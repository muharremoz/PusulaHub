# BruteForceAttackMonitor veritabanına kayıt atılıyor mu? (salt okuma, 30.10.2026)
#
# Eski SQL sunucusunda BruteForceAttackMonitor 02.12.2024'ten beri var ve
# Altınsaray'ın Pars'ı orada hata vermiyordu. Bu betik, veritabanının
# gerçekten KULLANILDIĞINI (Pars'ın kayıt attığını) gösterir:
#   1) her tablonun satır sayısı + tarih kolonlarındaki en eski / en yeni değer
#   2) SQL'in kendi izi: tabloya en son ne zaman yazıldı / okundu
#      (sys.dm_db_index_usage_stats — SQL yeniden başlayınca sıfırlanır)
#   3) şu an bu veritabanına bağlı oturumlar: kullanıcı, bilgisayar, program, IP
#   4) her tablonun en yeni 5 satırı
# Hiçbir şeye yazmaz. Sonuç ekrana + masaüstüne metin dosyası olarak.
#
# Çalıştırma: powershell -ExecutionPolicy Bypass -File scripts\eski-sql-bruteforce-kayit.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

# Sunucuda (yerelde) çalıştırılır, sa ile bağlanır — yalnız parola sorulur.
$sunucu = 'localhost'
$sp  = Read-Host 'sa parolası' -AsSecureString
$par = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sp))
$cs  = "Server=$sunucu;Database=BruteForceAttackMonitor;User ID=sa;Password=$par;Connect Timeout=15;TrustServerCertificate=True"

$cikti = New-Object System.Collections.Generic.List[string]
function Yaz($s, $renk = 'Gray') { Write-Host $s -ForegroundColor $renk; $cikti.Add($s) }
function Sorgu($sql) {
  $cmd = $b.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
  $t = New-Object Data.DataTable; $t.Load($cmd.ExecuteReader()); return $t
}
function Tablo($t, $enCok = 40) {
  if ($t.Rows.Count -eq 0) { Yaz '  (boş)'; return }
  ($t | Select-Object -First $enCok | Format-Table -AutoSize | Out-String -Width 250).TrimEnd() -split "`r?`n" | ForEach-Object { Yaz ('  ' + $_) }
}

$b = New-Object Data.SqlClient.SqlConnection $cs
try { $b.Open() } catch { Write-Host "Bağlanılamadı: $($_.Exception.Message)" -ForegroundColor Red; return }
$par = $null

$s = Sorgu "SELECT @@SERVERNAME ad, (SELECT sqlserver_start_time FROM sys.dm_os_sys_info) acilis, GETDATE() simdi"
Yaz ("Sunucu {0} | SQL açılışı {1:dd.MM.yyyy HH:mm} | şimdi {2:dd.MM.yyyy HH:mm}" -f $s.ad, $s.acilis, $s.simdi) 'Cyan'
Yaz '(2. bölümdeki yazma/okuma zamanları yalnız SQL açılışından bu yana)'

Yaz "`n=== 1) Tablolar: satır sayısı ve tarih kolonları" 'Cyan'
$tablolar = Sorgu "SELECT s.name sema, t.name tablo, SUM(p.rows) satir FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) GROUP BY s.name, t.name ORDER BY t.name"
foreach ($t in $tablolar) {
  $tam = '[' + $t.sema + '].[' + $t.tablo + ']'
  $kol = Sorgu "SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'$tam') AND system_type_id IN (40,42,43,58,61)"
  $tarih = ''
  foreach ($k in $kol) {
    $r = Sorgu "SELECT MIN([$($k.name)]) mn, MAX([$($k.name)]) mx FROM $tam"
    if ($r.mx -isnot [DBNull]) { $tarih += ('  {0}: {1:dd.MM.yyyy HH:mm} → {2:dd.MM.yyyy HH:mm}' -f $k.name, $r.mn, $r.mx) }
  }
  Yaz ('{0,-34} {1,10} satır{2}' -f $t.tablo, $t.satir, $tarih)
}

Yaz "`n=== 2) SQL'in izi: en son yazma / okuma" 'Cyan'
Tablo (Sorgu @"
SELECT OBJECT_NAME(u.object_id) tablo,
       MAX(u.last_user_update) son_yazma,
       MAX(COALESCE(u.last_user_seek, u.last_user_scan, u.last_user_lookup)) son_okuma,
       SUM(u.user_updates) yazma_sayisi
FROM sys.dm_db_index_usage_stats u
WHERE u.database_id = DB_ID() AND OBJECTPROPERTY(u.object_id, 'IsUserTable') = 1
GROUP BY u.object_id ORDER BY son_yazma DESC
"@)

Yaz "`n=== 3) Şu an bu veritabanına bağlı oturumlar" 'Cyan'
Tablo (Sorgu @"
SELECT s.login_name kullanici, s.host_name bilgisayar, s.program_name program, c.client_net_address ip,
       COUNT(*) oturum, MAX(s.last_request_end_time) son_istek
FROM sys.dm_exec_sessions s LEFT JOIN sys.dm_exec_connections c ON c.session_id = s.session_id
WHERE s.database_id = DB_ID() AND s.session_id <> @@SPID
GROUP BY s.login_name, s.host_name, s.program_name, c.client_net_address ORDER BY son_istek DESC
"@)

Yaz "`n=== 4) Her tablonun en yeni 5 satırı" 'Cyan'
foreach ($t in $tablolar) {
  if ([long]$t.satir -eq 0) { continue }
  $tam = '[' + $t.sema + '].[' + $t.tablo + ']'
  $kol = Sorgu "SELECT TOP 1 name FROM sys.columns WHERE object_id=OBJECT_ID(N'$tam') AND system_type_id IN (40,42,43,58,61) ORDER BY column_id"
  $sira = if ($kol.Rows.Count) { "ORDER BY [$($kol.Rows[0].name)] DESC" } else { '' }
  Yaz ("--- " + $t.tablo)
  Tablo (Sorgu "SELECT TOP 5 * FROM $tam $sira") 5
}
$b.Close()

$dosya = Join-Path ([Environment]::GetFolderPath('Desktop')) ("bruteforce-kayit-{0}-{1:yyyyMMdd-HHmm}.txt" -f ($sunucu -replace '[^\w\.-]', '_'), (Get-Date))
$cikti | Set-Content -LiteralPath $dosya -Encoding UTF8
Write-Host "`nÇıktı: $dosya" -ForegroundColor Cyan
