$server = "localhost"
$database = "PusulaHub"
$user = "SA"
$password = "P67S96L332008%"
$sqlPath = Join-Path $PSScriptRoot "2026-04-22-userapps-role-and-permissions-appid.sql"
$sql = [System.IO.File]::ReadAllText($sqlPath)

$connStr = "Server=$server;Database=$database;User Id=$user;Password=$password;TrustServerCertificate=true;"
$conn = New-Object System.Data.SqlClient.SqlConnection $connStr
$conn.Open()

# GO ile split edip batch batch calistir
$batches = [regex]::Split($sql, "(?im)^\s*GO\s*$")
foreach ($b in $batches) {
  if ($b.Trim() -eq "") { continue }
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $b
  $cmd.CommandTimeout = 60
  try {
    $reader = $cmd.ExecuteReader()
    while ($reader.Read()) {
      $row = @()
      for ($i = 0; $i -lt $reader.FieldCount; $i++) {
        $row += "$($reader.GetName($i))=$($reader.GetValue($i))"
      }
      Write-Host ($row -join " | ")
    }
    $reader.Close()
  } catch {
    Write-Host "HATA: $_" -ForegroundColor Red
  }
}

$conn.Close()
Write-Host "Migration tamamlandi." -ForegroundColor Green
