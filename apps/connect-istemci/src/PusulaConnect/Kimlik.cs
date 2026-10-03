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

        /// <summary>Servis tokenı döndürüldüğünde (nabızda yeniToken) yalnız token yeniden yazılır.</summary>
        public static void TokenYaz(string token) =>
            File.WriteAllBytes(TokenDosyasi, ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser));

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

    /// <summary>
    /// Destek için günlük — müşteri "çalışmadı" dediğinde ilk bakılan yer. Yalnız son 2 gün tutulur:
    /// gün değişince gunluk.txt → gunluk-YYYYMMDD.txt olur, bugün ve dün dışındaki dosyalar silinir.
    /// "Günlük → Aç" bugünün dosyasını açar; dünkü aynı klasörde.
    /// </summary>
    internal static class Gunluk
    {
        private static readonly object Kilit = new object();
        private const int TutulanGun = 2;
        public static string Dosya => Path.Combine(Kimlik.Klasor, "gunluk.txt");
        private static DateTime _denetlenenGun;

        public static void Yaz(string satir)
        {
            try
            {
                lock (Kilit)
                {
                    var bugun = DateTime.Today;
                    if (_denetlenenGun != bugun) { Dondur(bugun); _denetlenenGun = bugun; }
                    // Aynı gün içinde aşırı büyürse (hata döngüsü) baştan başla — 5 MB üstü destek için de okunmaz
                    var f = new FileInfo(Dosya);
                    if (f.Exists && f.Length > 5 * 1024 * 1024) File.Delete(Dosya);
                    File.AppendAllText(Dosya, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + satir + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }

        /// <summary>Önceki günün dosyasını tarihli ada taşır; 2 günden eski günlükleri (eski biçimdekiler dahil) siler.</summary>
        private static void Dondur(DateTime bugun)
        {
            try
            {
                var f = new FileInfo(Dosya);
                if (f.Exists && f.LastWriteTime.Date < bugun)
                {
                    var hedef = Path.Combine(Kimlik.Klasor, "gunluk-" + f.LastWriteTime.ToString("yyyyMMdd") + ".txt");
                    if (File.Exists(hedef)) File.Delete(hedef);
                    File.Move(Dosya, hedef);
                }
                var sinir = bugun.AddDays(-(TutulanGun - 1));   // bugün + dün kalır
                foreach (var eski in Directory.GetFiles(Kimlik.Klasor, "gunluk*"))
                {
                    if (string.Equals(eski, Dosya, StringComparison.OrdinalIgnoreCase)) continue;
                    if (File.GetLastWriteTime(eski).Date < sinir) { try { File.Delete(eski); } catch { } }
                }
            }
            catch { }
        }
    }
}
