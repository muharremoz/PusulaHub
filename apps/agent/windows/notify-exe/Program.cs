using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace PusulaNotify
{
    /// <summary>
    /// Agent'ın verdiği mesaj (eski PusulaNotify.cs ile aynı alanlar). agentPort agent'ın eklediği sayı.
    /// </summary>
    internal sealed class Mesaj
    {
        public string MsgId, Title, Body, Type, From, SentAt;
        public int AgentPort = 8585;
        /// <summary>Anketse sorular (Hub'dan olduğu gibi gelir, sayfaya olduğu gibi gider).</summary>
        public object Survey;
    }

    internal static class Program
    {
        internal static readonly string VeriKlasoru =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PusulaNotify");

        [STAThread]
        private static void Main(string[] args)
        {
            Mesaj m;
            try { m = args.Length > 0 && args[0] == "--deneme" ? DenemeMesaji(args.Length > 1 ? args[1] : "warning") : Coz(args); }
            catch (Exception e) { Gunluk("Argüman çözülemedi: " + e.Message); return; }
            if (m == null) return;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new BildirimFormu(m, deneme: args.Length > 0 && args[0] == "--deneme"));
        }

        /// <summary>PusulaNotify.exe &lt;base64(UTF-8 JSON)&gt; — agent'ın HandleNotify'ı böyle çağırır.</summary>
        private static Mesaj Coz(string[] args)
        {
            if (args.Length < 1) return null;
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(args[0]));
            var d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            string S(string k, string vars) => d.TryGetValue(k, out var v) && v != null && v.ToString() != "" ? v.ToString() : vars;
            var m = new Mesaj
            {
                MsgId = S("msgId", ""), Title = S("title", "(Başlıksız)"), Body = S("body", ""),
                Type = S("type", "info"), From = S("from", "Pusula Yazılım"), SentAt = S("sentAt", ""),
            };
            if (int.TryParse(S("agentPort", "8585"), out var port)) m.AgentPort = port;
            if (d.TryGetValue("survey", out var anket)) m.Survey = anket;
            return m;
        }

        /// <summary>Yerel deneme: PusulaNotify.exe --deneme [info|warning|urgent] (ACK gönderilmez).</summary>
        private static Mesaj DenemeMesaji(string tur) => tur == "anket" ? DenemeAnketi() : new Mesaj
        {
            MsgId = "", Type = tur, From = "Pusula Yazılım", SentAt = DateTime.UtcNow.ToString("o"),
            Title = tur == "urgent" ? "Sunucu 5 dakika içinde yeniden başlatılacak" : "Planlı Bakım Çalışması",
            Body = tur == "urgent"
                ? "Lütfen açık kayıtlarınızı hemen kaydedip programdan çıkınız."
                : "Değerli Müşterimiz,\n\nBu gece 23:00 – 01:00 arasında sunucularımızda planlı bakım çalışması yapılacaktır. Bu süre boyunca sunuculara bağlantı sağlanamayacaktır.\n\nLütfen 23:00'ten önce açık kayıtlarınızı kaydedip oturumunuzu kapatınız.\n\nSaygılarımızla,\nPusula Yazılım",
        };

        private static Mesaj DenemeAnketi() => new Mesaj
        {
            MsgId = "", Type = "info", From = "Pusula Yazılım", SentAt = DateTime.UtcNow.ToString("o"),
            Title = "Memnuniyet anketi",
            Body = "Hizmetimizi geliştirebilmek için birkaç sorumuzu yanıtlar mısınız?",
            Survey = new JavaScriptSerializer().DeserializeObject(
                "{\"sorular\":[{\"id\":\"s1\",\"tip\":\"puan\",\"soru\":\"Hizmetimizi nasıl puanlarsınız?\",\"zorunlu\":true}," +
                "{\"id\":\"s2\",\"tip\":\"tek\",\"soru\":\"Bağlantı hızından memnun musunuz?\",\"secenekler\":[\"Memnunum\",\"Kararsızım\",\"Memnun değilim\"],\"zorunlu\":true}," +
                "{\"id\":\"s3\",\"tip\":\"metin\",\"soru\":\"Eklemek istedikleriniz\",\"zorunlu\":false}]}"),
        };

        internal static void Gunluk(string metin)
        {
            try
            {
                Directory.CreateDirectory(VeriKlasoru);
                File.AppendAllText(Path.Combine(VeriKlasoru, "gunluk.txt"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + metin + Environment.NewLine);
            }
            catch { }
        }
    }

    internal sealed class BildirimFormu : Form
    {
        private const string Kok = "https://notify.pusula/";
        private readonly Mesaj _m;
        private readonly bool _deneme;
        private readonly bool _acil;
        private readonly bool _koyu;
        private readonly WebView2 _web = new WebView2();
        private readonly Timer _erteleme = new Timer();
        private bool _hatirlatma;
        private bool _bitti;

        /*  Pencere şeffaflığı: WinForms tek renk anahtarıyla (TransparencyKey) şeffaf yapılır,
         *  WebView2 arka planı saydam → sayfanın boş kalan yeri bu renge düşer ve görünmez.
         *  Renk kartın kenar rengine yakın seçildi: yuvarlak köşedeki yumuşatma pikselleri
         *  kart ile bu rengin karışımı olur, kenarla aynı tonda kaldığı için hale gibi görünmez.  */
        private static readonly Color AnahtarAcik = Color.FromArgb(229, 229, 230);
        private static readonly Color AnahtarKoyu = Color.FromArgb(46, 46, 47);

        public BildirimFormu(Mesaj m, bool deneme)
        {
            _m = m;
            _deneme = deneme;
            _acil = m.Type == "urgent";
            _koyu = KoyuTema();

            Text = "Pusula Bildirim";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = true;
            BackColor = _koyu ? AnahtarKoyu : AnahtarAcik;
            TransparencyKey = BackColor;
            // Sayfa boyunu bildirene kadar ekran dışında ve görünmez bekler
            Opacity = 0;
            Bounds = new Rectangle(-32000, -32000, 420, 300);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

            _web.Dock = DockStyle.Fill;
            _web.DefaultBackgroundColor = Color.Transparent;
            Controls.Add(_web);

            _erteleme.Tick += (s, e) => { _erteleme.Stop(); _hatirlatma = true; MesajiGonder(); };
            Load += async (s, e) => await BaslatAsync();
        }

        /// <summary>Bilgi/uyarı odak çalmasın (kullanıcı yazarken klavye popup'a gitmesin); acil öne gelir.</summary>
        protected override bool ShowWithoutActivation => !_acil;

        private static bool KoyuTema()
        {
            try
            {
                using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
                    return k?.GetValue("AppsUseLightTheme") is int v && v == 0;
            }
            catch { return false; }
        }

        private async Task BaslatAsync()
        {
            try
            {
                YukleyiciyiHazirla();
                /*  Bellek: popup her oturumda ayrı süreç ağacı açar, terminalde aynı anda onlarca olabilir.
                 *  GPU kapalı (kart için gereksiz, VM'de zaten yazılımsal) + kullanılmayan özellikler kapalı:
                 *  2026-10-06 yerel ölçüm popup başına ~199 MB → ~133 MB (özel bellek).                    */
                var argumanlar = "--disable-background-networking --disable-component-update --disable-gpu --disable-gpu-compositing"
                    + " --disable-extensions --disable-sync --renderer-process-limit=1 --disable-site-isolation-trials --js-flags=--max-old-space-size=32"
                    + " --disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication,msSmartScreenProtection,CalculateNativeWinOcclusion";
                // Bellek denemesi için: deneme modunda ortam değişkeniyle değiştirilebilir
                if (_deneme && Environment.GetEnvironmentVariable("PUSULA_NOTIFY_ARGS") is string ek) argumanlar = ek;
                var secenek = new CoreWebView2EnvironmentOptions(argumanlar);
                var ortam = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.VeriKlasoru, "WebView2"), secenek);
                await _web.EnsureCoreWebView2Async(ortam);
                var c = _web.CoreWebView2;
                c.Settings.AreDevToolsEnabled = _deneme;
                c.Settings.AreDefaultContextMenusEnabled = false;
                c.Settings.IsZoomControlEnabled = false;
                c.Settings.IsStatusBarEnabled = false;
                c.Settings.AreBrowserAcceleratorKeysEnabled = false;
                c.AddWebResourceRequestedFilter(Kok + "*", CoreWebView2WebResourceContext.All);
                c.WebResourceRequested += GomuluDosya;
                c.WebMessageReceived += SayfadanMesaj;
                c.NavigationCompleted += (s2, e2) =>
                {
                    if (!e2.IsSuccess) Program.Gunluk("Sayfa yüklenemedi: " + e2.WebErrorStatus + " (HTTP " + e2.HttpStatusCode + ")");
                    else if (_deneme) Program.Gunluk("Sayfa yüklendi");
                };
                c.ProcessFailed += (s2, e2) => Program.Gunluk("WebView2 süreci çöktü: " + e2.ProcessFailedKind + " " + e2.Reason);
                c.Navigate(Kok + "index.html");
            }
            catch (Exception e)
            {
                // WebView2 yoksa/açılamazsa mesaj yine de görünsün: düz Windows kutusu
                Program.Gunluk("WebView2 açılamadı, düz kutuya düşüldü: " + e.Message);
                Opacity = 0;
                var sonuc = MessageBox.Show(_m.Body, _m.Title, MessageBoxButtons.OK,
                    _acil ? MessageBoxIcon.Error : _m.Type == "warning" ? MessageBoxIcon.Warning : MessageBoxIcon.Information,
                    MessageBoxDefaultButton.Button1, MessageBoxOptions.DefaultDesktopOnly);
                if (sonuc == DialogResult.OK) await OkuduAsync();
                Close();
            }
        }

        // ------------------------------------------------------------ sayfa ↔ exe (notify-web/src/kopru.ts)

        private void SayfadanMesaj(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            Dictionary<string, object> d;
            try { d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(e.WebMessageAsJson); }
            catch { return; }
            var tur = d.TryGetValue("tur", out var t) ? t as string : null;
            if (_deneme) Program.Gunluk("sayfa → exe: " + e.WebMessageAsJson);
            switch (tur)
            {
                case "hazir": MesajiGonder(); break;
                case "boyut": BoyutVeKonum(Sayi(d, "genislik"), Sayi(d, "yukseklik")); break;
                case "okudum": _ = BitirAsync(okudu: true, cevaplar: d.TryGetValue("cevaplar", out var c) ? c : null); break;
                case "kapat": _ = BitirAsync(okudu: false); break;
                case "ertele":
                    Opacity = 0;
                    Hide();
                    _erteleme.Interval = Math.Max(1, Sayi(d, "dakika")) * 60_000;
                    _erteleme.Start();
                    break;
            }
        }

        private static int Sayi(Dictionary<string, object> d, string k) =>
            d.TryGetValue(k, out var v) && v != null && int.TryParse(Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture).Split('.')[0], out var n) ? n : 0;

        private void MesajiGonder()
        {
            var veri = new Dictionary<string, object>
            {
                ["tur"] = "mesaj",
                ["kullanici"] = Environment.UserName,
                ["koyu"] = _koyu,
                ["hatirlatma"] = _hatirlatma,
                ["mesaj"] = new Dictionary<string, object>
                {
                    ["msgId"] = _m.MsgId, ["title"] = _m.Title, ["body"] = _m.Body,
                    ["type"] = _m.Type, ["from"] = _m.From, ["sentAt"] = _m.SentAt,
                    ["survey"] = _m.Survey,
                },
            };
            _web.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(veri));
        }

        /// <summary>Sayfa CSS pikseli bildirir; pencere ekran ölçeğine göre büyütülür ve yerleştirilir.</summary>
        private void BoyutVeKonum(int cssGenislik, int cssYukseklik)
        {
            if (cssGenislik <= 0 || cssYukseklik <= 0 || _bitti) return;
            var olcek = DeviceDpi / 96.0;
            var boyut = new Size((int)Math.Ceiling(cssGenislik * olcek), (int)Math.Ceiling(cssYukseklik * olcek));
            var alan = Screen.PrimaryScreen.WorkingArea; // eski popup gibi ana ekran (RDP oturumunda zaten tek ekran)
            var bosluk = (int)(12 * olcek);
            var konum = _acil
                ? new Point(alan.Left + (alan.Width - boyut.Width) / 2, alan.Top + (alan.Height - boyut.Height) / 2)
                : new Point(alan.Right - boyut.Width - bosluk, alan.Bottom - boyut.Height - bosluk);
            Bounds = new Rectangle(konum, boyut);
            if (Opacity < 1)
            {
                Opacity = 1;
                if (!Visible) Show();
                if (_acil) Activate();
            }
        }

        private async Task BitirAsync(bool okudu, object cevaplar = null)
        {
            if (_bitti) return;
            _bitti = true;
            Hide();
            if (okudu) await OkuduAsync(cevaplar);
            Close();
        }

        /// <summary>Eski PusulaNotify ile aynı: localhost'taki agent'a ACK (GPO dışarı çıkışı engellese de çalışır).</summary>
        private async Task OkuduAsync(object cevaplar = null)
        {
            /*  Anket cevabı: agent ACK'ta yalnız msgId + username taşır → cevap msgId'ye eklenir:
             *  "<msgId>~a~<base64url(JSON)>". Hub poller ayırır (apps/web/src/lib/anket.ts cevapAyir).  */
            var ackId = _m.MsgId;
            if (cevaplar != null)
            {
                var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(cevaplar)))
                    .TrimEnd('=').Replace('+', '-').Replace('/', '_');
                ackId += "~a~" + b64;
            }
            if (_deneme) { if (cevaplar != null) Program.Gunluk("deneme ACK (gönderilmedi): " + ackId); return; }
            if (string.IsNullOrEmpty(_m.MsgId)) return;
            try
            {
                var js = new JavaScriptSerializer().Serialize(new Dictionary<string, string> { ["msgId"] = ackId, ["username"] = Environment.UserName });
                using (var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) })
                using (var r = await http.PostAsync("http://127.0.0.1:" + _m.AgentPort + "/api/ack", new StringContent(js, Encoding.UTF8, "application/json")))
                    if (!r.IsSuccessStatusCode) Program.Gunluk("ACK HTTP " + (int)r.StatusCode);
            }
            catch (Exception e) { Program.Gunluk("ACK gönderilemedi: " + e.Message); }
        }

        // ------------------------------------------------------------ gömülü arayüz

        private static readonly Dictionary<string, string> Turler = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".html"] = "text/html; charset=utf-8", [".js"] = "text/javascript; charset=utf-8", [".css"] = "text/css; charset=utf-8",
            [".woff2"] = "font/woff2", [".woff"] = "font/woff", [".svg"] = "image/svg+xml", [".png"] = "image/png", [".json"] = "application/json",
        };

        private void GomuluDosya(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            var yol = new Uri(e.Request.Uri).AbsolutePath.TrimStart('/');
            if (yol == "") yol = "index.html";
            // MSBuild %(RecursiveDir) ters bölü verir: kaynak adı "web/assets\x.js" biçiminde olabilir
            var asm = Assembly.GetExecutingAssembly();
            var akis = asm.GetManifestResourceStream("web/" + yol) ?? asm.GetManifestResourceStream("web/" + yol.Replace('/', '\\'));
            var env = _web.CoreWebView2.Environment;
            if (_deneme) Program.Gunluk("istek: " + yol + (akis == null ? " (YOK)" : ""));
            if (akis == null) { e.Response = env.CreateWebResourceResponse(null, 404, "Not Found", ""); return; }
            Turler.TryGetValue(Path.GetExtension(yol), out var tur);
            e.Response = env.CreateWebResourceResponse(akis, 200, "OK", "Content-Type: " + (tur ?? "application/octet-stream"));
        }

        /// <summary>WebView2Loader.dll'i (mimariye göre) çıkarır — tek dosya exe (Connect'teki düzen).</summary>
        private static void YukleyiciyiHazirla()
        {
            var mimari = Environment.Is64BitProcess ? "x64" : "x86";
            var surum = typeof(CoreWebView2Environment).Assembly.GetName().Version.ToString();
            var klasor = Path.Combine(Program.VeriKlasoru, "webview2", surum, mimari);
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
            CoreWebView2Environment.SetLoaderDllFolderPath(klasor);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { _erteleme.Dispose(); _web.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
