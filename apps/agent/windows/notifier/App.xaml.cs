using System;
using System.IO;
using System.Windows;
using System.Windows.Forms;
using System.Drawing;

namespace PusulaNotifier
{
    public partial class App : System.Windows.Application
    {
        private NotifyIcon _trayIcon = null!;
        private PollingService _poller = null!;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Tek instance kontrolü
            var mutex = new System.Threading.Mutex(true, "PusulaNotifier_SingleInstance", out bool created);
            if (!created)
            {
                Shutdown();
                return;
            }

            // Config yükle
            var config = NotifierConfig.Load();

            // Tray icon
            _trayIcon = BuildTrayIcon();

            // Polling servisi — mesaj gelince ShowNotification çağırır
            _poller = new PollingService(config, ShowNotification);
            _poller.Start();
        }

        private NotifyIcon BuildTrayIcon()
        {
            var icon = new NotifyIcon
            {
                Text    = "PusulaNotifier",
                Visible = true,
                Icon    = SystemIcons.Application,  // build'de gerçek icon.ico ile değiştirilir
            };

            var menu = new ContextMenuStrip();
            menu.Items.Add("PusulaNotifier v1.0", null, null).Enabled = false;
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Ayarlar",  null, (_, __) => ShowSettings());
            menu.Items.Add("Çıkış",    null, (_, __) => ExitApp());

            icon.ContextMenuStrip = menu;
            icon.DoubleClick += (_, __) => ShowSettings();
            return icon;
        }

        internal void ShowNotification(NotificationData data)
        {
            Dispatcher.Invoke(() =>
            {
                var win = new NotificationWindow(data);
                win.Show();
            });
        }

        /// <summary>
        /// "Daha Sonra Hatırlat" — belirtilen dakika sonra aynı mesajı tekrar göster.
        /// </summary>
        internal void SnoozeNotification(NotificationData data, int minutes = 10)
        {
            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromMinutes(minutes)
            };
            timer.Tick += (_, __) =>
            {
                timer.Stop();
                ShowNotification(data);
            };
            timer.Start();
        }

        private void ShowSettings()
        {
            var win = new SettingsWindow();
            win.ShowDialog();
            // Ayarlar değiştiyse poller'ı yeniden başlat
            _poller.Reload(NotifierConfig.Load());
        }

        private void ExitApp()
        {
            _poller.Stop();
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            Shutdown();
        }

        protected override void OnExit(ExitEventArgs e)
        {
            _trayIcon?.Dispose();
            base.OnExit(e);
        }
    }
}
