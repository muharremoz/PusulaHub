$conn = New-Object System.Data.SqlClient.SqlConnection('Server=localhost,1433;Database=PusulaHub;User Id=SA;Password=P67S96L332008%;TrustServerCertificate=true;')
$conn.Open()

function RunQuery($title, $sql) {
    Write-Host "`n=== $title ==="
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $reader = $cmd.ExecuteReader()
    while ($reader.Read()) {
        $row = @()
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $row += "$($reader.GetName($i))=$($reader.GetValue($i))"
        }
        Write-Host ($row -join " | ")
    }
    $reader.Close()
}

RunQuery "WizardServices kolonlari" "SELECT name, system_type_id, is_nullable FROM sys.columns WHERE object_id = OBJECT_ID('WizardServices') ORDER BY column_id"
RunQuery "WizardPortRanges var mi" "SELECT COUNT(*) AS Count FROM sys.tables WHERE name = 'WizardPortRanges'"
RunQuery "WizardPortAssignments var mi" "SELECT COUNT(*) AS Count FROM sys.tables WHERE name = 'WizardPortAssignments'"

$conn.Close()
