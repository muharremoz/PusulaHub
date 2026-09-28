# Terminal sunucularinda kullanici masaustu kotasi + dosya turu izleme (FSRM).
#
# Kurulum (sunucuda bir kez): FS-Resource-Manager rolu + asagidaki iki sablon
# ve dosya grubu. Bu betik her kullanicinin C:\Users\<kullanici>\Desktop
# klasorune sablonlari uygular; zamanlanmis gorev "PusulaMasaustuKota" saatte
# bir calistirir, boylece yeni acilan kullanicilar da kapsanir.
#
#   Kota sablonu   : "Pusula Masaustu 100MB"      - 100 MB, %85 ve %100'de olay
#   Dosya engeli   : "Pusula Masaustu tur izleme" - "Pusula Masaustu izin disi"
#                    grubu (izinli uzantilar DISINDAKI her sey)
#
# Su an UYARI modu: kota yumusak (SoftLimit), dosya engeli pasif. Engellemeye
# gecmek icin yalniz sablonlar degistirilir, turetilmis kotalar da guncellenir:
#   Set-FsrmQuotaTemplate -Name 'Pusula Masaustu 100MB' -SoftLimit:$false -UpdateDerived
#   Set-FsrmFileScreenTemplate -Name 'Pusula Masaustu tur izleme' -Active:$true -UpdateDerived
#
# Uyarilar Uygulama gunlugune SRMSVC kaynagiyla yazilir (kota 12325, dosya 8215)
# - 2026-09-28 T3'te test klasoruyle dogrulandi.
#
# TUZAKLAR:
#   - FSRM yollarinda TERS egik cizgi sart. 'C:/...' verilirse New-FsrmQuota
#     hata vermeden hicbir sey olusturmaz (agent exec'te ileri egik aliskanligi).
#   - New-FsrmFileScreenTemplate varsayilan AKTIF olusur; pasif icin
#     Set-FsrmFileScreenTemplate -Active:$false (sablon uygulanmadan once).
#   - Izinli listeye masaustunun kendi dosyalari (lnk/url/desktop.ini/Thumbs.db)
#     ve Office kaydederken actigi gecici dosyalar (~$*, *.tmp) eklendi. Excel
#     kaydederken uzantisiz 8 karakterlik gecici dosya da aciyor - aktif moda
#     gecmeden once pasif kayitlarda (8215) bunlar var mi bak.
#
# SAF ASCII (PowerShell 5.1 BOM'suz dosyayi ANSI okur).

$ErrorActionPreference = "Stop"

$KOTA_SABLONU  = "Pusula Masaustu 100MB"
$EKRAN_SABLONU = "Pusula Masaustu tur izleme"

# Sistem profilleri ve yonetici hesaplari kapsam disi. "Administrator" = yerel
# RID 500 (alusup); domain yoneticileri "administrator.PUSULADC" gibi acilir.
$HARIC = @("Public", "Default", "Default User", "All Users", "defaultuser0", "WDAGUtilityAccount")

$eklenen = 0; $hata = 0
foreach ($p in Get-ChildItem "C:\Users" -Directory -Force) {
    if ($HARIC -contains $p.Name) { continue }
    if ($p.Name -like "administrator*") { continue }
    if (($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $masaustu = Join-Path $p.FullName "Desktop"
    if (-not (Test-Path -LiteralPath $masaustu)) { continue }
    try {
        if (-not (Get-FsrmQuota -Path $masaustu -ErrorAction SilentlyContinue)) {
            New-FsrmQuota -Path $masaustu -Template $KOTA_SABLONU | Out-Null
            $eklenen++
        }
        if (-not (Get-FsrmFileScreen -Path $masaustu -ErrorAction SilentlyContinue)) {
            New-FsrmFileScreen -Path $masaustu -Template $EKRAN_SABLONU | Out-Null
        }
    } catch {
        $hata++
        Write-EventLog -LogName Application -Source "SRMSVC" -EventId 9001 -EntryType Warning `
            -Message ("PusulaMasaustuKota: {0} uygulanamadi - {1}" -f $masaustu, $_.Exception.Message) -ErrorAction SilentlyContinue
    }
}
"eklenen=$eklenen hata=$hata"
