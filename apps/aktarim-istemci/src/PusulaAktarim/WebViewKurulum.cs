using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PusulaAktarim
{
    /// <summary>
    /// WebView2 çalışma zamanı yoksa (Windows Server, eski Windows 10 — Aktarım genelde SQL sunucusunda çalışır)
    /// Microsoft'un resmî "Evergreen bootstrapper"ı indirilip sessizce kurulur; arayüz tarayıcı yerine yine
    /// uygulamanın kendi penceresinde açılır. Yönetici ise tüm bilgisayara, değilse yalnız bu kullanıcıya kurulur
    /// (bootstrapper kendisi karar verir). Kurulamazsa çağıran tarayıcıya düşer.
    /// </summary>
    internal static class WebViewKurulum
    {
        /// <summary>Microsoft'un sabit indirme bağlantısı (Evergreen Bootstrapper, ~2 MB).</summary>
        private const string Adres = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

        /// <summary>Kurulum penceresini gösterir, bitince çalışma zamanı var mı döner.</summary>
        public static bool Kur(Func<bool> varMi)
        {
            var sonuc = false;
            using (var f = new Form
            {
                Text = "Pusula Aktarım",
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = FormStartPosition.CenterScreen,
                MaximizeBox = false,
                MinimizeBox = false,
                ControlBox = false,
                ClientSize = new Size(420, 120),
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application,
                TopMost = true,
            })
            {
                var etiket = new Label
                {
                    Text = "Uygulama penceresi hazırlanıyor…\nMicrosoft WebView2 bileşeni indirilip kuruluyor (bir kez yapılır).",
                    Dock = DockStyle.Top, Height = 60, Padding = new Padding(16, 16, 16, 0), Font = new Font("Segoe UI", 9.5f),
                };
                var cubuk = new ProgressBar { Style = ProgressBarStyle.Marquee, Dock = DockStyle.Bottom, Height = 18, MarqueeAnimationSpeed = 30 };
                var alt = new Panel { Dock = DockStyle.Bottom, Height = 34, Padding = new Padding(16, 0, 16, 16) };
                alt.Controls.Add(cubuk);
                f.Controls.Add(alt);
                f.Controls.Add(etiket);
                f.Shown += async (s, e) =>
                {
                    try { sonuc = await Task.Run(() => IndirKur(varMi)); }
                    catch { sonuc = false; }
                    f.Close();
                };
                f.ShowDialog();
            }
            return sonuc;
        }

        private static bool IndirKur(Func<bool> varMi)
        {
            var dosya = Path.Combine(Path.GetTempPath(), "PusulaAktarim-WebView2Setup-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
            try
            {
                ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
                using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
                using (var akis = http.GetStreamAsync(Adres).GetAwaiter().GetResult())
                using (var hedef = File.Create(dosya))
                    akis.CopyTo(hedef);

                // Yalnız Microsoft imzalı ve zinciri geçerli dosya çalıştırılır
                try
                {
                    var imza = new System.Security.Cryptography.X509Certificates.X509Certificate2(
                        System.Security.Cryptography.X509Certificates.X509Certificate.CreateFromSignedFile(dosya));
                    if (!imza.Subject.Contains("O=Microsoft Corporation") || !imza.Verify()) return varMi();
                }
                catch { return varMi(); }

                using (var p = Process.Start(new ProcessStartInfo(dosya, "/silent /install") { UseShellExecute = true }))
                {
                    if (p == null || !p.WaitForExit((int)TimeSpan.FromMinutes(10).TotalMilliseconds)) return varMi();
                }
                return varMi();
            }
            finally
            {
                try { File.Delete(dosya); } catch { }
            }
        }
    }
}
