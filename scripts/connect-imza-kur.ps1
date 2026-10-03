# Pusula Connect — güncelleme imza anahtarlarını parolayla korur ve yedek anahtar üretir. BİR KEZ çalıştırılır.
#
#   powershell -ExecutionPolicy Bypass -File scripts\connect-imza-kur.ps1
#
# Ne yapar:
#   1. Parolayı gizli girişle iki kez sorar (en az 12 karakter). Parola ekrana, dosyaya, komut satırına yazılmaz.
#   2. ~/.ssh/pusula-connect-imza.pem (düz) → pusula-connect-imza.enc.pem (PKCS#8, AES-256, parolalı)
#   3. Yedek anahtar üretir → pusula-connect-imza-yedek.enc.pem (aynı parolayla) + açık kısmı
#      pusula-connect-imza-yedek.pub.txt (gizli değil; uygulamaya gömülür)
#   4. Şifreli dosyaların parolayla açıldığını doğrular, sonra DÜZ anahtarı siler.
#   5. Yayınlama betiği için parolayı bu Windows kullanıcısına bağlı (DPAPI) saklar: pusula-connect-imza.parola
#
# Sonra: iki .enc.pem dosyası Hub şifre kasasına konur (yedek). Parolayı ayrı bir yerde sakla — kasaya değil.

$ErrorActionPreference = 'Stop'
$ssh = Join-Path $env:USERPROFILE '.ssh'
$duz = Join-Path $ssh 'pusula-connect-imza.pem'
$ana = Join-Path $ssh 'pusula-connect-imza.enc.pem'
$yedek = Join-Path $ssh 'pusula-connect-imza-yedek.enc.pem'
$yedekPub = Join-Path $ssh 'pusula-connect-imza-yedek.pub.txt'
$parolaDosyasi = Join-Path $ssh 'pusula-connect-imza.parola'

if (-not (Test-Path $duz)) { if (Test-Path $ana) { Write-Host 'Anahtar zaten parolalı. Yapılacak bir şey yok.'; exit 0 } else { throw "Anahtar bulunamadı: $duz" } }
if (Test-Path $yedek) { throw "Yedek anahtar zaten var: $yedek (üzerine yazılmaz)" }

function Duz([Security.SecureString]$s) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
$p1 = Duz (Read-Host -AsSecureString 'İmza anahtarı parolası (en az 12 karakter)')
$p2 = Duz (Read-Host -AsSecureString 'Parola (tekrar)')
if ($p1 -ne $p2) { throw 'Parolalar eşleşmiyor.' }
if ($p1.Length -lt 12) { throw 'Parola en az 12 karakter olmalı.' }

# Parola node'a standart girişten, base64 olarak gider (komut satırında görünmez; Türkçe harfler bozulmaz)
$js = @'
const c = require("crypto"), fs = require("fs");
const [duz, ana, yedek, yedekPub] = process.argv.slice(2);
// PowerShell 5.1 yerel programa giden metinde Türkçe harfleri bozar → parola base64 (UTF-8 baytları) gelir
const parola = Buffer.from(fs.readFileSync(0, "utf8").trim(), "base64").toString("utf8");
const sifreli = (k) => k.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: parola });
const anaKey = c.createPrivateKey(fs.readFileSync(duz));
fs.writeFileSync(ana, sifreli(anaKey), { mode: 0o600 });
const { privateKey, publicKey } = c.generateKeyPairSync("rsa", { modulusLength: 3072 });
fs.writeFileSync(yedek, sifreli(privateKey), { mode: 0o600 });
fs.writeFileSync(yedekPub, Buffer.from(publicKey.export({ format: "jwk" }).n, "base64url").toString("base64"));
// Doğrula: iki dosya da parolayla açılıyor ve imza atabiliyor
for (const f of [ana, yedek]) {
  const k = c.createPrivateKey({ key: fs.readFileSync(f), passphrase: parola });
  const veri = Buffer.from("deneme"), imza = c.sign("sha256", veri, k);
  if (!c.verify("sha256", veri, c.createPublicKey(k), imza)) throw new Error("doğrulanamadı: " + f);
}
const n = (k) => Buffer.from(c.createPublicKey(k).export({ format: "jwk" }).n, "base64url").toString("base64");
if (n(c.createPrivateKey({ key: fs.readFileSync(ana), passphrase: parola })) !== n(anaKey)) throw new Error("ana anahtar değişti");
console.log("ok");
'@
# Kod geçici dosyadan çalışır: PowerShell 5.1 harici programa giden argümanlardaki çift tırnakları siliyor
$jsDosya = Join-Path $env:TEMP ('pc-imza-' + [Guid]::NewGuid().ToString('N') + '.js')
[IO.File]::WriteAllText($jsDosya, $js, (New-Object Text.UTF8Encoding($false)))
try { $sonuc = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p1)) | node $jsDosya $duz $ana $yedek $yedekPub }
finally { Remove-Item $jsDosya -Force -ErrorAction SilentlyContinue }
if ($sonuc -ne 'ok') { throw "Şifreleme başarısız: $sonuc" }

Add-Type -AssemblyName System.Security
$korunan = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($p1), $null, 'CurrentUser')
[IO.File]::WriteAllBytes($parolaDosyasi, $korunan)
$p1 = $null; $p2 = $null

Remove-Item $duz -Force
Write-Host ''
Write-Host 'Tamam:' -ForegroundColor Green
Write-Host "  $ana"
Write-Host "  $yedek"
Write-Host "  $yedekPub  (açık anahtar, gizli değil)"
Write-Host "  Düz anahtar silindi. Parola bu Windows kullanıcısına bağlı olarak saklandı."
Write-Host '  Parolayı ayrı bir yerde (Hub kasası DEĞİL) sakla.'
