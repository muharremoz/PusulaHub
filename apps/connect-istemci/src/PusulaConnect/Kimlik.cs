using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    /// <summary>
    /// Cihaz kaydı: servis tokenı (DPAPI, yalnız bu Windows kullanıcısı açabilir) +
    /// son bilinen profil (servise ulaşılamazsa bağlanmak yine mümkün olsun).
    /// </summary>
    internal static class Kimlik
    {
        public static string Klasor
        {
            get
            {
                var k = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PusulaConnect2");
                Directory.CreateDirectory(k);
                return k;
            }
        }

        private static string TokenDosyasi => Path.Combine(Klasor, "cihaz.dat");
        private static string ProfilDosyasi => Path.Combine(Klasor, "profil.json");

        public static void Kaydet(string token, JObject kayit)
        {
            File.WriteAllBytes(TokenDosyasi, ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser));
            ProfilYaz(kayit);
        }

        public static void ProfilYaz(JObject kayit) => File.WriteAllText(ProfilDosyasi, kayit.ToString(), Encoding.UTF8);

        public static string Token()
        {
            try
            {
                return File.Exists(TokenDosyasi)
                    ? Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(TokenDosyasi), null, DataProtectionScope.CurrentUser))
                    : null;
            }
            catch { return null; }
        }

        public static JObject Profil()
        {
            try { return File.Exists(ProfilDosyasi) ? JObject.Parse(File.ReadAllText(ProfilDosyasi, Encoding.UTF8)) : null; }
            catch { return null; }
        }

        public static void Sil()
        {
            try { File.Delete(TokenDosyasi); } catch { }
            try { File.Delete(ProfilDosyasi); } catch { }
        }
    }

    /// <summary>Destek için günlük — müşteri "çalışmadı" dediğinde ilk bakılan yer.</summary>
    internal static class Gunluk
    {
        private static readonly object Kilit = new object();
        public static string Dosya => Path.Combine(Kimlik.Klasor, "gunluk.txt");

        public static void Yaz(string satir)
        {
            try
            {
                lock (Kilit)
                {
                    var f = new FileInfo(Dosya);
                    if (f.Exists && f.Length > 2 * 1024 * 1024) File.Move(Dosya, Dosya + ".eski." + DateTime.Now.ToString("yyyyMMddHHmmss"));
                    File.AppendAllText(Dosya, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + satir + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }
    }
}
