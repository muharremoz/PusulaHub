using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace PusulaConnect
{
    /// <summary>
    /// Eski programların yazdırma yardımcısı (RFIDSERVER.exe, 2014): terminaldeki eski Pusula programları
    /// VPN üzerinden bu bilgisayara SOAP "Login(dosya)" çağrısı yapar (http://VPN-IP:port/WPFHost/Http);
    /// yardımcı gelen metni a.txt'ye yazar ve "copy a.txt \\127.0.0.1\PAYLASIM" ile paylaşılan yazıcıya
    /// ham (RAW, ZPL vb.) gönderir. Exe olduğu gibi gömülü (kaynağı yok, değiştirilmedi); Ayarlar'dan kurulur:
    ///   - %LOCALAPPDATA%\Programs\Pusula Connect\RFID Yardimcisi\ altına çıkarılır
    ///   - RfidServerP.txt: 1. satır yazıcı yolu (\\127.0.0.1\PAYLASIM), 2. satır port (exe böyle okur)
    ///   - Yazıcı paylaşılmamışsa (ya da paylaşım adında boşluk varsa — copy komutu tırnaksız) "RFID" adıyla paylaşılır
    ///   - URL ACL + güvenlik duvarı + paylaşım yönetici ister → "--rfid-izin" ile ayrı süreç (UAC bir kez)
    ///   - Açılışta pencere gösterir ("Gizle"ye basılana kadar) → Connect başlatıp penceresini gizler;
    ///     Windows açılışında da exe değil "PusulaConnect.exe --rfid-baslat" çalışır (başlat + gizle + çık)
    /// </summary>
    internal static class RfidYardimcisi
    {
        public const int VarsayilanPort = 5252;
        private const string ExeAdi = "RFIDSERVER.exe";
        private const string SurecAdi = "RFIDSERVER";
        private const string KaynakAdi = "rfid/RFIDSERVER.exe";
        private const string AyarAdi = "RfidServerP.txt";
        private const string RunAnahtari = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunAdi = "Pusula RFID Yardimcisi";
        private const string KuralAdi = "Pusula RFID Yardimcisi";
        private const string VarsayilanPaylasim = "RFID";

        public static string Klasor => Path.Combine(Yerlesim.KuruluKlasor, "RFID Yardimcisi");
        public static string Exe => Path.Combine(Klasor, ExeAdi);
        private static string AyarDosyasi => Path.Combine(Klasor, AyarAdi);
        public static bool Kurulu => File.Exists(Exe) && File.Exists(AyarDosyasi);

        // ------------------------------------------------------------ durum

        public static object Durum()
        {
            var (hedef, port) = Kurulu ? AyarOku(AyarDosyasi) : EskiAyar();
            var calisan = CalisanYol();
            var paylasim = PaylasimAdi(hedef);
            return new
            {
                kurulu = Kurulu,
                yazici = PaylasimYazicisi(paylasim),
                paylasim,
                hedef,
                port = port ?? VarsayilanPort,
                calisiyor = calisan != null,
                calisanYol = calisan,
                bizimki = calisan != null && YaziciAjani.YolEsit(calisan, Exe),
                baslangic = BaslangicKayitli(),
                eskiKurulum = EskiKurulumlar().Select(e => e.yol).ToArray(),
                yazicilar = YaziciAjani.Yazicilar(),
                vpnIp = YaziciAjani.VpnIp(),
            };
        }

        private static object _kisa;
        private static DateTime _kisaZaman;

        /// <summary>Sol panel için (her /durum'da çağrılır): 5 sn önbellekli.</summary>
        public static object KisaDurum()
        {
            if (_kisa != null && (DateTime.Now - _kisaZaman).TotalSeconds < 5) return _kisa;
            var kurulu = Kurulu;
            var calisiyor = false;
            foreach (var p in Process.GetProcessesByName(SurecAdi)) { calisiyor = true; p.Dispose(); }
            _kisa = new { kurulu, calisiyor, port = kurulu ? AyarOku(AyarDosyasi).port ?? VarsayilanPort : (int?)null, vpnIp = kurulu ? YaziciAjani.VpnIp() : null };
            _kisaZaman = DateTime.Now;
            return _kisa;
        }

        // ------------------------------------------------------------ port

        public static async Task<object> PortDenetle(int port)
        {
            if (port < 1024 || port > 65535) throw new KullaniciHatasi("Port 1024–65535 arasında olmalı.");
            if (!YaziciAjani.Dinleniyor(port)) return new { port, bos = true, ajan = false, oneri = (int?)null };
            var ajan = (await Ping(port, 1500)).ok;
            return new { port, bos = ajan, ajan, oneri = ajan ? (int?)null : YaziciAjani.BosPortOner(port) };
        }

        // ------------------------------------------------------------ test

        /// <summary>WCF servisin WSDL'i: "IWeb" sözleşmesi geçiyorsa dinleyen bizim yardımcı.</summary>
        public static async Task<(bool ok, long ms, string hata)> Ping(int port, int zamanAsimi, string host = "127.0.0.1")
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var r = (HttpWebRequest)WebRequest.Create("http://" + host + ":" + port + "/WPFHost/?wsdl");
                r.Timeout = zamanAsimi;
                r.Proxy = null;
                var t = r.GetResponseAsync();
                if (await Task.WhenAny(t, Task.Delay(zamanAsimi)) != t) { r.Abort(); return (false, sw.ElapsedMilliseconds, "yanıt yok"); }
                using (var y = (HttpWebResponse)await t)
                using (var s = new StreamReader(y.GetResponseStream(), Encoding.UTF8))
                {
                    var govde = await s.ReadToEndAsync();
                    return govde.Contains("IWeb") ? (true, sw.ElapsedMilliseconds, (string)null) : (false, sw.ElapsedMilliseconds, "başka bir uygulama yanıt verdi");
                }
            }
            catch (Exception e) { return (false, sw.ElapsedMilliseconds, e is WebException w && w.Response == null ? "bağlanılamadı" : e.Message); }
        }

        public static async Task<object> Test()
        {
            if (!Kurulu) throw new KullaniciHatasi("Eski programlar için yazdırma yardımcısı kurulu değil.");
            var (hedef, portN) = AyarOku(AyarDosyasi);
            var port = portN ?? VarsayilanPort;
            var yerel = await Ping(port, 3000);
            var vpnIp = YaziciAjani.VpnIp();
            (bool ok, long ms, string hata)? vpn = null;
            if (vpnIp != null) vpn = await Ping(port, 3000, vpnIp);
            var paylasim = PaylasimAdi(hedef);
            var yazici = PaylasimYazicisi(paylasim);
            var izin = IzinVar(port);
            var sonuc = new
            {
                port,
                yazici,
                vpnIp,
                calisiyor = CalisanYol() != null,
                yerel = new { yerel.ok, yerel.ms, yerel.hata },
                vpn = vpn.HasValue ? new { vpn.Value.ok, vpn.Value.ms, vpn.Value.hata } : null,
                yaziciBulundu = yazici != null,
                eslesenYazici = yazici,
                paylasim,
                // \\127.0.0.1\PAYLASIM için Sunucu (LanmanServer) hizmeti çalışmalı
                paylasimHizmeti = SunucuHizmetiCalisiyor(),
                urlacl = izin.urlacl,
                guvenlikDuvari = izin.kural,
                baslangic = BaslangicKayitli(),
            };
            Gunluk.Yaz("RFID yardımcısı testi: " + Newtonsoft.Json.JsonConvert.SerializeObject(sonuc));
            return sonuc;
        }

        // ------------------------------------------------------------ kurulum

        public static async Task<object> Kur(string yazici, int port)
        {
            yazici = (yazici ?? "").Trim();
            if (yazici.Length == 0) throw new KullaniciHatasi("Yazıcı seçin.");
            if (port < 1024 || port > 65535) throw new KullaniciHatasi("Port 1024–65535 arasında olmalı.");
            if (!YaziciAjani.Yazicilar().Contains(yazici)) throw new KullaniciHatasi("Yazıcı bulunamadı: " + yazici);

            var eskiPort = Kurulu ? AyarOku(AyarDosyasi).port : EskiAyar().port;
            Gunluk.Yaz("RFID yardımcısı kurulumu: yazıcı " + yazici + ", port " + port + (eskiPort.HasValue && eskiPort != port ? " (eski port " + eskiPort + ")" : ""));

            if (YaziciAjani.Dinleniyor(port) && !(await Ping(port, 1500)).ok)
            {
                var oneri = YaziciAjani.BosPortOner(port);
                throw new KullaniciHatasi("Port " + port + " başka bir uygulama tarafından kullanılıyor." + (oneri.HasValue ? " Önerilen boş port: " + oneri + "." : ""));
            }
            Durdur();
            EskiKurulumuKaldir();

            Directory.CreateDirectory(Klasor);
            ExeCikar();

            // Yazıcı paylaşımı: copy komutu tırnaksız → paylaşım adında boşluk olmamalı
            var paylasim = YaziciPaylasimi(yazici);
            var paylasimGerek = paylasim == null || paylasim.Contains(" ");
            var izin = IzinVar(port);
            if (!izin.urlacl || !izin.kural || paylasimGerek)
            {
                var arg = "--rfid-izin " + port + (eskiPort.HasValue && eskiPort != port ? " " + eskiPort : "") + (paylasimGerek ? " --paylas \"" + yazici + "\"" : "");
                var kod = await YaziciAjani.YoneticiCalistir(arg);
                if (kod == -1) throw new KullaniciHatasi("Yönetici izni verilmedi. Ağ izni (port " + port + "), güvenlik duvarı kuralı ve yazıcı paylaşımı için izin gerekir; tekrar deneyin.");
                izin = IzinVar(port);
                paylasim = YaziciPaylasimi(yazici);
                if (!izin.urlacl || !izin.kural || paylasim == null)
                    Gunluk.Yaz("RFID yardımcısı izinleri eksik kaldı: urlacl " + izin.urlacl + ", kural " + izin.kural + ", paylaşım " + (paylasim ?? "yok") + " (çıkış kodu " + kod + ")");
            }
            if (paylasim == null || paylasim.Contains(" ")) throw new KullaniciHatasi("Yazıcı paylaşılamadı (" + yazici + "). Windows'ta yazıcı özelliklerinden boşluksuz bir adla paylaşıp tekrar deneyin.");

            // Exe File.ReadAllText ile okuyup Environment.NewLine (CRLF) ile böler
            File.WriteAllText(AyarDosyasi, @"\\127.0.0.1\" + paylasim + "\r\n" + port, new UTF8Encoding(true));

            using (var k = Registry.CurrentUser.CreateSubKey(RunAnahtari)) k.SetValue(RunAdi, "\"" + Assembly.GetExecutingAssembly().Location + "\" --rfid-baslat");
            await Task.Run(BaslatVeGizle);
            _kisa = null;

            for (var i = 0; i < 20 && !(await Ping(port, 500)).ok; i++) await Task.Delay(250);
            return await Test();
        }

        public static async Task<object> Kaldir()
        {
            var port = Kurulu ? AyarOku(AyarDosyasi).port ?? VarsayilanPort : VarsayilanPort;
            Durdur();
            try { using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari, true)) if (k?.GetValue(RunAdi) != null) k.DeleteValue(RunAdi); } catch { }
            try { if (Directory.Exists(Klasor)) Directory.Delete(Klasor, true); } catch (Exception e) { Gunluk.Yaz("RFID yardımcısı klasörü silinemedi: " + e.Message); }
            // Yazıcı paylaşımı bırakılır (başka bir şey de kullanıyor olabilir)
            var izin = IzinVar(port);
            if (izin.urlacl || izin.kural) await YaziciAjani.YoneticiCalistir("--rfid-izin-sil " + port);
            Gunluk.Yaz("RFID yardımcısı kaldırıldı");
            _kisa = null;
            return Durum();
        }

        /// <summary>Connect açılışında: kurulu ve başlangıçta kayıtlıysa ama çalışmıyorsa başlatır.</summary>
        public static void GerekirseBaslat()
        {
            try
            {
                if (!Kurulu || !BaslangicKayitli() || CalisanYol() != null) return;
                BaslatVeGizle();
                Gunluk.Yaz("RFID yardımcısı çalışmıyordu, başlatıldı");
            }
            catch (Exception e) { Gunluk.Yaz("RFID yardımcısı başlatılamadı: " + e.Message); }
        }

        /// <summary>"--rfid-baslat" (Windows açılışı): çalışmıyorsa başlatır, penceresini gizler. Connect penceresi açılmaz.</summary>
        public static int AcilistaBaslat()
        {
            try
            {
                if (!Kurulu) return 1;
                if (CalisanYol() == null) BaslatVeGizle();
                return 0;
            }
            catch (Exception e) { Gunluk.Yaz("RFID yardımcısı (açılış) HATA: " + e.Message); return 1; }
        }

        /// <summary>Exe'yi başlatır; açılışta gösterdiği WPF penceresini ("Gizle" butonlu) en çok 30 sn bekleyip gizler.</summary>
        private static void BaslatVeGizle()
        {
            int pid;
            using (var p = Process.Start(new ProcessStartInfo(Exe) { WorkingDirectory = Klasor, UseShellExecute = true })) pid = p.Id;
            for (var i = 0; i < 120; i++)
            {
                System.Threading.Thread.Sleep(250);
                if (PencereleriGizle(pid) > 0) return;
            }
            Gunluk.Yaz("RFID yardımcısı penceresi bulunamadı (gizlenemedi)");
        }

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder ad, int uzunluk);

        /// <summary>
        /// Sürecin görünür üst düzey pencerelerini gizler (ShowInTaskbar=false olduğu için MainWindowHandle güvenilmez).
        /// Mesaj kutusu (#32770 — ör. "WEB SERVIS HATA") gizlenmez: kullanıcı hatayı görmeli.
        /// </summary>
        private static int PencereleriGizle(int pid)
        {
            var gizlenen = 0;
            EnumWindows((h, _) =>
            {
                if (GetWindowThreadProcessId(h, out var p) == 0 || p != pid || !IsWindowVisible(h)) return true;
                var sinif = new StringBuilder(64);
                GetClassName(h, sinif, sinif.Capacity);
                if (sinif.ToString() == "#32770") return true;   // hata kutusu: gizleme, asıl pencereyi beklemeye devam
                ShowWindow(h, 0);
                gizlenen++;
                return true;
            }, IntPtr.Zero);
            return gizlenen;
        }

        private static void Durdur()
        {
            foreach (var p in Process.GetProcessesByName(SurecAdi))
            {
                try { p.Kill(); p.WaitForExit(5000); Gunluk.Yaz("RFID yardımcısı durduruldu (PID " + p.Id + ")"); }
                catch (Exception e) { throw new KullaniciHatasi("Çalışan RFID yardımcısı durdurulamadı (başka bir kullanıcı/yönetici olarak açılmış olabilir): " + e.Message); }
                finally { p.Dispose(); }
            }
        }

        private static void ExeCikar()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(KaynakAdi))
            {
                if (s == null) throw new Exception("Gömülü RFID yardımcısı bulunamadı.");
                var ms = new MemoryStream();
                s.CopyTo(ms);
                var yeni = ms.ToArray();
                if (File.Exists(Exe) && File.ReadAllBytes(Exe).SequenceEqual(yeni)) return;
                File.WriteAllBytes(Exe, yeni);
            }
        }

        // ------------------------------------------------------------ yazıcı paylaşımı

        /// <summary>Yazıcının paylaşım adı (paylaşılmamışsa null).</summary>
        private static string YaziciPaylasimi(string yazici)
        {
            foreach (var y in YaziciListesi()) if (string.Equals(y.ad, yazici, StringComparison.OrdinalIgnoreCase)) return y.paylasim;
            return null;
        }

        /// <summary>Paylaşım adından yazıcı adı (bulunamazsa null).</summary>
        private static string PaylasimYazicisi(string paylasim)
        {
            if (string.IsNullOrEmpty(paylasim)) return null;
            foreach (var y in YaziciListesi()) if (string.Equals(y.paylasim, paylasim, StringComparison.OrdinalIgnoreCase)) return y.ad;
            return null;
        }

        private static List<(string ad, string paylasim)> YaziciListesi()
        {
            var l = new List<(string, string)>();
            try
            {
                using (var s = new ManagementObjectSearcher("SELECT Name, ShareName, Shared FROM Win32_Printer"))
                    foreach (ManagementObject o in s.Get())
                        using (o)
                        {
                            var paylasimli = o["Shared"] is bool b && b;
                            var ad = o["ShareName"] as string;
                            l.Add(((string)o["Name"], paylasimli && !string.IsNullOrWhiteSpace(ad) ? ad : null));
                        }
            }
            catch (Exception e) { Gunluk.Yaz("Yazıcı listesi (WMI) okunamadı: " + e.Message); }
            return l;
        }

        /// <summary>"\\127.0.0.1\RFID" → "RFID". Yerel paylaşım değilse null.</summary>
        private static string PaylasimAdi(string hedef)
        {
            if (string.IsNullOrWhiteSpace(hedef) || !hedef.StartsWith(@"\\")) return null;
            var parca = hedef.Substring(2).Split('\\');
            if (parca.Length < 2) return null;
            var sunucu = parca[0].ToLowerInvariant();
            if (sunucu != "127.0.0.1" && sunucu != "localhost" && sunucu != Environment.MachineName.ToLowerInvariant()) return null;
            return parca[1];
        }

        private static bool SunucuHizmetiCalisiyor()
        {
            try { using (var s = new ServiceController("LanmanServer")) return s.Status == ServiceControllerStatus.Running; }
            catch { return false; }
        }

        // ------------------------------------------------------------ eski (elle) kurulum

        private static (string yol, string tur)[] EskiKurulumlar()
        {
            var l = new List<(string, string)>();
            try
            {
                var bas = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                if (Directory.Exists(bas))
                    foreach (var f in Directory.GetFiles(bas))
                    {
                        var ad = Path.GetFileName(f);
                        if (ad.Equals(ExeAdi, StringComparison.OrdinalIgnoreCase)) l.Add((f, "exe"));
                        else if (ad.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) && (YaziciAjani.KisayolHedefi(f) ?? "").EndsWith(ExeAdi, StringComparison.OrdinalIgnoreCase)) l.Add((f, "lnk"));
                    }
            }
            catch { }
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari))
                    if (k != null)
                        foreach (var ad in k.GetValueNames())
                        {
                            if (ad == RunAdi) continue;
                            if ((k.GetValue(ad) as string ?? "").IndexOf(ExeAdi, StringComparison.OrdinalIgnoreCase) >= 0) l.Add(("HKCU Run: " + ad, "run"));
                        }
            }
            catch { }
            return l.ToArray();
        }

        /// <summary>Eski kurulumun ayarı: çalışan kopyanın ya da Başlangıç'taki kopyanın RfidServerP.txt'i.</summary>
        private static (string hedef, int? port) EskiAyar()
        {
            var adaylar = new List<string>();
            var c = CalisanYol();
            if (c != null && c != "?") adaylar.Add(Path.GetDirectoryName(c));
            foreach (var (yol, tur) in EskiKurulumlar())
            {
                if (tur == "exe") adaylar.Add(Path.GetDirectoryName(yol));
                else if (tur == "lnk" && YaziciAjani.KisayolHedefi(yol) is string h) adaylar.Add(Path.GetDirectoryName(h));
            }
            foreach (var d in adaylar)
            {
                var f = Path.Combine(d, AyarAdi);
                if (File.Exists(f)) return AyarOku(f);
            }
            // Ayar dosyası yoksa exe varsayılanı: \\127.0.0.1\RFID (pencerede yazılı), port 5555 — biz 5252 öneririz
            return (@"\\127.0.0.1\" + VarsayilanPaylasim, null);
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
                        YaziciAjani.Tasi(yol, hedef);
                        if (tur == "exe")
                            foreach (var yan in new[] { AyarAdi, "a.txt" })
                                if (File.Exists(Path.Combine(kaynakKlasor, yan))) YaziciAjani.Tasi(Path.Combine(kaynakKlasor, yan), hedef);
                    }
                    Gunluk.Yaz("Eski RFID yardımcısı kurulumu devre dışı: " + yol);
                }
                catch (Exception e) { Gunluk.Yaz("Eski RFID yardımcısı kaldırılamadı (" + yol + "): " + e.Message); }
            }
        }

        // ------------------------------------------------------------ yardımcılar

        private static (string hedef, int? port) AyarOku(string dosya)
        {
            try
            {
                var s = File.ReadAllText(dosya).Replace("\r\n", "\n").Split('\n');
                var hedef = s.Length > 0 && s[0].Trim().Length > 0 ? s[0].Trim() : null;
                int? port = s.Length > 1 && int.TryParse(s[1].Trim(), out var p) ? p : (int?)null;
                return (hedef, port);
            }
            catch { return (null, null); }
        }

        private static string CalisanYol()
        {
            foreach (var p in Process.GetProcessesByName(SurecAdi))
            {
                try { return p.MainModule?.FileName ?? "?"; }
                catch { return "?"; }
                finally { p.Dispose(); }
            }
            return null;
        }

        private static bool BaslangicKayitli()
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari)) return k?.GetValue(RunAdi) != null; }
            catch { return false; }
        }

        private static (bool urlacl, bool kural) IzinVar(int port)
        {
            var url = "http://+:" + port + "/";
            var acl = YaziciAjani.Netsh("http show urlacl url=" + url, out var o1) == 0 && o1.IndexOf(url, StringComparison.OrdinalIgnoreCase) >= 0;
            var kural = YaziciAjani.Netsh("advfirewall firewall show rule name=\"" + KuralAdi + "\"", out var o2) == 0 && o2.Contains(port.ToString());
            return (acl, kural);
        }

        // ------------------------------------------------------------ yönetici süreci

        /// <summary>"--rfid-izin &lt;port&gt; [eskiPort] [--paylas "yazıcı"]" / "--rfid-izin-sil &lt;port&gt;" — pencere açmaz.</summary>
        public static int YoneticiOlarakCalistir(string[] args)
        {
            try
            {
                var sil = args.Contains("--rfid-izin-sil");
                var pi = Array.IndexOf(args, "--paylas");
                var paylasilacak = pi >= 0 && pi + 1 < args.Length ? args[pi + 1] : null;
                var sayilar = args.Where((a, i) => i != pi + 1 && int.TryParse(a, out _)).Select(int.Parse).ToArray();
                if (sayilar.Length == 0) return 2;
                var port = sayilar[0];
                var eski = sayilar.Length > 1 ? sayilar[1] : (int?)null;

                // Yazdırma yardımcısı (PusulaX) aynı portu kullanıyorsa onun izni silinmesin diye yalnız bu kural silinir;
                // URL ACL "http://+:port/" ortaktır, yeniden eklenir.
                if (eski.HasValue) YaziciAjani.Netsh("http delete urlacl url=http://+:" + eski + "/", out _);
                YaziciAjani.Netsh("http delete urlacl url=http://+:" + port + "/", out _);
                YaziciAjani.Netsh("advfirewall firewall delete rule name=\"" + KuralAdi + "\"", out _);
                if (sil) { Gunluk.Yaz("RFID yardımcısı izinleri silindi (port " + port + ")"); return 0; }

                var a = YaziciAjani.Netsh("http add urlacl url=http://+:" + port + "/ sddl=D:(A;;GX;;;WD)", out var o1);
                var k = YaziciAjani.Netsh("advfirewall firewall add rule name=\"" + KuralAdi + "\" dir=in action=allow protocol=TCP localport=" + port + " profile=any", out var o2);
                var p = paylasilacak == null ? 0 : Paylas(paylasilacak);
                Gunluk.Yaz("RFID yardımcısı izinleri (yönetici): urlacl " + a + ", güvenlik duvarı " + k + ", paylaşım " + p + (a != 0 ? " — " + o1.Trim() : "") + (k != 0 ? " — " + o2.Trim() : ""));
                return a == 0 && k == 0 && p == 0 ? 0 : 1;
            }
            catch (Exception e)
            {
                Gunluk.Yaz("RFID yardımcısı izin HATA: " + e);
                return 1;
            }
        }

        /// <summary>Yazıcıyı boşluksuz bir adla paylaşır: "RFID" (başka yazıcıda varsa RFID2, RFID3…). Sunucu hizmetini de başlatır.</summary>
        private static int Paylas(string yazici)
        {
            var mevcut = YaziciListesi();
            var ad = VarsayilanPaylasim;
            for (var i = 2; mevcut.Any(y => !string.Equals(y.ad, yazici, StringComparison.OrdinalIgnoreCase) && string.Equals(y.paylasim, ad, StringComparison.OrdinalIgnoreCase)); i++)
                ad = VarsayilanPaylasim + i;

            try
            {
                using (var s = new ManagementObjectSearcher("SELECT * FROM Win32_Printer"))
                    foreach (ManagementObject o in s.Get())
                        using (o)
                        {
                            if (!string.Equals((string)o["Name"], yazici, StringComparison.OrdinalIgnoreCase)) continue;
                            o["Shared"] = true;
                            o["ShareName"] = ad;
                            o.Put();
                            Gunluk.Yaz("Yazıcı paylaşıldı: " + yazici + " → " + ad);
                        }
            }
            catch (Exception e) { Gunluk.Yaz("Yazıcı paylaşılamadı (" + yazici + "): " + e.Message); return 3; }

            try
            {
                using (var s = new ServiceController("LanmanServer"))
                    if (s.Status != ServiceControllerStatus.Running) { s.Start(); s.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20)); }
            }
            catch (Exception e) { Gunluk.Yaz("Sunucu (LanmanServer) hizmeti başlatılamadı: " + e.Message); }
            return 0;
        }
    }
}
