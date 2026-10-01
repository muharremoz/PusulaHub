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
    /// Uzak masaüstü: şifre Windows kimlik kasasında (CredWrite, TERMSRV/{sunucu}) —
    /// Connect 1.5 ile aynı. .rdp dosyası uygulamanın klasöründe üretilir (masaüstüne
    /// dosya bırakmaya gerek yok, kısayol uygulamanın kendisi). Ayarlar Connect 1.5'teki
    /// RdpYaz ile birebir (Terminal 1 kullanıcılarıyla aynı yönlendirmeler, sürücüler kapalı).
    /// </summary>
    internal static class Rdp
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL
        {
            public uint Flags, Type;
            public string TargetName, Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public uint CredentialBlobSize;
            public IntPtr CredentialBlob;
            public uint Persist, AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias, UserName;
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CredWrite([In] ref CREDENTIAL c, [In] uint flags);
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CredRead(string target, uint type, int flags, out IntPtr cred);
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CredDelete(string target, uint type, int flags);
        [DllImport("advapi32.dll")]
        private static extern void CredFree(IntPtr cred);

        private const uint DomainPassword = 2;

        /// <summary>Kimlik kasasında bu sunucu için kayıtlı kullanıcı adı (yoksa null). Şifre okunmaz.</summary>
        public static string KayitliKullanici(string sunucu)
        {
            if (!CredRead("TERMSRV/" + sunucu, DomainPassword, 0, out var p)) return null;
            try { return ((CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL))).UserName; }
            finally { CredFree(p); }
        }

        public static void SifreKaydet(string sunucu, string kullanici, string sifre)
        {
            var blob = Encoding.Unicode.GetBytes(sifre);
            var p = Marshal.AllocCoTaskMem(blob.Length);
            try
            {
                Marshal.Copy(blob, 0, p, blob.Length);
                var c = new CREDENTIAL
                {
                    Type = DomainPassword,
                    TargetName = "TERMSRV/" + sunucu,
                    CredentialBlob = p,
                    CredentialBlobSize = (uint)blob.Length,
                    Persist = 2,   // CRED_PERSIST_LOCAL_MACHINE
                    UserName = kullanici,
                };
                if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            finally
            {
                // Bellekteki şifre kopyasını sıfırla
                Marshal.Copy(new byte[blob.Length], 0, p, blob.Length);
                Marshal.FreeCoTaskMem(p);
            }
        }

        public static void SifreSil(string sunucu) => CredDelete("TERMSRV/" + sunucu, DomainPassword, 0);

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
        /// .rdp üretip mstsc ile açar. Normalde şifre dosyada YOK — kimlik kasasından gelir.
        /// 2FA açıkken şifre verilir: mstsc'nin kabul ettiği "password 51:b:" (DPAPI, bu kullanıcı) olarak
        /// tek kullanımlık dosyaya yazılır; mstsc okuduktan sonra dosya silinir.
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
                "authentication level:i:2", "prompt for credentials:i:0", "negotiate security layer:i:1",
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
