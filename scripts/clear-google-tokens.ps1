$cs = "Server=localhost,1433;Database=PusulaHub;User Id=SA;Password=P67S96L332008%;TrustServerCertificate=True"
$c = New-Object System.Data.SqlClient.SqlConnection $cs
$c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "DELETE FROM UserGoogleTokens"
$n = $cmd.ExecuteNonQuery()
Write-Output "deleted rows: $n"
$c.Close()
