#Requires -RunAsAdministrator
<#
.SYNOPSIS
    PusulaAgent Windows Service kurulum scripti
.DESCRIPTION
    - C# Windows Service wrapper'ını derler (csc.exe ile, sıfır bağımlılık)
    - "PusulaAgent" adıyla Windows Service olarak kaydeder (AUTO_START)
    - Firewall kuralı ekler (yerel web UI portu)
    - PusulaNotifier kurulumunu tetikler (varsa)
.NOTES
    Yönetici olarak çalıştırın: powershell -ExecutionPolicy Bypass -File install.ps1
#>

$AgentScript  = Join-Path $PSScriptRoot "PusulaAgent.ps1"
$WrapperSrc   = Join-Path $PSScriptRoot "PusulaAgentService.cs"
$WrapperExe   = Join-Path $PSScriptRoot "PusulaAgentService.exe"
$ConfigFile   = Join-Path $PSScriptRoot "config.json"
$ServiceName  = "PusulaAgent"
$ServiceDesc  = "PusulaHub Windows Agent - sunucu metriklerini toplar ve hub'a gönderir"

# ── Başlık ──────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    PusulaAgent — Windows Service Kurulum ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Config ───────────────────────────────────────────
if (-not (Test-Path $ConfigFile)) {
    $hubUrl = Read-Host "PusulaHub adresi (örn: http://192.168.1.100:3000)"
    $secret = Read-Host "Agent secret"
    @{
        hub_url    = $hubUrl
        secret     = $secret
        interval   = 30
        local_port = 8585
        agent_id   = $null
        token      = $null
    } | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8
    Write-Host "  ✓ config.json oluşturuldu" -ForegroundColor Green
} else {
    Write-Host "  ✓ config.json mevcut" -ForegroundColor Gray
}

$port = (Get-Content $ConfigFile | ConvertFrom-Json).local_port

# ── 2. C# Service Wrapper Kaynağı ───────────────────────
$csharpSource = @"
using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;

public class PusulaAgentService : ServiceBase
{
    private Process _process;
    private readonly string _scriptPath;
    private readonly string _workDir;
    private volatile bool _running;

    public PusulaAgentService(string scriptPath)
    {
        ServiceName = "PusulaAgent";
        CanStop = true;
        CanPauseAndContinue = false;
        AutoLog = true;
        _scriptPath = scriptPath;
        _workDir = Path.GetDirectoryName(scriptPath);
    }

    protected override void OnStart(string[] args)
    {
        _running = true;
        StartAgent();
    }

    private void StartAgent()
    {
        _process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName  = "powershell.exe",
                Arguments = string.Format(
                    "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File \"{0}\"",
                    _scriptPath),
                WorkingDirectory = _workDir,
                UseShellExecute  = false,
                CreateNoWindow   = true,
                RedirectStandardOutput = false,
                RedirectStandardError  = false,
            },
            EnableRaisingEvents = true,
        };

        // Servis duruyorsa agent'i yeniden baslat
        _process.Exited += (s, e) =>
        {
            if (_running)
            {
                Thread.Sleep(5000);
                StartAgent();
            }
        };

        _process.Start();
    }

    protected override void OnStop()
    {
        _running = false;
        try
        {
            if (_process != null && !_process.HasExited)
            {
                _process.Kill();
                _process.WaitForExit(5000);
            }
        }
        catch { }
    }

    static void Main(string[] scriptArgs)
    {
        string scriptPath = scriptArgs.Length > 0
            ? scriptArgs[0]
            : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "PusulaAgent.ps1");

        ServiceBase.Run(new PusulaAgentService(scriptPath));
    }
}
"@

# ── 3. C# Derleme ───────────────────────────────────────
Write-Host "  Derleniyor..." -ForegroundColor Yellow

# .NET Framework csc.exe bul
$cscPaths = @(
    "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "${env:WINDIR}\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $cscPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
    Write-Host "  HATA: csc.exe bulunamadı. .NET Framework 4.x kurulu mu?" -ForegroundColor Red
    exit 1
}

# Kaynak dosyayı yaz ve derle
$csharpSource | Set-Content $WrapperSrc -Encoding UTF8
$compileArgs = @(
    "/target:exe",
    "/optimize+",
    "/out:`"$WrapperExe`"",
    "/reference:System.ServiceProcess.dll",
    "`"$WrapperSrc`""
)
$result = & $csc @compileArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  HATA: Derleme başarısız:`n$result" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ PusulaAgentService.exe derlendi" -ForegroundColor Green

# ── 4. Mevcut servisi kaldır ────────────────────────────
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
    Write-Host "  ✓ Eski servis kaldırıldı" -ForegroundColor Yellow
}

# ── 5. Windows Service kaydı ────────────────────────────
$binPath = "`"$WrapperExe`" `"$AgentScript`""
& sc.exe create $ServiceName `
    binPath= $binPath `
    DisplayName= "PusulaAgent" `
    start= auto | Out-Null

& sc.exe description $ServiceName $ServiceDesc | Out-Null

# Servis çöktüğünde 5 sn sonra yeniden başlat (3 kez)
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Write-Host "  ✓ Windows Service oluşturuldu (AUTO_START)" -ForegroundColor Green

# ── 6. Firewall kuralı ──────────────────────────────────
netsh advfirewall firewall delete rule name="PusulaAgent" | Out-Null 2>&1
netsh advfirewall firewall add rule `
    name="PusulaAgent" `
    dir=in action=allow protocol=TCP `
    localport=$port `
    profile=any | Out-Null
Write-Host "  ✓ Firewall kuralı eklendi (TCP $port)" -ForegroundColor Green

# ── 7. Servisi başlat ───────────────────────────────────
Start-Service -Name $ServiceName
Start-Sleep -Seconds 3
$svc = Get-Service -Name $ServiceName
Write-Host "  ✓ Servis başlatıldı — Durum: $($svc.Status)" -ForegroundColor Green

# ── 8. PusulaNotifier ───────────────────────────────────
$notifierInstall = Join-Path $PSScriptRoot "notifier\install-notifier.ps1"
if (Test-Path $notifierInstall) {
    Write-Host ""
    Write-Host "  PusulaNotifier kuruluyor..." -ForegroundColor Yellow
    & $notifierInstall
}

# ── Özet ────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          Kurulum Tamamlandı!             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Yerel arayüz   : http://localhost:$port" -ForegroundColor Yellow
Write-Host "  Servis durumu  : Get-Service PusulaAgent" -ForegroundColor Gray
Write-Host "  Durdur         : Stop-Service PusulaAgent" -ForegroundColor Gray
Write-Host "  Kaldır         : powershell -File uninstall.ps1" -ForegroundColor Gray
