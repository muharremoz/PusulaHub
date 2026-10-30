# Eski SQL sunucusunda bir firmanın veritabanlarıyla ilgili hata/uyarıları arar (salt okuma, 30.10.2026).
#
# Soru: 3284 ALTINSARAY'ın Pars uygulaması yeni SQL'de BruteForceAttackMonitor'a
# 30 sn'de bir bağlanmayı deniyor ("veritabanı açılamadı"). Aynı şey eski
# sunucuda da var mıydı — ve ALTINSARAY datalarıyla ilgili başka hata var mı?
#
# Ne yapar: SQL hata günlüğünün BÜTÜN arşivlerini (sp_enumerrorlogs) okur ve
#   1) data adı süzgecini (varsayılan ALTINSARAY) geçiren HER satırı
#      (giriş hatası, uyarı, yedek / geri yükleme, bozulma, kilitlenme…)
#   2) BruteForceAttackMonitor geçen bütün giriş hatalarını
# toplar. Kullanıcıya göre süzmez: hatayı üreten giriş sa olmayabilir.
# Sonucu tür / kullanıcı / IP / gün kırılımında özetler, tam listeyi
# masaüstüne CSV yazar. Hiçbir şeye yazmaz, hiçbir ayarı değiştirmez.
#
# Çalıştırma (eski SQL sunucusunun kendisinde, Windows PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts\eski-sql-bruteforce-ara.ps1
# Not: SQL günlüğü varsayılan olarak yalnız son 6 arşivi tutar (her yeniden
# başlatmada bir yenisi açılır) — çok eski tarihler günlükte olmayabilir.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

# Sunucuda (yerelde) çalıştırılır, sa ile bağlanır — yalnız parola sorulur.
$sunucu = 'localhost'
$sp  = Read-Host 'sa parolası' -AsSecureString
$par = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sp))
$cs  = "Server=$sunucu;Database=master;User ID=sa;Password=$par;Connect Timeout=15;TrustServerCertificate=True"
$data = 'ALTINSARAY'

function Sorgu($baglanti, $sql) {
  $cmd = $baglanti.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 300
  $t = New-Object Data.DataTable; $t.Load($cmd.ExecuteReader()); return $t
}

function Tur($metin) {
  if ($metin -match 'Login failed') {
    if ($metin -match 'explicitly specified database') { return 'giris: veritabani acilamadi' }
    if ($metin -match 'Password did not match')        { return 'giris: parola yanlis' }
    if ($metin -match 'Could not find a login')        { return 'giris: kullanici yok' }
    return 'giris: diger'
  }
  if ($metin -match '(?i)deadlock')                     { return 'kilitlenme' }
  if ($metin -match '(?i)backup|BACKUP')                { return 'yedek' }
  if ($metin -match '(?i)restor')                       { return 'geri yukleme' }
  if ($metin -match '(?i)corrupt|consistency|CHECKDB|823|824|825') { return 'butunluk / disk' }
  if ($metin -match '(?i)log.*full|full.*log|9002')     { return 'log dolu' }
  if ($metin -match '(?i)Starting up database|recovery') { return 'acilis / kurtarma' }
  return 'diger'
}

$b = New-Object Data.SqlClient.SqlConnection $cs
try { $b.Open() } catch { Write-Host "Bağlanılamadı: $($_.Exception.Message)" -ForegroundColor Red; return }
$par = $null

$bilgi = Sorgu $b "SELECT @@SERVERNAME ad, CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(30)) surum, (SELECT COUNT(*) FROM sys.databases WHERE name='BruteForceAttackMonitor') brute_db"
Write-Host ("Sunucu: {0}  sürüm {1}  BruteForceAttackMonitor veritabanı: {2}" -f $bilgi.ad, $bilgi.surum, $(if ($bilgi.brute_db -gt 0) { 'VAR' } else { 'YOK' })) -ForegroundColor Cyan
$dbler = Sorgu $b "SELECT name, state_desc FROM sys.databases WHERE name LIKE N'%$($data.Replace("'", "''"))%' ORDER BY name"
Write-Host ("'$data' içeren veritabanları: " + (($dbler | ForEach-Object { $_.name + ' (' + $_.state_desc + ')' }) -join ', '))

$arsivler = Sorgu $b 'EXEC sp_enumerrorlogs'
Write-Host ("Günlük arşivi: {0} adet (en eski: {1})" -f $arsivler.Rows.Count, ($arsivler | Sort-Object Date | Select-Object -First 1).Date)

$satirlar = New-Object System.Collections.Generic.List[object]
$gorulen  = @{}
foreach ($a in $arsivler) {
  $no = [int]$a.'Archive #'
  foreach ($terim in @($data, 'BruteForceAttackMonitor')) {
    try {
      $t = Sorgu $b ("EXEC master.dbo.xp_readerrorlog {0}, 1, N'{1}'" -f $no, $terim.Replace("'", "''"))
    } catch { Write-Host "  arşiv $no / $terim okunamadı: $($_.Exception.Message)" -ForegroundColor Yellow; continue }
    foreach ($r in $t) {
      $metin = [string]$r.Text
      $anahtar = "$no|$($r.LogDate)|$metin"
      if ($gorulen.ContainsKey($anahtar)) { continue }   # iki terimi birden geçiren satır bir kez
      $gorulen[$anahtar] = 1
      $satirlar.Add([pscustomobject]@{
        Zaman     = [datetime]$r.LogDate
        Tur       = Tur $metin
        Kullanici = [regex]::Match($metin, "user '([^']*)'").Groups[1].Value
        Veritabani= [regex]::Match($metin, "database '([^']*)'").Groups[1].Value
        IP        = [regex]::Match($metin, 'CLIENT: ([^\]]+)\]').Groups[1].Value.Trim()
        Kaynak    = [string]$r.ProcessInfo
        Arsiv     = $no
        Metin     = $metin
      })
    }
  }
  Write-Host ("  arşiv {0,2} ({1:dd.MM.yyyy}) okundu" -f $no, $a.Date)
}
$b.Close()

if ($satirlar.Count -eq 0) {
  Write-Host "`nOkunan arşivlerin kapsadığı dönemde '$data' ya da BruteForceAttackMonitor geçen satır YOK." -ForegroundColor Green
  return
}

Write-Host ("`nToplam {0} satır, {1:dd.MM.yyyy HH:mm} - {2:dd.MM.yyyy HH:mm}" -f $satirlar.Count, ($satirlar | Measure-Object Zaman -Minimum).Minimum, ($satirlar | Measure-Object Zaman -Maximum).Maximum) -ForegroundColor Cyan

Write-Host "`n--- Tür"
$satirlar | Group-Object Tur | Sort-Object Count -Descending | ForEach-Object { '{0,7}  {1}' -f $_.Count, $_.Name }

Write-Host "`n--- Giriş hataları: kullanıcı / veritabanı / IP"
$satirlar | Where-Object { $_.Tur -like 'giris:*' } | Group-Object Kullanici, Veritabani, IP | Sort-Object Count -Descending | Select-Object -First 25 | ForEach-Object {
  $ilk = ($_.Group | Measure-Object Zaman -Minimum).Minimum; $son = ($_.Group | Measure-Object Zaman -Maximum).Maximum
  '{0,7}  {1}  ilk {2:dd.MM HH:mm}  son {3:dd.MM HH:mm}' -f $_.Count, $_.Name, $ilk, $son
}

Write-Host "`n--- Gün gün"
$satirlar | Group-Object { $_.Zaman.ToString('yyyy-MM-dd') } | Sort-Object Name | ForEach-Object {
  $saat = $_.Group | Group-Object { $_.Zaman.Hour } | Sort-Object { [int]$_.Name }
  $turler = ($_.Group | Group-Object Tur | Sort-Object Count -Descending | ForEach-Object { "$($_.Name) $($_.Count)" }) -join ', '
  '{0}  {1,6} satır  saat {2:00}-{3:00}  [{4}]' -f $_.Name, $_.Count, [int]$saat[0].Name, [int]$saat[-1].Name, $turler
}

Write-Host "`n--- Giriş dışı son 15 satır"
$satirlar | Where-Object { $_.Tur -notlike 'giris:*' } | Sort-Object Zaman -Descending | Select-Object -First 15 | ForEach-Object {
  '{0:dd.MM.yyyy HH:mm:ss}  [{1}]  {2}' -f $_.Zaman, $_.Tur, $_.Metin.Substring(0, [Math]::Min(160, $_.Metin.Length))
}

$csv = Join-Path ([Environment]::GetFolderPath('Desktop')) ("eski-sql-{0}-{1:yyyyMMdd-HHmm}.csv" -f $data, (Get-Date))
$satirlar | Sort-Object Zaman | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8 -Delimiter ';'
Write-Host "`nTam liste: $csv" -ForegroundColor Cyan
