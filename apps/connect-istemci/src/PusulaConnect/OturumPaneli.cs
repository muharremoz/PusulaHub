using System;
using System.ComponentModel;
using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using AxMSTSCLib;
using MSTSCLib;

namespace PusulaConnect
{
    /// <summary>Gömülü oturumun bağlantı bilgileri. Şifre yalnız bellekte, bağlanınca bileşene verilir.</summary>
    internal sealed class RdpAyar
    {
        public string Ad, Sunucu, Domain, Kullanici, Sifre;
        public int Port;
    }

    /// <summary>
    /// Uzak masaüstü Connect penceresinin içinde: Windows'un kendi RDP bileşeni (mstscax.dll —
    /// mstsc'nin de kullandığı ActiveX; ek kurulum yok). Üstte ince Pusula şeridi: logo, durum,
    /// gecikme, Tam ekran, Bağlantıyı kes. Şifre .rdp dosyasına/kimlik kasasına yazılmadan
    /// doğrudan bileşene verilir. Ayarlar Rdp.Baglan'daki .rdp ile aynı (sürücüler kapalı).
    /// Oturum bitince <see cref="Bitti"/> (mesaj null = kullanıcı kendi kesti/oturumu kapattı).
    /// </summary>
    internal sealed class OturumPaneli : UserControl
    {
        /// <summary>Mesaj: kullanıcıya gösterilecek hata (null = normal bitiş); şifreHatali: kayıtlı şifre yanlış.</summary>
        public event Action<string, bool> Bitti;

        private readonly RdpAyar _a;
        private readonly AxMsRdpClient9NotSafeForScripting _rdp;
        private readonly Panel _serit;
        private readonly DurumGostergesi _durum;
        private readonly Timer _olcum;
        private bool _olcuyor;
        private readonly Button _tamEkran;
        private readonly Timer _boyut;
        private bool _girisTamam, _kesiliyor, _bitti;

        private static readonly Color Cizgi = Color.FromArgb(229, 229, 229);
        private static readonly Color Soluk = Color.FromArgb(115, 115, 115);
        private static readonly Color Yesil = Color.FromArgb(5, 150, 105);
        private static readonly Color Amber = Color.FromArgb(217, 119, 6);

        public OturumPaneli(RdpAyar a)
        {
            _a = a;
            Dock = DockStyle.Fill;
            BackColor = Color.FromArgb(23, 23, 23);

            var olcek = DeviceDpi / 96f;
            int P(int v) => (int)Math.Round(v * olcek);

            _serit = new Panel { Dock = DockStyle.Top, Height = P(44), BackColor = Color.White, Padding = new Padding(P(14), 0, P(8), 0) };
            _serit.Paint += (s, e) => { using (var k = new Pen(Cizgi)) e.Graphics.DrawLine(k, 0, _serit.Height - 1, _serit.Width, _serit.Height - 1); };

            var logo = new PictureBox { Dock = DockStyle.Left, Width = P(104), SizeMode = PictureBoxSizeMode.Zoom, Image = Logo(), Margin = Padding.Empty };
            _durum = new DurumGostergesi(_a.Sunucu, _a.Kullanici) { Dock = DockStyle.Fill };
            var sag = new FlowLayoutPanel
            {
                Dock = DockStyle.Right, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight, Padding = new Padding(0, P(7), 0, 0),
            };
            _tamEkran = Dugme("Tam ekran", false, P);
            _tamEkran.Enabled = false;
            _tamEkran.Click += (s, e) => { try { _rdp.FullScreen = true; } catch { } };
            var kes = Dugme("Bağlantıyı kes", true, P);
            kes.Click += (s, e) => Kes();
            // Oturumda Windows başlık çubuğu gizli (ConnectPenceresi.OturumAc): küçültme şeritte
            var kucult = Dugme("Küçült", false, P);
            kucult.Click += (s, e) => { var f = FindForm(); if (f != null) f.WindowState = FormWindowState.Minimized; };
            sag.Controls.Add(kucult);
            sag.Controls.Add(_tamEkran);
            sag.Controls.Add(kes);

            _serit.Controls.Add(_durum);
            _serit.Controls.Add(sag);
            _serit.Controls.Add(logo);
            // Şerit başlık çubuğu gibi: sürükle = pencereyi taşı, çift tık = büyüt / eski boyut
            foreach (var c in new Control[] { _serit, _durum, logo })
            {
                c.MouseDown += (s, e) =>
                {
                    if (e.Button != MouseButtons.Left || e.Clicks > 1) return;
                    var f = FindForm();
                    if (f == null || f.WindowState == FormWindowState.Maximized) return;
                    ReleaseCapture();
                    SendMessage(f.Handle, 0xA1, (IntPtr)2, IntPtr.Zero); // WM_NCLBUTTONDOWN, HTCAPTION
                };
                c.DoubleClick += (s, e) =>
                {
                    var f = FindForm();
                    if (f != null) f.WindowState = f.WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                };
            }
            _durum.BringToFront(); // Fill en son yerleşsin

            _rdp = new AxMsRdpClient9NotSafeForScripting { Dock = DockStyle.Fill };
            ((ISupportInitialize)_rdp).BeginInit();
            Controls.Add(_rdp);
            Controls.Add(_serit);
            ((ISupportInitialize)_rdp).EndInit();
            _rdp.BringToFront();

            // Pencere boyutu değişince oturum çözünürlüğü de değişsin (bırakınca, yarım saniye sonra)
            _olcum = new Timer { Interval = 5000 };
            _olcum.Tick += (s, e) => Olc();
            _boyut = new Timer { Interval = 500 };
            _boyut.Tick += (s, e) => { _boyut.Stop(); CozunurlukGuncelle(); };
            _rdp.Resize += (s, e) => { if (_girisTamam) { _boyut.Stop(); _boyut.Start(); } };

            Durum("Bağlanıyor… " + _a.Sunucu, Soluk);
        }

        [DllImport("user32.dll")] private static extern bool ReleaseCapture();
        [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);

        /// <summary>Panel forma eklendikten (tutamaç oluştuktan) sonra çağrılır.</summary>
        public void Baglan()
        {
            _rdp.OnConnected += (s, e) => Durum("Oturum açılıyor…", Soluk);
            _rdp.OnLoginComplete += (s, e) =>
            {
                _girisTamam = true;
                _tamEkran.Enabled = true;
                BagliYaz();
                Olc();
                _olcum.Start();
                _rdp.Focus();
            };
            _rdp.OnAutoReconnecting2 += (s, e) => Durum("Bağlantı koptu, yeniden bağlanıyor…", Amber);
            _rdp.OnAutoReconnected += (s, e) => BagliYaz();
            _rdp.OnDisconnected += (s, e) => Kesildi(e.discReason);

            var w = Math.Max(800, _rdp.Width) & ~1;
            var h = Math.Max(600, _rdp.Height) & ~1;
            _rdp.Server = _a.Sunucu;
            _rdp.UserName = _a.Kullanici;
            if (!string.IsNullOrEmpty(_a.Domain)) _rdp.Domain = _a.Domain;
            _rdp.DesktopWidth = w;
            _rdp.DesktopHeight = h;
            _rdp.ColorDepth = 32;
            _rdp.FullScreenTitle = "Pusula — " + _a.Ad;
            _rdp.ConnectingText = "Bağlanıyor…";
            _rdp.DisconnectedText = "Bağlantı kesildi";

            var ay = _rdp.AdvancedSettings9;
            ay.RDPPort = _a.Port > 0 ? _a.Port : 3389;
            ay.ClearTextPassword = _a.Sifre;
            ay.EnableCredSspSupport = true;       // NLA
            // Sertifika uyarısı ("uzak bilgisayarın kimliği doğrulanamıyor") SORULMAZ: sunucular kendinden imzalı
            // sertifika kullanıyor, bağlantı zaten VPN tüneli içinde ve sunucu adı profilden geliyor.
            ay.AuthenticationLevel = 0;
            ay.NegotiateSecurityLayer = true;
            ay.RedirectPrinters = true;
            ay.RedirectClipboard = true;
            ay.RedirectSmartCards = true;
            ay.RedirectPorts = true;
            ay.RedirectDevices = true;
            ay.RedirectDrives = false;            // sürücüler BİLEREK kapalı (Rdp.Baglan ile aynı)
            ay.AudioRedirectionMode = 2;          // ses çalınmaz (audiomode:i:2)
            ay.EnableAutoReconnect = true;
            ay.MaxReconnectAttempts = 20;
            ay.BandwidthDetection = true;
            ay.NetworkConnectionType = 7;         // otomatik algıla
            ay.ContainerHandledFullScreen = 0;    // tam ekranı bileşen kendisi yönetir (bağlantı çubuğuyla)
            ay.DisplayConnectionBar = true;
            ay.SmartSizing = false;
            ay.GrabFocusOnConnect = true;
            try { _rdp.SecuredSettings3.KeyboardHookMode = 2; } catch { }   // Win tuşları yalnız tam ekranda uzağa

            // Ekran ölçeği (125/150 % dizüstüler): uzak masaüstü de aynı büyüklükte görünsün
            try
            {
                var ek = (IMsRdpExtendedSettings)_rdp.GetOcx();
                object olcek = Olcek();
                object cihaz = 100u;
                ek.set_Property("DesktopScaleFactor", ref olcek);
                ek.set_Property("DeviceScaleFactor", ref cihaz);
            }
            catch { }

            _a.Sifre = null;
            _rdp.Connect();
        }

        /// <summary>Kullanıcı "Bağlantıyı kes" dedi (veya pencere kapanıyor).</summary>
        public void Kes()
        {
            _kesiliyor = true;
            try
            {
                if (_rdp.Connected != 0) { _rdp.Disconnect(); return; }
            }
            catch { }
            Bitir(null, false);
        }

        public bool Acik => !_bitti;

        private void Kesildi(int neden)
        {
            string mesaj = null;
            var sifreHatali = false;
            // 1 = yerelden kesildi, 2 = uzakta kullanıcı kesti/oturumu kapattı, 3 = sunucu kesti
            if (!_kesiliyor && neden != 1 && neden != 2)
            {
                if (neden == 2055 || neden == 2567 || neden == 2823 || neden == 3335)
                {
                    // 0x807 oturum açılamadı, 0xA07 hesap kısıtlı, 0xB07 şifre süresi doldu, 0xD07 hesap kilitli
                    sifreHatali = neden == 2055;
                    mesaj = neden == 2055 ? "Kayıtlı şifre ile oturum açılamadı. Şifreyi yeniden girin."
                        : neden == 3335 ? "Hesap kilitlendi. Pusula ile iletişime geçin."
                        : neden == 2823 ? "Şifrenin süresi dolmuş. Pusula ile iletişime geçin."
                        : "Bu hesapla oturum açılamıyor. Pusula ile iletişime geçin.";
                }
                else if (neden == 3)
                    mesaj = "Sunucu oturumu sonlandırdı.";
                else
                {
                    try { mesaj = _rdp.GetErrorDescription((uint)neden, (uint)_rdp.ExtendedDisconnectReason); } catch { }
                    if (string.IsNullOrWhiteSpace(mesaj)) mesaj = "Bağlantı kesildi.";
                    mesaj = mesaj.Trim() + " (kod " + neden + ")";
                }
            }
            Gunluk.Yaz("RDP oturumu bitti: neden " + neden + (_kesiliyor ? " (kullanıcı kesti)" : ""));
            Bitir(mesaj, sifreHatali);
        }

        private void Bitir(string mesaj, bool sifreHatali)
        {
            if (_bitti) return;
            _bitti = true;
            _boyut.Stop();
            _olcum.Stop();
            BeginInvoke((Action)(() => Bitti?.Invoke(mesaj, sifreHatali)));
        }

        private void BagliYaz() => _durum.Bagli();

        private void Durum(string metin, Color renk) => _durum.Bekliyor(metin, renk);

        /// <summary>
        /// Bağlantı kalitesi: 5 sn'de bir sunucunun RDP kapısına TCP bağlantı süresi (bileşenin kendi rtt
        /// değeri gerçeği yansıtmıyor — LAN'da 6 ms'ye 400 ms gösterdi).
        /// </summary>
        private async void Olc()
        {
            if (_olcuyor || _bitti || !_girisTamam) return;
            _olcuyor = true;
            try
            {
                var t = await Rdp.Yokla(_a.Sunucu, _a.Port, 3000);
                if (!_bitti) _durum.Gecikme(t.erisim ? t.ms : -1);
            }
            catch { }
            finally { _olcuyor = false; }
        }

        private void CozunurlukGuncelle()
        {
            if (!_girisTamam || _bitti) return;
            try
            {
                if (_rdp.FullScreen) return;
                var w = (uint)(Math.Max(800, _rdp.Width) & ~1);
                var h = (uint)(Math.Max(600, _rdp.Height) & ~1);
                _rdp.UpdateSessionDisplaySettings(w, h, w, h, 0, Olcek(), 100);
            }
            catch { }
        }

        private uint Olcek()
        {
            var y = (int)Math.Round(DeviceDpi * 100 / 96.0);
            foreach (var d in new[] { 100, 125, 150, 175, 200, 250, 300 }) if (y <= d + 12) return (uint)d;
            return 300;
        }

        private static Button Dugme(string metin, bool vurgulu, Func<int, int> p)
        {
            var b = new Button
            {
                Text = metin, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 9f), Height = p(30), Padding = new Padding(p(8), 0, p(8), 0),
                Margin = new Padding(p(6), 0, 0, 0), Cursor = Cursors.Hand, UseVisualStyleBackColor = false,
                BackColor = vurgulu ? Color.FromArgb(23, 23, 23) : Color.White,
                ForeColor = vurgulu ? Color.White : Color.FromArgb(23, 23, 23),
            };
            b.FlatAppearance.BorderColor = vurgulu ? Color.FromArgb(23, 23, 23) : Cizgi;
            b.FlatAppearance.MouseOverBackColor = vurgulu ? Color.FromArgb(64, 64, 64) : Color.FromArgb(245, 245, 245);
            return b;
        }

        private static Image Logo()
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"))
                return s == null ? null : new Bitmap(Image.FromStream(s));
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _boyut.Dispose();
                _olcum.Dispose();
                try { if (_rdp.Connected != 0) _rdp.Disconnect(); } catch { }
            }
            base.Dispose(disposing);
        }
    }

    /// <summary>
    /// Şeritteki durum: renkli nokta + "Bağlı", sinyal çubukları + "Bağlantı mükemmel/iyi/orta/zayıf",
    /// kullanıcı adı. Ayrıntı (sunucu, ms) üzerine gelince ipucunda — kullanıcıya ms değil anlamı gösterilir.
    /// </summary>
    internal sealed class DurumGostergesi : Control
    {
        private static readonly Color Yesil = Color.FromArgb(5, 150, 105);
        private static readonly Color Amber = Color.FromArgb(217, 119, 6);
        private static readonly Color Kirmizi = Color.FromArgb(220, 38, 38);
        private static readonly Color Koyu = Color.FromArgb(23, 23, 23);
        private static readonly Color Soluk = Color.FromArgb(115, 115, 115);
        private static readonly Color Bos = Color.FromArgb(222, 222, 222);

        private readonly string _sunucu, _kullanici;
        private readonly ToolTip _ipucu = new ToolTip { InitialDelay = 300 };
        private bool _bagli;
        private string _metin;
        private Color _renk;
        private int _ms = -2; // -2 ölçülmedi, -1 ulaşılamadı

        public DurumGostergesi(string sunucu, string kullanici)
        {
            _sunucu = sunucu;
            _kullanici = kullanici;
            DoubleBuffered = true;
            BackColor = Color.White;
            Font = new Font("Segoe UI", 9.5f);
        }

        public void Bekliyor(string metin, Color renk) { _bagli = false; _metin = metin; _renk = renk; Yenile(); }
        public void Bagli() { _bagli = true; Yenile(); }
        public void Gecikme(int ms) { _ms = ms; Yenile(); }

        /// <summary>0 = ulaşılamıyor … 4 = mükemmel</summary>
        private int Seviye => _ms == -2 ? 4 : _ms < 0 ? 0 : _ms < 60 ? 4 : _ms < 120 ? 3 : _ms < 250 ? 2 : 1;

        private static string SeviyeAdi(int s) =>
            s == 4 ? "Bağlantı mükemmel" : s == 3 ? "Bağlantı iyi" : s == 2 ? "Bağlantı orta" : s == 1 ? "Bağlantı zayıf" : "Sunucuya ulaşılamıyor";

        private static Color SeviyeRengi(int s) => s >= 3 ? Yesil : s == 2 ? Amber : Kirmizi;

        private void Yenile()
        {
            if (_bagli)
                _ipucu.SetToolTip(this, "Sunucu: " + _sunucu + "\nKullanıcı: " + _kullanici +
                    (_ms >= 0 ? "\nGecikme: " + _ms + " ms" : _ms == -1 ? "\nSunucu yanıt vermiyor" : ""));
            else _ipucu.SetToolTip(this, null);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            var o = DeviceDpi / 96f;
            int P(float v) => (int)Math.Round(v * o);
            float x = P(14), orta = Height / 2f;
            var bayrak = TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.SingleLine;

            void Nokta(Color c)
            {
                using (var hale = new SolidBrush(Color.FromArgb(50, c))) g.FillEllipse(hale, x - P(3), orta - P(7), P(14), P(14));
                using (var b = new SolidBrush(c)) g.FillEllipse(b, x, orta - P(4), P(8), P(8));
                x += P(18);
            }
            void Yazi(string m, Font f, Color c)
            {
                var w = TextRenderer.MeasureText(g, m, f, Size.Empty, bayrak).Width;
                TextRenderer.DrawText(g, m, f, new Rectangle((int)x, 0, w + 2, Height), c, bayrak);
                x += w;
            }
            void Ayrac()
            {
                x += P(14);
                using (var k = new Pen(Bos)) g.DrawLine(k, x, orta - P(9), x, orta + P(9));
                x += P(14);
            }

            if (!_bagli)
            {
                Nokta(_renk);
                Yazi(_metin ?? "", Font, Koyu);
                return;
            }

            var seviye = Seviye;
            Nokta(seviye == 0 ? Kirmizi : Yesil);
            using (var kalin = new Font(Font, FontStyle.Bold)) Yazi("Bağlı", kalin, Koyu);
            Ayrac();

            // sinyal çubukları
            var renk = SeviyeRengi(seviye);
            for (var i = 0; i < 4; i++)
            {
                var h = P(5 + i * 3);
                using (var b = new SolidBrush(i < seviye ? renk : Bos))
                    g.FillRectangle(b, x + i * P(5), orta + P(7) - h, P(3), h);
            }
            x += P(4 * 5 + 6);
            Yazi(SeviyeAdi(seviye), Font, seviye >= 3 ? Koyu : renk);
            Ayrac();
            Yazi(_kullanici, Font, Soluk);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _ipucu.Dispose();
            base.Dispose(disposing);
        }
    }
}
