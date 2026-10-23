# Yeni terminal — bölge biçimi tr-TR'yi KULLANICI profillerine uygular (tN-kur.ps1'deki Set-Culture yalnız çalışan hesaba —
# agent'tan SYSTEM'e — uygulanır). Windows kurulumunda "Türkçe (Kıbrıs)" tr-CY seçilirse saat 12 saatlik (ÖS/ÖÖ) gelir ve
# varsayılan profil üzerinden HER YENİ KULLANICIYA geçer (T6, 23.10.2026).
# Kaynak: HKU\.DEFAULT\Control Panel\International (Set-Culture tr-TR sonrası). Hedef: varsayılan profil + yüklü kullanıcı kovanları.
#   node __ps.mjs "Terminal N" scripts/yeni-terminal/bolge-tr.ps1
$kaynak = 'Registry::HKU\.DEFAULT\Control Panel\International'
$k = Get-Item $kaynak
if ((Get-ItemProperty $kaynak).LocaleName -ne 'tr-TR') { throw '.DEFAULT tr-TR degil — once tN-kur.ps1 (Set-Culture tr-TR)' }
function Uygula([string]$hedefKok) {
  $h = "Registry::$hedefKok\Control Panel\International"
  if (-not (Test-Path $h)) { New-Item $h -Force | Out-Null }
  foreach ($ad in $k.GetValueNames()) { Set-ItemProperty -Path $h -Name $ad -Value $k.GetValue($ad) -Type ($k.GetValueKind($ad)) }
  $up = "$h\User Profile"
  if (-not (Test-Path $up)) { New-Item $up -Force | Out-Null }
  Set-ItemProperty -Path $up -Name 'Languages' -Value @('tr-TR') -Type MultiString
  # tr-CY dil kaydı kalmasın
  Get-ChildItem $up -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -eq 'tr-CY' } | Remove-Item -Recurse -Force
  (Get-ItemProperty $h).LocaleName + ' ' + (Get-ItemProperty $h).sShortTime
}
reg load HKU\YT_DEF C:\Users\Default\NTUSER.DAT 2>$null | Out-Null
'Varsayilan profil -> ' + (Uygula 'HKU\YT_DEF')
[gc]::Collect(); Start-Sleep -Milliseconds 300; reg unload HKU\YT_DEF 2>$null | Out-Null
foreach ($s in Get-ChildItem 'Registry::HKU' | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' }) {
  $ad = try { (New-Object Security.Principal.SecurityIdentifier($s.PSChildName)).Translate([Security.Principal.NTAccount]).Value } catch { $s.PSChildName }
  "$ad -> " + (Uygula "HKU\$($s.PSChildName)")
}
'Not: acik oturumlarda saat biçimi oturum kapatip acinca (ya da Explorer yeniden baslayinca) gecerli olur.'
