using System;
using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace PusulaNotifier
{
    public partial class NotificationWindow : Window
    {
        private readonly NotificationData _data;

        // ── tip → (headerBg, iconBg, badgeBg, badgeFg, glyph, label, okBg) ──
        private static (string hdr, string iconBg, string badgeBg, string badgeFg, string glyph, string label, string okBg)
            StyleFor(string? type) => type?.ToLower() switch
            {
                "warning" => ("#FFFBEB", "#FEF3C7", "#FDE68A", "#92400E", "⚡", "UYARI",  "#D97706"),
                "urgent"  => ("#FEF2F2", "#FEE2E2", "#FECACA", "#991B1B", "⚠",  "ACİL",   "#DC2626"),
                _         => ("#EFF6FF", "#DBEAFE", "#BFDBFE", "#1D4ED8", "ℹ",  "BİLGİ",  "#2563EB"),
            };

        public NotificationWindow(NotificationData data)
        {
            InitializeComponent();
            _data = data;

            // Pencerenin başlık çubuğu olmadığı için elle sürükle desteği
            MouseLeftButtonDown += (_, e) =>
            {
                if (e.ButtonState == MouseButtonState.Pressed)
                    DragMove();
            };

            Loaded += OnLoaded;
        }

        // ════════════════════════════════════════════════════════════════
        //  Yükleme — alanları doldur, renkleri uygula, animasyonu başlat
        // ════════════════════════════════════════════════════════════════
        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            // Başlık ve mesaj gövdesi
            TitleText.Text = _data.Title ?? "(Başlıksız)";
            BodyText.Text  = _data.Body  ?? string.Empty;

            // Alıcı — mevcut Windows oturum kullanıcısı
            var userName      = Environment.UserName;          // "ahmet.yilmaz" (domain olmadan)
            FromText.Text     = $"Sayın {userName}";
            AvatarLetter.Text = FirstLetter(userName);

            // Alıcının firması
            ToCompanyText.Text = string.IsNullOrWhiteSpace(_data.ToCompany)
                ? ""
                : _data.ToCompany;

            // Gönderim zamanı
            if (DateTime.TryParse(_data.SentAt, null, DateTimeStyles.RoundtripKind, out var dt))
                SentAtText.Text = dt.ToLocalTime().ToString("HH:mm");
            else
                SentAtText.Text = DateTime.Now.ToString("HH:mm");

            // Tip'e göre renk
            ApplyTypeStyle();

            // Giriş animasyonu
            ((Storyboard)Resources["FadeIn"]).Begin(this);
        }

        // ════════════════════════════════════════════════════════════════
        //  Tip'e göre renk uygula
        // ════════════════════════════════════════════════════════════════
        private void ApplyTypeStyle()
        {
            var s = StyleFor(_data.Type);

            HeaderBand.Background    = Brush(s.hdr);
            IconContainer.Background = Brush(s.iconBg);
            TypeBadge.Background     = Brush(s.badgeBg);
            TypeLabel.Foreground     = Brush(s.badgeFg);
            TypeLabel.Text           = s.label;
            IconGlyph.Text           = s.glyph;
            IconGlyph.Foreground     = Brush(s.badgeFg);

            // Okundu butonu rengi (BtnPrimary stil arka planını override et)
            OkBtn.Background = Brush(s.okBg);
        }

        // ════════════════════════════════════════════════════════════════
        //  Buton tıklama olayları
        // ════════════════════════════════════════════════════════════════

        /// "Okudum, Anladım" — pencereyi kapat
        private void OkBtn_Click(object sender, RoutedEventArgs e)
            => CloseWithFade();

        // ════════════════════════════════════════════════════════════════
        //  FadeOut → kapat
        // ════════════════════════════════════════════════════════════════
        private void CloseWithFade()
        {
            var sb = (Storyboard)Resources["FadeOut"];
            sb.Completed += (_, __) => Close();
            sb.Begin(this);
        }

        // ════════════════════════════════════════════════════════════════
        //  Yardımcılar
        // ════════════════════════════════════════════════════════════════
        private static SolidColorBrush Brush(string hex)
            => new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));

        private static string FirstLetter(string s)
            => string.IsNullOrWhiteSpace(s) ? "?" : s.Trim()[0].ToString().ToUpper();
    }
}
