# SonicWall Global VPN Client (GVC) baglanti kontrolu
#
# Musteri tarafinda "Phase 1 tamamlaniyor ama baglanti kurulmuyor"
# durumunu ayirt etmek icin. Olcer:
#   - genel IP ve ag gecidinin DNS cozumu
#   - UDP 500  (IKE)   : ag gecidine gercek bir IKE istegi gonderip yanit bekler
#   - UDP 4500 (NAT-T) : ayni istegi NAT-T bicimiyle gonderir
#   - TCP 4433 (SonicWall yonetim/SSL VPN) ve TCP 443
#   - yerelde 500/4500 portunu tutan baska program (IKEEXT, baska VPN)
#   - GVC servisi ve sanal ag karti, kurulu diger VPN istemcileri
#
# Calistirma:  VPN-KONTROL.bat  (cift tiklama)
# veya:        powershell -NoProfile -ExecutionPolicy Bypass -File vpn-kontrol.ps1 [-AgGecidi adres]
#
# SAF ASCII. Turkce karakter kullanilmiyor: dosya BOM'suz gittiginde
# PowerShell 5.1 onu ANSI okuyup ayristirmayi bozuyor.

param(
  [string]$AgGecidi = "aksoy.aksoy-tr.com"
)

$ErrorActionPreference = "SilentlyContinue"

$satirlar = New-Object System.Collections.ArrayList
$sorunlar = New-Object System.Collections.ArrayList

function Y($metin, $renk) {
  if ($renk) { Write-Host $metin -ForegroundColor $renk } else { Write-Host $metin }
  [void]$satirlar.Add($metin)
}
function Baslik($m) { Y "" ; Y ("--- " + $m + " ---") "Cyan" }
function Tamam($m)  { Y ("  [ TAMAM ] " + $m) "Green" }
function Uyari($m)  { Y ("  [ UYARI ] " + $m) "Yellow" }
function Hata($m)   { Y ("  [ HATA  ] " + $m) "Red" ; [void]$sorunlar.Add($m) }
function Bilgi($m)  { Y ("           " + $m) "DarkGray" }

# ---------------------------------------------------------------------------
# IKEv1 istek paketi
#
# Sunucunun cevap vermesi icin gecerli bicimde bir ISAKMP mesaji gerekir;
# rastgele bayt atilirsa sessizce dusurulur ve "kapali" sanilir. Burada
# SonicWall GVC'nin kullandigi tipik oneriler (3DES/AES, SHA1, DH2/DH14,
# on paylasimli anahtar + XAUTH) ile bir Main Mode SA istegi kuruluyor.
# Sunucu oneriyi kabul etse de reddetse de (NO_PROPOSAL_CHOSEN) bir paket
# dondurur - bizim icin onemli olan yalnizca yanit gelmesi.
# ---------------------------------------------------------------------------
function Be16([int]$v) { return [byte[]]@((($v -shr 8) -band 0xFF), ($v -band 0xFF)) }
function Be32([int64]$v) {
  return [byte[]]@((($v -shr 24) -band 0xFF), (($v -shr 16) -band 0xFF), (($v -shr 8) -band 0xFF), ($v -band 0xFF))
}
function Ozellik([int]$tip, [int]$deger) { return (Be16 (0x8000 -bor $tip)) + (Be16 $deger) }

function Donusum([int]$no, [bool]$son, [int]$sifre, [int]$anahtarBit, [int]$grup, [int]$dogrulama) {
  $oz = @()
  $oz += Ozellik 1 $sifre                 # sifreleme
  if ($anahtarBit -gt 0) { $oz += Ozellik 14 $anahtarBit }
  $oz += Ozellik 2 2                      # hash = SHA1
  $oz += Ozellik 4 $grup                  # DH grubu
  $oz += Ozellik 3 $dogrulama             # 1 = PSK, 65001 = XAUTH + PSK
  $oz += Ozellik 11 1                     # omur tipi = saniye
  $oz += Ozellik 12 28800                 # omur
  $govde = [byte[]]@($no, 1, 0, 0) + $oz  # donusum no, KEY_IKE, ayrilmis
  $sonraki = if ($son) { 0 } else { 3 }
  return [byte[]]@($sonraki, 0) + (Be16 (4 + $govde.Length)) + $govde
}

function IkePaketi {
  $liste = @(
    @{ S = 7; K = 256; G = 14; D = 65001 },
    @{ S = 7; K = 256; G = 2;  D = 65001 },
    @{ S = 5; K = 0;   G = 2;  D = 65001 },
    @{ S = 7; K = 256; G = 14; D = 1 },
    @{ S = 7; K = 256; G = 2;  D = 1 },
    @{ S = 5; K = 0;   G = 2;  D = 1 }
  )
  $donusumler = @()
  for ($i = 0; $i -lt $liste.Count; $i++) {
    $t = $liste[$i]
    $donusumler += Donusum ($i + 1) ($i -eq $liste.Count - 1) $t.S $t.K $t.G $t.D
  }
  $oneriGovde = [byte[]]@(1, 1, 0, $liste.Count) + $donusumler      # oneri no, ISAKMP, SPI boyu, adet
  $oneri = [byte[]]@(0, 0) + (Be16 (4 + $oneriGovde.Length)) + $oneriGovde
  $saGovde = (Be32 1) + (Be32 1) + $oneri                              # DOI = IPsec, SIT_IDENTITY_ONLY
  $sa = [byte[]]@(0, 0) + (Be16 (4 + $saGovde.Length)) + $saGovde

  $spi = New-Object byte[] 8
  (New-Object Random).NextBytes($spi)
  $baslik = $spi + (New-Object byte[] 8) + [byte[]]@(1, 0x10, 2, 0) + (Be32 0) + (Be32 (28 + $sa.Length))
  return , ([byte[]]($baslik + $sa))
}

# UDP ile gonder, yanit bekle. Donus: $null (yanit yok) veya yanit baytlari
function UdpDene([string]$ip, [int]$port, [byte[]]$veri, [int]$beklemeMs) {
  $u = New-Object Net.Sockets.UdpClient
  try {
    $u.Client.ReceiveTimeout = $beklemeMs
    $u.Connect($ip, $port)
    [void]$u.Send($veri, $veri.Length)
    $uzak = New-Object Net.IPEndPoint([Net.IPAddress]::Any, 0)
    try { return , $u.Receive([ref]$uzak) } catch { return $null }
  } finally { $u.Close() }
}

function TcpDene([string]$ip, [int]$port, [int]$beklemeMs) {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $ok = $c.BeginConnect($ip, $port, $null, $null).AsyncWaitHandle.WaitOne($beklemeMs)
    return ($ok -and $c.Connected)
  } finally { $c.Close() }
}

# Yanitin ne oldugunu kaba olarak yorumla
function YanitAcikla([byte[]]$b, [int]$kaydir) {
  if ($b.Length -lt $kaydir + 28) { return ("" + $b.Length + " bayt (IKE degil)") }
  $tip = $b[$kaydir + 18]
  $ilk = $b[$kaydir + 16]
  $ad = switch ($tip) { 2 { "Main Mode" } 4 { "Aggressive Mode" } 5 { "Bilgi (notify)" } default { "tip " + $tip } }
  $ek = if ($ilk -eq 11) { " - sunucu bir bildirim dondurdu (oneri reddi olabilir, bu normal)" } elseif ($ilk -eq 1) { " - sunucu oneriyi kabul etti" } else { "" }
  return ("" + $b.Length + " bayt, IKE " + $ad + $ek)
}

Y "==================================================="
Y "  SonicWall VPN Baglanti Kontrolu"
Y ("  Bilgisayar : " + $env:COMPUTERNAME + "   Kullanici: " + $env:USERNAME)
Y ("  Tarih      : " + (Get-Date).ToString("dd.MM.yyyy HH:mm:ss"))
Y ("  Ag gecidi  : " + $AgGecidi)
Y "==================================================="

# ---------------------------------------------------------------- ag bilgisi
Baslik "Internet baglantisi"
$genelIp = $null
foreach ($url in @("https://api.ipify.org", "http://ifconfig.me/ip", "http://icanhazip.com")) {
  try {
    $genelIp = ((Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 6).Content).Trim()
    if ($genelIp -match '^\d+\.\d+\.\d+\.\d+$') { break } else { $genelIp = $null }
  } catch { }
}
if ($genelIp) {
  Tamam ("Genel IP: " + $genelIp)
  try {
    $ptr = (Resolve-DnsName -Name $genelIp -Type PTR -ErrorAction Stop).NameHost -join ", "
    Bilgi ("Ters DNS: " + $ptr)
  } catch { }
} else {
  Hata "Internete cikilamiyor ya da genel IP ogrenilemedi."
}

$yerel = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" }
foreach ($a in $yerel) {
  Bilgi ("Kart: " + $a.InterfaceAlias + "  IP: " + ($a.IPv4Address.IPAddress -join ",") + "  Ag gecidi: " + ($a.IPv4DefaultGateway.NextHop -join ","))
}

# ------------------------------------------------------------- ag gecidi DNS
Baslik "Ag gecidi adresi"
$hedefIp = $null
if ($AgGecidi -match '^\d+\.\d+\.\d+\.\d+$') {
  $hedefIp = $AgGecidi
  Tamam ("IP olarak verildi: " + $hedefIp)
} else {
  try {
    $hedefIp = (Resolve-DnsName -Name $AgGecidi -Type A -ErrorAction Stop | Where-Object { $_.Type -eq "A" } | Select-Object -First 1).IPAddress
    Tamam ($AgGecidi + " -> " + $hedefIp)
  } catch {
    Hata ($AgGecidi + " cozulemedi (DNS). VPN istemcisi ag gecidini bulamaz.")
  }
}

# ------------------------------------------------------------------- IKE yolu
$u500 = $null; $u4500 = $null
if ($hedefIp) {
  Baslik "VPN portlari"
  $paket = IkePaketi

  $u500 = UdpDene $hedefIp 500 $paket 4000
  if ($u500) {
    Tamam ("UDP 500 (IKE)   : yanit geldi - " + (YanitAcikla $u500 0))
  } else {
    # tek paket kaybolmus olabilir, bir kez daha dene
    $u500 = UdpDene $hedefIp 500 (IkePaketi) 4000
    if ($u500) { Tamam ("UDP 500 (IKE)   : yanit geldi (2. deneme) - " + (YanitAcikla $u500 0)) }
    else { Hata "UDP 500 (IKE)   : YANIT YOK - modem/saglayici IKE'yi engelliyor olabilir." }
  }

  # NAT-T: 4 baytlik sifir isaretcisi + ayni IKE mesaji
  $natt = [byte[]]@(0, 0, 0, 0) + (IkePaketi)
  $u4500 = UdpDene $hedefIp 4500 $natt 4000
  if (-not $u4500) { $u4500 = UdpDene $hedefIp 4500 ([byte[]]@(0, 0, 0, 0) + (IkePaketi)) 4000 }
  if ($u4500) {
    Tamam ("UDP 4500 (NAT-T): yanit geldi - " + (YanitAcikla $u4500 4))
  } elseif ($u500) {
    Uyari "UDP 4500 (NAT-T): yanit yok."
    Bilgi "Bazi guvenlik duvarlari 4500'de ilk istegi yanitlamaz; bu tek basina"
    Bilgi "kesin kanit degil. Ama baglanti 'Phase 1 tamamlandi' deyip takiliyorsa"
    Bilgi "en guclu aday budur: modemde IPsec/NAT-T gecisi (passthrough) kapali."
  } else {
    Hata "UDP 4500 (NAT-T): yanit yok."
  }

  foreach ($p in @(4433, 443)) {
    if (TcpDene $hedefIp $p 4000) { Tamam ("TCP " + $p + "        : acik") }
    else { Bilgi ("TCP " + $p + "        : kapali/filtreli (GVC icin gerekli degil)") }
  }
}

# --------------------------------------------------------- yerel cakismalar
Baslik "Bu bilgisayar"
$tutan = Get-NetUDPEndpoint | Where-Object { $_.LocalPort -in 500, 4500 }
if ($tutan) {
  foreach ($t in $tutan) {
    $proc = Get-Process -Id $t.OwningProcess
    $ad = if ($proc) { $proc.ProcessName } else { "pid " + $t.OwningProcess }
    $svc = (Get-CimInstance Win32_Service -Filter ("ProcessId=" + $t.OwningProcess) | Select-Object -ExpandProperty Name) -join ","
    $etiket = if ($svc) { $ad + " (" + $svc + ")" } else { $ad }
    Bilgi ("UDP " + $t.LocalPort + " yerelde tutuluyor: " + $etiket)
  }
  Bilgi "Windows'un kendi IKE servisi (IKEEXT/svchost) normaldir; baska bir VPN programi ise cakisma olabilir."
} else {
  Bilgi "Yerelde UDP 500/4500 tutan program yok."
}

$gvcSvc = Get-Service | Where-Object { $_.DisplayName -match "SonicWall|Global VPN" -or $_.Name -match "SWGVC|SonicWall" }
if ($gvcSvc) {
  foreach ($s in $gvcSvc) {
    if ($s.Status -eq "Running") { Tamam ("Servis: " + $s.DisplayName + " calisiyor") }
    else { Hata ("Servis: " + $s.DisplayName + " durumu: " + $s.Status) }
  }
} else {
  Uyari "SonicWall GVC servisi bulunamadi (kurulu degil ya da adi farkli)."
}

$sanal = Get-NetAdapter -IncludeHidden | Where-Object { $_.InterfaceDescription -match "SonicWall" }
if ($sanal) {
  foreach ($n in $sanal) {
    Bilgi ("Sanal kart: " + $n.InterfaceDescription + "  durum: " + $n.Status)
    if ($n.Status -eq "Disabled") { Hata "SonicWall sanal ag karti DEVRE DISI - Ag Baglantilari'ndan etkinlestirin." }
  }
} else {
  Uyari "SonicWall sanal ag karti bulunamadi."
}

$digerVpn = @()
$kayit = @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
foreach ($k in $kayit) {
  Get-ItemProperty $k | Where-Object { $_.DisplayName -match "FortiClient|Cisco AnyConnect|Cisco Secure|GlobalProtect|OpenVPN|WireGuard|NordVPN|ExpressVPN|ProtonVPN|Check Point|Pulse|Zscaler|Shrew|TheGreenBow|NCP" } |
    ForEach-Object { $digerVpn += $_.DisplayName }
}
$digerVpn = $digerVpn | Sort-Object -Unique
if ($digerVpn) {
  Uyari ("Baska VPN yazilimi kurulu: " + ($digerVpn -join ", "))
  Bilgi "Bunlarin surucusu GVC ile cakisabilir; denerken kapali olsunlar."
} else {
  Tamam "Baska VPN yazilimi yok."
}

# ---------------------------------------------------------------------- ozet
Y ""
Y "==================================================="
Y "  SONUC"
Y "==================================================="
if (-not $genelIp) {
  Y "  Bilgisayar internete cikamiyor. Once internet baglantisi duzeltilmeli." "Red"
} elseif (-not $hedefIp) {
  Y "  VPN adresi cozulemiyor. DNS ayarlari kontrol edilmeli." "Red"
} elseif (-not $u500) {
  Y "  Ag gecidine IKE (UDP 500) ulasmiyor. Modem veya internet saglayicisi" "Red"
  Y "  VPN trafigini engelliyor ya da ag gecidi bu IP'yi kabul etmiyor." "Red"
  Y "  Telefonun mobil erisim noktasi ile deneyin; orada calisiyorsa sorun bu hattadir." "Red"
} elseif (-not $u4500) {
  Y "  IKE (500) calisiyor, NAT-T (4500) icin yanit alinamadi." "Yellow"
  Y "  GVC'de 'Phase 1 tamamlandi' deyip ilerlemiyorsa sebep buyuk ihtimalle budur." "Yellow"
  Y "  1) Telefonun mobil erisim noktasi ile deneyin." "Yellow"
  Y "  2) Modemde 'IPsec Passthrough' / 'VPN Passthrough' acik olmali, UDP 500 ve 4500 engellenmemeli." "Yellow"
} else {
  Y "  Ag yolu acik: UDP 500 ve 4500 ag gecidine ulasiyor." "Green"
  Y "  Baglanti yine kurulmuyorsa sorun kimlik dogrulama/ayar tarafindadir:" "Green"
  Y "  kullanici adi/sifre penceresi arkada kalmis olabilir ya da SonicWall" "Green"
  Y "  kullaniciyi reddediyordur (SonicWall loglarina bakilmali)." "Green"
}
if ($sorunlar.Count -gt 0) {
  Y ""
  Y "  Bulunan sorunlar:"
  foreach ($s in $sorunlar) { Y ("   - " + $s) }
}

# Rapor dosyasi - masaustune, WhatsApp ile gonderilebilsin diye
$masaustu = [Environment]::GetFolderPath("Desktop")
$rapor = Join-Path $masaustu ("VPN-kontrol-" + $env:COMPUTERNAME + ".txt")
try {
  Set-Content -Path $rapor -Value $satirlar -Encoding UTF8
  Y ""
  Y ("  Rapor kaydedildi: " + $rapor) "Cyan"
  Y "  Bu dosyayi bize gonderin." "Cyan"
} catch {
  Y ""
  Y ("  Rapor yazilamadi: " + $_.Exception.Message) "Yellow"
}
