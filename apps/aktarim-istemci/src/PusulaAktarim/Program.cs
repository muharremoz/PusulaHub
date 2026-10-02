using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PusulaAktarim
{
    /// <summary>
    /// Başlatıcı: yerel web sunucusu + tepsi simgesi; arayüz varsayılan tarayıcıda açılır.
    /// Sayfa 5 sn'de bir /api/nabiz atar; 45 sn kesilirse (sekme kapandı) exe çıkar —
    /// ama aktarım ya da resim küçültme sürerken kapanmaz, tepsiden yeniden açılır.
    /// (0.2.4-0.2.5'teki WebView2 penceresi 0.2.6'da kaldırıldı.)
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
                TarayicidaAc(tamAdres);

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
                case "POST /sql/atla": return Task.FromResult(_uygulama.SqlAtla());
                case "POST /sql/giris": return Task.FromResult(_uygulama.SqlGirisineDon());
                case "POST /resim/klasor": return _uygulama.ResimKlasoruOlc(i.Metin("yol"));
                case "POST /kesif/yenile": return _uygulama.YenidenKesif();
                case "POST /aktarim/baslat":
                    return _uygulama.AktarimBaslat(i.Govde);
                // Resim küçültme (aktarımdan ayrı araç) — bkz. ResimKucultucu
                case "POST /resim/tara":
                    return Task.Run(() => ResimKucultucu.Tara((i.Govde?["klasorler"] as Newtonsoft.Json.Linq.JArray)?.Values<string>() ?? new string[0], (i.Sayi("esikKb") > 0 ? i.Sayi("esikKb") : 500)));
                case "POST /resim/ornek":
                    return Task.Run(() => ResimKucultucu.Ornek(i.Metin("yol"), (i.Sayi("kalite") > 0 ? i.Sayi("kalite") : 85)));
                case "POST /resim/goruntu":
                    return Task.Run<object>(() => ResimKucultucu.Goruntu(i.Metin("yol"), i.Sayi("kalite") > 0 ? (int?)i.Sayi("kalite") : null));
                case "POST /resim/baslat":
                    return Task.FromResult(ResimKucultucu.Baslat((i.Sayi("kalite") > 0 ? i.Sayi("kalite") : 85), i.Mantik("yedekle"), i.Sayi("taramaNo")));
                case "GET /resim/durum": return Task.FromResult(ResimKucultucu.Durum());
                case "POST /resim/durdur": return Task.FromResult(ResimKucultucu.Durdur());
                case "POST /dosya/boyut":
                    return Task.Run(() => DosyaGezgini.KlasorBoyutu(i.Metin("yol")));
                case "POST /dosya/listele":
                    return Task.FromResult(DosyaGezgini.Listele(i.Metin("yol"), i.Mantik("dosyalar"), (i.Govde?["uzantilar"] as Newtonsoft.Json.Linq.JArray)?.Values<string>().ToArray()));
                case "POST /aktarim/duraklat": return _uygulama.Duraklat();
                case "POST /aktarim/yeni": return Task.FromResult(_uygulama.YeniAktarim());
                case "POST /aktarim/devam": return _uygulama.Devam();
                case "POST /cikis":
                    _ = Task.Run(async () => { await Task.Delay(300); Kapat(); });
                    return Task.FromResult<object>(new { tamam = true });
                default: throw new KullaniciHatasi("Bilinmeyen istek: " + i.Yontem + " " + i.Yol, 404);
            }
        }

        // ------------------------------------------------------------ yaşam döngüsü

        private static void Bekci()
        {
            // Sekme kapalı olsa da süren iş yarıda kesilmesin (tepsiden yeniden açılır)
            if (_uygulama != null && _uygulama.Mesgul) { _sonNabiz = DateTime.Now; return; }
            var simdi = DateTime.Now;
            var sinir = _sonNabiz == DateTime.MinValue ? _baslangic + IlkNabizSiniri : _sonNabiz + NabizSiniri;
            if (simdi > sinir) Kapat();
        }

        private static void Kapat()
        {
            if (Interlocked.Exchange(ref _kapaniyor, 1) == 1) return;
            try { _uygulama?.Kapat(); } catch { }
            try { _sunucu?.Durdur(); } catch { }
            Application.Exit();
        }

        private static void TepsiKur(string adres)
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Aç", null, (s, e) => TarayicidaAc(adres));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Kapat", null, (s, e) => Kapat());
            _tepsi = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application,
                Text = Baslik,
                ContextMenuStrip = menu,
                Visible = true,
            };
            _tepsi.DoubleClick += (s, e) => TarayicidaAc(adres);
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
