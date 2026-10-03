# Pusula Connect — imza anahtarı parolasını BU bilgisayara/kullanıcıya tanıtır (yeni bilgisayar, geri yükleme).
#
#   powershell -ExecutionPolicy Bypass -File scripts\connect-imza-parola.ps1
#
# Önce Hub şifre kasasındaki "Pusula Connect — güncelleme imza anahtarı (ANA)" (ve YEDEK) kaydının şifre alanını
# ~/.ssh/pusula-connect-imza.enc.pem (ve pusula-connect-imza-yedek.enc.pem) olarak kaydet. Bu betik parolayı gizli
# girişle sorar, anahtarın o parolayla açıldığını doğrular ve yayınlama betiğinin okuyacağı DPAPI dosyasını yazar.

$ErrorActionPreference = 'Stop'
$ssh = Join-Path $env:USERPROFILE '.ssh'
$ana = Join-Path $ssh 'pusula-connect-imza.enc.pem'
$parolaDosyasi = Join-Path $ssh 'pusula-connect-imza.parola'
if (-not (Test-Path $ana)) { throw "Anahtar yok: $ana (Hub şifre kasasından kaydedin)" }

$s = Read-Host -AsSecureString 'İmza anahtarı parolası'
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
try { $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }

# Doğrula: parola anahtarı açıyor mu (parola base64 olarak standart girişten; PowerShell 5.1 Türkçe harfleri bozmasın)
$js = 'const c=require("crypto"),fs=require("fs");try{c.createPrivateKey({key:fs.readFileSync(process.argv[2]),passphrase:Buffer.from(fs.readFileSync(0,"utf8").trim(),"base64").toString("utf8")});console.log("ok")}catch(e){console.log("hata")}'
$jsDosya = Join-Path $env:TEMP ('pc-imza-' + [Guid]::NewGuid().ToString('N') + '.js')
[IO.File]::WriteAllText($jsDosya, $js, (New-Object Text.UTF8Encoding($false)))
try { $sonuc = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p)) | node $jsDosya $ana }
finally { Remove-Item $jsDosya -Force -ErrorAction SilentlyContinue }
if ($sonuc -ne 'ok') { throw 'Parola anahtarı açmadı.' }

Add-Type -AssemblyName System.Security
[IO.File]::WriteAllBytes($parolaDosyasi, [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($p), $null, 'CurrentUser'))
$p = $null
Write-Host 'Tamam: parola bu Windows kullanıcısı için kaydedildi; scripts/connect-yayinla.sh artık imzalayabilir.' -ForegroundColor Green
