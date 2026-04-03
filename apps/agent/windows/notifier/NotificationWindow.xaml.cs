using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace PusulaNotifier
{
    public partial class NotificationWindow : Window
    {
        private readonly NotificationData _data;
        private readonly DispatcherTimer _timer;
        private int _remaining;                 // saniye
        private const int AUTO_CLOSE_SECONDS = 30;
        private const int URGENT_CLOSE_SECONDS = 60;

        // Tüm açık bildirimleri alt alta yığmak için statik offset
        private static int _stackOffset = 0;
        private static readonly object _stackLock = new();

        public NotificationWindow(NotificationData data)
        {
            InitializeComponent();
            _data = data;
            _remaining = data.Type == "urgent" ? URGENT_CLOSE_SECONDS : AUTO_CLOSE_SECONDS;

            ApplyStyle();
            PositionWindow();

            // Otomatik kapanma zamanlayıcısı
            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _timer.Tick += OnTick;
        }

        private void ApplyStyle()
        {
            TitleText.Text = _data.Title;
            BodyText.Text  = _data.Body;
            FromText.Text  = $"Gönderen: {_data.From}";

            if (DateTime.TryParse(_data.SentAt, out var dt))
                SentAtText.Text = dt.ToLocalTime().ToString("HH:mm");

            // Tip bazlı stil
            var (accent, iconBg, iconFg, icon) = _data.Type switch
            {
                "urgent"  => ("#EF4444", "#FEF2F2", "#991B1B", "⚠"),
                "warning" => ("#F59E0B", "#FFFBEB", "#92400E", "⚡"),
                _         => ("#3B82F6", "#EFF6FF", "#1D4ED8", "ℹ"),
            };

            AccentBar.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accent));
            IconBg.Background    = new SolidColorBrush((Color)ColorConverter.ConvertFromString(iconBg));
            IconText.Text        = icon;
            IconText.Foreground  = new SolidColorBrush((Color)ColorConverter.ConvertFromString(iconFg));

            // Urgent'ta ertele gizle
            if (_data.Type == "urgent") SnoozeBtn.Visibility = Visibility.Collapsed;

            UpdateProgress();
        }

        private void PositionWindow()
        {
            var wa = SystemParameters.WorkArea;
            Left = wa.Right - Width - 16;

            lock (_stackLock)
            {
                Top = wa.Bottom - Height - 16 - _stackOffset;
                _stackOffset += (int)Height + 8;
            }
        }

        protected override void OnContentRendered(EventArgs e)
        {
            base.OnContentRendered(e);

            // Gerçek yüksekliği öğrenince konumu güncelle
            PositionWindow();

            // Slide-in animasyonu
            var sb = (Storyboard)Resources["SlideIn"];
            sb.Begin();

            _timer.Start();
        }

        private void OnTick(object? s, EventArgs e)
        {
            _remaining--;
            UpdateProgress();

            if (_remaining <= 0)
                AnimateClose();
        }

        private void UpdateProgress()
        {
            int total = _data.Type == "urgent" ? URGENT_CLOSE_SECONDS : AUTO_CLOSE_SECONDS;
            double pct = Math.Max(0, (double)_remaining / total);

            // Progress bar genişliği — parent track genişliğine göre
            var trackWidth = ((System.Windows.Controls.Grid)ProgressBar.Parent).ActualWidth;
            if (trackWidth > 0)
            {
                ProgressBar.Width = trackWidth * pct;
                var color = pct > 0.5 ? "#10B981" : pct > 0.2 ? "#F59E0B" : "#EF4444";
                ProgressBar.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
            }

            TimerText.Text = $"{_remaining}s";
        }

        private void AnimateClose()
        {
            _timer.Stop();
            var sb = (Storyboard)Resources["SlideOut"];
            sb.Completed += (_, __) =>
            {
                lock (_stackLock) { _stackOffset = Math.Max(0, _stackOffset - (int)ActualHeight - 8); }
                Close();
            };
            sb.Begin();
        }

        private void CloseBtn_Click(object sender, RoutedEventArgs e)  => AnimateClose();
        private void OkBtn_Click(object sender, RoutedEventArgs e)     => AnimateClose();

        private void SnoozeBtn_Click(object sender, RoutedEventArgs e)
        {
            // 10 dakika sonra tekrar göster
            _timer.Stop();
            _remaining = 600;  // 10 dk

            var snoozeTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(10) };
            snoozeTimer.Tick += (_, __) =>
            {
                snoozeTimer.Stop();
                var win = new NotificationWindow(_data);
                win.Show();
            };
            snoozeTimer.Start();

            AnimateClose();
        }
    }
}
