using System;
using Newtonsoft.Json.Linq;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PusulaConnect
{
    /// <summary>
    /// Başlatıcı (Aktarım 2 iskeleti): yerel web sunucusu + pencere (WebView2) + tepsi.
    /// Ek kipler:
    ///   --vpn-kur       yönetici olarak FortiClient kurulumu (pencere yok) — bkz. VpnKurulumu
    ///   --yazici-izin   yönetici olarak yazıcı ajanının URL ACL + güvenlik duvarı kaydı — bkz. YaziciAjani
    ///   --rfid-izin     yönetici olarak eski programların RFID yardımcısı: URL ACL + güvenlik duvarı + yazıcı paylaşımı — bkz. RfidYardimcisi
    ///   --sayim-klasor  yönetici olarak sayım klasörünü (C:\Pusula altında) oluşturur, Users değiştirme hakkı — bkz. Sayim
    ///   --rfid-baslat   Windows açılışı: RFID yardımcısını başlatıp penceresini gizler (Connect penceresi açılmaz)
    ///   --guncellendi   kendini güncelledikten sonra yeniden açılış (eski kopyanın kapanmasını bekler)
    /// </summary>
    internal static class Program
    {
        private static YerelSunucu _sunucu;
        private static Uygulama _uygulama;
        private static NotifyIcon _tepsi;
        private static int _kapaniyor;
        private static ConnectPenceresi _pencere;
        private const string GosterOlayi = @"Local\PusulaConnect2-goster";
        private const string Baslik = "Pusula Connect";
        private static readonly TimeSpan NabizSiniri = TimeSpan.FromSeconds(45);
        private static DateTime _sonNabiz = DateTime.MinValue;
        private static readonly DateTime _baslangic = DateTime.Now;

        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Contains("--vpn-kur")) return VpnKurulumu.YoneticiOlarakCalistir();
            if (args.Contains("--yazici-izin") || args.Contains("--yazici-izin-sil")) return YaziciAjani.YoneticiOlarakCalistir(args);
            if (args.Contains("--rfid-izin") || args.Contains("--rfid-izin-sil")) return RfidYardimcisi.YoneticiOlarakCalistir(args);
            if (args.Contains("--sayim-klasor")) return Sayim.YoneticiOlarakCalistir(args);
            if (args.Contains("--rfid-baslat")) return RfidYardimcisi.AcilistaBaslat();

            using (var tekil = new Mutex(false, @"Local\PusulaConnect2"))
            {
                // Güncellemeden sonra eski kopya kapanana kadar bekle; normal açılışta beklemeden dene.
                var bekle = args.Contains("--guncellendi") ? 15000 : 0;
                bool sahip;
                try { sahip = tekil.WaitOne(bekle); } catch (AbandonedMutexException) { sahip = true; }
                if (!sahip)
                {
                    try { if (EventWaitHandle.TryOpenExisting(GosterOlayi, out var olay)) olay.Set(); } catch { }
                    return 0;
                }

                DpiFarkinda();
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Gunluk.Yaz("Açıldı: sürüm " + ServisIstemci.Surum + ", " + Application.ExecutablePath);
                Yerlesim.Yerles();
                // Güncellemeden sonra ilk açılış: kısayollardaki eski ikon önbelleğini tazele
                if (args.Contains("--guncellendi")) _ = Task.Run(Yerlesim.IkonlariTazele);
                _ = Task.Run(YaziciAjani.GerekirseBaslat);
                _ = Task.Run(RfidYardimcisi.GerekirseBaslat);

                var adres = Environment.GetEnvironmentVariable("PUSULA_CONNECT_URL");
                _uygulama = new Uygulama(new ServisIstemci(string.IsNullOrWhiteSpace(adres) ? ServisIstemci.VarsayilanAdres : adres)) { Kapat = Kapat };

                try
                {
                    _sunucu = new YerelSunucu(Yonlendir);
                    _sunucu.Baslat();
                }
                catch (Exception e)
                {
                    MessageBox.Show("Yerel sunucu başlatılamadı: " + e.Message, Baslik, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                var tamAdres = _sunucu.Adres + "#anahtar=" + _sunucu.Anahtar;
                AdresYaz(tamAdres);
                TepsiKur(tamAdres);
                // Yeni duyuru: tepsi bildirimi (oturum tam ekrandayken de görünür); tıklanınca pencere öne gelir.
                var tepsi = _tepsi;
                _uygulama.Bildir = (baslik, metin, onem) =>
                {
                    var kisa = string.IsNullOrEmpty(metin) ? "" : metin.Length > 200 ? metin.Substring(0, 197) + "…" : metin;
                    var ikon = onem == "kritik" ? ToolTipIcon.Error : onem == "uyari" ? ToolTipIcon.Warning : ToolTipIcon.Info;
                    void goster() => tepsi.ShowBalloonTip(15000, "Pusula duyurusu: " + baslik, kisa.Length > 0 ? kisa : baslik, ikon);
                    var p = _pencere;
                    if (p != null && !p.IsDisposed && p.IsHandleCreated) p.BeginInvoke((Action)goster); else goster();
                };
                _tepsi.BalloonTipClicked += (s, e) => Goster(tamAdres);
                // WebView2 yoksa (eski Windows 10/Server) önce kurulmaya çalışılır — yoksa arayüz tarayıcıya düşerdi
                if (ConnectPenceresi.CalismaZamaniVar() || WebViewYoksaKur())
                {
                    _pencere = new ConnectPenceresi(tamAdres, Kapat);
                    _pencere.Show();
                    var pencere = _pencere;
                    _uygulama.OturumAc = (a, bitti) => pencere.OturumAc(a, bitti);
                    _uygulama.OturumAcikMi = () => !pencere.IsDisposed && pencere.OturumAcik;
                    _uygulama.OturumKes = () => pencere.OturumKes();
                    GosterOlayiniDinle();
                }
                else TarayicidaAc(tamAdres);

                // Terminal erişimini arka planda tazele (VPN açılıp kapanınca kart güncellensin)
                var kontrol = new System.Windows.Forms.Timer { Interval = 10000 };
                kontrol.Tick += (s, e) =>
                {
                    _ = Task.Run(_uygulama.Kontrol);
                    if (_pencere == null || _pencere.IsDisposed || !_pencere.Visible)
                    {
                        var sinir = _sonNabiz == DateTime.MinValue ? _baslangic + TimeSpan.FromMinutes(5) : _sonNabiz + NabizSiniri;
                        if (DateTime.Now > sinir) Kapat();
                    }
                };
                kontrol.Start();

                Application.Run();
                kontrol.Stop();
                _tepsi.Visible = false;
                _tepsi.Dispose();
                try { tekil.ReleaseMutex(); } catch { }
            }
            return 0;
        }

        private static Task<object> Yonlendir(Istek i)
        {
            switch (i.Yontem + " " + i.Yol)
            {
                case "GET /durum": return Task.FromResult(_uygulama.Durum());
                case "POST /nabiz": _sonNabiz = DateTime.Now; return Task.FromResult<object>(new { tamam = true });
                case "POST /kayit": return _uygulama.Kayit(i.Metin("kod"));
                case "POST /kayit/sil": return Task.FromResult(_uygulama.KayitSil());
                case "POST /kontrol": return _uygulama.KontrolEt();
                case "POST /vpn/kur": return Task.FromResult(_uygulama.VpnKur());
                case "POST /vpn/ac": return Task.FromResult(_uygulama.VpnAc());
                case "POST /rdp/sifre": return _uygulama.SifreKaydet(i.Metin("sifre"), i.Metin("kod"));
                case "POST /rdp/sifre/sil": return _uygulama.SifreSil();
                case "POST /baglan": return _uygulama.Baglan(i.Metin("kod"));
                case "POST /iki/baslat": return _uygulama.IkiBaslat();
                case "POST /iki/onayla": return _uygulama.IkiOnayla(i.Metin("kod"), i.Metin("sifre"));
                case "POST /iki/kilit": return _uygulama.IkiKilitAc(i.Metin("kod"));
                case "POST /iki/kapat": return _uygulama.IkiKapat(i.Metin("kod"));
                case "POST /guncelle": return Task.FromResult(_uygulama.Guncelle());
                case "POST /guncelleme/denetle": return _uygulama.GuncellemeDenetle();
                case "POST /ayarlar": return Task.FromResult(_uygulama.AyarKaydet(i.Govde));
                case "POST /sifre/goster": return _uygulama.SifreGoster(i.Metin("kod"));
                case "POST /duyuru/okundu": return _uygulama.DuyuruOkundu(i.Metin("id"));
                case "POST /yazici/durum": return Task.Run(YaziciAjani.Durum);
                case "POST /yazici/port": return YaziciAjani.PortDenetle(i.Sayi("port"));
                case "POST /yazici/kur": return YaziciAjani.Kur(i.Metin("yazici"), i.Sayi("port"));
                case "POST /yazici/test": return YaziciAjani.Test();
                case "POST /yazici/kaldir": return YaziciAjani.Kaldir();
                case "POST /rfid/durum": return Task.Run(RfidYardimcisi.Durum);
                case "POST /rfid/port": return RfidYardimcisi.PortDenetle(i.Sayi("port"));
                case "POST /rfid/kur": return RfidYardimcisi.Kur(i.Metin("yazici"), i.Sayi("port"));
                case "POST /rfid/test": return RfidYardimcisi.Test();
                case "POST /rfid/kaldir": return RfidYardimcisi.Kaldir();
                case "POST /yedekler/yenile": return _uygulama.YedekleriYenile();
                // Sayım: tur = "pusulax" (varsayılan) | "eski"; secim (eski) = { veritabani, ad, formId }
                case "POST /sayim/kur": return _uygulama.SayimKur(i.Metin("tur"), i.Metin("kod"), i.Govde?["secim"] as JObject);
                case "POST /sayim/guncelle": return _uygulama.SayimGuncelle(i.Metin("tur"), i.Metin("kod"), i.Govde?["secim"] as JObject);
                case "POST /sayim/test": return Sayim.Bul(i.Metin("tur")).Test();
                case "POST /sayim/klasor": return Task.FromResult(Sayim.Bul(i.Metin("tur")).KlasorAc());
                case "POST /sayim/kaldir": return Task.FromResult(Sayim.Bul(i.Metin("tur")).Kaldir(i.Mantik("klasor")));
                case "POST /sayim/veritabanlari": return _uygulama.SayimVeritabanlari().ContinueWith(t => (object)t.Result);
                case "POST /gunluk/ac":
                    Process.Start(new ProcessStartInfo("notepad.exe", "\"" + Gunluk.Dosya + "\"") { UseShellExecute = true });
                    return Task.FromResult<object>(new { tamam = true });
                case "POST /cikis":
                    _ = Task.Run(async () => { await Task.Delay(300); Kapat(); });
                    return Task.FromResult<object>(new { tamam = true });
                default: throw new KullaniciHatasi("Bilinmeyen istek: " + i.Yontem + " " + i.Yol, 404);
            }
        }

        private static void Kapat()
        {
            if (Interlocked.Exchange(ref _kapaniyor, 1) == 1) return;
            try { _sunucu?.Durdur(); } catch { }
            var p = _pencere;
            if (p != null && !p.IsDisposed)
            {
                p.SormadanKapat = true;
                try { p.BeginInvoke((Action)(() => { try { p.Close(); } catch { } Application.Exit(); })); return; } catch { }
            }
            Application.Exit();
        }

        private static void TepsiKur(string adres)
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Göster", null, (s, e) => Goster(adres));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Kapat", null, (s, e) => Kapat());
            _tepsi = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application,
                Text = Baslik,
                ContextMenuStrip = menu,
                Visible = true,
            };
            _tepsi.DoubleClick += (s, e) => Goster(adres);
        }

        private static void Goster(string adres)
        {
            if (_pencere != null && !_pencere.IsDisposed && !_pencere.SormadanKapat) _pencere.OneGetir();
            else TarayicidaAc(adres);
        }

        private static void GosterOlayiniDinle()
        {
            var olay = new EventWaitHandle(false, EventResetMode.AutoReset, GosterOlayi);
            ThreadPool.RegisterWaitForSingleObject(olay, (d, z) =>
            {
                var p = _pencere;
                if (p != null && !p.IsDisposed) p.BeginInvoke((Action)p.OneGetir);
            }, null, Timeout.Infinite, false);
        }

        private static bool WebViewYoksaKur()
        {
            Gunluk.Yaz("WebView2 yok — kuruluyor");
            var tamam = WebViewKurulum.Kur(ConnectPenceresi.CalismaZamaniVar);
            Gunluk.Yaz(tamam ? "WebView2 kuruldu" : "WebView2 kurulamadı — arayüz tarayıcıda açılacak");
            return tamam;
        }

        /// <summary>
        /// Yedek yol (WebView2 kurulamadı): arayüz Edge'de, yoksa Chrome'da "uygulama penceresi" olarak
        /// (--app: adres çubuğu/sekme yok) açılır. Varsayılan tarayıcıya bırakılmaz — o Internet Explorer
        /// olabiliyor ve arayüz IE'de çalışmıyor (boş sayfa; 03.10.2026 PUSULALOCAL'da yaşandı).
        /// </summary>
        private static void TarayicidaAc(string adres)
        {
            foreach (var exe in new[] { "msedge.exe", "chrome.exe" })
            {
                var yol = UygulamaYolu(exe);
                if (yol == null) continue;
                try
                {
                    Process.Start(new ProcessStartInfo(yol, "--app=\"" + adres + "\"") { UseShellExecute = false });
                    Gunluk.Yaz("Arayüz " + exe + " uygulama penceresinde açıldı");
                    return;
                }
                catch (Exception e) { Gunluk.Yaz(exe + " açılamadı: " + e.Message); }
            }
            try { Process.Start(new ProcessStartInfo(adres) { UseShellExecute = true }); }
            catch (Exception e) { MessageBox.Show("Tarayıcı açılamadı:\n" + adres + "\n\n" + e.Message, Baslik); }
        }

        /// <summary>Kayıtlı uygulama yolu (App Paths) — önce kullanıcı, sonra makine (64 ve 32 bit görünüm).</summary>
        private static string UygulamaYolu(string exe)
        {
            var anahtar = @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe;
            foreach (var kovan in new[] { Microsoft.Win32.RegistryHive.CurrentUser, Microsoft.Win32.RegistryHive.LocalMachine })
                foreach (var gorunum in new[] { Microsoft.Win32.RegistryView.Registry64, Microsoft.Win32.RegistryView.Registry32 })
                {
                    try
                    {
                        using (var k = Microsoft.Win32.RegistryKey.OpenBaseKey(kovan, gorunum).OpenSubKey(anahtar))
                        {
                            var yol = (k?.GetValue(null) as string)?.Trim('"');
                            if (!string.IsNullOrEmpty(yol) && File.Exists(yol)) return yol;
                        }
                    }
                    catch { }
                }
            return null;
        }

        [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr deger);
        [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();

        /// <summary>
        /// Ekran ölçekli (125/150 %) bilgisayarlarda pencere bulanık büyütülmesin: gömülü uzak masaüstü
        /// gerçek piksellerle çizilsin (mstsc gibi). Per-Monitor V2 (Win10 1703+), yoksa sistem DPI.
        /// </summary>
        private static void DpiFarkinda()
        {
            try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
            try { SetProcessDPIAware(); } catch { }
        }

        /// <summary>Geliştirmede (vite) exe'yi bulmak için.</summary>
        private static void AdresYaz(string adres)
        {
            try { File.WriteAllText(Path.Combine(Kimlik.Klasor, "web-adres.txt"), adres); } catch { }
        }
    }
}
