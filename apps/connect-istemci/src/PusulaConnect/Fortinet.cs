using System;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PusulaConnect
{
    /// <summary>
    /// FortiClient VPN: algılama, kurulum, profil. Mantık Connect 1.5'ten
    /// (scripts/musteri-kurulum/PusulaConnect.cs) taşındı — oradaki saha notları geçerli:
    ///   · Kurulu mu → ürünün KENDİSİNE bak (exe/Uninstall kaydı). Profil anahtarını biz
    ///     yazdığımız için HKLM\SOFTWARE\Fortinet\FortiClient varlığı kanıt DEĞİL.
    ///   · MSI %TEMP% köküne değil ALT klasöre (FortiClient CA_CopyMSIToTemp 1603).
    ///   · İndirilen dosya gerçekten MSI mı (OLE imzası) — sunucu HTML hata sayfası dönebiliyor.
    ///   · ARM'de x64 paket kurulamıyor (sürücüler) → ayrı adres yoksa hiç indirilmez.
    ///   · Kullanıcı adı FCConfig ile ÖNCEDEN yazılabiliyor (01.10.2026 denendi, v1'in "yazılamaz"
    ///     notu yanlıştı) — bkz. KullaniciAdiYaz. ŞİFRE yazılamıyor: kullanıcı ilk bağlantıda
    ///     FortiClient'a bir kez girer; "Save Password" FortiGate portal ayarına bağlı.
    /// </summary>
    internal static class Fortinet
    {
        public static string ExeYolu()
        {
            // ProgramW6432: 32 bit süreçte de gerçek "Program Files" (64 bit)
            var adaylar = new[]
            {
                Environment.GetEnvironmentVariable("ProgramW6432"),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            };
            foreach (var kok in adaylar)
            {
                if (string.IsNullOrEmpty(kok)) continue;
                var y = Path.Combine(kok, @"Fortinet\FortiClient\FortiClient.exe");
                if (File.Exists(y)) return y;
            }
            return null;
        }

        /// <summary>Kurulu mu + sürümü (Uninstall kaydından). Kurulu değilse null.</summary>
        public static string KuruluSurum()
        {
            foreach (var yol in new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" })
            {
                try
                {
                    using (var kok = Hklm64())
                    using (var k = kok.OpenSubKey(yol))
                    {
                        if (k == null) continue;
                        foreach (var alt in k.GetSubKeyNames())
                        {
                            using (var a = k.OpenSubKey(alt))
                            {
                                var ad = a?.GetValue("DisplayName") as string;
                                if (ad != null && ad.IndexOf("FortiClient", StringComparison.OrdinalIgnoreCase) >= 0)
                                    return (a.GetValue("DisplayVersion") as string) ?? "?";
                            }
                        }
                    }
                }
                catch { }
            }
            return ExeYolu() != null ? "?" : null;
        }

        private static string TunelAnahtari(string tunel) => @"SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels\" + tunel;

        /// <summary>
        /// HKLM'nin 64 bit görünümü — süreç 32 bit açılsa bile FortiClient'ın (64 bit) okuduğu
        /// yere bakılır/yazılır. Aksi halde profil WOW6432Node'a düşer ve FortiClient görmez.
        /// </summary>
        private static RegistryKey Hklm64() =>
            RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Default);

        /// <summary>Profil var ve doğru sunucuyu gösteriyor mu.</summary>
        public static bool ProfilDogru(string tunel, string sunucu)
        {
            try
            {
                using (var kok = Hklm64())
                using (var k = kok.OpenSubKey(TunelAnahtari(tunel)))
                    return k != null && string.Equals(k.GetValue("Server") as string, sunucu, StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        /// <summary>HKLM'ye yazar — yönetici ister. Değerler Connect 1.5 ile birebir (sahadaki çalışan profiller).</summary>
        public static void ProfilYaz(string tunel, string sunucu)
        {
            using (var kok = Hklm64())
            using (var k = kok.CreateSubKey(TunelAnahtari(tunel)))
            {
                if (k == null) throw new Exception("Kayıt defteri anahtarı açılamadı");
                k.SetValue("Server", sunucu, RegistryValueKind.String);
                k.SetValue("Description", tunel, RegistryValueKind.String);
                // 0 = "Save login": kullanıcı adı ilk girişte FortiClient'ın DATA1'ine yazılır.
                k.SetValue("promptusername", 0, RegistryValueKind.DWord);
                k.SetValue("promptcertificate", 0, RegistryValueKind.DWord);
                k.SetValue("ServerCert", "0", RegistryValueKind.String);
                k.SetValue("dual_stack", 0, RegistryValueKind.DWord);
                k.SetValue("sso_enabled", 0, RegistryValueKind.DWord);
                k.SetValue("use_external_browser", 0, RegistryValueKind.DWord);
                k.SetValue("azure_auto_login", 0, RegistryValueKind.DWord);
            }
        }

        /// <summary>FortiClient bu tünel için kullanıcı adı saklıyor mu (DATA1 — makineye bağlı şifreli).</summary>
        public static bool KullaniciAdiTanimli(string tunel)
        {
            try
            {
                using (var kok = Hklm64())
                using (var k = kok.OpenSubKey(TunelAnahtari(tunel)))
                    return k != null && !string.IsNullOrEmpty(k.GetValue("DATA1") as string);
            }
            catch { return false; }
        }

        /// <summary>
        /// Kullanıcı adını FortiClient'a yazar (yönetici ister). FortiClient'ın kendi aracı FCConfig ile
        /// tek bağlantılık bir ayar dosyası içe aktarılır; FortiClient adı DATA1'e kendisi şifreler.
        /// Sahada denenen tuzaklar (FortiClient VPN 7.0.14):
        ///   · Dosya BOM'SUZ UTF-8 olmalı — BOM'lu dosyayı hiçbir çıktı vermeden atlar.
        ///   · -p zorunlu ve en az 8 karakter (dosya şifresi; içerik düz metin, rastgele verilir).
        ///   · "-o importvpn" iş görmüyor, "-o import" çalışıyor. Diğer tünellere dokunmaz.
        /// Başarısızsa false (profil yine çalışır, kullanıcı adı FortiClient'ta elle girilir).
        /// </summary>
        public static bool KullaniciAdiYaz(string tunel, string sunucu, string kullanici)
        {
            var exe = ExeYolu();
            if (exe == null || string.IsNullOrWhiteSpace(kullanici)) return false;
            var fcconfig = Path.Combine(Path.GetDirectoryName(exe), "FCConfig.exe");
            if (!File.Exists(fcconfig)) { Gunluk.Yaz("FCConfig.exe yok: " + fcconfig); return false; }

            string E(string s) => System.Security.SecurityElement.Escape(s ?? "");
            var xml =
                "<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n" +
                "<forticlient_configuration><vpn><sslvpn><connections><connection>" +
                "<name>" + E(tunel) + "</name><description>" + E(tunel) + "</description>" +
                "<server>" + E(sunucu) + "</server><username>" + E(kullanici) + "</username>" +
                "<single_user_mode>0</single_user_mode><prompt_certificate>0</prompt_certificate><prompt_username>0</prompt_username>" +
                "</connection></connections></sslvpn></vpn></forticlient_configuration>\n";
            var dosya = Path.Combine(Path.GetTempPath(), "PusulaConnect2", "vpn-" + Guid.NewGuid().ToString("N") + ".conf");
            Directory.CreateDirectory(Path.GetDirectoryName(dosya));
            File.WriteAllText(dosya, xml, new System.Text.UTF8Encoding(false));
            try
            {
                var sifre = Guid.NewGuid().ToString("N").Substring(0, 16);
                var psi = new System.Diagnostics.ProcessStartInfo(fcconfig, "-m vpn -f \"" + dosya + "\" -o import -p " + sifre + " -q")
                {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
                    WorkingDirectory = Path.GetDirectoryName(fcconfig),
                };
                using (var p = System.Diagnostics.Process.Start(psi))
                {
                    var cikti = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
                    if (!p.WaitForExit(60000)) { try { p.Kill(); } catch { } Gunluk.Yaz("FCConfig zaman aşımı"); return false; }
                    Gunluk.Yaz("FCConfig çıkış " + p.ExitCode + ": " + cikti.Replace("\r", " ").Replace("\n", " ").Trim());
                }
                var tamam = KullaniciAdiTanimli(tunel) && ProfilDogru(tunel, sunucu);
                Gunluk.Yaz("VPN kullanıcı adı " + (tamam ? "FortiClient'a yazıldı" : "YAZILAMADI (elle girilecek)"));
                return tamam;
            }
            catch (Exception e)
            {
                Gunluk.Yaz("FCConfig hatası: " + e.Message);
                return false;
            }
            finally { try { File.Delete(dosya); } catch { } }
        }

        // ------------------------------------------------------------ ARM

        [StructLayout(LayoutKind.Sequential)]
        private struct SYSTEM_INFO
        {
            public ushort wProcessorArchitecture, wReserved;
            public uint dwPageSize;
            public IntPtr lpMinimumApplicationAddress, lpMaximumApplicationAddress, dwActiveProcessorMask;
            public uint dwNumberOfProcessors, dwProcessorType, dwAllocationGranularity;
            public ushort wProcessorLevel, wProcessorRevision;
        }

        [DllImport("kernel32.dll")]
        private static extern void GetNativeSystemInfo(ref SYSTEM_INFO lpSystemInfo);

        public static bool ArmMi()
        {
            try
            {
                var si = new SYSTEM_INFO();
                GetNativeSystemInfo(ref si);
                return si.wProcessorArchitecture == 12 || si.wProcessorArchitecture == 5;
            }
            catch { return false; }
        }

        // ------------------------------------------------------------ MSI

        /// <summary>İndirir (ilerleme 0-100, bayt/sn) ve MSI olduğunu doğrular.</summary>
        public static string MsiIndir(string url, Action<int, double> ilerleme)
        {
            var klasor = Path.Combine(Path.GetTempPath(), "PusulaConnect2");   // %TEMP% kökü DEĞİL
            Directory.CreateDirectory(klasor);
            var hedef = Path.Combine(klasor, "FortiClientVPN.msi");
            if (File.Exists(hedef)) File.Delete(hedef);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var istek = (HttpWebRequest)WebRequest.Create(url);
            istek.Timeout = 30000;
            istek.ReadWriteTimeout = 60000;
            using (var yanit = (HttpWebResponse)istek.GetResponse())
            using (var akis = yanit.GetResponseStream())
            using (var dosya = File.Create(hedef))
            {
                var toplam = yanit.ContentLength;
                var tampon = new byte[1 << 16];
                long alinan = 0, hizBayt = 0;
                var hizAn = DateTime.Now;
                double hiz = 0;
                int n, son = -1;
                while ((n = akis.Read(tampon, 0, tampon.Length)) > 0)
                {
                    dosya.Write(tampon, 0, n);
                    alinan += n;
                    var dt = (DateTime.Now - hizAn).TotalSeconds;
                    if (dt >= 1)
                    {
                        var anlik = (alinan - hizBayt) / dt;
                        hiz = hiz <= 0 ? anlik : hiz * 0.5 + anlik * 0.5;
                        hizAn = DateTime.Now; hizBayt = alinan;
                    }
                    var y = toplam > 0 ? (int)(alinan * 100 / toplam) : 0;
                    if (y != son) { son = y; ilerleme(y, hiz); }
                }
            }
            MsiDogrula(hedef);
            return hedef;
        }

        /// <summary>Makul boyut + OLE imzası (D0 CF 11 E0 A1 B1 1A E1).</summary>
        public static void MsiDogrula(string yol)
        {
            var fi = new FileInfo(yol);
            if (!fi.Exists || fi.Length < 1024 * 1024)
                throw new Exception("İndirilen dosya geçersiz (" + (fi.Exists ? fi.Length + " bayt" : "yok") + ")");
            var imza = new byte[8];
            using (var f = File.OpenRead(yol)) f.Read(imza, 0, 8);
            var beklenen = new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };
            for (var i = 0; i < 8; i++)
                if (imza[i] != beklenen[i]) throw new Exception("İndirilen dosya kurulum paketi değil (sunucu hata sayfası dönmüş olabilir)");
        }

        /// <summary>Sessiz kurulum; msiexec çıkış kodu + kendi günlüğünden bilinen sebep.</summary>
        public static void MsiKur(string msi)
        {
            var log = Path.Combine(Path.GetTempPath(), "PusulaConnect2-msi.log");
            var psi = new System.Diagnostics.ProcessStartInfo("msiexec.exe", "/i \"" + msi + "\" /qn /norestart /l*v \"" + log + "\"")
            { UseShellExecute = false, CreateNoWindow = true };
            Gunluk.Yaz("msiexec: " + psi.Arguments);
            using (var p = System.Diagnostics.Process.Start(psi))
            {
                p.WaitForExit();
                Gunluk.Yaz("msiexec çıkış kodu: " + p.ExitCode);
                if (p.ExitCode != 0 && p.ExitCode != 3010)
                    throw new Exception("Kurulum hatası (kod " + p.ExitCode + ")" + (BilinenSebep(log) is string s ? ": " + s : ""));
            }
            if (KuruluSurum() == null) throw new Exception("Kurulum tamamlandı dendi ama FortiClient bulunamadı");
        }

        private static string BilinenSebep(string log)
        {
            try
            {
                if (!File.Exists(log)) return null;
                var t = File.ReadAllText(log);
                if (t.IndexOf("difxapi.dll", StringComparison.OrdinalIgnoreCase) >= 0)
                    return "Windows'un sürücü kurulum bileşeni eksik (difxapi.dll)";
                if (t.IndexOf("CopyMSIToTemp", StringComparison.OrdinalIgnoreCase) >= 0)
                    return "Kurulum dosyası geçici klasöre kopyalanamadı";
            }
            catch { }
            return null;
        }
    }
}
