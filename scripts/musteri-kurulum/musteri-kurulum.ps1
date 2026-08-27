<#
    Musteri kurulum betigi — FortiClient VPN profili + RDP kisayolu

    Her yeni musteri kullanicisinda tekrarlanan su sureci tek dosyaya indirir:
      indir → kur → VPN profili olustur → RDP ayarlarini gir → masaustune kaydet

    SIFRE GOMULMEZ. Kullanici adi hazir gelir, sifreyi kullanici bir kez
    kendisi girer; FortiClient ve Windows kendi kasalarinda saklar. Boylece
    kolayligin buyuk kismi elde edilir, sifrenin elden ele dolasan bir dosyada
    durmasi riski alinmaz.

    YONETICI olarak calistirilmalidir: VPN profili HKLM altina yazilir.
    KUR.bat bunu kendiliginden yapar.

    Kullanim (KUR.bat uzerinden onerilir):
        .\musteri-kurulum.ps1 -TunelAdi 'Pusula' -VpnSunucu 'vpn.pusulanet.net:17443' `
                              -RdpSunucu '10.15.2.5' -KullaniciAdi '2311.iremtoptan1'
#>

param(
    # FortiClient'ta gorunecek baglanti adi
    [Parameter(Mandatory = $true)] [string] $TunelAdi,
    # "adres:port"
    [Parameter(Mandatory = $true)] [string] $VpnSunucu,
    # RDP hedefi (terminal sunucusu)
    [Parameter(Mandatory = $true)] [string] $RdpSunucu,
    # Domain'siz kullanici adi — ornek: 2311.iremtoptan1
    [Parameter(Mandatory = $true)] [string] $KullaniciAdi,

    [string] $Domain      = 'PUSULADC',
    # Masaustundeki kisayolun adi
    [string] $KisayolAdi  = 'Pusula Baglanti',
    # FortiClient kurulum dosyasi — betikle ayni klasorde aranir
    [string] $MsiYolu     = '',
    # Yazici yonlendirme (etiket/barkod yazicilari icin acik olmali)
    [switch] $YaziciKapali,
    # Yerel surucu yonlendirme — varsayilan KAPALI (guvenlik)
    [switch] $SurucuAcik
)

$ErrorActionPreference = 'Stop'

function Yaz([string]$m, [string]$renk = 'Gray') { Write-Host $m -ForegroundColor $renk }
function Baslik([string]$m) { Write-Host ''; Write-Host $m -ForegroundColor Cyan }

# ── Yonetici kontrolu ───────────────────────────────────────────────────
$kimlik = [Security.Principal.WindowsIdentity]::GetCurrent()
$yetkili = (New-Object Security.Principal.WindowsPrincipal($kimlik)).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $yetkili) {
    Yaz 'HATA: Bu betik yonetici olarak calistirilmalidir.' Red
    Yaz 'KUR.bat dosyasina sag tiklayip "Yonetici olarak calistir" secin.' Yellow
    exit 1
}

Yaz "Musteri kurulumu — $KullaniciAdi" Green
Yaz "VPN: $VpnSunucu   RDP: $RdpSunucu"

# ── 1) FortiClient kurulumu ─────────────────────────────────────────────
Baslik '1) FortiClient VPN'

$zatenKurulu = Test-Path 'HKLM:\SOFTWARE\Fortinet\FortiClient'
if ($zatenKurulu) {
    Yaz '   Zaten kurulu — kurulum adimi atlandi.' Green
} else {
    if (-not $MsiYolu) {
        <#  MSI ONCELIKLI. Fortinet'in sitesinden inen "FortiClientVPN.exe"
            aslinda ONLINE KURULUM: kendisi kurmaz, calisinca internetten
            asil paketi indirir. Musteride internet/bant genisligi belirsiz
            oldugu icin ona guvenmiyoruz.
            Tam MSI, FortiClient kurulu bir makinede su iki yerden alinabilir:
              C:\ProgramData\Applications\Cache\{PRODUCT-GUID}\<surum>\FortiClient.msi
              (veya Windows Installer onbellegi: LocalPackage kaydi)                       #>
        $msiAday = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter *.msi -EA SilentlyContinue |
                   Where-Object { $_.Name -match '(?i)forti' } | Select-Object -First 1
        if ($msiAday) {
            $MsiYolu = $msiAday.FullName
        } else {
            $exeAday = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter *.exe -EA SilentlyContinue |
                       Where-Object { $_.Name -match '(?i)forticlient' } | Select-Object -First 1
            if ($exeAday) {
                $MsiYolu = $exeAday.FullName
                Yaz '   UYARI: Pakette MSI yok, online kurulum dosyasi bulundu.' Yellow
                Yaz '   Bu dosya kurulumu internetten indirir; yavas olabilir veya' Yellow
                Yaz '   musteride internet yoksa basarisiz olur. Tam MSI onerilir.' Yellow
            }
        }
    }
    if (-not $MsiYolu -or -not (Test-Path -LiteralPath $MsiYolu)) {
        Yaz '   FortiClient kurulum dosyasi bulunamadi.' Red
        Yaz '   FortiClientVPN.msi dosyasini bu klasore koyup tekrar calistirin.' Yellow
        Yaz '   (Profil ve kisayol yine de olusturulacak.)' Yellow
    } else {
        Yaz "   Kuruluyor: $(Split-Path -Leaf $MsiYolu)"
        if ($MsiYolu -match '(?i)\.msi$') {
            $p = Start-Process msiexec.exe -ArgumentList @('/i', "`"$MsiYolu`"", '/qn', '/norestart') -Wait -PassThru
        } else {
            $p = Start-Process $MsiYolu -ArgumentList '/quiet' -Wait -PassThru
        }
        if ($p.ExitCode -eq 0) { Yaz '   Kurulum tamam.' Green }
        else { Yaz "   Kurulum cikis kodu: $($p.ExitCode) — kontrol edin." Yellow }
    }
}

# ── 2) VPN profili ──────────────────────────────────────────────────────
Baslik '2) VPN profili'

<#  DATA1 alanina DOKUNULMUYOR: mevcut profillerde kullanici adini tutan
    "EncLM ..." blobu makineye bagli bir anahtarla sifreleniyor, baska
    bilgisayara kopyalanamaz. Bunun yerine promptusername=1 veriyoruz:
    FortiClient kullanici adi ve sifreyi sorar, kullanici bir kez girer,
    "kaydet" derse FortiClient kendi sifreleyip saklar.                     #>

$kok = 'HKLM:\SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels'
$tun = Join-Path $kok $TunelAdi

if (-not (Test-Path $kok)) { New-Item -Path $kok -Force | Out-Null }
$vardi = Test-Path $tun
if (-not $vardi) { New-Item -Path $tun -Force | Out-Null }

$degerler = @(
    @{ Ad = 'Server';               Tip = 'String'; Deger = $VpnSunucu },
    @{ Ad = 'Description';          Tip = 'String'; Deger = $KisayolAdi },
    @{ Ad = 'promptusername';       Tip = 'DWord';  Deger = 1 },
    @{ Ad = 'promptcertificate';    Tip = 'DWord';  Deger = 0 },
    @{ Ad = 'ServerCert';           Tip = 'String'; Deger = '0' },
    @{ Ad = 'dual_stack';           Tip = 'DWord';  Deger = 0 },
    @{ Ad = 'sso_enabled';          Tip = 'DWord';  Deger = 0 },
    @{ Ad = 'use_external_browser'; Tip = 'DWord';  Deger = 0 },
    @{ Ad = 'azure_auto_login';     Tip = 'DWord';  Deger = 0 }
)
foreach ($d in $degerler) {
    New-ItemProperty -Path $tun -Name $d.Ad -Value $d.Deger -PropertyType $d.Tip -Force | Out-Null
}
Yaz "   $(if ($vardi) { 'Guncellendi' } else { 'Olusturuldu' }): $TunelAdi -> $VpnSunucu" Green

# ── 3) RDP kisayolu ─────────────────────────────────────────────────────
Baslik '3) RDP kisayolu'

$yaziciDeger = if ($YaziciKapali) { 0 } else { 1 }
$suruculer   = if ($SurucuAcik)   { '*' } else { '' }

# .rdp duz metindir; sifre YAZILMAZ. Windows ilk girişten sonra
# kullanicinin onayiyla kimlik bilgisini kendi kasasinda saklar.
$rdp = @"
full address:s:$RdpSunucu
username:s:$Domain\$KullaniciAdi
screen mode id:i:2
use multimon:i:0
desktopwidth:i:1920
desktopheight:i:1080
session bpp:i:32
compression:i:1
keyboardhook:i:2
audiocapturemode:i:0
audiomode:i:2
redirectprinters:i:$yaziciDeger
redirectclipboard:i:1
redirectsmartcards:i:0
drivestoredirect:s:$suruculer
autoreconnection enabled:i:1
authentication level:i:2
prompt for credentials:i:0
negotiate security layer:i:1
bandwidthautodetect:i:1
networkautodetect:i:1
"@

$masaustu = [Environment]::GetFolderPath('Desktop')
$rdpYolu  = Join-Path $masaustu "$KisayolAdi.rdp"
[System.IO.File]::WriteAllText($rdpYolu, $rdp, [System.Text.Encoding]::Unicode)
Yaz "   Olusturuldu: $rdpYolu" Green
Yaz "   Kullanici: $Domain\$KullaniciAdi   Hedef: $RdpSunucu"

# ── Ozet ────────────────────────────────────────────────────────────────
Baslik 'KURULUM TAMAM'
Yaz ''
Yaz 'Simdi ne yapilacak:' Cyan
Yaz "  1. FortiClient'i acin, '$TunelAdi' baglantisini secin."
Yaz "  2. Kullanici adi: $KullaniciAdi  — sifrenizi girin."
Yaz '     (Sifreyi kaydettirirseniz bir daha sorulmaz.)'
Yaz '  3. VPN baglandiktan sonra masaustundeki'
Yaz "     '$KisayolAdi' kisayoluna cift tiklayin."
Yaz ''
Yaz 'Sifreler bu pakette YER ALMAZ; ilk girişte siz belirlersiniz.' Yellow
