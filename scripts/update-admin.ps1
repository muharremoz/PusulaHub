$cs = "Server=localhost,1433;Database=PusulaHub;User Id=SA;Password=P67S96L332008%;TrustServerCertificate=True"
$c = New-Object System.Data.SqlClient.SqlConnection $cs
$c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "UPDATE AppUsers SET Username = 'admin@pusulanet.net', Email = 'admin@pusulanet.net', UpdatedAt = GETDATE() WHERE Id = 'B1B3E697-7D07-4A46-9A9A-D374507B044C'"
$n = $cmd.ExecuteNonQuery()
Write-Output "updated rows: $n"
$c.Close()
