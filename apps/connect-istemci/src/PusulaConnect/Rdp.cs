using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace PusulaConnect
{
    /// <summary>
    /// Uzak masaüstü şifresi ve yedek mstsc yolu. Oturum normalde Connect penceresinde açılır
    /// (OturumPaneli); şifre DPAPI ile uygulama klasöründe durur — 2FA kapalıyken sabit entropiyle
    /// (rdp-sifre-yerel.dat), açıkken servisin kasa anahtarıyla (rdp-sifre.dat). Ayarlar Connect
    /// 1.5'teki RdpYaz ile birebir (Terminal 1 kullanıcılarıyla aynı yönlendirmeler, sürücüler kapalı).
    /// </summary>
    internal static class Rdp
    {
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CredDelete(string target, uint type, int flags);

        private const uint DomainPassword = 2;

        /// <summary>
        /// Eski sürümlerin (0.1.0–0.1.1) kimlik kasasına yazdığı TERMSRV/{sunucu} kaydını siler. Gömülü oturum
        /// kimlik kasasından şifre OKUYAMAZ (alan adı şifreleri uygulamalara kapalı), bu yüzden artık
        /// kullanılmıyor; orada kalsa mstsc ile kodsuz bağlanılabilirdi.
        /// </summary>
        public static void SifreSil(string sunucu) => CredDelete("TERMSRV/" + sunucu, DomainPassword, 0);

        // ------------------------------------------------------------ 2FA kapalıyken şifre
        // DPAPI (yalnız bu Windows kullanıcısı açabilir), sabit ek entropiyle. Gömülü oturum şifreyi buradan alır.

        private static string YerelDosya => Path.Combine(Kimlik.Klasor, "rdp-sifre-yerel.dat");
        private static readonly byte[] YerelEntropi = Encoding.UTF8.GetBytes("pusula-connect-rdp");
        public static bool YerelSifreVar => File.Exists(YerelDosya);

        public static void YerelKaydet(string sifre) =>
            File.WriteAllBytes(YerelDosya, ProtectedData.Protect(Encoding.UTF8.GetBytes(sifre), YerelEntropi, DataProtectionScope.CurrentUser));

        public static string YerelOku()
        {
            try { return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(YerelDosya), YerelEntropi, DataProtectionScope.CurrentUser)); }
            catch (Exception e) when (e is CryptographicException || e is FileNotFoundException)
            {
                throw new KullaniciHatasi("Kayıtlı oturum şifresi açılamadı. Şifrenizi yeniden kaydedin.");
            }
        }

        public static void YerelSil() { try { File.Delete(YerelDosya); } catch { } }

        // ------------------------------------------------------------ 2FA açıkken şifre
        // Kimlik kasasında DURMAZ (orada dursa mstsc ile kodsuz bağlanılırdı). DPAPI ile, ek entropi
        // olarak servisin verdiği KASA ANAHTARIYLA saklanır: kod doğrulanmadan anahtar gelmez, şifre çözülmez.

        private static string KasaDosyasi => Path.Combine(Kimlik.Klasor, "rdp-sifre.dat");
        public static bool KasaliSifreVar => File.Exists(KasaDosyasi);

        public static void KasaliKaydet(string sifre, string kasaAnahtari) =>
            File.WriteAllBytes(KasaDosyasi, ProtectedData.Protect(Encoding.UTF8.GetBytes(sifre), Convert.FromBase64String(kasaAnahtari), DataProtectionScope.CurrentUser));

        public static string KasaliOku(string kasaAnahtari)
        {
            try { return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(KasaDosyasi), Convert.FromBase64String(kasaAnahtari), DataProtectionScope.CurrentUser)); }
            catch (Exception e) when (e is CryptographicException || e is FileNotFoundException)
            {
                throw new KullaniciHatasi("Kayıtlı oturum şifresi açılamadı. Şifrenizi yeniden kaydedin.");
            }
        }

        public static void KasaliSil() { try { File.Delete(KasaDosyasi); } catch { } }

        /// <summary>
        /// YEDEK YOL (WebView2 penceresi yoksa; normalde oturum OturumPaneli'nde açılır): .rdp üretip mstsc ile
        /// açar. Şifre mstsc'nin kabul ettiği "password 51:b:" (DPAPI, bu kullanıcı) olarak tek kullanımlık
        /// dosyaya yazılır; mstsc okuduktan sonra dosya silinir.
        /// </summary>
        public static void Baglan(string ad, string sunucu, int port, string domain, string kullanici, string sifre = null)
        {
            var sb = new StringBuilder();
            sb.AppendLine("full address:s:" + sunucu + (port > 0 && port != 3389 ? ":" + port : ""));
            sb.AppendLine("username:s:" + (string.IsNullOrEmpty(domain) ? kullanici : domain + "\\" + kullanici));
            foreach (var s in new[]
            {
                "screen mode id:i:2", "use multimon:i:0", "session bpp:i:32", "compression:i:1", "keyboardhook:i:2",
                "audiocapturemode:i:0", "audiomode:i:2", "redirectprinters:i:1", "redirectclipboard:i:1",
                "redirectsmartcards:i:1", "redirectwebauthn:i:1", "redirectcomports:i:1",
                "drivestoredirect:s:",   // sürücüler BİLEREK kapalı (güvenlik + yavaş hatta yavaşlama)
                "camerastoredirect:s:*", "devicestoredirect:s:*", "autoreconnection enabled:i:1",
                "authentication level:i:0", "prompt for credentials:i:0", "negotiate security layer:i:1",
                "bandwidthautodetect:i:1", "networkautodetect:i:1",
            }) sb.AppendLine(s);
            var dosya = Path.Combine(Kimlik.Klasor, ad + ".rdp");
            if (sifre != null)
            {
                var blob = ProtectedData.Protect(Encoding.Unicode.GetBytes(sifre), null, DataProtectionScope.CurrentUser);
                sb.AppendLine("password 51:b:" + BitConverter.ToString(blob).Replace("-", ""));
                dosya = Path.Combine(Kimlik.Klasor, ad + "-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".rdp");
            }
            File.WriteAllText(dosya, sb.ToString(), Encoding.Unicode);
            Process.Start(new ProcessStartInfo("mstsc.exe", "\"" + dosya + "\"") { UseShellExecute = true });
            if (sifre != null)
                _ = Task.Run(async () => { await Task.Delay(20000); try { File.Delete(dosya); } catch { } });
        }

        /// <summary>Terminale TCP bağlantısı (VPN açık mı sorusunun pratik cevabı). Gecikme ms ya da hata.</summary>
        /// <summary>
        /// Ad DNS ile çözülüyor mu (IP verilirse true). Kısa zaman aşımı: çözülemeyen ad Windows'ta saniyelerce bekletebilir.
        /// ps*.databag.net gibi adlar genel DNS'te özel adrese çözülür; bazı modem/ISS DNS'leri bu yanıtı düşürür.
        /// </summary>
        public static async Task<bool> AdCozulur(string ad, int zamanAsimiMs = 3000)
        {
            if (System.Net.IPAddress.TryParse(ad, out _)) return true;
            try
            {
                var t = System.Net.Dns.GetHostAddressesAsync(ad);
                if (await Task.WhenAny(t, Task.Delay(zamanAsimiMs)) != t) return false;
                return (await t).Length > 0;
            }
            catch { return false; }
        }

        public static async Task<(bool erisim, int ms, string hata)> Yokla(string sunucu, int port, int zamanAsimiMs = 2500)
        {
            var sure = Stopwatch.StartNew();
            using (var c = new TcpClient())
            {
                try
                {
                    var baglan = c.ConnectAsync(sunucu, port > 0 ? port : 3389);
                    if (await Task.WhenAny(baglan, Task.Delay(zamanAsimiMs)) != baglan) return (false, 0, "zaman aşımı");
                    await baglan;
                    return (true, (int)sure.ElapsedMilliseconds, null);
                }
                catch (Exception e) { return (false, 0, e.GetBaseException().Message); }
            }
        }
    }
}
