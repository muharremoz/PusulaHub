using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PusulaConnect
{
    /// <summary>
    /// Uygulamanın kendi penceresi — arayüz tarayıcı sekmesi yerine burada (WebView2 =
    /// Windows'taki Edge motoru). Sekme yanlışlıkla kapatılıp oturum düşmesin diye
    /// (CRM masaüstü kabuğundaki gibi): kapatırken onay sorulur.
    ///
    /// Tek dosya exe: WebView2'nin yerel yükleyicisi (WebView2Loader.dll) exe'ye
    /// gömülü; ilk açılışta %LOCALAPPDATA%\PusulaConnect2\webview2 altına çıkarılır.
    /// WebView2 çalışma zamanı yoksa (çok eski Windows 10) konsol tarayıcıda açılır.
    /// </summary>
    internal sealed class ConnectPenceresi : Form
    {
        private readonly string _adres;
        private readonly Action _kapat;
        private readonly WebView2 _web;
        /// <summary>Pencere açılış sorunları Hub'a olay olarak gider (Program bağlar): (tür, ayrıntı).</summary>
        public static Action<string, object> OlayGonder;

        /// <summary>Program (tepsi/nabız/çıkış) kapatıyorsa onay sorulmaz.</summary>
        public bool SormadanKapat { get; set; }

        private static string VeriKlasoru =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PusulaConnect2");

        public ConnectPenceresi(string adres, Action kapat)
        {
            _adres = adres;
            _kapat = kapat;
            Text = "Pusula Connect";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
            StartPosition = FormStartPosition.CenterScreen;
            var ekran = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(1500, ekran.Width - 80), Math.Min(950, ekran.Height - 60));
            MinimumSize = new Size(960, 600);
            WindowState = FormWindowState.Maximized;
            BackColor = Color.White;

            _web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.White };
            Controls.Add(_web);
            Load += async (s, e) => await Baslat();
        }

        /// <summary>WebView2 çalışma zamanı kurulu mu (Evergreen, Edge ile gelir).</summary>
        public static bool CalismaZamaniVar()
        {
            try
            {
                YukleyiciyiHazirla();
                return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString());
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// WebView2 ortamını kurar. 09.10.2026: bazı müşterilerde "dosya bulunamadı (0x80070002)" — çalışma zamanı kayıtlı
        /// ama dosyaları yok (arka planda güncelleniyor ya da bozuk). Önce 5 sn bekleyip bir kez daha denenir (güncelleme
        /// anı), yine olmazsa Microsoft'un kurulum programıyla onarılıp son kez denenir; olmazsa tarayıcıya düşülür.
        /// </summary>
        private async Task OrtamiKur()
        {
            Exception ilk = null;
            for (var deneme = 1; deneme <= 3; deneme++)
            {
                try
                {
                    var ortam = await CoreWebView2Environment.CreateAsync(null, Path.Combine(VeriKlasoru, "WebView2"));
                    await _web.EnsureCoreWebView2Async(ortam);
                    if (deneme > 1)
                    {
                        Gunluk.Yaz("Uygulama penceresi " + deneme + ". denemede açıldı");
                        OlayGonder?.Invoke("pencere_acildi_tekrar", new { deneme, hata = ilk?.Message });
                    }
                    return;
                }
                catch (Exception ex)
                {
                    ilk = ilk ?? ex;
                    Gunluk.Yaz("Uygulama penceresi açılamadı (" + deneme + ". deneme): " + ex.Message);
                    if (deneme == 1) await Task.Delay(5000);
                    else if (deneme == 2)
                    {
                        Gunluk.Yaz("WebView2 onarılıyor");
                        var tamam = WebViewKurulum.Kur(CalismaZamaniVar);
                        Gunluk.Yaz("WebView2 onarım sonucu: " + (tamam ? "kurulu" : "kurulamadı"));
                    }
                    else
                    {
                        OlayGonder?.Invoke("pencere_acilamadi", new { hata = ex.Message, surum = CalismaZamaniSurumu() });
                        throw;
                    }
                }
            }
        }

        private static string CalismaZamaniSurumu()
        {
            try { return CoreWebView2Environment.GetAvailableBrowserVersionString(); } catch { return null; }
        }

        private async Task Baslat()
        {
            try
            {
                await OrtamiKur();
                var a = _web.CoreWebView2.Settings;
                // F5 ile sayfa yenilenmesin (süren iş ekranı kaybolmasın).
                a.AreBrowserAcceleratorKeysEnabled = false;
                a.AreDevToolsEnabled = false;
                a.IsStatusBarEnabled = false;
                a.IsZoomControlEnabled = true;
                a.AreDefaultContextMenusEnabled = true;
                // Yalnız yerel sunucu açılır; dış bağlantılar varsayılan tarayıcıda.
                _web.CoreWebView2.NavigationStarting += (s, e) =>
                {
                    if (YerelMi(e.Uri)) return;
                    e.Cancel = true;
                    DisaAc(e.Uri);
                };
                // window.open: PDF yazdırma sayfası (about:blank + document.write) pencerede
                // açılsın; dış adres tarayıcıya.
                _web.CoreWebView2.NewWindowRequested += (s, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Uri) && e.Uri != "about:blank" && !YerelMi(e.Uri))
                    {
                        e.Handled = true;
                        DisaAc(e.Uri);
                    }
                };
                _web.CoreWebView2.DocumentTitleChanged += (s, e) => Text = "Pusula Connect";
                // Kapatma onayı sayfanın kendi penceresinde sorulur (KapatmaOnayi):
                // sayfa "soruldu" diye yanıtlarsa Windows kutusu açılmaz.
                _web.CoreWebView2.WebMessageReceived += (s, e) =>
                {
                    string m = null;
                    try { m = e.TryGetWebMessageAsString(); } catch { }
                    if (m == "soruldu") _soruldu = true;
                };
                _web.CoreWebView2.NavigationCompleted += (s, e) => _sayfaHazir = e.IsSuccess;
                _web.CoreWebView2.Navigate(_adres);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Uygulama penceresi açılamadı, tarayıcıda açılıyor.\n\n" + ex.Message,
                    "Pusula Connect", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                DisaAc(_adres);
                SormadanKapat = true;
                Hide();
            }
        }

        private bool YerelMi(string uri) =>
            uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase) ||
            uri.StartsWith("blob:", StringComparison.OrdinalIgnoreCase) ||
            uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
            uri.StartsWith(new Uri(_adres).GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase);

        private static void DisaAc(string uri)
        {
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri) { UseShellExecute = true }); }
            catch { }
        }

        /// <summary>Tepsiden / ikinci kopyadan: pencereyi öne getir.</summary>
        public void OneGetir()
        {
            if (IsDisposed) return;
            if (!Visible) Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Maximized;
            Activate();
            BringToFront();
        }

        // ------------------------------------------------------------ gömülü uzak masaüstü

        private OturumPaneli _oturum;

        /// <summary>Oturum açık mı (Uygulama.Durum için; her iş parçacığından okunabilir).</summary>
        public bool OturumAcik => _oturum != null;

        /// <summary>Açık oturumu keser (Bitti olayı normal yoldan gelir, arayüz geri döner).</summary>
        public void OturumKes()
        {
            if (IsDisposed) return;
            if (InvokeRequired) { BeginInvoke((Action)OturumKes); return; }
            _oturum?.Kes();
        }

        /// <summary>
        /// Uzak masaüstünü pencerenin tamamında açar (arayüz gizlenir). Bitince arayüz geri gelir ve
        /// <paramref name="bitti"/> (mesaj, şifreHatalı) çağrılır. UI iş parçacığında çalışır.
        /// </summary>
        public void OturumAc(RdpAyar a, Action<string, bool, int> bitti)
        {
            if (InvokeRequired) { Invoke((Action)(() => OturumAc(a, bitti))); return; }
            if (_oturum != null) { OneGetir(); return; }
            var p = new OturumPaneli(a);
            p.Bitti += (mesaj, sifreHatali) =>
            {
                if (_oturum != p) return;
                _oturum = null;
                Controls.Remove(p);
                _web.Visible = true;
                p.Dispose();
                BaslikCubugu(true);
                bitti(mesaj, sifreHatali, p.SonNeden);
            };
            _oturum = p;
            BaslikCubugu(false);
            SuspendLayout();
            Controls.Add(p);
            p.BringToFront();
            _web.Visible = false;
            ResumeLayout();
            OneGetir();
            try { p.Baglan(); }
            catch
            {
                _oturum = null;
                Controls.Remove(p);
                _web.Visible = true;
                p.Dispose();
                BaslikCubugu(true);
                throw;
            }
        }

        /// <summary>
        /// Oturumda Windows başlık çubuğu gizlenir (Pusula şeridi onun yerini alır). Kenarlıksız pencere
        /// büyütülünce görev çubuğunu örtmesin diye büyütme sınırı çalışma alanı yapılır.
        /// </summary>
        private void BaslikCubugu(bool goster)
        {
            // Normal/büyük arası gidip gelmeden (pencere bir an küçülüp geri büyüyordu): stil değişir,
            // pencere büyükse yeni stile uygun büyük dikdörtgene doğrudan yerleştirilir.
            FormBorderStyle = goster ? FormBorderStyle.Sizable : FormBorderStyle.None;
            if (WindowState != FormWindowState.Maximized) return;
            var r = BuyukDikdortgen(goster);
            SetWindowPos(Handle, IntPtr.Zero, r.X, r.Y, r.Width, r.Height, 0x0004 | 0x0010 | 0x0020); // NOZORDER|NOACTIVATE|FRAMECHANGED
        }

        /// <summary>
        /// Büyütülmüş pencerenin ekrandaki yeri: kenarlıksızken tam çalışma alanı (görev çubuğu hariç),
        /// kenarlıklıyken Windows'un yaptığı gibi çerçeve kalınlığı kadar dışarı taşan alan.
        /// </summary>
        private Rectangle BuyukDikdortgen(bool kenarlikli)
        {
            var alan = Screen.FromHandle(Handle).WorkingArea;
            if (!kenarlikli) return alan;
            int k;
            try { var dpi = (uint)Ekran.Dpi(this); k = GetSystemMetricsForDpi(32, dpi) + GetSystemMetricsForDpi(92, dpi); } // SM_CXFRAME + SM_CXPADDEDBORDER
            catch { k = GetSystemMetrics(32) + GetSystemMetrics(92); }
            alan.Inflate(k, k);
            return alan;
        }

        [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr h, IntPtr sonra, int x, int y, int w, int hh, uint bayrak);
        [DllImport("user32.dll")] private static extern int GetSystemMetrics(int i);
        [DllImport("user32.dll")] private static extern int GetSystemMetricsForDpi(int i, uint dpi);

        [StructLayout(LayoutKind.Sequential)] private struct NOKTA { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] private struct MINMAXINFO { public NOKTA Ayrilmis, MaxBoyut, MaxKonum, MinIz, MaxIz; }

        protected override void WndProc(ref Message m)
        {
            base.WndProc(ref m);
            // Kenarlıksızken büyütme = çalışma alanı (yoksa görev çubuğunun da üstünü örter)
            if (m.Msg == 0x0024 && FormBorderStyle == FormBorderStyle.None) // WM_GETMINMAXINFO
            {
                var ekran = Screen.FromHandle(Handle);
                var mm = (MINMAXINFO)Marshal.PtrToStructure(m.LParam, typeof(MINMAXINFO));
                mm.MaxKonum = new NOKTA { X = ekran.WorkingArea.X - ekran.Bounds.X, Y = ekran.WorkingArea.Y - ekran.Bounds.Y };
                mm.MaxBoyut = new NOKTA { X = ekran.WorkingArea.Width, Y = ekran.WorkingArea.Height };
                Marshal.StructureToPtr(mm, m.LParam, false);
            }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                // Kenarlıksızken de görev çubuğundan küçültülüp geri getirilebilsin
                var cp = base.CreateParams;
                cp.Style |= 0x00020000; // WS_MINIMIZEBOX
                return cp;
            }
        }

        private bool _sayfaHazir;
        private volatile bool _soruldu;

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (_oturum != null && !SormadanKapat && e.CloseReason == CloseReason.UserClosing)
            {
                // Oturum açıkken arayüz gizli; onay Windows kutusuyla sorulur.
                var c = MessageBox.Show(this,
                    "Pusula oturumu açık. Bağlantı kesilip uygulama kapatılsın mı?\n\nAçık programlarınız sunucuda çalışmaya devam eder; yeniden bağlanınca kaldığınız yerden sürer.",
                    "Pusula Connect", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (c != DialogResult.Yes) { e.Cancel = true; return; }
                SormadanKapat = true;
                try { _oturum.Kes(); } catch { }
            }
            if (!SormadanKapat && e.CloseReason == CloseReason.UserClosing)
            {
                // Önce konsolun kendi onay penceresi; sayfa 1,5 sn içinde yanıtlamazsa
                // (yüklenmemiş/donmuş) Windows kutusuna düşülür — pencere kapatılamaz kalmasın.
                if (_sayfaHazir && _web.CoreWebView2 != null)
                {
                    e.Cancel = true;
                    _soruldu = false;
                    try { _web.CoreWebView2.PostWebMessageAsString("kapatmayi-sor"); } catch { }
                    var bekle = new Timer { Interval = 1500 };
                    bekle.Tick += (s, a) =>
                    {
                        bekle.Stop();
                        bekle.Dispose();
                        if (!_soruldu && !IsDisposed) WindowsKutusuylaSor();
                    };
                    bekle.Start();
                    return;
                }
                var c = MessageBox.Show(this,
                    "Uygulama kapatılsın mı?\n\nSüren iş duraklatılır; yeniden açınca kaldığı yerden devam eder.",
                    "Pusula Connect", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (c != DialogResult.Yes)
                {
                    e.Cancel = true;
                    return;
                }
            }
            base.OnFormClosing(e);
            if (!e.Cancel) _kapat();
        }

        private void WindowsKutusuylaSor()
        {
            var c = MessageBox.Show(this,
                "Uygulama kapatılsın mı?\n\nSüren iş duraklatılır; yeniden açınca kaldığı yerden devam eder.",
                "Pusula Connect", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (c != DialogResult.Yes) return;
            SormadanKapat = true;
            Close();
        }

        // ------------------------------------------------------------ gömülü yükleyici

        private static bool _hazir;

        /// <summary>WebView2Loader.dll'i (işlemci mimarisine göre) çıkarır ve yükler.</summary>
        private static void YukleyiciyiHazirla()
        {
            if (_hazir) return;
            var mimari = RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? "arm64"
                : Environment.Is64BitProcess ? "x64" : "x86";
            var surum = typeof(CoreWebView2Environment).Assembly.GetName().Version.ToString();
            var klasor = Path.Combine(VeriKlasoru, "webview2", surum, mimari);
            var dosya = Path.Combine(klasor, "WebView2Loader.dll");
            if (!File.Exists(dosya))
            {
                Directory.CreateDirectory(klasor);
                using (var kaynak = Assembly.GetExecutingAssembly().GetManifestResourceStream($"webview2/{mimari}/WebView2Loader.dll"))
                {
                    if (kaynak == null) throw new FileNotFoundException("Gömülü WebView2Loader.dll yok: " + mimari);
                    var gecici = dosya + "." + Guid.NewGuid().ToString("N");
                    using (var hedef = File.Create(gecici)) kaynak.CopyTo(hedef);
                    try { File.Move(gecici, dosya); } catch { File.Delete(gecici); } // eşzamanlı açılışta biri kazanır
                }
            }
            // Resmî yol: yükleyici bu klasörden alınır (başka WebView2 çağrısından ÖNCE).
            CoreWebView2Environment.SetLoaderDllFolderPath(klasor);
            _hazir = true;
        }
    }
}
