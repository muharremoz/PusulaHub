using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PusulaAktarim
{
    /// <summary>
    /// Başlatıcı: yerel web sunucusu + tepsi simgesi + pencere (WebView2).
    /// SQL Konsol web sürümünün (PusulaCRM/sql-konsol) yaşam döngüsüyle aynı:
    /// pencere varsa ömrü o belirler; yoksa (WebView2 eksik → tarayıcı) sayfa
    /// 5 sn'de bir /api/nabiz atar, 45 sn kesilirse exe çıkar.
    /// </summary>
    internal static class Program
    {
        private static readonly TimeSpan NabizSiniri = TimeSpan.FromSeconds(45);
        private static readonly TimeSpan IlkNabizSiniri = TimeSpan.FromMinutes(5);

        private static YerelSunucu _sunucu;
        private static Uygulama _uygulama;
        private static NotifyIcon _tepsi;
        private static DateTime _sonNabiz = DateTime.MinValue;
        private static readonly DateTime _baslangic = DateTime.Now;
        private static int _kapaniyor;
        private static AktarimPenceresi _pencere;
        private const string GosterOlayi = @"Local\PusulaAktarim-goster";
        private const string Baslik = "Pusula Aktarım";

        [STAThread]
        private static void Main()
        {
            // Parametre dosyaları Windows-1254; net48'de kod sayfası sağlayıcısı gerekmez ama emin olalım.
            try { Encoding.GetEncoding(1254); } catch { }

            using (var tekil = new Mutex(true, @"Local\PusulaAktarim", out var ilk))
            {
                if (!ilk)
                {
                    try
                    {
                        if (EventWaitHandle.TryOpenExisting(GosterOlayi, out var olay)) { olay.Set(); return; }
                    }
                    catch { }
                    var adres = AdresDosyasiOku();
                    if (adres != null) TarayicidaAc(adres);
                    else MessageBox.Show("Uygulama zaten açık. Tepsi simgesinden açabilirsiniz.", Baslik,
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                var servisAdresi = Environment.GetEnvironmentVariable("PUSULA_AKTARIM_URL");
                if (string.IsNullOrWhiteSpace(servisAdresi)) servisAdresi = ServisIstemci.VarsayilanAdres;
                _uygulama = new Uygulama(new ServisIstemci(servisAdresi));

                try
                {
                    _sunucu = new YerelSunucu(Yonlendir);
                    _sunucu.Baslat();
                }
                catch (Exception e)
                {
                    MessageBox.Show("Yerel sunucu başlatılamadı: " + e.Message, Baslik, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                var tamAdres = _sunucu.Adres + "#anahtar=" + _sunucu.Anahtar;
                AdresDosyasiYaz(tamAdres);
                TepsiKur(tamAdres);
                if (AktarimPenceresi.CalismaZamaniVar())
                {
                    _pencere = new AktarimPenceresi(tamAdres, Kapat);
                    _pencere.Show();
                    GosterOlayiniDinle();
                }
                else
                {
                    TarayicidaAc(tamAdres);
                }

                var bekci = new System.Windows.Forms.Timer { Interval = 5000 };
                bekci.Tick += (s, e) => Bekci();
                bekci.Start();

                Application.Run();

                bekci.Stop();
                _tepsi.Visible = false;
                _tepsi.Dispose();
                AdresDosyasiSil();
            }
        }

        // ------------------------------------------------------------ API

        private static Task<object> Yonlendir(Istek i)
        {
            switch (i.Yontem + " " + i.Yol)
            {
                case "GET /durum": return Task.FromResult(_uygulama.Durum());
                case "POST /nabiz": _sonNabiz = DateTime.Now; return Task.FromResult<object>(new { tamam = true });
                case "POST /giris": return _uygulama.Giris(i.Metin("kod"));
                case "POST /sql/elle": return _uygulama.ElleBaglan(i.Metin("sunucu"), i.Metin("kullanici"), i.Metin("sifre"));
                case "POST /kesif/yenile": return _uygulama.YenidenKesif();
                case "POST /aktarim/baslat":
                    return _uygulama.AktarimBaslat(i.Govde);
                case "POST /sec/dosyalar": return Sec(p => DosyaSec(p, i.Metin("tur")));
                case "POST /sec/klasor": return Sec(p => KlasorSec(p, i.Metin("aciklama")));
                case "POST /aktarim/duraklat": return _uygulama.Duraklat();
                case "POST /aktarim/devam": return _uygulama.Devam();
                case "POST /cikis":
                    _ = Task.Run(async () => { await Task.Delay(300); Kapat(); });
                    return Task.FromResult<object>(new { tamam = true });
                default: throw new KullaniciHatasi("Bilinmeyen istek: " + i.Yontem + " " + i.Yol, 404);
            }
        }

        // ------------------------------------------------------------ Windows dosya/klasör seçimi
        // Web arayüzündeki <input type=file> dosyanın YOLUNU vermez; uygulama yolu bilmeli
        // (paketleme, devam). Bu yüzden seçim pencereleri exe'de, Windows'un kendi penceresi.

        private static Task<object> Sec(Func<IWin32Window, object> goster)
        {
            var sonuc = new TaskCompletionSource<object>();
            void Calistir(IWin32Window sahip)
            {
                try { sonuc.SetResult(goster(sahip)); } catch (Exception e) { sonuc.SetException(e); }
            }
            var p = _pencere;
            if (p != null && !p.IsDisposed && p.Visible) p.BeginInvoke((Action)(() => Calistir(p)));
            else
            {
                // Pencere yok (tarayıcı modu) → ayrı STA iş parçacığı
                var t = new Thread(() => Calistir(null)) { IsBackground = true };
                t.SetApartmentState(ApartmentState.STA);
                t.Start();
            }
            return sonuc.Task;
        }

        /// <summary>tur: eski (varsayılan, çoklu) | exe | param — program dosyası seçimi tek dosya.</summary>
        private static object DosyaSec(IWin32Window sahip, string tur)
        {
            var (baslik, filtre, coklu) =
                tur == "exe" ? ("Program dosyasını (.exe) seçin", "Program dosyası|*.exe", false) :
                tur == "param" ? ("Parametre dosyasını (.txt) seçin", "Parametre dosyası|*.txt|Tüm dosyalar|*.*", false) :
                ("Eski yıl dataları seçin", "Veritabanı ve arşiv dosyaları|*.mdf;*.ldf;*.ndf;*.bak;*.zip;*.rar;*.7z|Tüm dosyalar|*.*", true);
            using (var d = new OpenFileDialog { Title = baslik, Multiselect = coklu, Filter = filtre })
            {
                return new { yollar = d.ShowDialog(sahip) == DialogResult.OK ? d.FileNames : new string[0] };
            }
        }

        private static object KlasorSec(IWin32Window sahip, string aciklama)
        {
            using (var d = new FolderBrowserDialog { Description = aciklama ?? "Klasör seçin", ShowNewFolderButton = false })
            {
                return new { yol = d.ShowDialog(sahip) == DialogResult.OK ? d.SelectedPath : null };
            }
        }

        // ------------------------------------------------------------ yaşam döngüsü

        private static void Bekci()
        {
            if (_pencere != null && !_pencere.IsDisposed && _pencere.Visible) return;
            var simdi = DateTime.Now;
            var sinir = _sonNabiz == DateTime.MinValue ? _baslangic + IlkNabizSiniri : _sonNabiz + NabizSiniri;
            if (simdi > sinir) Kapat();
        }

        private static void Kapat()
        {
            if (Interlocked.Exchange(ref _kapaniyor, 1) == 1) return;
            try { _uygulama?.Kapat(); } catch { }
            try { _sunucu?.Durdur(); } catch { }
            if (_pencere != null && !_pencere.IsDisposed)
            {
                _pencere.SormadanKapat = true;
                try { _pencere.Close(); } catch { }
            }
            Application.Exit();
        }

        private static void TepsiKur(string adres)
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Göster", null, (s, e) => Goster(adres));
            menu.Items.Add("Tarayıcıda aç", null, (s, e) => TarayicidaAc(adres));
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
            ThreadPool.RegisterWaitForSingleObject(olay, (d, zamanAsimi) =>
            {
                var p = _pencere;
                if (p != null && !p.IsDisposed) p.BeginInvoke((Action)p.OneGetir);
            }, null, Timeout.Infinite, false);
        }

        private static void TarayicidaAc(string adres)
        {
            try { Process.Start(new ProcessStartInfo(adres) { UseShellExecute = true }); }
            catch (Exception e)
            {
                MessageBox.Show("Tarayıcı açılamadı. Adresi elle açın:\n\n" + adres + "\n\n" + e.Message,
                    Baslik, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private static string AdresDosyasi =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PusulaAktarim", "web-adres.txt");

        private static void AdresDosyasiYaz(string adres)
        {
            try { Directory.CreateDirectory(Path.GetDirectoryName(AdresDosyasi)); File.WriteAllText(AdresDosyasi, adres); }
            catch { }
        }

        private static string AdresDosyasiOku()
        {
            try { return File.Exists(AdresDosyasi) ? File.ReadAllText(AdresDosyasi).Trim() : null; }
            catch { return null; }
        }

        private static void AdresDosyasiSil()
        {
            try { File.Delete(AdresDosyasi); } catch { }
        }
    }
}
