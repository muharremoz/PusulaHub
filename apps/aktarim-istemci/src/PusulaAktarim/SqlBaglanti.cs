using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace PusulaAktarim
{
    /// <summary>Bağlanılacak SQL Server. Şifre yalnız bellekte; servise gönderilmez.</summary>
    internal sealed class SqlHedef
    {
        public string Sunucu;
        public string Kullanici;   // null → Windows oturumu
        public string Sifre;
        public string Kaynak;      // "windows" | "ps.dat" | "elle"

        public string BaglantiMetni(string veritabani = "master", int zamanAsimi = 8) =>
            new SqlConnectionStringBuilder
            {
                DataSource = Sunucu,
                InitialCatalog = veritabani,
                IntegratedSecurity = Kullanici == null,
                UserID = Kullanici ?? "",
                Password = Sifre ?? "",
                ConnectTimeout = zamanAsimi,
                Encrypt = false,
                TrustServerCertificate = true,
                ApplicationName = "PusulaAktarim",
                Pooling = true,
            }.ConnectionString;
    }

    /// <summary>
    /// Bu makinedeki SQL Server'ı bulup bağlanır. Sıra (SQL Konsol'daki düzen):
    ///   1. Yerel örnekler (kayıt defteri) + ps.dat'taki sunucu, Windows oturumuyla
    ///   2. C:\Pusula\ps.dat (sa + base64 şifre)
    ///   3. Elle giriş (arayüz)
    /// Bağlantı ancak sirket veritabanı görülebiliyorsa "uygun" sayılır; yoksa ilk
    /// başarılı bağlantı kullanılır (kullanıcı listeden değiştirebilir).
    /// </summary>
    internal static class SqlBaglanti
    {
        public const string PsDatYolu = @"C:\Pusula\ps.dat";

        /// <summary>Bu makinede kurulu SQL Server örnekleri ("." varsayılan, ".\AD" adlı).</summary>
        public static List<string> YerelOrnekler()
        {
            var sonuc = new List<string>();
            foreach (var gorunum in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                try
                {
                    using (var kok = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, gorunum))
                    using (var k = kok.OpenSubKey(@"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"))
                    {
                        if (k == null) continue;
                        foreach (var ad in k.GetValueNames())
                        {
                            var s = ad.Equals("MSSQLSERVER", StringComparison.OrdinalIgnoreCase) ? "." : @".\" + ad;
                            if (!sonuc.Contains(s, StringComparer.OrdinalIgnoreCase)) sonuc.Add(s);
                        }
                    }
                }
                catch { }
            }
            return sonuc;
        }

        /// <summary>ps.dat: 1. satır sunucu, 2. satır sa şifresi (base64). Yoksa/bozuksa null.</summary>
        public static SqlHedef PsDat()
        {
            try
            {
                if (!File.Exists(PsDatYolu)) return null;
                var satirlar = File.ReadAllLines(PsDatYolu).Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                if (satirlar.Length < 2) return null;
                var sifre = Encoding.UTF8.GetString(Convert.FromBase64String(satirlar[1]));
                return string.IsNullOrEmpty(sifre) ? null
                    : new SqlHedef { Sunucu = satirlar[0], Kullanici = "sa", Sifre = sifre, Kaynak = "ps.dat" };
            }
            catch { return null; }
        }

        /// <summary>Denenecek adaylar, sırasıyla.</summary>
        public static List<SqlHedef> Adaylar()
        {
            var ps = PsDat();
            var liste = new List<SqlHedef>();
            var sunucular = YerelOrnekler();
            if (ps != null && !sunucular.Contains(ps.Sunucu, StringComparer.OrdinalIgnoreCase)) sunucular.Insert(0, ps.Sunucu);
            foreach (var s in sunucular) liste.Add(new SqlHedef { Sunucu = s, Kaynak = "windows" });
            if (ps != null) liste.Add(ps);
            return liste;
        }

        /// <summary>Bağlanmayı dener; olmazsa hata mesajını döndürür (null = başarılı).</summary>
        public static async Task<string> Dene(SqlHedef h)
        {
            try
            {
                using (var c = new SqlConnection(h.BaglantiMetni("master", 6)))
                {
                    await c.OpenAsync().ConfigureAwait(false);
                    return null;
                }
            }
            catch (Exception e) { return e.GetBaseException().Message; }
        }

        /// <summary>sirket veritabanı bu bağlantıda var ve okunabiliyor mu.</summary>
        public static async Task<bool> SirketVar(SqlHedef h)
        {
            try
            {
                using (var c = new SqlConnection(h.BaglantiMetni("master", 6)))
                {
                    await c.OpenAsync().ConfigureAwait(false);
                    using (var k = new SqlCommand("SELECT HAS_DBACCESS('sirket')", c))
                        return Convert.ToInt32(await k.ExecuteScalarAsync().ConfigureAwait(false) ?? 0) == 1;
                }
            }
            catch { return false; }
        }
    }
}
