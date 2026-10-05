using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace PusulaConnect
{
    /// <summary>
    /// Gömülü oturum açılırken uzak masaüstü bileşeninin üstünü kaplayan bekleme ekranı (bileşenin kendi
    /// "Bağlanıyor…" ekranı düz siyahtı). Logo, dönen gösterge, üç adım (bağlantı → kimlik → oturum),
    /// sunucu/kullanıcı, uzun sürerse ipucu ve İptal. Bağlantı koparsa "yeniden bağlanıyor" kipine geçer.
    /// OturumPaneli olaylara göre Adim()/YenidenBaglaniyor() çağırır, oturum açılınca gizler.
    /// </summary>
    internal sealed class BaglanmaEkrani : Control
    {
        public event Action Iptal;

        private static readonly Color Zemin = Color.FromArgb(247, 247, 248);
        private static readonly Color Koyu = Color.FromArgb(23, 23, 23);
        private static readonly Color Soluk = Color.FromArgb(115, 115, 115);
        private static readonly Color Cizgi = Color.FromArgb(229, 229, 229);
        private static readonly Color Turuncu = Color.FromArgb(242, 106, 27);
        private static readonly Color Yesil = Color.FromArgb(5, 150, 105);
        private static readonly Color Amber = Color.FromArgb(217, 119, 6);

        private static readonly string[] Adimlar = { "Sunucuya bağlanılıyor", "Kimlik doğrulanıyor", "Oturum açılıyor" };

        private readonly Image _logo;
        private readonly string _sunucu, _kullanici;
        private readonly Timer _cark;
        private readonly Button _iptal;
        private float _aci;
        private int _adim;                 // 0..2 — şu an süren adım
        private bool _yeniden;             // bağlantı koptu, yeniden bağlanıyor
        private DateTime _baslangic = DateTime.Now;

        public BaglanmaEkrani(Image logo, string sunucu, string kullanici)
        {
            _logo = logo;
            _sunucu = sunucu;
            _kullanici = kullanici;
            DoubleBuffered = true;
            SetStyle(ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            BackColor = Zemin;
            Font = new Font("Segoe UI", 9.5f);

            _iptal = new Button
            {
                Text = "İptal", AutoSize = false, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9.5f),
                BackColor = Color.White, ForeColor = Koyu, Cursor = Cursors.Hand, UseVisualStyleBackColor = false,
            };
            _iptal.FlatAppearance.BorderColor = Cizgi;
            _iptal.FlatAppearance.MouseOverBackColor = Color.FromArgb(245, 245, 245);
            _iptal.Click += (s, e) => Iptal?.Invoke();
            Controls.Add(_iptal);

            _cark = new Timer { Interval = 33 };
            _cark.Tick += (s, e) => { _aci = (_aci + 9) % 360; Invalidate(); };
            _cark.Start();
        }

        /// <summary>0 = bağlantı, 1 = kimlik doğrulama, 2 = oturum açılıyor.</summary>
        public void Adim(int adim) { _adim = Math.Max(_adim, Math.Min(2, adim)); _yeniden = false; Invalidate(); }

        public void YenidenBaglaniyor()
        {
            _yeniden = true;
            _baslangic = DateTime.Now;
            Visible = true;
            BringToFront();
            Invalidate();
        }

        public void Gizle() { Visible = false; }

        protected override void OnVisibleChanged(EventArgs e)
        {
            base.OnVisibleChanged(e);
            if (_cark == null) return;
            if (Visible) _cark.Start(); else _cark.Stop();
        }

        private float O => Ekran.Carpan(this);
        private int P(float v) => (int)Math.Round(v * O);

        protected override void OnLayout(LayoutEventArgs e)
        {
            base.OnLayout(e);
            if (_iptal == null) return;   // yapıcıda Font/BackColor ataması yerleşimi düğme oluşmadan tetikler
            var w = P(120);
            _iptal.Size = new Size(w, P(34));
            _iptal.Location = new Point((Width - w) / 2, KartUst + KartYukseklik - P(24) - _iptal.Height);
        }

        private int KartGenislik => Math.Min(Width - P(32), P(420));
        private int KartYukseklik => P(356);
        private int KartUst => Math.Max(P(16), (Height - KartYukseklik) / 2);

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            g.Clear(Zemin);

            // Kart
            var kw = KartGenislik; var kx = (Width - kw) / 2; var ky = KartUst;
            var kart = new Rectangle(kx, ky, kw, KartYukseklik);
            using (var yol = Yuvarlak(kart, P(14)))
            {
                using (var golge = new SolidBrush(Color.FromArgb(10, 0, 0, 0)))
                using (var golgeYol = Yuvarlak(new Rectangle(kart.X, kart.Y + P(3), kart.Width, kart.Height), P(14)))
                    g.FillPath(golge, golgeYol);
                using (var b = new SolidBrush(Color.White)) g.FillPath(b, yol);
                using (var k = new Pen(Cizgi)) g.DrawPath(k, yol);
            }

            int y = ky + P(28);
            // Logo
            if (_logo != null)
            {
                var lh = P(30); var lw = (int)(_logo.Width * (lh / (float)_logo.Height));
                g.DrawImage(_logo, new Rectangle((Width - lw) / 2, y, lw, lh));
                y += lh + P(26);
            }

            // Dönen gösterge: soluk halka + turuncu (yeniden bağlanırken amber) yay
            var r = P(26);
            var halka = new Rectangle(Width / 2 - r, y, r * 2, r * 2);
            using (var k = new Pen(Color.FromArgb(238, 238, 238), P(4))) g.DrawEllipse(k, halka);
            using (var k = new Pen(_yeniden ? Amber : Turuncu, P(4)) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                g.DrawArc(k, halka, _aci, 100);
            y += r * 2 + P(18);

            // Başlık + alt satır
            var baslik = _yeniden ? "Bağlantı koptu, yeniden bağlanıyor…" : Adimlar[_adim] + "…";
            using (var f = new Font("Segoe UI Semibold", 12.5f))
                Ortala(g, baslik, f, Koyu, y, P(26));
            y += P(28);
            Ortala(g, _sunucu + "  ·  " + _kullanici, Font, Soluk, y, P(20));
            y += P(34);

            // Adımlar: ● Bağlantı ── ● Kimlik ── ● Oturum
            if (!_yeniden)
            {
                string[] kisa = { "Bağlantı", "Kimlik", "Oturum" };
                var aralik = Math.Min(P(110), (kw - P(48)) / 3);
                var bas = Width / 2 - aralik;
                for (var i = 0; i < 3; i++)
                {
                    var cx = bas + i * aralik;
                    if (i < 2)
                        using (var k = new Pen(i < _adim ? Yesil : Cizgi, P(2))) g.DrawLine(k, cx + P(10), y + P(8), cx + aralik - P(10), y + P(8));
                    var nokta = new Rectangle(cx - P(8), y, P(16), P(16));
                    if (i < _adim)
                    {
                        using (var b = new SolidBrush(Yesil)) g.FillEllipse(b, nokta);
                        using (var k = new Pen(Color.White, P(2)) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                            g.DrawLines(k, new[] { new Point(cx - P(4), y + P(8)), new Point(cx - P(1), y + P(11)), new Point(cx + P(4), y + P(5)) });
                    }
                    else if (i == _adim)
                    {
                        using (var b = new SolidBrush(Color.FromArgb(40, Turuncu))) g.FillEllipse(b, nokta);
                        using (var b = new SolidBrush(Turuncu)) g.FillEllipse(b, new Rectangle(cx - P(4), y + P(4), P(8), P(8)));
                    }
                    else
                        using (var k = new Pen(Cizgi, P(2))) g.DrawEllipse(k, nokta);
                    var renk = i <= _adim ? Koyu : Soluk;
                    var w = TextRenderer.MeasureText(kisa[i], Font).Width;
                    TextRenderer.DrawText(g, kisa[i], Font, new Point(cx - w / 2, y + P(22)), renk);
                }
            }
            y += P(50);

            // Uzun sürerse ipucu
            if ((DateTime.Now - _baslangic).TotalSeconds > 20)
                Ortala(g, _yeniden ? "İnternet ve VPN bağlantınızı kontrol edin." : "Uzun sürüyor — VPN bağlantınızı kontrol edin.", Font, Amber, y, P(20));
        }

        private void Ortala(Graphics g, string metin, Font f, Color c, int y, int h) =>
            TextRenderer.DrawText(g, metin, f, new Rectangle(0, y, Width, h), c,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);

        private static GraphicsPath Yuvarlak(Rectangle r, int yaricap)
        {
            var d = yaricap * 2;
            var p = new GraphicsPath();
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _cark.Dispose();
            base.Dispose(disposing);
        }
    }
}
