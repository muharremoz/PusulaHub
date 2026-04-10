$conn = New-Object System.Data.SqlClient.SqlConnection('Server=localhost,1433;Database=PusulaHub;User Id=SA;Password=P67S96L332008%;TrustServerCertificate=true;')
$conn.Open()
$sql = Get-Content -Raw "$PSScriptRoot\2026-04-10-wizard-services-typed.sql"
$batches = $sql -split '(?mi)^\s*GO\s*$'
foreach ($b in $batches) {
    if ($b.Trim()) {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $b
        try {
            $cmd.ExecuteNonQuery() | Out-Null
            Write-Host "OK batch"
        } catch {
            Write-Host "ERR: $($_.Exception.Message)"
        }
    }
}
$conn.Close()
Write-Host "Done."
