exec sp_executesql N'select top 1 * from  (SELECT m.Mlzadi, ROUND(f.DevMik+f.GirMik-f.CikMik,2) as Miktar, ROUND(((f.DevTut+f.GirTut-f.CikTut)+(f.DevIsc+f.GirIsc-f.CikIsc))/NULLIF(f.DevMik+f.Girmik-f.CikMik,0),3) as BirimMaliyet, f.IscilikBr
FROM dbo.FindStock(@User,GETDATE(),0,0,0) f INNER JOIN Malzeme m on f.Grpkod = m.GrpID and f.Mlzkod = m.Mlzkod
WHERE ROUND(DevMik+GirMik-CikMik,2)<>0
) "DashboardSubSelectRe" 
where (0 = 1)',N'@USER int',@USER=1
GO
exec sp_executesql N'EXEC [dbo].[Report_Position]
    @PersonalId = @USER,
    @Date =NULL,
    @ParaBr = ''HAS'';',N'@USER int',@USER=1
GO
exec sp_executesql N'select "TBL0"."Mlzadi","TBL0"."Miktar","TBL0"."BirimMaliyet","TBL0"."IscilikBr" from  (SELECT m.Mlzadi, ROUND(f.DevMik+f.GirMik-f.CikMik,2) as Miktar, ROUND(((f.DevTut+f.GirTut-f.CikTut)+(f.DevIsc+f.GirIsc-f.CikIsc))/NULLIF(f.DevMik+f.Girmik-f.CikMik,0),3) as BirimMaliyet, f.IscilikBr
FROM dbo.FindStock(@User,GETDATE(),0,0,0) f INNER JOIN Malzeme m on f.Grpkod = m.GrpID and f.Mlzkod = m.Mlzkod
WHERE ROUND(DevMik+GirMik-CikMik,2)<>0
) "TBL0" 
group by "TBL0"."Mlzadi","TBL0"."Miktar","TBL0"."BirimMaliyet","TBL0"."IscilikBr"',N'@USER int',@USER=1
GO
exec sp_executesql N'select "TBL0"."Kasa","TBL0"."Birim",sum("TBL0"."Bakiye") from  (SELECT f.firmaTanimi as Kasa, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi Birim
FROM dbo.FindBalance(@USER,GETDATE(),(SELECT KasaHesapTipi FROM Sabitler),0) ff INNER JOIN Firma f ON f.firmaKodu = ff.Firkod
) "TBL0" 
group by "TBL0"."Kasa","TBL0"."Birim"',N'@USER int',@USER=1
GO
exec sp_executesql N'select "TBL0"."Hesap","TBL0"."Birim",sum("TBL0"."Bakiye") from  (SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT BankaHesabi FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
UNION ALL
SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT CASE WHEN BankaHesabi = POSHesabi or POSHesabi <=0 THEN -1 ELSE POSHesabi END FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
) "TBL0" 
group by "TBL0"."Hesap","TBL0"."Birim"',N'@USER int',@USER=1
GO
exec sp_executesql N'select "TBL0"."Hesap",sum("TBL0"."Bakiye") from  (SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT BankaHesabi FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
UNION ALL
SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT CASE WHEN BankaHesabi = POSHesabi or POSHesabi <=0 THEN -1 ELSE POSHesabi END FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
) "TBL0" 
group by "TBL0"."Hesap"',N'@USER int',@USER=1
GO
exec sp_executesql N'select "TBL0"."Birim",sum("TBL0"."Bakiye") from  (SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT BankaHesabi FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
UNION ALL
SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT CASE WHEN BankaHesabi = POSHesabi or POSHesabi <=0 THEN -1 ELSE POSHesabi END FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
) "TBL0" 
group by "TBL0"."Birim"',N'@USER int',@USER=1
GO
exec sp_executesql N'select sum("TBL0"."Bakiye") from  (SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT BankaHesabi FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
UNION ALL
SELECT f.firmaTanimi as Hesap, ff.Borc - ff.Alacak as Bakiye, ff.DovCinsi as Birim
FROM dbo.FindBalance(@USER, GETDATE(), (SELECT CASE WHEN BankaHesabi = POSHesabi or POSHesabi <=0 THEN -1 ELSE POSHesabi END FROM Sabitler),0) ff INNER JOIN Firma f on f.firmaKodu = ff.Firkod
) "TBL0" ',N'@USER int',@USER=1
GO
exec sp_executesql N'select B_DovCinsi DovCinsi,isnull(b.Borc,0) Borc,isnull(b.Alacak,0) Alacak,isnull(d.Kusurat,2) Kusurat,isnull(d.Esira,0) OrderScreen from DovizB d left join FindProcessBalance(@firkod,@carinum,@date) b on b.DovCinsi = d.B_DovCinsi',N'@firkod bigint,@carinum nvarchar(5),@date datetime',@firkod=2,@carinum=N'39638',@date='2026-10-01 00:00:00'