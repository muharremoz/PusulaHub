using System.Windows;

namespace PusulaNotifier
{
    public partial class SettingsWindow : Window
    {
        private readonly NotifierConfig _config;

        public SettingsWindow()
        {
            InitializeComponent();
            _config = NotifierConfig.Load();

            TxtHub.Text      = _config.HubUrl;
            TxtAgentId.Text  = _config.AgentId;
            TxtToken.Text    = _config.Token;
            TxtInterval.Text = _config.Interval.ToString();
        }

        private void SaveBtn_Click(object sender, RoutedEventArgs e)
        {
            _config.HubUrl  = TxtHub.Text.TrimEnd('/');
            if (int.TryParse(TxtInterval.Text, out int iv))
                _config.Interval = iv < 10 ? 10 : iv;
            _config.Save();
            DialogResult = true;
            Close();
        }

        private void CancelBtn_Click(object sender, RoutedEventArgs e) => Close();

        private void TestBtn_Click(object sender, RoutedEventArgs e)
        {
            var app = (App)Application.Current;
            app.ShowNotification(new NotificationData
            {
                Id    = "test",
                Title = "Test Bildirimi",
                Body  = "PusulaNotifier düzgün çalışıyor. Bu bir test mesajıdır.",
                Type  = "info",
                From  = "PusulaHub",
                SentAt = System.DateTime.UtcNow.ToString("o"),
            });
        }
    }
}
