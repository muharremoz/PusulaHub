$cs = "Server=localhost,1433;Database=PusulaHub;User Id=SA;Password=P67S96L332008%;TrustServerCertificate=True"
$c = New-Object System.Data.SqlClient.SqlConnection $cs
$c.Open()

# Find user tables
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT name FROM sys.tables WHERE name LIKE '%User%' ORDER BY name"
$r = $cmd.ExecuteReader()
$tables = @()
while ($r.Read()) { $tables += $r[0] }
$r.Close()
Write-Output "Tables: $($tables -join ', ')"
Write-Output ""

# Find the main Users table — try common names
foreach ($t in @("PanelUsers","AppUsers")) {
  if ($tables -contains $t) {
    Write-Output "=== $t ==="
    $cmd2 = $c.CreateCommand()
    $cmd2.CommandText = "SELECT TOP 200 * FROM $t"
    $r2 = $cmd2.ExecuteReader()
    $cols = @()
    for ($i=0; $i -lt $r2.FieldCount; $i++) { $cols += $r2.GetName($i) }
    Write-Output ("Cols: " + ($cols -join " | "))
    while ($r2.Read()) {
      $row = @()
      for ($i=0; $i -lt $r2.FieldCount; $i++) {
        $v = $r2.GetValue($i)
        if ($v -is [System.DBNull]) { $v = "" }
        $row += [string]$v
      }
      Write-Output ($row -join " | ")
    }
    $r2.Close()
    Write-Output ""
  }
}

$c.Close()
