# Guvenlik taramasi (salt okuma). Dosya agaclarinda:
#   TEHLIKELI-TUR  : acilinca calisan uzantilar (lnk, bat, cmd, ps1, vbs, js, hta, scr, ...)
#   CIFT-UZANTI    : fatura.pdf.exe gibi
#   GIZLI-EXE      : belge/resim uzantili ama icerigi Windows programi (MZ)
#   TUR-UYUSMAZ    : resim/pdf uzantisi ile bas baytlar uyusmuyor (zararsiz da olabilir)
#   MAKRO          : Office dosyasinda VBA (xlsm/xlsb/docm normal; xlsx/docx icinde VBA SUPHELI)
#   DDE/DIS        : Excel'de DDE/cmd formulu, dis baglanti, OLE nesnesi
#   WEB-DOSYA      : aspx/ashx/asmx/asp/php/jsp (IIS koklerinde web shell adayi)
#   ADS            : alternatif veri akisi (Zone.Identifier haric)
#   KALICILIK      : Run kayitlari, zamanlanmis gorevler (Microsoft disi), Startup klasorleri, servisler
# Kullanim: -Kokler <yol,yol> -Cikti <dosya> [-Ads] [-Kalicilik] [-DosyaUstSinirMB 300]
# SAF ASCII (PowerShell 5.1 BOM'suz dosyayi ANSI okur).
param(
    [string[]]$Kokler = @(),
    [string]$Cikti = "C:\ProgramData\Pusula\guvenlik-tarama.txt",
    [switch]$Ads,
    [switch]$Kalicilik,
    [int]$DosyaUstSinirMB = 300
)
$ErrorActionPreference = "SilentlyContinue"
$r = New-Object System.Collections.Generic.List[string]
function Y($m) { $script:r.Add($m) }
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tehlikeli = @('.lnk','.bat','.cmd','.ps1','.psm1','.vbs','.vbe','.js','.jse','.wsf','.wsh','.hta','.scr','.pif','.com','.msi','.msp','.jar','.url','.iso','.img','.vhd','.vhdx','.chm','.reg','.inf','.cpl','.ws','.sct','.xll','.application','.appref-ms')
$web = @('.aspx','.ashx','.asmx','.asp','.php','.jsp','.cer')
$belge = @('.jpg','.jpeg','.png','.gif','.bmp','.tif','.tiff','.txt','.csv','.pdf','.xls','.xlsx','.xlsm','.xlsb','.doc','.docx','.docm','.rtf','.bak','.zip','.rar','.7z','.ods','.odt')
$resim = @('.jpg','.jpeg','.png','.gif','.bmp','.tif','.tiff','.pdf')
$ust = $DosyaUstSinirMB * 1MB

Y ("BASLADI | " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " | " + $env:COMPUTERNAME + " | kokler: " + ($Kokler -join ";"))

foreach ($kok in $Kokler) {
    if (-not (Test-Path -LiteralPath $kok)) { Y ("KOK-YOK | " + $kok); continue }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $n = 0; $exeN = 0; $hata = 0
    Get-ChildItem -LiteralPath $kok -Recurse -File -Force | ForEach-Object {
        $f = $_
        $n++
        $ext = $f.Extension.ToLower()
        $ad = $f.Name
        if ($ad -match '\.(jpg|jpeg|png|gif|pdf|xls|xlsx|doc|docx|txt|rar|zip|bak)\.(exe|scr|com|bat|cmd|vbs|vbe|js|jse|lnk|pif|hta|ps1|msi)$') { Y ("CIFT-UZANTI | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName) }
        if ($tehlikeli -contains $ext) { Y ("TEHLIKELI-TUR | " + $ext + " | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName) }
        if ($web -contains $ext) { Y ("WEB-DOSYA | " + $ext + " | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName) }
        if ($ext -eq '.exe' -or $ext -eq '.dll') { $exeN++ }

        if ($belge -contains $ext -and $f.Length -ge 4) {
            try {
                $fs = [IO.File]::OpenRead($f.FullName); $b = New-Object byte[] 8; $k = $fs.Read($b, 0, 8); $fs.Close()
                if ($k -ge 2 -and $b[0] -eq 0x4D -and $b[1] -eq 0x5A) { Y ("GIZLI-EXE | " + $ext + " | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName) }
                elseif ($resim -contains $ext -and $k -ge 4) {
                    $ok = $false
                    switch ($ext) {
                        '.jpg'  { $ok = ($b[0] -eq 0xFF -and $b[1] -eq 0xD8) }
                        '.jpeg' { $ok = ($b[0] -eq 0xFF -and $b[1] -eq 0xD8) }
                        '.png'  { $ok = ($b[0] -eq 0x89 -and $b[1] -eq 0x50) }
                        '.gif'  { $ok = ($b[0] -eq 0x47 -and $b[1] -eq 0x49) }
                        '.bmp'  { $ok = ($b[0] -eq 0x42 -and $b[1] -eq 0x4D) }
                        '.tif'  { $ok = (($b[0] -eq 0x49 -and $b[1] -eq 0x49) -or ($b[0] -eq 0x4D -and $b[1] -eq 0x4D)) }
                        '.tiff' { $ok = (($b[0] -eq 0x49 -and $b[1] -eq 0x49) -or ($b[0] -eq 0x4D -and $b[1] -eq 0x4D)) }
                        '.pdf'  { $ok = ($b[0] -eq 0x25 -and $b[1] -eq 0x50) }
                    }
                    if (-not $ok) {
                        # Baska bir resim bicimi mi (jpg adli png gibi) yoksa tamamen farkli mi
                        $hex = ($b[0..3] | ForEach-Object { $_.ToString("X2") }) -join ""
                        $gercek = "?"
                        if ($b[0] -eq 0xFF -and $b[1] -eq 0xD8) { $gercek = "jpg" }
                        elseif ($b[0] -eq 0x89 -and $b[1] -eq 0x50) { $gercek = "png" }
                        elseif ($b[0] -eq 0x47 -and $b[1] -eq 0x49) { $gercek = "gif" }
                        elseif ($b[0] -eq 0x42 -and $b[1] -eq 0x4D) { $gercek = "bmp" }
                        elseif ($b[0] -eq 0x52 -and $b[1] -eq 0x49) { $gercek = "webp/riff" }
                        elseif ($b[0] -eq 0x50 -and $b[1] -eq 0x4B) { $gercek = "zip/office" }
                        elseif ($b[0] -eq 0xD0 -and $b[1] -eq 0xCF) { $gercek = "ole/eski-office" }
                        elseif ($b[0] -eq 0x25 -and $b[1] -eq 0x50) { $gercek = "pdf" }
                        Y ("TUR-UYUSMAZ | " + $ext + " -> " + $gercek + " (" + $hex + ") | " + $f.Length + " | " + $f.FullName)
                    }
                }
            } catch { $hata++ }
        }

        if ($ext -in '.xlsx','.xlsm','.xlsb','.docx','.docm','.pptx','.pptm' -and $f.Length -le $ust) {
            try {
                $z = [IO.Compression.ZipFile]::OpenRead($f.FullName)
                $girdiler = $z.Entries
                $vba = $girdiler | Where-Object { $_.FullName -match 'vbaProject\.bin$' }
                $dis = $girdiler | Where-Object { $_.FullName -match 'externalLink|oleObject|activeX|embeddings' }
                if ($vba) {
                    $supheli = if ($ext -in '.xlsx','.docx','.pptx') { " | SUPHELI: makrosuz uzantida VBA" } else { "" }
                    Y ("MAKRO | " + $ext + " | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName + $supheli)
                }
                if ($dis) { Y ("DDE/DIS | " + (($dis | ForEach-Object { $_.FullName.Split('/')[-1] } | Select-Object -Unique) -join ",") + " | " + $f.FullName) }
                # DDE/cmd formulu: sayfa xml'lerinde
                foreach ($e in ($girdiler | Where-Object { $_.FullName -match '^xl/worksheets/sheet\d+\.xml$' -and $_.Length -lt 20MB })) {
                    $sr = New-Object IO.StreamReader($e.Open()); $t = $sr.ReadToEnd(); $sr.Close()
                    if ($t -match "cmd\|'|powershell|mshta|rundll32|regsvr32|certutil|wscript|cscript|\bDDE\b") { Y ("DDE/DIS | formul: cmd/powershell/DDE | " + $f.FullName); break }
                }
                $z.Dispose()
            } catch { $hata++ }
        }
        if ($ext -in '.xls','.doc','.ppt' -and $f.Length -le $ust) {
            try {
                $bytes = [IO.File]::ReadAllBytes($f.FullName)
                $s = [Text.Encoding]::Unicode.GetString($bytes)
                if ($s -match '_VBA_PROJECT|VBA_PROJECT_CUR|\bMacros\b') { Y ("MAKRO | " + $ext + " | " + $f.Length + " | " + $f.LastWriteTime.ToString("yyyy-MM-dd") + " | " + $f.FullName) }
                $a = [Text.Encoding]::ASCII.GetString($bytes)
                if ($a -match "cmd\|'|powershell\.exe|mshta|DDEAUTO") { Y ("DDE/DIS | eski-office: cmd/powershell/DDE | " + $f.FullName) }
            } catch { $hata++ }
        }
        if ($Ads) {
            try {
                Get-Item -LiteralPath $f.FullName -Stream * | Where-Object { $_.Stream -ne ':$DATA' -and $_.Stream -ne 'Zone.Identifier' } | ForEach-Object { Y ("ADS | " + $_.Stream + " | " + $_.Length + " | " + $f.FullName) }
            } catch { $hata++ }
        }
    }
    Y ("OZET | " + $kok + " | dosya " + $n + " | exe/dll " + $exeN + " | okunamayan " + $hata + " | sure " + [int]$sw.Elapsed.TotalSeconds + " sn")
    $r | Set-Content -Path $Cikti -Encoding UTF8
}

if ($Kalicilik) {
    foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run') {
        $p = Get-ItemProperty $k
        if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { Y ("KALICILIK | Run HKLM | " + $_.Name + " = " + $_.Value) } }
    }
    # Yuklu kullanici kovanlari
    Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[0-9-]+$' } | ForEach-Object {
        $sid = $_.PSChildName
        foreach ($alt in 'Software\Microsoft\Windows\CurrentVersion\Run','Software\Microsoft\Windows\CurrentVersion\RunOnce') {
            $p = Get-ItemProperty ("Registry::HKEY_USERS\" + $sid + "\" + $alt)
            if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { Y ("KALICILIK | Run HKU " + $sid.Substring($sid.Length - 5) + " | " + $_.Name + " = " + $_.Value) } }
        }
    }
    Get-ChildItem "C:\Users\*\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\*","C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\*" -Force | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { Y ("KALICILIK | Startup | " + $_.FullName) }
    Get-ScheduledTask | Where-Object { $_.TaskPath -notmatch '^\\Microsoft\\' } | ForEach-Object {
        $t = $_
        $akt = ($t.Actions | ForEach-Object { $_.Execute + " " + $_.Arguments }) -join " ; "
        Y ("KALICILIK | Gorev | " + $t.TaskPath + $t.TaskName + " | " + $t.State + " | " + $t.Principal.UserId + " | " + $akt)
    }
    Get-CimInstance Win32_Service | Where-Object { $_.PathName -and $_.PathName -notmatch '^(\"?C:\\Windows\\|\"?C:\\Program Files)' } | ForEach-Object { Y ("KALICILIK | Servis | " + $_.Name + " | " + $_.State + " | " + $_.StartMode + " | " + $_.PathName) }
    Get-WmiObject -Namespace root\subscription -Class __EventFilter | ForEach-Object { Y ("KALICILIK | WMI-abone | " + $_.Name + " | " + $_.Query) }
}

Y ("BITTI | " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
$r | Set-Content -Path $Cikti -Encoding UTF8
