#Requires -Version 5.1
<#
.SYNOPSIS
    PusulaAgent - Windows Agent for PusulaHub
.DESCRIPTION
    Sunucu metriklerini toplar ve PusulaHub'a gönderir.
    Aynı zamanda yerel web arayüzü sunar (varsayılan port: 8585).
.NOTES
    Versiyon : 1.1.0
    Çalıştır : powershell -ExecutionPolicy Bypass -File PusulaAgent.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ══════════════════════════════════════════════
#   YAPILANDIRMA
# ══════════════════════════════════════════════
$VERSION    = "1.1.0"
$ConfigFile = Join-Path $PSScriptRoot "config.json"

$DefaultConfig = [ordered]@{
    hub_url    = "http://192.168.1.100:3000"
    secret     = "pusulahub-secret"
    interval   = 30
    local_port = 8585
    agent_id   = $null
    token      = $null
}

function Load-Config {
    if (Test-Path $ConfigFile) {
        try {
            $raw = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $cfg = [ordered]@{}
            foreach ($key in $DefaultConfig.Keys) {
                $cfg[$key] = if ($null -ne $raw.$key) { $raw.$key } else { $DefaultConfig[$key] }
            }
            return $cfg
        } catch { }
    }
    return $DefaultConfig.Clone()
}

function Save-Config($cfg) {
    $cfg | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8
}

# ══════════════════════════════════════════════
#   METRIK TOPLAMA
# ══════════════════════════════════════════════
function Get-Metrics {
    # CPU
    $cpu = [math]::Round((Get-CimInstance -ClassName Win32_Processor |
        Measure-Object -Property LoadPercentage -Average).Average, 1)

    # RAM
    $os       = Get-CimInstance -ClassName Win32_OperatingSystem
    $totalMB  = [math]::Round($os.TotalVisibleMemorySize / 1024)
    $freeMB   = [math]::Round($os.FreePhysicalMemory / 1024)
    $usedMB   = $totalMB - $freeMB

    # Diskler
    $disks = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
        $totalGB = [math]::Round($_.Size / 1GB, 1)
        $freeGB  = [math]::Round($_.FreeSpace / 1GB, 1)
        $usedGB  = [math]::Round($totalGB - $freeGB, 1)
        @{
            drive   = $_.DeviceID
            totalGB = $totalGB
            usedGB  = $usedGB
            freeGB  = $freeGB
            percent = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100) } else { 0 }
        }
    }

    # Uptime
    $lastBoot = (Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime
    $uptimeSec = [math]::Round((New-TimeSpan -Start $lastBoot -End (Get-Date)).TotalSeconds)

    # Ağ adaptörleri
    $adapters = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" |
        ForEach-Object {
            @{
                name   = $_.Description
                ipv4   = ($_.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1) ?? ""
                sentMB = 0
                recvMB = 0
            }
        }

    return @{
        cpu     = $cpu
        ram     = @{ totalMB = $totalMB; usedMB = $usedMB; freeMB = $freeMB }
        disks   = @($disks)
        uptimeSeconds    = $uptimeSec
        networkAdapters  = @($adapters)
    }
}

function Get-Sessions {
    try {
        $result = & quser 2>$null
        if (-not $result) { return @() }
        $sessions = @()
        foreach ($line in $result | Select-Object -Skip 1) {
            if ($line -match '^\s*(\S+)\s+(\S+)?\s+(\d+)\s+(\w+)\s+(\w+)?\s+(.*)$') {
                $sessions += @{
                    username    = $Matches[1].TrimStart('>')
                    clientIp    = ""
                    logonTime   = $Matches[6].Trim()
                    sessionType = if ($Matches[2] -match 'rdp') { "RDP" } else { "Console" }
                    state       = $Matches[4]
                }
            }
        }
        return $sessions
    } catch { return @() }
}

function Get-IISData {
    try {
        Import-Module WebAdministration -ErrorAction Stop
        $sites = Get-Website | ForEach-Object {
            @{
                name         = $_.Name
                status       = $_.State
                binding      = ($_.Bindings.Collection | Select-Object -First 1).BindingInformation ?? ""
                appPool      = $_.ApplicationPool
                physicalPath = $_.PhysicalPath
            }
        }
        $pools = Get-WebConfiguration -Filter "system.applicationHost/applicationPools/add" |
            ForEach-Object {
                $state = (Get-WebAppPoolState $_.Name).Value
                @{
                    name         = $_.Name
                    status       = $state
                    runtime      = $_.ManagedRuntimeVersion
                    pipelineMode = $_.ManagedPipelineMode
                }
            }
        return @{ sites = @($sites); appPools = @($pools) }
    } catch { return $null }
}

function Get-SQLData {
    try {
        $svcs = Get-Service -Name "MSSQLSERVER","MSSQL$*" -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -eq "Running" }
        if (-not $svcs) { return $null }

        $query = @"
SELECT name,
       (SELECT SUM(size*8/1024) FROM sys.master_files f WHERE f.database_id=d.database_id AND f.type=0) AS sizeMB,
       state_desc AS status,
       (SELECT MAX(backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name=d.name AND b.type='D') AS lastBackup,
       (SELECT COUNT(*) FROM sys.tables WHERE object_id IS NOT NULL) AS tblCount
FROM sys.databases d WHERE name NOT IN ('master','tempdb','model','msdb')
"@
        $dbs = Invoke-Sqlcmd -Query $query -ErrorAction Stop
        $databases = $dbs | ForEach-Object {
            @{
                name       = $_.name
                sizeMB     = [int]($_.sizeMB ?? 0)
                status     = $_.status
                lastBackup = if ($_.lastBackup) { $_.lastBackup.ToString("dd.MM.yyyy HH:mm") } else { "Yok" }
                tables     = [int]($_.tblCount ?? 0)
            }
        }
        return @{ databases = @($databases) }
    } catch { return $null }
}

function Get-LocalUsersData {
    try {
        $users = Get-LocalUser | ForEach-Object {
            @{
                username    = $_.Name
                displayName = if ($_.FullName) { $_.FullName } else { $_.Name }
                enabled     = [bool]$_.Enabled
                lastLogin   = if ($_.LastLogon) { $_.LastLogon.ToString("dd.MM.yyyy HH:mm") } else { "Hiç" }
                description = if ($_.Description) { $_.Description } else { "" }
            }
        }
        return @($users)
    } catch { return @() }
}

function Get-ADData {
    try {
        Import-Module ActiveDirectory -ErrorAction Stop
        $users = Get-ADUser -Filter * -Properties LastLogonDate,EmailAddress,Department |
            ForEach-Object {
                @{
                    username    = $_.SamAccountName
                    displayName = $_.Name
                    email       = $_.EmailAddress ?? ""
                    ou          = ($_.DistinguishedName -split ",OU=" | Select-Object -Index 1) ?? ""
                    enabled     = $_.Enabled
                    lastLogin   = if ($_.LastLogonDate) { $_.LastLogonDate.ToString("dd.MM.yyyy HH:mm") } else { "Hiç" }
                }
            }
        return @{ users = @($users); ouTree = @() }
    } catch { return $null }
}

function Get-RecentLogs {
    try {
        $events = Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=1,2,3; StartTime=(Get-Date).AddHours(-1)} `
            -MaxEvents 20 -ErrorAction Stop |
            ForEach-Object {
                @{
                    timestamp = $_.TimeCreated.ToString("o")
                    level     = switch ($_.Level) { 1{"critical"} 2{"error"} 3{"warning"} default{"info"} }
                    source    = $_.ProviderName
                    message   = $_.Message.Split([Environment]::NewLine)[0].Substring(0, [Math]::Min(120, $_.Message.Length))
                }
            }
        return @{ events = @($events) }
    } catch { return @{ events = @() } }
}

function Get-Roles {
    $roles = @()
    if (Get-Service "W3SVC" -ErrorAction SilentlyContinue) { $roles += "IIS" }
    if (Get-Service "MSSQLSERVER","MSSQL$*" -ErrorAction SilentlyContinue | Where-Object Status -eq Running) { $roles += "SQL" }
    if (Get-Service "NTDS" -ErrorAction SilentlyContinue) { $roles += "Active Directory" }
    if (Get-Service "DNS"  -ErrorAction SilentlyContinue) { $roles += "DNS" }
    if (Get-Service "DHCPServer" -ErrorAction SilentlyContinue) { $roles += "DHCP" }
    if (Get-Service "LanmanServer" -ErrorAction SilentlyContinue) { $roles += "File Server" }
    return $roles
}

# ══════════════════════════════════════════════
#   HUB İLETİŞİM
# ══════════════════════════════════════════════
function Register-WithHub($cfg) {
    $body = @{
        hostname  = $env:COMPUTERNAME
        ip        = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (
                        (Get-NetRoute -DestinationPrefix "0.0.0.0/0" | Sort-Object -Property RouteMetric | Select-Object -First 1).ifIndex
                    ) | Select-Object -First 1 -ExpandProperty IPAddress)
        os        = "windows"
        version   = $VERSION
        secret    = $cfg["secret"]
        localPort = $cfg["local_port"]
    } | ConvertTo-Json

    try {
        $resp = Invoke-RestMethod -Uri "$($cfg['hub_url'])/api/agent/register" `
            -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        $cfg["agent_id"] = $resp.agentId
        $cfg["token"]    = $resp.token
        Save-Config $cfg
        Write-Host "[PusulaAgent] Kayıt başarılı. ID: $($resp.agentId)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[PusulaAgent] Kayıt başarısız: $_" -ForegroundColor Red
        return $false
    }
}

function Send-Report($cfg, $reportData) {
    $body = $reportData | ConvertTo-Json -Depth 10 -Compress
    try {
        $resp = Invoke-RestMethod -Uri "$($cfg['hub_url'])/api/agent/report" `
            -Method POST -Body $body -ContentType "application/json" -TimeoutSec 15
        return @{ ok = $true; resp = $resp }
    } catch {
        $statusCode = $_.Exception.Response?.StatusCode?.value__
        if ($statusCode -eq 401) {
            return @{ ok = $false; reregister = $true }
        }
        return @{ ok = $false; error = $_.ToString() }
    }
}

function Poll-Messages($cfg) {
    if (-not $cfg["token"] -or -not $cfg["agent_id"]) { return }
    try {
        $url  = "$($cfg['hub_url'])/api/agent/messages?agentId=$($cfg['agent_id'])&token=$($cfg['token'])"
        $resp = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 10
        if ($resp.reregister) {
            $cfg["token"]    = $null
            $cfg["agent_id"] = $null
            Register-WithHub $cfg
            return
        }

        # Exec isteklerini işle
        if ($resp.execs -and $resp.execs.Count -gt 0) {
            foreach ($exec in $resp.execs) {
                Invoke-AgentExec $cfg $exec
            }
        }
    } catch {
        # Poll hatası kritik değil, sessizce geç
    }
}

function Invoke-AgentExec($cfg, $exec) {
    $execId  = $exec.execId
    $command = $exec.command
    $timeout = if ($exec.timeout) { [int]$exec.timeout } else { 30 }

    $startTime = Get-Date
    $stdout    = ""
    $stderr    = ""
    $exitCode  = -1

    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName               = "cmd.exe"
        $psi.Arguments              = "/c $command"
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError  = $true
        $psi.UseShellExecute        = $false
        $psi.CreateNoWindow         = $true

        $proc = [System.Diagnostics.Process]::Start($psi)
        $finished = $proc.WaitForExit($timeout * 1000)

        if (-not $finished) {
            $proc.Kill()
            $stderr   = "Komut zaman aşımına uğradı ($timeout sn)"
            $exitCode = -2
        } else {
            $stdout   = $proc.StandardOutput.ReadToEnd()
            $stderr   = $proc.StandardError.ReadToEnd()
            $exitCode = $proc.ExitCode
        }
    } catch {
        $stderr   = $_.ToString()
        $exitCode = -1
    }

    $duration = [math]::Round((New-TimeSpan -Start $startTime -End (Get-Date)).TotalMilliseconds)

    $resultPayload = @{
        execId   = $execId
        agentId  = $cfg["agent_id"]
        token    = $cfg["token"]
        stdout   = $stdout
        stderr   = $stderr
        exitCode = $exitCode
        duration = $duration
    }

    # WebSocket varsa önce onu dene
    if ($SharedState.WsConnected -and $SharedState.WsSocket) {
        $wsPayload = $resultPayload.Clone()
        $wsPayload["type"] = "exec-result"
        $sent = Send-WsMessage $SharedState.WsSocket $wsPayload
        if ($sent) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚡ Exec tamamlandı (WS): $execId (exit:$exitCode)" -ForegroundColor Cyan
            return
        }
    }

    # HTTP fallback
    try {
        $body = $resultPayload | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri "$($cfg['hub_url'])/api/agent/exec-result" `
            -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚡ Exec tamamlandı: $execId (exit:$exitCode)" -ForegroundColor Cyan
    } catch {
        Write-Host "[PusulaAgent] Exec sonucu gönderilemedi: $_" -ForegroundColor Red
    }
}

# ══════════════════════════════════════════════
#   WEBSOCKET İLETİŞİM
# ══════════════════════════════════════════════

function Connect-WebSocket($cfg) {
    try {
        $wsUrl = $cfg["hub_url"] -replace "^http", "ws"
        $uri   = "$wsUrl/ws/agent?agentId=$($cfg['agent_id'])&token=$($cfg['token'])"

        $ws  = New-Object System.Net.WebSockets.ClientWebSocket
        $ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
        $cts = New-Object System.Threading.CancellationTokenSource
        $cts.CancelAfter(10000)

        $ws.ConnectAsync([Uri]$uri, $cts.Token).GetAwaiter().GetResult()

        if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            Write-Host "[PusulaAgent] WebSocket bağlantısı kuruldu" -ForegroundColor Green
            return $ws
        }
    } catch {
        Write-Host "[PusulaAgent] WebSocket bağlantısı başarısız: $_" -ForegroundColor Yellow
    }
    return $null
}

function Send-WsMessage($ws, $message) {
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { return $false }
    try {
        $json    = $message | ConvertTo-Json -Depth 10 -Compress
        $bytes   = [System.Text.Encoding]::UTF8.GetBytes($json)
        $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
        $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true,
            [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
        return $true
    } catch {
        return $false
    }
}

function Receive-WsMessage($ws, $timeoutMs = 1000) {
    if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { return $null }
    try {
        $buffer  = New-Object byte[] 65536
        $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
        $cts     = New-Object System.Threading.CancellationTokenSource
        $cts.CancelAfter($timeoutMs)

        $result = $ws.ReceiveAsync($segment, $cts.Token).GetAwaiter().GetResult()

        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            return $null
        }

        $json = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
        return $json | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Process-WsMessages($ws, $cfg) {
    while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $msg = Receive-WsMessage $ws 500
        if (-not $msg) { break }

        switch ($msg.type) {
            "exec" {
                Invoke-AgentExec $cfg $msg
            }
            "ping" {
                Send-WsMessage $ws @{ type = "pong" } | Out-Null
            }
            "message" {
                $logEntry = @{ time = (Get-Date -Format "HH:mm:ss"); ok = $true; msg = "Bildirim: $($msg.title)" }
                $SharedState.ActivityLog.Insert(0, $logEntry)
                if ($SharedState.ActivityLog.Count -gt 20) { $SharedState.ActivityLog.RemoveAt(20) }
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] 📨 Bildirim: $($msg.title)" -ForegroundColor Magenta
            }
            "reregister" {
                try {
                    $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                        "reregister", [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
                } catch { }
                $cfg["token"]    = $null
                $cfg["agent_id"] = $null
                $SharedState.WsConnected = $false
                $SharedState.WsSocket    = $null
                Register-WithHub $cfg
                $SharedState.Config = $cfg
            }
        }
    }
}

# ══════════════════════════════════════════════
#   YEREL WEB ARAYÜZÜ
# ══════════════════════════════════════════════
$HtmlPage = @'
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PusulaAgent</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f2f0;color:#111;font-size:13px}
  .header{background:#fff;border-bottom:1px solid #e5e5e5;padding:14px 24px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .logo{width:28px;height:28px;background:#111;border-radius:6px;display:flex;align-items:center;justify-content:center}
  .logo svg{fill:#fff;width:16px;height:16px}
  .title{font-size:15px;font-weight:700}
  .hostname{font-size:12px;color:#666;margin-left:2px}
  .dot{width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;margin-left:auto}
  .dot.off{background:#ef4444}
  .dot.conn{animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .container{max-width:960px;margin:0 auto;padding:20px 16px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .card{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.07);overflow:hidden;margin-bottom:12px}
  .card-head{background:#f9f8f7;border-bottom:1px solid #eee;padding:8px 14px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;display:flex;align-items:center;justify-content:between;gap:8px}
  .card-head span{flex:1}
  .card-body{padding:14px}
  .metric-val{font-size:28px;font-weight:700;tabular-nums}
  .metric-sub{font-size:11px;color:#888;margin-top:2px}
  .bar-wrap{background:#f0f0f0;border-radius:4px;height:6px;margin-top:8px;overflow:hidden}
  .bar{height:100%;border-radius:4px;transition:width .4s}
  .bar.ok{background:#10b981}
  .bar.warn{background:#f59e0b}
  .bar.danger{background:#ef4444}
  .badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;border:1px solid}
  .badge.green{background:#ecfdf5;color:#065f46;border-color:#a7f3d0}
  .badge.red{background:#fef2f2;color:#991b1b;border-color:#fecaca}
  .badge.gray{background:#f3f4f6;color:#374151;border-color:#d1d5db}
  .badge.blue{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
  .status-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:12px}
  .status-row:last-child{border-bottom:none}
  .status-row .label{color:#888;width:110px;flex-shrink:0}
  .status-row .val{font-weight:500;flex:1}
  form label{display:block;font-size:11px;font-weight:600;color:#555;margin-bottom:4px;margin-top:12px}
  form label:first-child{margin-top:0}
  form input{width:100%;height:34px;border:1px solid #d1d5db;border-radius:5px;padding:0 10px;font-size:12px;background:#fff;outline:none;transition:border .15s}
  form input:focus{border-color:#6366f1}
  form input[type=number]{width:80px}
  .btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:5px;border:none;cursor:pointer;font-size:12px;font-weight:600;transition:opacity .15s}
  .btn-primary{background:#111;color:#fff}
  .btn-primary:hover{opacity:.85}
  .btn-outline{background:#fff;color:#374151;border:1px solid #d1d5db}
  .btn-outline:hover{background:#f9f8f7}
  .btn-row{display:flex;gap:8px;margin-top:14px}
  .log-item{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:11px}
  .log-item:last-child{border-bottom:none}
  .log-time{color:#888;font-family:monospace;flex-shrink:0}
  .log-ok{color:#10b981}
  .log-err{color:#ef4444}
  .roles-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:14px}
  .tag{font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:#f0f0f0;color:#444}
  .section-sep{height:4px}
  #toast{position:fixed;bottom:20px;right:20px;background:#111;color:#fff;padding:10px 16px;border-radius:6px;font-size:12px;display:none;z-index:999}
</style>
</head>
<body>
<div class="header">
  <div class="logo"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
  <div>
    <div class="title">PusulaAgent</div>
    <div class="hostname" id="h-hostname">yükleniyor…</div>
  </div>
  <div id="h-dot" class="dot conn" title="Bağlantı durumu"></div>
</div>

<div class="container">

  <!-- Durum -->
  <div class="card">
    <div class="card-head"><span>Bağlantı Durumu</span> <span id="h-status-badge"></span></div>
    <div class="card-body">
      <div class="status-row"><div class="label">Hub Adresi</div><div class="val" id="s-hub"></div></div>
      <div class="status-row"><div class="label">Son Gönderim</div><div class="val" id="s-last"></div></div>
      <div class="status-row"><div class="label">Agent ID</div><div class="val" id="s-agentid" style="font-family:monospace;font-size:11px;color:#888"></div></div>
      <div class="status-row"><div class="label">Çalışma Süresi</div><div class="val" id="s-uptime"></div></div>
    </div>
  </div>

  <!-- Metrikler -->
  <div class="grid3">
    <div class="card">
      <div class="card-head"><span>CPU</span></div>
      <div class="card-body">
        <div class="metric-val" id="m-cpu">—</div>
        <div class="metric-sub">İşlemci Kullanımı</div>
        <div class="bar-wrap"><div class="bar ok" id="b-cpu" style="width:0%"></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span>RAM</span></div>
      <div class="card-body">
        <div class="metric-val" id="m-ram">—</div>
        <div class="metric-sub" id="m-ram-sub"></div>
        <div class="bar-wrap"><div class="bar ok" id="b-ram" style="width:0%"></div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span>Disk</span></div>
      <div class="card-body">
        <div class="metric-val" id="m-disk">—</div>
        <div class="metric-sub" id="m-disk-sub"></div>
        <div class="bar-wrap"><div class="bar ok" id="b-disk" style="width:0%"></div></div>
      </div>
    </div>
  </div>

  <!-- Roller -->
  <div class="card">
    <div class="card-head"><span>Tespit Edilen Roller</span></div>
    <div class="roles-wrap" id="roles-wrap">—</div>
  </div>

  <!-- Yapılandırma + Log -->
  <div class="grid2">
    <div class="card">
      <div class="card-head"><span>Yapılandırma</span></div>
      <div class="card-body">
        <form id="cfg-form" onsubmit="saveConfig(event)">
          <label>Hub Adresi</label>
          <input type="url" id="cfg-hub" placeholder="http://192.168.1.100:3000" required>
          <label>Secret</label>
          <input type="password" id="cfg-secret" placeholder="••••••••" required>
          <label>Gönderim Aralığı (sn)</label>
          <input type="number" id="cfg-interval" min="10" max="300" value="30">
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">Kaydet</button>
            <button type="button" class="btn btn-outline" onclick="pushNow()">Şimdi Gönder</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span>Son Aktiviteler</span></div>
      <div class="card-body" id="log-list" style="padding:0 14px"></div>
    </div>
  </div>

</div>

<div id="toast"></div>

<script>
let data = null;

async function refresh() {
  try {
    const r = await fetch('/api/status');
    data = await r.json();
    render(data);
  } catch(e) {
    document.getElementById('h-dot').className = 'dot off';
  }
}

function pct(v){ return Math.min(100, Math.max(0, v)) }
function barClass(v){ return v > 85 ? 'bar danger' : v > 70 ? 'bar warn' : 'bar ok' }
function fmtUptime(s){
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
  if(d>0) return d+'g '+h+'s '+m+'d';
  if(h>0) return h+'s '+m+'d';
  return m+'d';
}

function render(d) {
  // Header
  document.getElementById('h-hostname').textContent = d.hostname + ' · ' + d.ip;
  const dot = document.getElementById('h-dot');
  dot.className = 'dot ' + (d.hub_connected ? 'conn' : 'off');
  dot.title = d.hub_connected ? 'Hub bağlı' : 'Hub bağlantısı yok';

  // Status
  document.getElementById('s-hub').textContent = d.hub_url;
  document.getElementById('s-last').textContent = d.last_push || '—';
  document.getElementById('s-agentid').textContent = d.agent_id || 'Kayıtlı değil';
  document.getElementById('s-uptime').textContent = fmtUptime(d.uptime_seconds || 0);

  const badge = document.getElementById('h-status-badge');
  badge.className = 'badge ' + (d.hub_connected ? 'green' : 'red');
  badge.textContent = d.hub_connected ? '● Bağlı' : '○ Bağlantı yok';

  // Metrics
  const cpu = d.metrics?.cpu || 0;
  const ram = d.metrics?.ram || {};
  const ramPct = ram.totalMB > 0 ? Math.round(ram.usedMB/ram.totalMB*100) : 0;
  const disk = d.metrics?.disks?.[0] || {};

  document.getElementById('m-cpu').textContent = cpu + '%';
  const bCpu = document.getElementById('b-cpu');
  bCpu.style.width = pct(cpu)+'%'; bCpu.className = barClass(cpu)+' bar';

  document.getElementById('m-ram').textContent = ramPct + '%';
  document.getElementById('m-ram-sub').textContent = (ram.usedMB||0)+' MB / '+(ram.totalMB||0)+' MB';
  const bRam = document.getElementById('b-ram');
  bRam.style.width = pct(ramPct)+'%'; bRam.className = barClass(ramPct)+' bar';

  if(disk.drive) {
    document.getElementById('m-disk').textContent = disk.percent + '%';
    document.getElementById('m-disk-sub').textContent = disk.drive+' · '+disk.usedGB+'GB / '+disk.totalGB+'GB';
    const bDisk = document.getElementById('b-disk');
    bDisk.style.width = pct(disk.percent)+'%'; bDisk.className = barClass(disk.percent)+' bar';
  }

  // Roles
  const rolesEl = document.getElementById('roles-wrap');
  if(d.roles && d.roles.length) {
    rolesEl.innerHTML = d.roles.map(r=>`<span class="tag">${r}</span>`).join('');
  } else {
    rolesEl.textContent = 'Tespit edilen rol yok';
  }

  // Config
  if(!document.getElementById('cfg-hub').value) {
    document.getElementById('cfg-hub').value = d.hub_url || '';
  }
  document.getElementById('cfg-interval').value = d.interval || 30;

  // Logs
  const logs = d.activity_log || [];
  document.getElementById('log-list').innerHTML = logs.slice(0,10).map(l =>
    `<div class="log-item">
      <span class="log-time">${l.time}</span>
      <span class="${l.ok?'log-ok':'log-err'}">${l.ok?'✓':'✗'}</span>
      <span style="color:#555">${l.msg}</span>
    </div>`
  ).join('') || '<div style="padding:8px 0;color:#aaa;font-size:11px">Henüz aktivite yok</div>';
}

async function saveConfig(e) {
  e.preventDefault();
  const body = {
    hub_url:  document.getElementById('cfg-hub').value,
    secret:   document.getElementById('cfg-secret').value,
    interval: parseInt(document.getElementById('cfg-interval').value),
  };
  try {
    await fetch('/api/config', {method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
    toast('Yapılandırma kaydedildi');
    document.getElementById('cfg-secret').value = '';
  } catch(err) { toast('Hata: '+err.message, true); }
}

async function pushNow() {
  try {
    const r = await fetch('/api/push', {method:'POST'});
    const d = await r.json();
    toast(d.ok ? 'Veri gönderildi' : 'Gönderilemedi: '+d.error, !d.ok);
    refresh();
  } catch(err) { toast('Hata: '+err.message, true); }
}

function toast(msg, err=false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = err ? '#ef4444' : '#111';
  el.style.display = 'block';
  setTimeout(()=>el.style.display='none', 3000);
}

refresh();
setInterval(refresh, 15000);
</script>
</body>
</html>
'@

# ══════════════════════════════════════════════
#   HTTP SUNUCU (Background Runspace)
# ══════════════════════════════════════════════

# Paylaşımlı state (thread-safe değişkenler)
$SharedState = [System.Collections.Hashtable]::Synchronized(@{
    Metrics      = $null
    Config       = $null
    HubConnected = $false
    LastPush     = ""
    UptimeSec    = 0
    Roles        = @()
    ActivityLog  = [System.Collections.ArrayList]::new()
    TriggerPush  = $false
    WsSocket     = $null
    WsConnected  = $false
})

function Start-LocalWebServer($port, $html, $state) {
    $rs = [runspacefactory]::CreateRunspace()
    $rs.Open()
    $rs.SessionStateProxy.SetVariable("html",  $html)
    $rs.SessionStateProxy.SetVariable("state", $state)
    $rs.SessionStateProxy.SetVariable("port",  $port)

    $ps = [powershell]::Create().AddScript({
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://+:$port/")
        try { $listener.Start() } catch {
            $listener.Prefixes.Clear()
            $listener.Prefixes.Add("http://localhost:$port/")
            $listener.Start()
        }

        while ($listener.IsListening) {
            try {
                $ctx  = $listener.GetContext()
                $req  = $ctx.Request
                $resp = $ctx.Response

                $path   = $req.Url.AbsolutePath
                $method = $req.HttpMethod

                if ($path -eq "/" -and $method -eq "GET") {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($html)
                    $resp.ContentType = "text/html; charset=utf-8"
                    $resp.ContentLength64 = $bytes.Length
                    $resp.OutputStream.Write($bytes, 0, $bytes.Length)

                } elseif ($path -eq "/api/status" -and $method -eq "GET") {
                    $payload = @{
                        hostname      = $env:COMPUTERNAME
                        ip            = ""
                        hub_url       = $state.Config?.hub_url ?? ""
                        hub_connected = $state.HubConnected
                        last_push     = $state.LastPush
                        agent_id      = $state.Config?.agent_id ?? ""
                        interval      = $state.Config?.interval ?? 30
                        uptime_seconds= $state.UptimeSec
                        metrics       = $state.Metrics
                        roles         = $state.Roles
                        activity_log  = @($state.ActivityLog)
                    } | ConvertTo-Json -Depth 6 -Compress
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
                    $resp.ContentType = "application/json"
                    $resp.ContentLength64 = $bytes.Length
                    $resp.OutputStream.Write($bytes, 0, $bytes.Length)

                } elseif ($path -eq "/api/config" -and $method -eq "POST") {
                    $body = New-Object System.IO.StreamReader($req.InputStream)
                    $json = $body.ReadToEnd() | ConvertFrom-Json
                    if ($json.hub_url) { $state.Config["hub_url"]  = $json.hub_url }
                    if ($json.secret)  { $state.Config["secret"]   = $json.secret; $state.Config["token"] = $null; $state.Config["agent_id"] = $null }
                    if ($json.interval){ $state.Config["interval"] = [int]$json.interval }
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                    $resp.ContentType = "application/json"
                    $resp.ContentLength64 = $bytes.Length
                    $resp.OutputStream.Write($bytes, 0, $bytes.Length)

                } elseif ($path -eq "/api/push" -and $method -eq "POST") {
                    $state.TriggerPush = $true
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                    $resp.ContentType = "application/json"
                    $resp.ContentLength64 = $bytes.Length
                    $resp.OutputStream.Write($bytes, 0, $bytes.Length)

                } else {
                    $resp.StatusCode = 404
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
                    $resp.ContentLength64 = $bytes.Length
                    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
                }

                $resp.Close()
            } catch { }
        }
    })

    $ps.Runspace = $rs
    $null = $ps.BeginInvoke()
    return $ps
}

# ══════════════════════════════════════════════
#   ANA DÖNGÜ
# ══════════════════════════════════════════════
function Main {
    $cfg = Load-Config
    $SharedState.Config = $cfg

    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║        PusulaAgent v$VERSION              ║" -ForegroundColor Cyan
    Write-Host "║  Hub  : $($cfg['hub_url'])".PadRight(44) + "║" -ForegroundColor Cyan
    Write-Host "║  Port : $($cfg['local_port'])".PadRight(44) + "║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[PusulaAgent] Yerel arayüz: http://localhost:$($cfg['local_port'])" -ForegroundColor Yellow

    # Web sunucusunu başlat
    $webServer = Start-LocalWebServer $cfg["local_port"] $HtmlPage $SharedState

    # Kayıt yap
    if (-not $cfg["token"]) {
        Write-Host "[PusulaAgent] Hub'a kayıt yapılıyor..." -ForegroundColor Yellow
        Register-WithHub $cfg
        $SharedState.Config = $cfg
    }

    # Rolleri tespit et
    $SharedState.Roles = Get-Roles

    Write-Host "[PusulaAgent] Döngü başladı. Ctrl+C ile durdur." -ForegroundColor Green

    while ($true) {
        try {
            # WebSocket bağlantısı kur (yoksa)
            if ($cfg["token"] -and -not $SharedState.WsConnected) {
                $ws = Connect-WebSocket $cfg
                if ($ws) {
                    $SharedState.WsSocket    = $ws
                    $SharedState.WsConnected = $true
                }
            }

            # Metrikleri topla
            $metrics = Get-Metrics
            $SharedState.Metrics   = $metrics
            $SharedState.UptimeSec = $metrics.uptimeSeconds

            # Rapor verisi oluştur
            $report = @{
                agentId   = $cfg["agent_id"]
                token     = $cfg["token"]
                timestamp = (Get-Date -Format "o")
                metrics   = $metrics
                sessions  = @(Get-Sessions)
                logs      = Get-RecentLogs
                roles     = $SharedState.Roles
            }

            # Roller varsa ek veri ekle
            if ($SharedState.Roles -contains "IIS") {
                $iis = Get-IISData
                if ($iis) { $report["iis"] = $iis }
            }
            if ($SharedState.Roles -contains "SQL") {
                $sql = Get-SQLData
                if ($sql) { $report["sql"] = $sql }
            }
            if ($SharedState.Roles -contains "Active Directory") {
                $ad = Get-ADData
                if ($ad) { $report["ad"] = $ad }
            } else {
                $report["localUsers"] = Get-LocalUsersData
            }

            # Hub'a gönder
            if ($cfg["token"]) {
                $sentViaWs = $false

                # WebSocket varsa önce onu dene
                if ($SharedState.WsConnected -and $SharedState.WsSocket) {
                    $wsReport = $report.Clone()
                    $wsReport["type"] = "report"
                    $sentViaWs = Send-WsMessage $SharedState.WsSocket $wsReport

                    if ($sentViaWs) {
                        $now = Get-Date -Format "HH:mm:ss"
                        $SharedState.HubConnected = $true
                        $SharedState.LastPush     = $now
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Gönderildi (WS)" -ForegroundColor Green
                        $logEntry = @{ time = $now; ok = $true; msg = "Veri gönderildi (WS)" }
                        $SharedState.ActivityLog.Insert(0, $logEntry)
                        if ($SharedState.ActivityLog.Count -gt 20) { $SharedState.ActivityLog.RemoveAt(20) }

                        # WS üzerinden gelen mesajları işle
                        Process-WsMessages $SharedState.WsSocket $cfg
                    } else {
                        # WS gönderim başarısız — bağlantıyı kapat
                        $SharedState.WsConnected = $false
                        $SharedState.WsSocket    = $null
                    }
                }

                # HTTP fallback
                if (-not $sentViaWs) {
                    $result = Send-Report $cfg $report
                    $now    = Get-Date -Format "HH:mm:ss"
                    $logEntry = @{ time = $now; ok = $result.ok; msg = if ($result.ok) { "Veri gönderildi" } else { $result.error ?? "Hata" } }
                    $SharedState.ActivityLog.Insert(0, $logEntry)
                    if ($SharedState.ActivityLog.Count -gt 20) { $SharedState.ActivityLog.RemoveAt(20) }

                    if ($result.ok) {
                        $SharedState.HubConnected = $true
                        $SharedState.LastPush     = $now
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✓ Gönderildi" -ForegroundColor Green
                        Poll-Messages $cfg
                    } elseif ($result.reregister) {
                        Write-Host "[PusulaAgent] Token geçersiz, yeniden kayıt..." -ForegroundColor Yellow
                        $cfg["token"]    = $null
                        $cfg["agent_id"] = $null
                        $SharedState.WsConnected = $false
                        $SharedState.WsSocket    = $null
                        Register-WithHub $cfg
                        $SharedState.Config = $cfg
                    } else {
                        $SharedState.HubConnected = $false
                        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✗ $($result.error)" -ForegroundColor Red
                    }
                }
            } else {
                Register-WithHub $cfg
                $SharedState.Config = $cfg
            }

        } catch {
            Write-Host "[PusulaAgent] Hata: $_" -ForegroundColor Red
        }

        # Interval veya manual push bekleme
        $elapsed = 0
        while ($elapsed -lt $cfg["interval"]) {
            if ($SharedState.TriggerPush) {
                $SharedState.TriggerPush = $false
                break
            }
            Start-Sleep -Seconds 1
            $elapsed++
        }
    }
}

Main
