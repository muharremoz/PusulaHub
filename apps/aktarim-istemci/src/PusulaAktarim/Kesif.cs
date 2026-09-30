using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace PusulaAktarim
{
    // ------------------------------------------------------------ rapor modeli (JSON: servise gider)

    internal sealed class KesifRaporu
    {
        public string Zaman;
        public string Makine;
        public string IstemciSurum;
        public SqlBilgisi Sql;
        public List<VeritabaniBilgisi> Veritabanlari = new List<VeritabaniBilgisi>();
        public List<Dictionary<string, object>> Guvenlik = new List<Dictionary<string, object>>();
        public List<KlasorBilgisi> ResimKlasorleri = new List<KlasorBilgisi>();
        public List<ProgramKlasoru> ProgramKlasorleri = new List<ProgramKlasoru>();
        public List<string> Uyarilar = new List<string>();
    }

    internal sealed class SqlBilgisi
    {
        public string Sunucu;
        public string Kaynak;          // windows | ps.dat | elle
        public string MakineAdi;       // SERVERPROPERTY('MachineName')
        public bool Yerel;             // SQL bu makinede mi (yedek dosyasını buradan okuyabilir miyiz)
        public string Surum;
        public string Surumu;          // Edition
        public bool SikistirmaVar;     // Express'te BACKUP ... COMPRESSION yok
        public string YedekKlasoru;
    }

    internal sealed class VeritabaniBilgisi
    {
        public string Ad;
        public string Durum;
        public string KurtarmaModeli;
        public double VeriMb;
        public double LogMb;
        public string SonYedek;
        /// <summary>firma | transfer | diger — guvenlik'te satırı olan firma datası, URN*/TRANSFER, geri kalan.</summary>
        public string Tur;
        public bool GuvenlikteVar;
        public List<string> SirketAdlari = new List<string>();
        public string PrgTur;
        public string Kod;
    }

    internal sealed class KlasorBilgisi
    {
        public string Yol;
        public bool Var;
        public int DosyaSayisi;
        public double BoyutMb;
        public bool Eksik;             // süre/sayı sınırına takıldı, sayım eksik
        public List<string> Kullananlar = new List<string>();
    }

    internal sealed class ProgramKlasoru
    {
        public string Yol;
        public List<string> Exeler = new List<string>();
        public List<ParametreDosyasi> Parametreler = new List<ParametreDosyasi>();
    }

    internal sealed class ParametreDosyasi
    {
        public string Ad;
        public string DataKodu;
    }

    /// <summary>
    /// Keşif: bu makinedeki SQL Server'da Pusula datalarını, resim ve program
    /// klasörlerini bulur. Yalnız OKUR, hiçbir şey değiştirmez.
    /// </summary>
    internal static class Kesif
    {
        private static readonly Regex TransferAdi = new Regex(@"^URN|TRANSFER", RegexOptions.IgnoreCase);
        private static readonly string[] SistemDbleri = { "master", "model", "msdb", "tempdb", "ReportServer", "ReportServerTempDB", "distribution" };
        /// <summary>guvenlik'ten servise GİTMEYEN sütunlar (lisans/şifre bilgileri).</summary>
        private static readonly string[] GizliSutunlar = { "pin", "puk", "vc" };

        public static async Task<KesifRaporu> Calistir(SqlHedef h, Action<string> ilerleme)
        {
            var r = new KesifRaporu
            {
                Zaman = DateTime.Now.ToString("s"),
                Makine = Environment.MachineName,
                IstemciSurum = ServisIstemci.Surum,
            };

            ilerleme("SQL Server bilgileri okunuyor…");
            using (var c = new SqlConnection(h.BaglantiMetni("master", 10)))
            {
                await c.OpenAsync().ConfigureAwait(false);
                r.Sql = await SqlBilgisiOku(c, h).ConfigureAwait(false);

                ilerleme("Veritabanları listeleniyor…");
                r.Veritabanlari = await VeritabanlariOku(c).ConfigureAwait(false);

                ilerleme("Şirket tanımları (guvenlik) okunuyor…");
                r.Guvenlik = await GuvenlikOku(c, r.Uyarilar).ConfigureAwait(false);
            }
            Siniflandir(r);

            ilerleme("Resim klasörleri taranıyor…");
            r.ResimKlasorleri = ResimKlasorleri(r.Guvenlik, ilerleme);

            ilerleme("Program klasörleri aranıyor…");
            r.ProgramKlasorleri = ProgramKlasorleri();

            if (!r.Sql.Yerel)
                r.Uyarilar.Add("SQL Server bu bilgisayarda değil (" + r.Sql.MakineAdi + "). Yedek dosyaları o sunucuda oluşur; aktarım için uygulamayı SQL Server'ın kurulu olduğu bilgisayarda çalıştırın.");
            if (!r.Veritabanlari.Any(v => v.Tur == "firma"))
                r.Uyarilar.Add("guvenlik tablosunda eşleşen firma datası bulunamadı.");
            return r;
        }

        private static async Task<SqlBilgisi> SqlBilgisiOku(SqlConnection c, SqlHedef h)
        {
            const string sorgu = @"
SELECT CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)),
       CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)),
       CAST(SERVERPROPERTY('Edition') AS nvarchar(128)),
       CAST(SERVERPROPERTY('EngineEdition') AS int),
       CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(512))";
            using (var k = new SqlCommand(sorgu, c))
            using (var o = await k.ExecuteReaderAsync().ConfigureAwait(false))
            {
                await o.ReadAsync().ConfigureAwait(false);
                var makine = o.IsDBNull(0) ? "" : o.GetString(0);
                var engine = o.IsDBNull(3) ? 0 : o.GetInt32(3);
                return new SqlBilgisi
                {
                    Sunucu = h.Sunucu,
                    Kaynak = h.Kaynak,
                    MakineAdi = makine,
                    Yerel = string.Equals(makine, Environment.MachineName, StringComparison.OrdinalIgnoreCase),
                    Surum = o.IsDBNull(1) ? "" : o.GetString(1),
                    Surumu = o.IsDBNull(2) ? "" : o.GetString(2),
                    // EngineEdition 4 = Express → yedek sıkıştırma yok
                    SikistirmaVar = engine != 4,
                    YedekKlasoru = o.IsDBNull(4) ? null : o.GetString(4),
                };
            }
        }

        private static async Task<List<VeritabaniBilgisi>> VeritabanlariOku(SqlConnection c)
        {
            const string sorgu = @"
SELECT d.name, d.state_desc, d.recovery_model_desc,
       CAST(SUM(CASE WHEN f.type = 0 THEN f.size ELSE 0 END) * 8.0 / 1024 AS float),
       CAST(SUM(CASE WHEN f.type = 1 THEN f.size ELSE 0 END) * 8.0 / 1024 AS float),
       (SELECT MAX(b.backup_finish_date) FROM msdb.dbo.backupset b WHERE b.database_name = d.name AND b.type = 'D')
FROM sys.databases d
LEFT JOIN sys.master_files f ON f.database_id = d.database_id
WHERE d.database_id > 4
GROUP BY d.name, d.state_desc, d.recovery_model_desc
ORDER BY d.name";
            var liste = new List<VeritabaniBilgisi>();
            using (var k = new SqlCommand(sorgu, c) { CommandTimeout = 60 })
            using (var o = await k.ExecuteReaderAsync().ConfigureAwait(false))
            {
                while (await o.ReadAsync().ConfigureAwait(false))
                {
                    var ad = o.GetString(0);
                    if (SistemDbleri.Contains(ad, StringComparer.OrdinalIgnoreCase)) continue;
                    liste.Add(new VeritabaniBilgisi
                    {
                        Ad = ad,
                        Durum = o.GetString(1),
                        KurtarmaModeli = o.GetString(2),
                        VeriMb = Math.Round(o.IsDBNull(3) ? 0 : o.GetDouble(3), 1),
                        LogMb = Math.Round(o.IsDBNull(4) ? 0 : o.GetDouble(4), 1),
                        SonYedek = o.IsDBNull(5) ? null : o.GetDateTime(5).ToString("s"),
                    });
                }
            }
            return liste;
        }

        /// <summary>sirket.dbo.guvenlik — sütunlar kurulumdan kuruluma değişiyor, hepsini oku, gizlileri at.</summary>
        private static async Task<List<Dictionary<string, object>>> GuvenlikOku(SqlConnection c, List<string> uyarilar)
        {
            var liste = new List<Dictionary<string, object>>();
            try
            {
                using (var k = new SqlCommand("SELECT * FROM sirket.dbo.guvenlik", c) { CommandTimeout = 30 })
                using (var o = await k.ExecuteReaderAsync().ConfigureAwait(false))
                {
                    while (await o.ReadAsync().ConfigureAwait(false))
                    {
                        var satir = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        for (var i = 0; i < o.FieldCount; i++)
                        {
                            var ad = o.GetName(i);
                            if (GizliSutunlar.Contains(ad, StringComparer.OrdinalIgnoreCase)) continue;
                            var v = o.IsDBNull(i) ? null : o.GetValue(i);
                            satir[ad] = v is string s ? s.Trim() : v;
                        }
                        liste.Add(satir);
                    }
                }
            }
            catch (SqlException e)
            {
                uyarilar.Add("sirket.guvenlik okunamadı: " + e.Message);
            }
            return liste;
        }

        private static string Deger(Dictionary<string, object> s, string ad) =>
            s.TryGetValue(ad, out var v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)?.Trim() : null;

        private static void Siniflandir(KesifRaporu r)
        {
            foreach (var v in r.Veritabanlari)
            {
                var satirlar = r.Guvenlik.Where(g => string.Equals(Deger(g, "DataYolu"), v.Ad, StringComparison.OrdinalIgnoreCase)).ToList();
                v.GuvenlikteVar = satirlar.Count > 0;
                v.SirketAdlari = satirlar.Select(g => Deger(g, "srkadi")).Where(x => !string.IsNullOrEmpty(x)).Distinct().ToList();
                v.PrgTur = satirlar.Select(g => Deger(g, "PrgTur")).FirstOrDefault(x => !string.IsNullOrEmpty(x));
                v.Kod = satirlar.Select(g => Deger(g, "KOD")).FirstOrDefault(x => !string.IsNullOrEmpty(x));
                if (string.Equals(v.Ad, "sirket", StringComparison.OrdinalIgnoreCase)) v.Tur = "sirket";
                else if (TransferAdi.IsMatch(v.Ad)) v.Tur = "transfer";
                else v.Tur = v.GuvenlikteVar ? "firma" : "diger";
            }
        }

        // ------------------------------------------------------------ resim klasörleri

        private const int ResimSayiSiniri = 500_000;
        private static readonly TimeSpan ResimSureSiniri = TimeSpan.FromSeconds(45);

        private static List<KlasorBilgisi> ResimKlasorleri(List<Dictionary<string, object>> guvenlik, Action<string> ilerleme)
        {
            var yollar = new Dictionary<string, KlasorBilgisi>(StringComparer.OrdinalIgnoreCase);
            foreach (var g in guvenlik)
            {
                var ham = Deger(g, "resimyolu");
                if (string.IsNullOrWhiteSpace(ham)) continue;
                var yol = ham.Replace('/', '\\').TrimEnd('\\');
                if (!yollar.TryGetValue(yol, out var k)) yollar[yol] = k = new KlasorBilgisi { Yol = yol };
                var ad = Deger(g, "srkadi");
                if (ad != null && !k.Kullananlar.Contains(ad)) k.Kullananlar.Add(ad);
            }
            foreach (var k in yollar.Values)
            {
                ilerleme("Resim klasörü taranıyor: " + k.Yol);
                try { k.Var = Directory.Exists(k.Yol); } catch { k.Var = false; }
                if (!k.Var) continue;
                var sure = Stopwatch.StartNew();
                long bayt = 0;
                var sayi = 0;
                var yigin = new Stack<string>();
                yigin.Push(k.Yol);
                while (yigin.Count > 0)
                {
                    if (sayi >= ResimSayiSiniri || sure.Elapsed > ResimSureSiniri) { k.Eksik = true; break; }
                    var d = yigin.Pop();
                    try
                    {
                        foreach (var f in new DirectoryInfo(d).EnumerateFiles()) { sayi++; bayt += f.Length; }
                        foreach (var alt in Directory.EnumerateDirectories(d)) yigin.Push(alt);
                    }
                    catch { /* erişim yok → atla */ }
                }
                k.DosyaSayisi = sayi;
                k.BoyutMb = Math.Round(bayt / 1048576.0, 1);
            }
            return yollar.Values.ToList();
        }

        // ------------------------------------------------------------ program klasörleri

        private static readonly Regex DataKoduSatiri = new Regex(@"^\[DATA KODU\]\s*(.+)$", RegexOptions.Multiline);
        private static readonly Regex DataKoduBlok = new Regex(@"<DATAKODU>\s*([^<]*?)\s*</DATAKODU>", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        /// <summary>Sabit disklerdeki \Pusula klasörlerinde parametre dosyası olan klasörler (en fazla 4 seviye).</summary>
        private static List<ProgramKlasoru> ProgramKlasorleri()
        {
            var sonuc = new List<ProgramKlasoru>();
            var kokler = DriveInfo.GetDrives()
                .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
                .Select(d => Path.Combine(d.RootDirectory.FullName, "Pusula"))
                .Where(Directory.Exists)
                .ToList();
            foreach (var kok in kokler) Tara(kok, 0, sonuc);
            return sonuc;
        }

        private static void Tara(string klasor, int derinlik, List<ProgramKlasoru> sonuc)
        {
            if (derinlik > 4 || sonuc.Count > 200) return;
            try
            {
                var parametreler = Directory.EnumerateFiles(klasor, "*arametre*.txt").ToList();
                if (parametreler.Count > 0)
                {
                    var p = new ProgramKlasoru { Yol = klasor };
                    p.Exeler = Directory.EnumerateFiles(klasor, "*.exe").Select(Path.GetFileName).OrderBy(x => x).ToList();
                    foreach (var dosya in parametreler)
                    {
                        string kod = null;
                        try
                        {
                            var metin = File.ReadAllText(dosya, Encoding.GetEncoding(1254));
                            var m = DataKoduBlok.Match(metin);
                            if (!m.Success) m = DataKoduSatiri.Match(metin);
                            if (m.Success) kod = m.Groups[1].Value.Trim();
                        }
                        catch { }
                        p.Parametreler.Add(new ParametreDosyasi { Ad = Path.GetFileName(dosya), DataKodu = kod });
                    }
                    sonuc.Add(p);
                }
                foreach (var alt in Directory.EnumerateDirectories(klasor))
                {
                    var ad = Path.GetFileName(alt);
                    // Resim/yedek klasörlerine inme — parametre dosyası orada olmaz, tarama uzar.
                    if (Regex.IsMatch(ad, @"^(resim|resimler|yedek|backup|temp|log)", RegexOptions.IgnoreCase)) continue;
                    Tara(alt, derinlik + 1, sonuc);
                }
            }
            catch { /* erişim yok */ }
        }
    }
}
