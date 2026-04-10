$server   = "localhost"
$database = "PusulaHub"
$sqlFile  = "$PSScriptRoot\2026-04-10-company-server-assignment.sql"
$sql      = Get-Content $sqlFile -Raw
Invoke-Sqlcmd -ServerInstance $server -Database $database -Query $sql
Write-Host "Migration uygulandı: company-server-assignment"
