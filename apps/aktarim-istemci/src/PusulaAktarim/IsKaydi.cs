using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace PusulaAktarim
{
    /// <summary>
    /// Aktarılacak tek öğe. Tip:
    ///   vt     → SQL veritabanı: COPY_ONLY yedek alınır, yüklenince yerel yedek silinir
    ///   dosya  → diskte duran dosya (eski yıl .mdf/.bak, program exe/parametre): olduğu gibi, SİLİNMEZ
    ///   paket  → çok sayıda küçük dosya (resim, ek klasör): paket dosyasında toplanır, yüklenince paket silinir
    /// </summary>
    internal sealed class IsOgesi
    {
        public string Tip = "vt";
        /// <summary>Sunucudaki tür: veritabani | eski | program | paket</summary>
        public string Tur = "veritabani";
        public string Ad;              // ekranda görünen ad
        public string Yol;             // sunucudaki göreli yol (ör. KOLN.bak, Perakende/Parametre.txt)
        public string YerelYol;        // yüklenecek yerel dosya (vt/paket için üretilen)
        public string Veritabani;      // Tip=vt: yedeği alınacak veritabanı
        public string KaynakKok;       // Tip=paket: dosyaların kök klasörü
        public List<string> Dosyalar;  // Tip=paket: kök klasöre göre yollar
        public Dictionary<string, object> Meta;
        /// <summary>bekliyor | yedekleniyor | hazirlaniyor | yukleniyor | tamam | hata</summary>
        public string Durum = "bekliyor";
        public int Yuzde;              // o anki adımın yüzdesi
        public long Boyut;
        public long Gonderilen;
        public string Sha256;
        public string Hata;
        public double VeriMb;
    }

    /// <summary>
    /// Yarım iş diskte durur: uygulama kapanıp açılınca kaldığı yerden devam eder.
    /// %LOCALAPPDATA%\PusulaAktarim\isler\{oturumId}.json — atomik yazım (Taslaklar.cs düzeni).
    /// Oturum tokenı ayrı dosyada, DPAPI ile (yalnız bu Windows kullanıcısı açabilir).
    /// </summary>
    internal sealed class IsKaydi
    {
        public string OturumId;
        public string Olusturma = DateTime.Now.ToString("s");
        public bool Sikistir;
        /// <summary>Pusula tarafı tamamlayınca aktarılan veritabanları müşterinin SQL Server'ından ayrılsın (detach; dosyalar kalır).</summary>
        public bool VeritabanlariAyir;
        public List<IsOgesi> Ogeler = new List<IsOgesi>();

        [JsonIgnore] public bool Bitti => Ogeler.Count > 0 && Ogeler.All(o => o.Durum == "tamam");

        private static readonly object Kilit = new object();
        private static string Kok => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PusulaAktarim");
        private static string Dosya(string oturumId) => Path.Combine(Kok, "isler", oturumId + ".json");

        public static IsKaydi Oku(string oturumId)
        {
            try
            {
                var f = Dosya(oturumId);
                return File.Exists(f) ? JsonConvert.DeserializeObject<IsKaydi>(File.ReadAllText(f, Encoding.UTF8)) : null;
            }
            catch { return null; }
        }

        public void Yaz()
        {
            lock (Kilit)
            {
                var f = Dosya(OturumId);
                Directory.CreateDirectory(Path.GetDirectoryName(f));
                var gecici = f + ".tmp";
                File.WriteAllText(gecici, JsonConvert.SerializeObject(this, Formatting.Indented), Encoding.UTF8);
                if (File.Exists(f)) File.Replace(gecici, f, null); else File.Move(gecici, f);
            }
        }

        public void Sil()
        {
            try { File.Delete(Dosya(OturumId)); } catch { }
        }

        // ------------------------------------------------------------ oturum tokenı (DPAPI)

        private static string TokenDosyasi => Path.Combine(Kok, "oturum.dat");

        public static void TokenYaz(string token)
        {
            try
            {
                Directory.CreateDirectory(Kok);
                var sifreli = ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(TokenDosyasi, sifreli);
            }
            catch { }
        }

        public static string TokenOku()
        {
            try
            {
                return File.Exists(TokenDosyasi)
                    ? Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(TokenDosyasi), null, DataProtectionScope.CurrentUser))
                    : null;
            }
            catch { return null; }
        }

        public static void TokenSil()
        {
            try { File.Delete(TokenDosyasi); } catch { }
        }
    }
}
