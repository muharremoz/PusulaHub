using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace PusulaConnect
{
    /// <summary>
    /// Pusula X yazıcı ajanı (PusulaXPrintAgent.exe): müşteri PC'sinde HTTP dinler, terminaldeki
    /// Pusula X VPN üzerinden bu bilgisayarın yazıcısına (RFID/ZPL, PDF) yazdırır.
    /// Eskiden elle kuruluyordu (klasör kopyala + Başlangıç + Setting.txt). Şimdi exe Connect'e
    /// gömülü; Ayarlar'dan kurulur:
    ///   - %LOCALAPPDATA%\Programs\Pusula Connect\Yazici Ajani\ altına çıkarılır
    ///   - Setting.txt: 1. satır yazıcı adı, 2. satır PORT (ajan böyle okur — VPN IP değil)
    ///   - HKCU Run ile Windows açılışında başlar
    ///   - URL ACL + güvenlik duvarı kuralı yönetici ister → "--yazici-izin" ile ayrı süreç (UAC bir kez)
    /// Ajanın kendi yönetici denemesi "user=Everyone" kullanır; Türkçe Windows'ta grup adı "Herkes"
    /// olduğu için başarısız olur ve yalnız localhost'u dinler. Biz SID ile (WD) kaydederiz.
    /// </summary>
    internal static class YaziciAjani
    {
        public const int VarsayilanPort = 5556;
        private const string ExeAdi = "PusulaXPrintAgent.exe";
        private const string SurecAdi = "PusulaXPrintAgent";
        private const string KaynakAdi = "yazici-ajani/PusulaXPrintAgent.exe";
        private const string RunAnahtari = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunAdi = "PusulaX Print Agent";
        private const string KuralAdi = "PusulaX Print Agent";

        public static string Klasor => Path.Combine(Yerlesim.KuruluKlasor, "Yazici Ajani");
        public static string Exe => Path.Combine(Klasor, ExeAdi);
        private static string AyarDosyasi => Path.Combine(Klasor, "Setting.txt");
        public static bool Kurulu => File.Exists(Exe) && File.Exists(AyarDosyasi);

        // ------------------------------------------------------------ durum

        public static object Durum()
        {
            var (yazici, port) = Kurulu ? AyarOku(AyarDosyasi) : EskiAyar();
            var calisan = CalisanYol();
            return new
            {
                kurulu = Kurulu,
                yazici,
                port = port ?? VarsayilanPort,
                calisiyor = calisan != null,
                calisanYol = calisan,
                bizimki = calisan != null && YolEsit(calisan, Exe),
                baslangic = BaslangicKayitli(),
                eskiKurulum = EskiKurulumlar().Select(e => e.yol).ToArray(),
                yazicilar = Yazicilar(),
                vpnIp = VpnIp(),
            };
        }

        private static object _kisa;
        private static DateTime _kisaZaman;

        /// <summary>Sol panel için (her /durum'da çağrılır): 5 sn önbellekli, süreç yolu okunmaz.</summary>
        public static object KisaDurum()
        {
            if (_kisa != null && (DateTime.Now - _kisaZaman).TotalSeconds < 5) return _kisa;
            var kurulu = Kurulu;
            var calisiyor = false;
            foreach (var p in Process.GetProcessesByName(SurecAdi)) { calisiyor = true; p.Dispose(); }
            _kisa = new { kurulu, calisiyor, port = kurulu ? AyarOku(AyarDosyasi).port ?? VarsayilanPort : (int?)null, vpnIp = kurulu ? VpnIp() : null };
            _kisaZaman = DateTime.Now;
            return _kisa;
        }

        public static string[] Yazicilar()
        {
            try { return PrinterSettings.InstalledPrinters.Cast<string>().OrderBy(p => p, StringComparer.CurrentCultureIgnoreCase).ToArray(); }
            catch { return new string[0]; }
        }

        /// <summary>FortiClient bağdaştırıcısının IPv4'ü — Pusula X bu adrese yazdırır.</summary>
        public static string VpnIp()
        {
            try
            {
                foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (n.OperationalStatus != OperationalStatus.Up) continue;
                    var ad = (n.Description + " " + n.Name).ToLowerInvariant();
                    if (!ad.Contains("fortinet") && !ad.Contains("forticlient")) continue;
                    var ip = n.GetIPProperties().UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork);
                    if (ip != null) return ip.Address.ToString();
                }
            }
            catch { }
            return null;
        }

        // ------------------------------------------------------------ port

        internal static bool Dinleniyor(int port)
        {
            try { return IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e => e.Port == port); }
            catch { return false; }
        }

        /// <summary>Port boş mu; dolu ama dinleyen zaten yazıcı ajanıysa "bizim" (kurulum onu durdurup yeniden başlatır).</summary>
        public static async Task<object> PortDenetle(int port)
        {
            if (port < 1024 || port > 65535) throw new KullaniciHatasi("Port 1024–65535 arasında olmalı.");
            if (!Dinleniyor(port)) return new { port, bos = true, ajan = false, oneri = (int?)null };
            var ajan = (await Ping(port, 1500)).ok;
            return new { port, bos = ajan, ajan, oneri = ajan ? (int?)null : BosPortOner(port) };
        }

        internal static int? BosPortOner(int port)
        {
            for (var p = port + 1; p <= Math.Min(65535, port + 200); p++) if (!Dinleniyor(p)) return p;
            return null;
        }

        // ------------------------------------------------------------ test

        public static async Task<(bool ok, long ms, string hata)> Ping(int port, int zamanAsimi, string host = "127.0.0.1")
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var r = (HttpWebRequest)WebRequest.Create("http://" + host + ":" + port + "/api/ping");
                r.Timeout = zamanAsimi;
                r.Proxy = null;
                var t = r.GetResponseAsync();
                if (await Task.WhenAny(t, Task.Delay(zamanAsimi)) != t) { r.Abort(); return (false, sw.ElapsedMilliseconds, "yanıt yok"); }
                using (var y = (HttpWebResponse)await t)
                using (var s = new StreamReader(y.GetResponseStream(), Encoding.UTF8))
                {
                    var govde = await s.ReadToEndAsync();
                    return govde.Contains("Print Agent") ? (true, sw.ElapsedMilliseconds, (string)null) : (false, sw.ElapsedMilliseconds, "başka bir uygulama yanıt verdi");
                }
            }
            catch (Exception e) { return (false, sw.ElapsedMilliseconds, e is WebException w && w.Response == null ? "bağlanılamadı" : e.Message); }
        }

        public static async Task<object> Test()
        {
            if (!Kurulu) throw new KullaniciHatasi("Yazdırma yardımcısı kurulu değil.");
            var (yazici, portN) = AyarOku(AyarDosyasi);
            var port = portN ?? VarsayilanPort;
            var yerel = await Ping(port, 3000);
            var vpnIp = VpnIp();
            (bool ok, long ms, string hata)? vpn = null;
            if (vpnIp != null) vpn = await Ping(port, 3000, vpnIp);
            var eslesen = YaziciBul(yazici);
            var izin = IzinVar(port);
            var sonuc = new
            {
                port,
                yazici,
                vpnIp,
                calisiyor = CalisanYol() != null,
                yerel = new { yerel.ok, yerel.ms, yerel.hata },
                vpn = vpn.HasValue ? new { vpn.Value.ok, vpn.Value.ms, vpn.Value.hata } : null,
                yaziciBulundu = eslesen != null,
                eslesenYazici = eslesen,
                urlacl = izin.urlacl,
                guvenlikDuvari = izin.kural,
                baslangic = BaslangicKayitli(),
            };
            Gunluk.Yaz("Yazıcı ajanı testi: " + Newtonsoft.Json.JsonConvert.SerializeObject(sonuc));
            return sonuc;
        }

        /// <summary>Ajanın kendi eşleştirmesiyle aynı sıra: birebir, içerir, içinde geçer.</summary>
        private static string YaziciBul(string ad)
        {
            if (string.IsNullOrWhiteSpace(ad)) return null;
            var l = Yazicilar();
            return l.FirstOrDefault(p => p.Equals(ad, StringComparison.OrdinalIgnoreCase))
                ?? l.FirstOrDefault(p => p.IndexOf(ad, StringComparison.OrdinalIgnoreCase) >= 0)
                ?? l.FirstOrDefault(p => ad.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        // ------------------------------------------------------------ kurulum

        public static async Task<object> Kur(string yazici, int port)
        {
            yazici = (yazici ?? "").Trim();
            if (yazici.Length == 0) throw new KullaniciHatasi("Yazıcı seçin.");
            if (port < 1024 || port > 65535) throw new KullaniciHatasi("Port 1024–65535 arasında olmalı.");

            var eskiPort = Kurulu ? AyarOku(AyarDosyasi).port : EskiAyar().port;
            Gunluk.Yaz("Yazıcı ajanı kurulumu: yazıcı " + yazici + ", port " + port + (eskiPort.HasValue && eskiPort != port ? " (eski port " + eskiPort + ")" : ""));

            // Port başka bir uygulamadaysa hiçbir şeye dokunmadan dur (dinleyen ajanın kendisiyse sorun değil).
            if (Dinleniyor(port) && !(await Ping(port, 1500)).ok)
            {
                var oneri = BosPortOner(port);
                throw new KullaniciHatasi("Port " + port + " başka bir uygulama tarafından kullanılıyor." + (oneri.HasValue ? " Önerilen boş port: " + oneri + "." : ""));
            }
            // Çalışan ajan (bizimki ya da elle kurulmuş) durdurulur: tekil mutex'i var, ikisi birlikte açılmaz.
            Durdur();

            EskiKurulumuKaldir();

            Directory.CreateDirectory(Klasor);
            ExeCikar();
            // UTF-8 BOM: ajan File.ReadAllText ile okur, BOM'u tanır → Türkçe yazıcı adları bozulmaz.
            File.WriteAllText(AyarDosyasi, yazici + "\r\n" + port, new UTF8Encoding(true));

            var izin = IzinVar(port);
            if (!izin.urlacl || !izin.kural)
            {
                var kod = await YoneticiCalistir("--yazici-izin " + port + (eskiPort.HasValue && eskiPort != port ? " " + eskiPort : ""));
                if (kod == -1) throw new KullaniciHatasi("Yönetici izni verilmedi. Ağ izni (port " + port + ") ve güvenlik duvarı kuralı için izin gerekir; tekrar deneyin.");
                izin = IzinVar(port);
                if (!izin.urlacl || !izin.kural)
                    Gunluk.Yaz("Yazıcı ajanı izinleri eksik kaldı: urlacl " + izin.urlacl + ", kural " + izin.kural + " (çıkış kodu " + kod + ")");
            }

            using (var k = Registry.CurrentUser.CreateSubKey(RunAnahtari)) k.SetValue(RunAdi, "\"" + Exe + "\"");
            Baslat();
            _kisa = null;

            // Ajanın dinlemeye başlamasını bekle
            for (var i = 0; i < 20 && !(await Ping(port, 500)).ok; i++) await Task.Delay(250);
            return await Test();
        }

        public static async Task<object> Kaldir()
        {
            var port = Kurulu ? AyarOku(AyarDosyasi).port ?? VarsayilanPort : VarsayilanPort;
            Durdur();
            try { using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari, true)) if (k?.GetValue(RunAdi) != null) k.DeleteValue(RunAdi); } catch { }
            try { if (Directory.Exists(Klasor)) Directory.Delete(Klasor, true); } catch (Exception e) { Gunluk.Yaz("Yazıcı ajanı klasörü silinemedi: " + e.Message); }
            var izin = IzinVar(port);
            if (izin.urlacl || izin.kural) await YoneticiCalistir("--yazici-izin-sil " + port);   // reddedilirse kalır, zararsız
            Gunluk.Yaz("Yazıcı ajanı kaldırıldı");
            _kisa = null;
            return Durum();
        }

        /// <summary>Connect açılışında: kurulu ve başlangıçta kayıtlıysa ama çalışmıyorsa başlatır.</summary>
        public static void GerekirseBaslat()
        {
            try
            {
                if (!Kurulu || !BaslangicKayitli() || CalisanYol() != null) return;
                Baslat();
                Gunluk.Yaz("Yazıcı ajanı çalışmıyordu, başlatıldı");
            }
            catch (Exception e) { Gunluk.Yaz("Yazıcı ajanı başlatılamadı: " + e.Message); }
        }

        private static void Baslat() =>
            Process.Start(new ProcessStartInfo(Exe) { WorkingDirectory = Klasor, UseShellExecute = true });

        private static void Durdur()
        {
            foreach (var p in Process.GetProcessesByName(SurecAdi))
            {
                try { p.Kill(); p.WaitForExit(5000); Gunluk.Yaz("Yazıcı ajanı durduruldu (PID " + p.Id + ")"); }
                catch (Exception e) { throw new KullaniciHatasi("Çalışan yazdırma yardımcısı durdurulamadı (başka bir kullanıcı/yönetici olarak açılmış olabilir): " + e.Message); }
                finally { p.Dispose(); }
            }
        }

        private static void ExeCikar()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(KaynakAdi))
            {
                if (s == null) throw new Exception("Gömülü yazıcı ajanı bulunamadı.");
                var ms = new MemoryStream();
                s.CopyTo(ms);
                var yeni = ms.ToArray();
                if (File.Exists(Exe) && File.ReadAllBytes(Exe).SequenceEqual(yeni)) return;
                File.WriteAllBytes(Exe, yeni);
            }
        }

        // ------------------------------------------------------------ eski (elle) kurulum

        /// <summary>
        /// Elle kurulmuş kopyalar: Başlangıç klasöründeki exe/kısayol ve HKCU Run'daki başka kayıtlar.
        /// Silinmez — "Yazici Ajani\eski-kurulum" altına taşınır (kısayol/exe), Run kaydı kaldırılır.
        /// </summary>
        private static (string yol, string tur)[] EskiKurulumlar()
        {
            var l = new System.Collections.Generic.List<(string, string)>();
            try
            {
                var bas = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                if (Directory.Exists(bas))
                    foreach (var f in Directory.GetFiles(bas))
                    {
                        var ad = Path.GetFileName(f);
                        if (ad.Equals(ExeAdi, StringComparison.OrdinalIgnoreCase)) l.Add((f, "exe"));
                        else if (ad.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && (KisayolHedefi(f) ?? "").EndsWith(ExeAdi, StringComparison.OrdinalIgnoreCase)) l.Add((f, "lnk"));
                    }
            }
            catch { }
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari))
                    if (k != null)
                        foreach (var ad in k.GetValueNames())
                        {
                            if (ad == RunAdi && Kurulu) continue;
                            if ((k.GetValue(ad) as string ?? "").IndexOf(ExeAdi, StringComparison.OrdinalIgnoreCase) >= 0) l.Add(("HKCU Run: " + ad, "run"));
                        }
            }
            catch { }
            return l.ToArray();
        }

        /// <summary>Eski kurulumun ayarı: çalışan kopyanın ya da Başlangıç'taki kopyanın Setting.txt'i.</summary>
        private static (string yazici, int? port) EskiAyar()
        {
            var adaylar = new System.Collections.Generic.List<string>();
            var c = CalisanYol();
            if (c != null) adaylar.Add(Path.GetDirectoryName(c));
            foreach (var (yol, tur) in EskiKurulumlar())
            {
                if (tur == "exe") adaylar.Add(Path.GetDirectoryName(yol));
                else if (tur == "lnk" && KisayolHedefi(yol) is string h) adaylar.Add(Path.GetDirectoryName(h));
            }
            foreach (var d in adaylar)
            {
                var f = Path.Combine(d, "Setting.txt");
                if (File.Exists(f)) return AyarOku(f);
            }
            return (null, null);
        }

        private static void EskiKurulumuKaldir()
        {
            var hedef = Path.Combine(Klasor, "eski-kurulum");
            foreach (var (yol, tur) in EskiKurulumlar())
            {
                try
                {
                    if (tur == "run")
                    {
                        var ad = yol.Substring("HKCU Run: ".Length);
                        using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari, true)) k?.DeleteValue(ad, false);
                    }
                    else
                    {
                        Directory.CreateDirectory(hedef);
                        var kaynakKlasor = Path.GetDirectoryName(yol);
                        Tasi(yol, hedef);
                        // Başlangıç klasörüne doğrudan kopyalanmış exe'nin yanındakiler de
                        if (tur == "exe")
                            foreach (var yan in new[] { "Setting.txt", "PusulaXPrintAgent.pdb", "Log.txt" })
                                if (File.Exists(Path.Combine(kaynakKlasor, yan))) Tasi(Path.Combine(kaynakKlasor, yan), hedef);
                    }
                    Gunluk.Yaz("Eski yazıcı ajanı kurulumu devre dışı: " + yol);
                }
                catch (Exception e) { Gunluk.Yaz("Eski yazıcı ajanı kaldırılamadı (" + yol + "): " + e.Message); }
            }
        }

        internal static void Tasi(string kaynak, string klasor)
        {
            var h = Path.Combine(klasor, Path.GetFileName(kaynak));
            if (File.Exists(h)) h = Path.Combine(klasor, Path.GetFileNameWithoutExtension(kaynak) + "." + DateTime.Now.ToString("yyyyMMddHHmmss") + Path.GetExtension(kaynak));
            File.Move(kaynak, h);
        }

        internal static string KisayolHedefi(string lnk)
        {
            try
            {
                var tur = Type.GetTypeFromProgID("WScript.Shell");
                var kabuk = Activator.CreateInstance(tur);
                var k = tur.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, kabuk, new object[] { lnk });
                return k.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, k, null) as string;
            }
            catch { return null; }
        }

        // ------------------------------------------------------------ yardımcılar

        private static (string yazici, int? port) AyarOku(string dosya)
        {
            try
            {
                var s = File.ReadAllText(dosya).Replace("\r\n", "\n").Split('\n');
                var yazici = s.Length > 0 && s[0].Trim().Length > 0 ? s[0].Trim() : null;
                int? port = s.Length > 1 && int.TryParse(s[1].Trim(), out var p) ? p : (int?)null;
                return (yazici, port);
            }
            catch { return (null, null); }
        }

        private static string CalisanYol()
        {
            foreach (var p in Process.GetProcessesByName(SurecAdi))
            {
                try { return p.MainModule?.FileName ?? "?"; }
                catch { return "?"; }   // başka kullanıcı/yönetici süreci
                finally { p.Dispose(); }
            }
            return null;
        }

        private static bool BaslangicKayitli()
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari)) return k?.GetValue(RunAdi) != null; }
            catch { return false; }
        }

        internal static bool YolEsit(string a, string b)
        {
            try { return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }

        /// <summary>URL ACL ve güvenlik duvarı kuralı var mı (yönetici gerekmez).</summary>
        private static (bool urlacl, bool kural) IzinVar(int port)
        {
            var url = "http://+:" + port + "/";
            var acl = Netsh("http show urlacl url=" + url, out var o1) == 0 && o1.IndexOf(url, StringComparison.OrdinalIgnoreCase) >= 0;
            // Bizim kural ya da ajanın kendi eklediği "PusulaX Print Agent <port>"
            var kural = (Netsh("advfirewall firewall show rule name=\"" + KuralAdi + "\"", out var o2) == 0 && o2.Contains(port.ToString()))
                     || Netsh("advfirewall firewall show rule name=\"" + KuralAdi + " " + port + "\"", out _) == 0;
            return (acl, kural);
        }

        internal static int Netsh(string argumanlar, out string cikti)
        {
            cikti = "";
            try
            {
                using (var p = Process.Start(new ProcessStartInfo("netsh.exe", argumanlar)
                {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
                }))
                {
                    cikti = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(15000);
                    return p.HasExited ? p.ExitCode : -2;
                }
            }
            catch (Exception e) { cikti = e.Message; return -3; }
        }

        /// <summary>Aynı exe'yi yönetici olarak çalıştırır; UAC reddedilirse -1.</summary>
        internal static async Task<int> YoneticiCalistir(string argumanlar)
        {
            Process p;
            try { p = Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, argumanlar) { Verb = "runas", UseShellExecute = true }); }
            catch (Win32Exception e) when (e.NativeErrorCode == 1223) { Gunluk.Yaz("Yazıcı ajanı: UAC reddedildi"); return -1; }
            using (p)
            {
                for (var i = 0; i < 1200 && !p.HasExited; i++) await Task.Delay(100);   // UAC penceresi dahil en çok 2 dk
                return p.HasExited ? p.ExitCode : -2;
            }
        }

        // ------------------------------------------------------------ yönetici süreci

        /// <summary>"--yazici-izin &lt;port&gt; [eskiPort]" / "--yazici-izin-sil &lt;port&gt;" — pencere açmaz.</summary>
        public static int YoneticiOlarakCalistir(string[] args)
        {
            try
            {
                var sil = args.Contains("--yazici-izin-sil");
                var sayilar = args.Where(a => int.TryParse(a, out _)).Select(int.Parse).ToArray();
                if (sayilar.Length == 0) return 2;
                var port = sayilar[0];
                var eski = sayilar.Length > 1 ? sayilar[1] : (int?)null;

                if (eski.HasValue) Netsh("http delete urlacl url=http://+:" + eski + "/", out _);
                Netsh("http delete urlacl url=http://+:" + port + "/", out _);
                Netsh("advfirewall firewall delete rule name=\"" + KuralAdi + "\"", out _);
                if (sil) { Gunluk.Yaz("Yazıcı ajanı izinleri silindi (port " + port + ")"); return 0; }

                // WD = Everyone (SID ile: Türkçe Windows'ta grup adı "Herkes")
                var a = Netsh("http add urlacl url=http://+:" + port + "/ sddl=D:(A;;GX;;;WD)", out var o1);
                var k = Netsh("advfirewall firewall add rule name=\"" + KuralAdi + "\" dir=in action=allow protocol=TCP localport=" + port + " profile=any", out var o2);
                Gunluk.Yaz("Yazıcı ajanı izinleri (yönetici): urlacl " + a + ", güvenlik duvarı " + k + (a != 0 ? " — " + o1.Trim() : "") + (k != 0 ? " — " + o2.Trim() : ""));
                return a == 0 && k == 0 ? 0 : 1;
            }
            catch (Exception e)
            {
                Gunluk.Yaz("Yazıcı ajanı izin HATA: " + e);
                return 1;
            }
        }
    }
}
