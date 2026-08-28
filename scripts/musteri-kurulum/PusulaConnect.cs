/*  Pusula Connect  —  VPN + uzak masaüstü bağlantı kurucu (WPF)
 *  -------------------------------------------------------------
 *  Ad bilerek "Kurulum" degil: program Pusula uygulamasini KURMUYOR,
 *  musterinin baglantisini kuruyor. Kardes projelerle de ayni kalipta
 *  (PusulaHub, PusulaFix, PusulaCRM).
 *  Musteriye giden tek dosya. Sihirbaz akisi:
 *
 *      1. Karsilama      — ne yapilacagi ozetlenir
 *      2. Kurulum        — MSI indirilir, sessiz kurulur, VPN profili +
 *                          masaustu kisayolu olusturulur
 *      3. Kimlik         — kullanici adi/sifre alinir
 *      4. Bitti          — ne yapilacagi anlatilir
 *
 *  TASARIM — token kopyalanmiyor, PAYLASILIYOR:
 *  PusulaFix'in Themes/LightTheme.xaml dosyasi derleme aninda exe'ye
 *  kaynak olarak gomuluyor (derle.bat, /resource:) ve calisma aninda
 *  XamlReader ile yukleniyor. Renk/stil orada degisince burada da
 *  degisir; iki uygulamanin gorsel dili ayrisamaz. WinForms yerine WPF
 *  olmasinin sebebi bu: stiller (PrimaryButton, ModernTextBox ...)
 *  dogrudan kullanilabiliyor, kose/golge/kenarlik elle cizilmiyor.
 *
 *  MUSTERIYE TEK DOSYA GIDER. Ayarlar (firma, kullanici, sunucular)
 *  exe'ye gomuluyor; her musteri kendi ini'siyle derleniyor:
 *      derle.bat 2311.ini  ->  PusulaConnect-2311.exe
 *  Exe'nin yanina ayarlar.ini konursa gomuluyu ezer — sahada bir deger
 *  degistirmek gerekince yeniden derleyip dosya gondermeye gerek kalmaz.
 *
 *  MSI GOMULU DEGIL, indiriliyor: 131 MB'lik dosyayi her musteriye
 *  gondermek yerine kendi sunucumuzdan cekiyoruz. Adres ini'de.
 *
 *  SIFRE HAKKINDA — iki taraf farkli davraniyor, sebebi teknik:
 *    · RDP  : sifre Windows kimlik kasasina yazilabiliyor (CredWrite),
 *             kullanici bir daha sormaz.
 *    · VPN  : FortiClient'in kimlik bilgisi alan bir komut satiri ya da
 *             API'si YOK; DATA1 alani da makineye bagli sifreli oldugu
 *             icin disaridan yazilamiyor.
 *
 *  VPN tarafinda sahada olculen gercek akis (2026-08-27) — musteriye
 *  onceden soylenmezse destek cagrisina donuyor, son sayfada bire bir
 *  anlatiliyor:
 *    1. Kayit defterine promptusername=0 yazmak "Save login" secmeye
 *       YETMIYOR. FortiClient radyo dugmesini DATA1'de kayitli kullanici
 *       adi var mi diye belirliyor; olmayinca "Prompt on login"de kaliyor.
 *       Kullanici Edit'ten kendisi secip kullanici adini yaziyor.
 *    2. Sifre kaydetme secenegi ILK baglantida hic cikmiyor; ancak
 *       ikinci baglantida beliriyor.
 */

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using System.Reflection;

/*  Surum numarasi gunluge yaziliyor: musteri "kurulum calismadi" dediginde
 *  ilk soru hangi yapiyi calistirdigi oluyor. Ozellikle bir duzeltmeden
 *  sonra eski exe elden ele dolasabiliyor.
 *  Degistirmeyi unutma: davranis degisen her yayinda artir.            */
[assembly: AssemblyVersion("1.5.0.0")]
[assembly: AssemblyFileVersion("1.5.0.0")]
[assembly: AssemblyTitle("Pusula Connect")]
[assembly: AssemblyProduct("Pusula Connect")]
[assembly: AssemblyCompany("Pusula")]

namespace PusulaConnect
{
    // ═══════════════════════════════════════════════════════════════
    //  Tema — PusulaFix'in sozlugu
    // ═══════════════════════════════════════════════════════════════
    static class Tema
    {
        static ResourceDictionary sozluk;

        public static void Yukle()
        {
            Stream akis = Assembly.GetExecutingAssembly()
                                  .GetManifestResourceStream("Tema.xaml");
            if (akis == null)
                throw new Exception("Tema kaynağı exe içinde bulunamadı.");
            using (akis)
                sozluk = (ResourceDictionary)XamlReader.Load(akis);

            Application.Current.Resources.MergedDictionaries.Add(sozluk);
        }

        public static Brush F(string anahtar) { return (Brush)sozluk[anahtar]; }
        public static Style S(string anahtar) { return (Style)sozluk[anahtar]; }
        public static Color R(string anahtar) { return ((SolidColorBrush)sozluk[anahtar]).Color; }

        public static FontFamily Yazi { get { return (FontFamily)sozluk["PrimaryFont"]; } }

        /*  Tema "Cascadia Code" diyor; her musteri makinesinde kurulu
         *  degil. WPF'in kendi yedegine birakmak yerine acikca Consolas
         *  ekleniyor — aksi halde degisken genislikli bir yazi tipine
         *  dusuyor ve hizalama bozuluyor.                              */
        public static FontFamily Mono
        {
            get
            {
                FontFamily m = (FontFamily)sozluk["MonoFont"];
                return new FontFamily(m.Source + ", Consolas, Courier New");
            }
        }

        /// Iki rengi oranla karistirir. Koyu yesil panelin uzerindeki
        /// metin tonlari bununla turetiliyor ki temadan kopmasinlar.
        public static Brush Karisim(Color a, Color b, double oran)
        {
            Color c = Color.FromRgb(
                (byte)(a.R + (b.R - a.R) * oran),
                (byte)(a.G + (b.G - a.G) * oran),
                (byte)(a.B + (b.B - a.B) * oran));
            SolidColorBrush f = new SolidColorBrush(c);
            f.Freeze();
            return f;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Gunluk (log)
    // ═══════════════════════════════════════════════════════════════
    /*  NEDEN VAR: sahada iki olay yasandi ve ikisinde de elimizde hicbir
     *  iz yoktu — birinde indirme bozuktu ama ekran basarili gosterdi,
     *  digerinde indirme tamamdi kurulum olmadi. Musteriden "ne oldu"
     *  diye bilgi almak mumkun olmadigi icin program kendi kaydini
     *  tutuyor.
     *
     *  Yer: %ProgramData%\PusulaConnect\kurulum.log — kullanicidan
     *  bagimsiz, yonetici haklariyla yazilabilir ve makinede kalici.
     *  Dosya eklemeli (append): musteri programi birkac kez calistirsa
     *  da onceki denemenin izi kaybolmasin, asil teshis orada oluyor.  */
    static class Gunluk
    {
        static string yol;
        static readonly object kilit = new object();

        public static string Yol { get { return yol; } }

        public static void Baslat()
        {
            try
            {
                string klasor = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "PusulaConnect");
                Directory.CreateDirectory(klasor);
                yol = Path.Combine(klasor, "kurulum.log");

                // Dosya sonsuza kadar buyumesin; 1 MB'i asinca bastan basla.
                try
                {
                    FileInfo fi = new FileInfo(yol);
                    if (fi.Exists && fi.Length > 1024 * 1024) fi.Delete();
                }
                catch { }

                Yaz("");
                Yaz("========================================================");
                Yaz("PusulaConnect calisti");
                Yaz("  surum   : " + Assembly.GetExecutingAssembly().GetName().Version);
                Yaz("  makine  : " + Environment.MachineName);
                Yaz("  kullanici: " + Environment.UserName);
                Yaz("  isletim : " + Environment.OSVersion.VersionString
                                   + (Environment.Is64BitOperatingSystem ? " (64 bit)" : " (32 bit)"));
                Yaz("  yonetici: " + YoneticiMi());
                Yaz("========================================================");
            }
            catch { yol = null; }   // gunluk yazilamiyorsa program yine de calissin
        }

        static string YoneticiMi()
        {
            try
            {
                System.Security.Principal.WindowsPrincipal p =
                    new System.Security.Principal.WindowsPrincipal(
                        System.Security.Principal.WindowsIdentity.GetCurrent());
                return p.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator)
                     ? "evet" : "HAYIR";
            }
            catch { return "bilinmiyor"; }
        }

        public static void Yaz(string satir)
        {
            if (yol == null) return;
            try
            {
                lock (kilit)
                    File.AppendAllText(yol,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + satir + Environment.NewLine,
                        Encoding.UTF8);
            }
            catch { }
        }

        public static void Hata(string nerede, Exception ex)
        {
            Yaz("HATA [" + nerede + "] " + ex.GetType().Name + ": " + ex.Message);
            if (ex.InnerException != null)
                Yaz("     ic hata: " + ex.InnerException.Message);
        }

        /// Gunlugu masaustune kopyalar — musterinin bize gonderebilmesi icin.
        public static string MasaustuneKopyala()
        {
            if (yol == null || !File.Exists(yol)) return null;
            string hedef = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                "PusulaConnect-kayit.txt");
            File.Copy(yol, hedef, true);
            return hedef;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Ince ilerleme cubugu
    // ═══════════════════════════════════════════════════════════════
    class Ilerleme : Border
    {
        readonly Border dolu = new Border();
        double deger;

        public Ilerleme()
        {
            Height = 6;
            CornerRadius = new CornerRadius(3);
            Background = Tema.F("BorderLightBrush");

            dolu.CornerRadius = new CornerRadius(3);
            dolu.Background = Tema.F("BrandPrimaryBrush");
            dolu.HorizontalAlignment = HorizontalAlignment.Left;
            Child = dolu;

            SizeChanged += delegate { Guncelle(); };
        }

        public double Deger
        {
            get { return deger; }
            set { deger = Math.Max(0, Math.Min(100, value)); Guncelle(); }
        }

        void Guncelle() { dolu.Width = ActualWidth * (deger / 100.0); }
    }

    // ═══════════════════════════════════════════════════════════════
    public class AnaPencere : Window
    {
        // ── Ayarlar ──
        string ayFirma = "", ayKullanici = "", ayVpn = "vpn.pusulanet.net:17443";
        string ayRdp = "10.15.2.5", ayTunel = "Pusula", ayDomain = "PUSULADC";
        string ayMsiUrl = "";
        /*  ARM makineler icin AYRI kurulum dosyasi. Fortinet ARM'i ayri
         *  bir paketle dagitiyor; x64 paketi ARM'de kurulamiyor.       */
        string ayMsiUrlArm = "";

        // ── Arayuz ──
        TextBlock[] adimNokta  = new TextBlock[4];
        TextBlock[] adimEtiket = new TextBlock[4];
        int aktifAdim = 0;

        TextBlock   bBaslik, bAlt, durumMetni;
        StackPanel  govde;
        Button      dugmeIleri, dugmeGeri;
        Ilerleme    cubuk;

        Brush panelMetin, panelSolgun, panelTamam;

        // ── Kurulum durumu ──
        string indirilenMsi = "";
        TextBox     kutuKullanici;
        PasswordBox kutuSifre;

        public AnaPencere()
        {
            Title  = "Pusula Connect";
            Width  = 720;
            Height = 580;
            ResizeMode = ResizeMode.NoResize;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = Tema.F("WindowBackgroundBrush");
            FontFamily = Tema.Yazi;
            FontSize   = 13;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);

            Color kd = Tema.R("BrandDarkBrush");
            panelMetin  = Tema.Karisim(kd, Colors.White, 0.55);
            panelSolgun = Tema.Karisim(kd, Colors.White, 0.35);
            panelTamam  = Tema.Karisim(Tema.R("SuccessBrush"), Colors.White, 0.45);

            AyarlariOku();
            Gunluk.Yaz("ayarlar: firma=" + ayFirma + " kullanici=" + ayKullanici
                     + " vpn=" + ayVpn + " rdp=" + ayRdp + " tunel=" + ayTunel
                     + " domain=" + ayDomain);
            Gunluk.Yaz("msiurl : " + (ayMsiUrl.Length > 0 ? ayMsiUrl : "(tanimsiz)"));
            Gunluk.Yaz("msiurl_arm : " + (ayMsiUrlArm.Length > 0 ? ayMsiUrlArm : "(tanimsiz)"));
            Gunluk.Yaz("islemci: " + (ArmMi() ? "ARM" : "x64/x86"));
            ArayuzKur();
            SayfaKarsilama();
        }

        // ─────────────────────────────────────────────────────────
        static string Klasor()
        {
            return Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        }

        /*  Ayarlar iki kaynaktan, bu sirayla:
         *    1. exe'ye gomulu kopya  — musteriye TEK dosya gitsin diye.
         *       Her musteri icin kendi ayarlar.ini'siyle derleniyor.
         *    2. exe'nin yanindaki ayarlar.ini — varsa gomuluyu EZER.
         *       Sahada bir deger degistirmek gerekirse yeniden derleyip
         *       dosya gondermeden cozulsun diye birakildi.               */
        void AyarlariOku()
        {
            try
            {
                Stream akis = Assembly.GetExecutingAssembly()
                                      .GetManifestResourceStream("Ayarlar.ini");
                if (akis != null)
                    using (StreamReader sr = new StreamReader(akis, Encoding.UTF8))
                        SatirlariIsle(sr.ReadToEnd().Split('\n'));
            }
            catch { }

            try
            {
                string ini = Path.Combine(Klasor(), "ayarlar.ini");
                if (File.Exists(ini))
                    SatirlariIsle(File.ReadAllLines(ini, Encoding.UTF8));
            }
            catch { }
        }

        void SatirlariIsle(string[] sat)
        {
            for (int i = 0; i < sat.Length; i++)
            {
                string s = sat[i].Trim();
                if (s.Length == 0 || s[0] == '#' || s[0] == ';') continue;
                int e = s.IndexOf('=');
                if (e <= 0) continue;
                string a = s.Substring(0, e).Trim().ToLowerInvariant();
                string d = s.Substring(e + 1).Trim();
                if (a == "firma") ayFirma = d;
                else if (a == "kullanici") ayKullanici = d;
                else if (a == "vpn") ayVpn = d;
                else if (a == "rdp") ayRdp = d;
                else if (a == "tunel") ayTunel = d;
                else if (a == "domain") ayDomain = d;
                else if (a == "msiurl") ayMsiUrl = d;
            }
        }

        /// WPF'te WinForms'un DoEvents karsiligi. Kurulum akisi senkron
        /// ilerledigi icin pencerenin donmamasi adina kuyruk arada bir
        /// bosaltiliyor.
        static void Nefes()
        {
            Application.Current.Dispatcher.Invoke(
                (Action)delegate { }, DispatcherPriority.Background);
        }

        // ═════════════════════════════════════════════════════════
        //  Iskelet
        // ═════════════════════════════════════════════════════════
        void ArayuzKur()
        {
            Grid kok = new Grid();
            kok.ColumnDefinitions.Add(Sutun(212));
            kok.ColumnDefinitions.Add(Sutun(-1));
            Content = kok;

            kok.Children.Add(SolPanel());

            Grid sag = new Grid();
            Grid.SetColumn(sag, 1);
            sag.RowDefinitions.Add(Satir(-2));   // baslik
            sag.RowDefinitions.Add(Satir(-1));   // govde
            sag.RowDefinitions.Add(Satir(-2));   // alt serit
            kok.Children.Add(sag);

            StackPanel bas = new StackPanel();
            bas.Margin = new Thickness(36, 34, 36, 0);
            sag.Children.Add(bas);

            bBaslik = new TextBlock();
            bBaslik.FontSize = 22;
            bBaslik.FontWeight = FontWeights.SemiBold;
            bBaslik.Foreground = Tema.F("TextPrimaryBrush");
            bas.Children.Add(bBaslik);

            bAlt = new TextBlock();
            bAlt.FontSize = 13;
            bAlt.Margin = new Thickness(0, 5, 0, 0);
            bAlt.Foreground = Tema.F("TextSecondaryBrush");
            bAlt.TextWrapping = TextWrapping.Wrap;
            bas.Children.Add(bAlt);

            govde = new StackPanel();
            govde.Margin = new Thickness(36, 24, 36, 0);
            Grid.SetRow(govde, 1);
            sag.Children.Add(govde);

            sag.Children.Add(AltSerit());
        }

        static ColumnDefinition Sutun(double g)
        {
            ColumnDefinition c = new ColumnDefinition();
            if (g == -1) c.Width = new GridLength(1, GridUnitType.Star);
            else if (g == -2) c.Width = GridLength.Auto;
            else c.Width = new GridLength(g);
            return c;
        }

        static RowDefinition Satir(double y)
        {
            RowDefinition r = new RowDefinition();
            if (y == -1) r.Height = new GridLength(1, GridUnitType.Star);
            else if (y == -2) r.Height = GridLength.Auto;
            else r.Height = new GridLength(y);
            return r;
        }

        UIElement SolPanel()
        {
            Border kenar = new Border();
            kenar.Background = Tema.F("BrandDarkBrush");
            Grid.SetColumn(kenar, 0);

            StackPanel ic = new StackPanel();
            ic.Margin = new Thickness(28, 32, 20, 0);
            kenar.Child = ic;

            TextBlock logo = new TextBlock();
            logo.Text = "PUSULA";
            logo.FontSize = 19;
            logo.FontWeight = FontWeights.SemiBold;
            logo.Foreground = Brushes.White;
            ic.Children.Add(logo);

            TextBlock logoAlt = new TextBlock();
            logoAlt.Text = "Bağlantı Kurulumu";
            logoAlt.FontSize = 12;
            logoAlt.Margin = new Thickness(0, 2, 0, 0);
            logoAlt.Foreground = panelMetin;
            ic.Children.Add(logoAlt);

            string[] adlar = { "Karşılama", "Kurulum", "Kullanıcı bilgileri", "Tamamlandı" };
            StackPanel adimlar = new StackPanel();
            adimlar.Margin = new Thickness(0, 46, 0, 0);
            ic.Children.Add(adimlar);

            for (int i = 0; i < adlar.Length; i++)
            {
                Grid g = new Grid();
                g.Margin = new Thickness(0, 0, 0, 16);
                g.ColumnDefinitions.Add(Sutun(24));
                g.ColumnDefinitions.Add(Sutun(-1));

                TextBlock nokta = new TextBlock();
                nokta.Text = "○";
                nokta.FontSize = 12;
                nokta.Foreground = panelSolgun;
                nokta.VerticalAlignment = VerticalAlignment.Center;
                g.Children.Add(nokta);
                adimNokta[i] = nokta;

                TextBlock e = new TextBlock();
                e.Text = adlar[i];
                e.FontSize = 12.5;
                e.Foreground = panelMetin;
                e.VerticalAlignment = VerticalAlignment.Center;
                Grid.SetColumn(e, 1);
                g.Children.Add(e);
                adimEtiket[i] = e;

                adimlar.Children.Add(g);
            }
            return kenar;
        }

        UIElement AltSerit()
        {
            Border serit = new Border();
            serit.BorderBrush = Tema.F("BorderBrush");
            serit.BorderThickness = new Thickness(0, 1, 0, 0);
            Grid.SetRow(serit, 2);

            StackPanel yigin = new StackPanel();
            yigin.Margin = new Thickness(36, 16, 36, 20);
            serit.Child = yigin;

            cubuk = new Ilerleme();
            cubuk.Margin = new Thickness(0, 0, 0, 12);
            cubuk.Visibility = Visibility.Collapsed;
            yigin.Children.Add(cubuk);

            Grid alt = new Grid();
            alt.ColumnDefinitions.Add(Sutun(-1));
            alt.ColumnDefinitions.Add(Sutun(-2));
            yigin.Children.Add(alt);

            durumMetni = new TextBlock();
            durumMetni.FontSize = 12;
            durumMetni.VerticalAlignment = VerticalAlignment.Center;
            durumMetni.TextWrapping = TextWrapping.Wrap;
            durumMetni.Margin = new Thickness(0, 0, 16, 0);
            durumMetni.Foreground = Tema.F("TextSecondaryBrush");
            alt.Children.Add(durumMetni);

            StackPanel dugmeler = new StackPanel();
            dugmeler.Orientation = Orientation.Horizontal;
            Grid.SetColumn(dugmeler, 1);
            alt.Children.Add(dugmeler);

            dugmeGeri = new Button();
            dugmeGeri.Style = Tema.S("SecondaryButton");
            dugmeGeri.Content = "Kapat";
            dugmeGeri.MinWidth = 96;
            dugmeGeri.Margin = new Thickness(0, 0, 10, 0);
            dugmeGeri.Click += KapatTiklandi;
            dugmeler.Children.Add(dugmeGeri);

            dugmeIleri = new Button();
            dugmeIleri.Style = Tema.S("PrimaryButton");
            dugmeIleri.MinWidth = 150;
            dugmeIleri.Click += IleriTiklandi;
            dugmeler.Children.Add(dugmeIleri);

            return serit;
        }

        void AdimVurgula(int i)
        {
            aktifAdim = i;
            for (int k = 0; k < adimNokta.Length; k++)
            {
                bool tamam = k < i, aktif = k == i;
                adimNokta[k].Text = tamam ? "✓" : (aktif ? "●" : "○");
                adimNokta[k].Foreground = tamam ? panelTamam
                                        : (aktif ? Brushes.White : panelSolgun);
                adimEtiket[k].Foreground = aktif ? Brushes.White
                                         : (tamam ? panelMetin : panelSolgun);
                adimEtiket[k].FontWeight = aktif ? FontWeights.SemiBold : FontWeights.Normal;
            }
        }

        // ═════════════════════════════════════════════════════════
        //  1) Karsilama
        // ═════════════════════════════════════════════════════════
        void SayfaKarsilama()
        {
            AdimVurgula(0);
            bBaslik.Text = "Hoş geldiniz";
            bAlt.Text = "Bu program, uzak masaüstü bağlantınız için gereken ayarları sizin yerinize yapar.";
            govde.Children.Clear();

            BilgiSatiri("Firma", ayFirma.Length > 0 ? ayFirma : "—");
            BilgiSatiri("Kullanıcı", ayKullanici.Length > 0 ? ayKullanici : "kurulum sırasında sorulacak");
            BilgiSatiri("VPN sunucusu", ayVpn);
            BilgiSatiri("Uzak masaüstü", ayRdp);

            TextBlock not = new TextBlock();
            not.Text = "Yapılacaklar: FortiClient VPN kurulumu · VPN profili · "
                     + "masaüstü kısayolu · kullanıcı bilgilerinin kaydedilmesi";
            not.FontSize = 12;
            not.TextWrapping = TextWrapping.Wrap;
            not.Margin = new Thickness(0, 18, 0, 0);
            not.Foreground = Tema.F("TextMutedBrush");
            govde.Children.Add(not);

            dugmeIleri.Content = "Kuruluma Başla";
            dugmeIleri.IsEnabled = true;
            dugmeGeri.Visibility = Visibility.Visible;
            durumMetni.Text = "";
        }

        void BilgiSatiri(string ad, string deger)
        {
            Border satir = new Border();
            satir.BorderBrush = Tema.F("BorderLightBrush");
            satir.BorderThickness = new Thickness(0, 0, 0, 1);
            satir.Padding = new Thickness(0, 9, 0, 9);

            Grid g = new Grid();
            g.ColumnDefinitions.Add(Sutun(124));
            g.ColumnDefinitions.Add(Sutun(-1));
            satir.Child = g;

            TextBlock a = new TextBlock();
            a.Text = ad;
            a.FontSize = 12.5;
            a.VerticalAlignment = VerticalAlignment.Center;
            a.Foreground = Tema.F("TextSecondaryBrush");
            g.Children.Add(a);

            TextBlock d = new TextBlock();
            d.Text = deger;
            d.FontFamily = Tema.Mono;
            d.FontSize = 12.5;
            d.VerticalAlignment = VerticalAlignment.Center;
            d.Foreground = Tema.F("TextPrimaryBrush");
            Grid.SetColumn(d, 1);
            g.Children.Add(d);

            govde.Children.Add(satir);
        }

        // ═════════════════════════════════════════════════════════
        //  2) Kurulum
        // ═════════════════════════════════════════════════════════
        List<TextBlock> islemNokta = new List<TextBlock>();
        List<TextBlock> islemMetin = new List<TextBlock>();

        void SayfaKurulum()
        {
            AdimVurgula(1);
            bBaslik.Text = "Kurulum yapılıyor";
            bAlt.Text = "Bu işlem birkaç dakika sürebilir. Lütfen pencereyi kapatmayın.";
            govde.Children.Clear();
            islemNokta.Clear(); islemMetin.Clear();

            string[] islemler = {
                "FortiClient VPN indiriliyor",
                "FortiClient VPN kuruluyor",
                "VPN profili oluşturuluyor",
                "Masaüstü kısayolu oluşturuluyor"
            };

            for (int i = 0; i < islemler.Length; i++)
            {
                Grid g = new Grid();
                g.Margin = new Thickness(0, 0, 0, 14);
                g.ColumnDefinitions.Add(Sutun(26));
                g.ColumnDefinitions.Add(Sutun(-1));

                TextBlock n = new TextBlock();
                n.Text = "○";
                n.FontSize = 13;
                n.VerticalAlignment = VerticalAlignment.Center;
                n.Foreground = Tema.F("TextMutedBrush");
                g.Children.Add(n);
                islemNokta.Add(n);

                TextBlock m = new TextBlock();
                m.Text = islemler[i];
                m.FontSize = 13;
                m.TextWrapping = TextWrapping.Wrap;
                m.VerticalAlignment = VerticalAlignment.Center;
                m.Foreground = Tema.F("TextMutedBrush");
                Grid.SetColumn(m, 1);
                g.Children.Add(m);
                islemMetin.Add(m);

                govde.Children.Add(g);
            }

            dugmeIleri.IsEnabled = false;
            dugmeIleri.Content = "Lütfen bekleyin";
            dugmeGeri.Visibility = Visibility.Collapsed;
            cubuk.Visibility = Visibility.Visible;
            cubuk.Deger = 0;
            Nefes();

            KurulumuYurut();
        }

        /// Arayuzu gunceller, gunluge YAZMAZ — sik tekrarlanan ilerleme
        /// metinleri gunlugu bogmasin diye.
        void EkranaYaz(int i, string metin)
        {
            if (i < 0 || i >= islemMetin.Count) return;
            islemMetin[i].Text = metin;
            Nefes();
        }

        void Isaretle(int i, int durum, string metin)   // 0=calisiyor 1=tamam 2=hata 3=atlandi
        {
            if (i < 0 || i >= islemNokta.Count) return;
            TextBlock n = islemNokta[i];
            if (durum == 0)      { n.Text = "→"; n.Foreground = Tema.F("TextPrimaryBrush"); }
            else if (durum == 1) { n.Text = "✓"; n.Foreground = Tema.F("SuccessBrush"); }
            else if (durum == 2) { n.Text = "✕"; n.Foreground = Tema.F("ErrorBrush"); }
            else                 { n.Text = "–"; n.Foreground = Tema.F("WarningBrush"); }

            islemMetin[i].Foreground = Tema.F("TextPrimaryBrush");
            if (metin != null && metin.Length > 0) islemMetin[i].Text = metin;

            // Ekranda ne yazdiysa gunluge de yaz: musteri "ekranda su
            // yaziyordu" dediginde kayitla karsilastirabilelim.
            string[] durumAdi = { "calisiyor", "TAMAM", "HATA", "atlandi" };
            Gunluk.Yaz("adim " + (i + 1) + " [" + durumAdi[durum] + "] "
                     + (metin ?? islemMetin[i].Text));
            Nefes();
        }

        /// ARM makinede FortiClient kurulamiyor; kullaniciya bunu
        /// soyleyip kalan adimlara gecmek icin isaretlenir.
        bool armAtlandi = false;

        void KurulumuYurut()
        {
            bool sorunsuz = true;

            /*  ARM ise indirmeye HIC baslanmiyor: paket x64 ve ARM'de
             *  kurulamiyor, 131 MB'i bosuna indirmenin anlami yok.     */
            /*  ARM ise: uygun bir kurulum dosyamiz varsa normal akisa
             *  devam ediliyor (asagida mimariye gore adres seciliyor).
             *  Yoksa indirmeye hic baslanmiyor — paket x64 ve ARM'de
             *  kurulamiyor, 131 MB'i bosuna indirmenin anlami yok.     */
            if (ArmMi() && ayMsiUrlArm.Length == 0 && YanindakiMsi().Length == 0)
            {
                armAtlandi = true;
                Gunluk.Yaz("ARM islemci tespit edildi — FortiClient (x64) bu makineye kurulamaz");
                Isaretle(0, 3, "ARM işlemci — kurulum paketi bu makineyle uyumsuz");
                Isaretle(1, 3, "FortiClient kurulamıyor (ARM desteği ayrı sürümde)");
                cubuk.Deger = 50;

                // VPN profili ve kısayol yine de yazılıyor: FortiClient
                // sonradan uygun sürümle kurulursa profil hazır olur,
                // uzak masaüstü kısayolu ise VPN'den bağımsız çalışır.
                Isaretle(2, 0, null);
                try { VpnProfiliYaz(ayTunel, ayVpn); Isaretle(2, 1, "VPN profili hazır: " + ayTunel); }
                catch (Exception ex) { Isaretle(2, 2, "VPN profili: " + KisaHata(ex)); }

                Isaretle(3, 0, null);
                try
                {
                    string y = RdpYaz(ayTunel, ayRdp, ayDomain, ayKullanici);
                    Isaretle(3, 1, "Kısayol: " + Path.GetFileName(y));
                }
                catch (Exception ex) { Isaretle(3, 2, "Kısayol: " + KisaHata(ex)); }

                cubuk.Deger = 100;
                Gunluk.Yaz("SONUC: ARM makine — FortiClient kurulmadi, profil ve kisayol yazildi");
                durumMetni.Text = "Bu bilgisayar ARM işlemcili — VPN programı kurulamadı.";
                durumMetni.Foreground = Tema.F("WarningBrush");
                dugmeIleri.IsEnabled = true;
                dugmeIleri.Content = "Devam";
                return;
            }

            // ── 1) MSI: once yanindaki dosya, yoksa indir ──
            Isaretle(0, 0, null);
            string yerel = YanindakiMsi();
            if (yerel.Length > 0)
            {
                // Yanindaki dosya da indirilen kadar suphelidir.
                try
                {
                    MsiDogrula(yerel, "paketteki dosya");
                    /*  Paketteki MSI YERELE KOPYALANIYOR, oldugu yerden
                     *  kurulmuyor.
                     *
                     *  Sebep: msiexec'in sunucu sureci SYSTEM olarak
                     *  calisiyor ve paketin durdugu yere erisemeyebiliyor.
                     *  Sahada paket OneDrive ile esitlenen masaustunde
                     *  duruyordu (2026-08-28, HAKBILIR); OneDrive'in
                     *  "isteğe bagli dosyalar" yer tutucularini SYSTEM
                     *  acamiyor. Ag suruculeri ve USB icin de ayni risk
                     *  var. Yerel gecici klasore kopyalamak bu sinifin
                     *  tamamini ortadan kaldiriyor.                     */
                    indirilenMsi = YerelKopyaya(yerel);
                    Isaretle(0, 1, "Kurulum dosyası pakette bulundu");
                    cubuk.Deger = 25;
                }
                catch (Exception ex)
                {
                    Gunluk.Hata("YanindakiMsi", ex);
                    Isaretle(0, 2, "Paketteki dosya bozuk: " + KisaHata(ex));
                    sorunsuz = false;
                }
            }
            else
            {
                /*  Adres MIMARIYE gore seciliyor. ARM makineye x64 paketi
                 *  indirmek bosuna 131 MB ve sonunda 1603 demek.        */
                bool arm = ArmMi();
                string adres = arm ? ayMsiUrlArm : ayMsiUrl;
                Gunluk.Yaz("  secilen adres (" + (arm ? "ARM" : "x64") + "): "
                         + (adres.Length > 0 ? adres : "(tanimsiz)"));

                if (adres.Length == 0)
                {
                    Isaretle(0, 2, arm
                        ? "ARM işlemci için kurulum dosyası tanımlı değil"
                        : "Kurulum dosyası yok ve indirme adresi tanımsız");
                    sorunsuz = false;
                }
                else
                {
                    try { indirilenMsi = MsiIndir(adres); Isaretle(0, 1, "FortiClient VPN indirildi"); }
                    catch (Exception ex) { Isaretle(0, 2, "İndirme hatası: " + KisaHata(ex)); sorunsuz = false; }
                }
            }

            // ── 2) Kurulum ──
            Isaretle(1, 0, null);
            try
            {
                string kanit;
                if (FortiClientKurulu(out kanit))
                {
                    Gunluk.Yaz("  zaten kurulu -> " + kanit);
                    Isaretle(1, 1, "FortiClient VPN zaten kurulu");
                }
                else if (indirilenMsi.Length == 0)
                { Isaretle(1, 3, "Kurulum atlandı (dosya yok)"); sorunsuz = false; }
                else
                {
                    /*  /l*v ile msiexec'in KENDI ayrintili gunlugu aliniyor.
                     *  Cikis kodu tek basina yetmiyor: "1603" gibi genel bir
                     *  kod neyin patladigini soylemiyor, sebebi bu dosyada
                     *  yaziyor. Sahada "indirdi ama kuramadi" vakasinda tam
                     *  bu eksikti.                                          */
                    string msiLog = Path.Combine(Path.GetTempPath(), "PusulaConnect-msi.log");
                    ProcessStartInfo psi = new ProcessStartInfo("msiexec.exe",
                        "/i \"" + indirilenMsi + "\" /qn /norestart /l*v \"" + msiLog + "\"");
                    psi.UseShellExecute = false; psi.CreateNoWindow = true;
                    Gunluk.Yaz("  msiexec basliyor: " + psi.Arguments);
                    Process p = Process.Start(psi);
                    while (!p.HasExited) { Nefes(); System.Threading.Thread.Sleep(120); }
                    Gunluk.Yaz("  msiexec cikis kodu: " + p.ExitCode);

                    if (p.ExitCode == 0 || p.ExitCode == 3010)
                    {
                        Isaretle(1, 1, "FortiClient VPN kuruldu");
                        // Kurulum "basarili" dedi ama urun ortada yok mu?
                        string k2;
                        if (!FortiClientKurulu(out k2))
                        {
                            Gunluk.Yaz("  UYARI: msiexec basarili dondu ama urun bulunamadi (" + k2 + ")");
                            Isaretle(1, 2, "Kurulum tamamlanmadı (ürün bulunamadı)");
                            sorunsuz = false;
                        }
                        else Gunluk.Yaz("  dogrulandi -> " + k2);
                    }
                    else
                    {
                        Isaretle(1, 2, "Kurulum hatası (kod " + p.ExitCode + ")");
                        sorunsuz = false;
                        MsiGunlugunuAktar(msiLog);
                    }
                }
            }
            catch (Exception ex) { Isaretle(1, 2, "Kurulum hatası: " + KisaHata(ex)); sorunsuz = false; }
            cubuk.Deger = 65;

            // ── 3) VPN profili ──
            Isaretle(2, 0, null);
            try { VpnProfiliYaz(ayTunel, ayVpn); Isaretle(2, 1, "VPN profili hazır: " + ayTunel); }
            catch (Exception ex) { Isaretle(2, 2, "VPN profili: " + KisaHata(ex)); sorunsuz = false; }
            cubuk.Deger = 85;

            // ── 4) Kisayol (kullanici adi henuz yoksa 3. adimda guncellenecek) ──
            Isaretle(3, 0, null);
            try
            {
                string yol = RdpYaz(ayTunel, ayRdp, ayDomain, ayKullanici);
                Isaretle(3, 1, "Kısayol: " + Path.GetFileName(yol));
            }
            catch (Exception ex) { Isaretle(3, 2, "Kısayol: " + KisaHata(ex)); sorunsuz = false; }
            cubuk.Deger = 100;

            Gunluk.Yaz(sorunsuz ? "SONUC: kurulum tamamlandi"
                                : "SONUC: kurulum bitti, bazi adimlar atlandi");
            durumMetni.Text = sorunsuz ? "Kurulum tamamlandı." : "Kurulum bitti, bazı adımlar atlandı.";
            durumMetni.Foreground = sorunsuz ? Tema.F("SuccessBrush") : Tema.F("WarningBrush");
            dugmeIleri.IsEnabled = true;
            dugmeIleri.Content = "Devam";
        }

        /*  FortiClient GERCEKTEN kurulu mu?
         *
         *  ONCEKI HALI HATALIYDI ve sahada yanlis sonuc verdi: yalnizca
         *  HKLM\SOFTWARE\Fortinet\FortiClient anahtarinin varligina
         *  bakiyordu. Ama bu programin kendisi VPN profilini
         *  ...\FortiClient\Sslvpn\Tunnels\<tunel> altina yaziyor, yani o
         *  anahtari KENDI olusturuyor. Sonuc: ilk calistirmada indirme
         *  basarisiz olup kurulum atlansa bile 3. adim profili yaziyor;
         *  musteri programi ikinci kez calistirdiginda "zaten kurulu"
         *  yazip hicbir sey kurmadan basarili gorunuyordu.
         *
         *  Dogrusu urunun kendisini aramak: once calistirilabilir dosya,
         *  sonra Windows Installer kayitlari. Hangi kanitla karar
         *  verildigi gunluge yaziliyor.                                */
        static bool FortiClientKurulu(out string kanit)
        {
            string[] adaylar = {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                             @"Fortinet\FortiClient\FortiClient.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                             @"Fortinet\FortiClient\FortiClient.exe"),
            };
            for (int i = 0; i < adaylar.Length; i++)
                if (File.Exists(adaylar[i])) { kanit = "dosya: " + adaylar[i]; return true; }

            string[] kaldirYollari = {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            };
            for (int i = 0; i < kaldirYollari.Length; i++)
            {
                try
                {
                    using (RegistryKey k = Registry.LocalMachine.OpenSubKey(kaldirYollari[i]))
                    {
                        if (k == null) continue;
                        string[] altlar = k.GetSubKeyNames();
                        for (int j = 0; j < altlar.Length; j++)
                        {
                            using (RegistryKey a = k.OpenSubKey(altlar[j]))
                            {
                                if (a == null) continue;
                                object ad = a.GetValue("DisplayName");
                                if (ad != null && ad.ToString().IndexOf("FortiClient",
                                        StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    kanit = "kayit: " + ad + " " + a.GetValue("DisplayVersion");
                                    return true;
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            kanit = "urun bulunamadi";
            return false;
        }

        /*  msi gunlugunde taniyabildigimiz bir sebep var mi?
         *  Sahada gorulen ikisi:
         *   · difxapi.dll  — Windows surucu kurulum bileseni eksik;
         *     FortiClient CA_InstallDrivers adiminda 1603 ile duruyor.
         *     Makineye ozgu, kurulum programi cozemez.
         *   · CopyMSIToTemp — MSI %TEMP% kokunde oldugunda FortiClient
         *     dosyayi kendi uzerine kopyalamaya calisiyor. Bu bizim
         *     hatamizdi, indirme alt klasore alinarak duzeltildi.       */
        static string BilinenSebep(string msiLog)
        {
            try
            {
                if (!File.Exists(msiLog)) return null;
                string t = File.ReadAllText(msiLog);
                if (t.IndexOf("difxapi.dll", StringComparison.OrdinalIgnoreCase) >= 0)
                    return "difxapi.dll yuklenemedi — bu makinede Windows'un surucu "
                         + "kurulum bileseni eksik, FortiClient surucu adiminda duruyor.";
                if (t.IndexOf("CopyMSIToTemp", StringComparison.OrdinalIgnoreCase) >= 0)
                    return "Kurulum dosyasi gecici klasore kopyalanamadi.";
            }
            catch { }
            return null;
        }

        /*  msiexec gunlugu cok uzun (megabaytlar). Tamamini kopyalamak
         *  yerine ise yarayan satirlari suzuyoruz: hata satirlari ve
         *  kapanis ozeti. Musteri makinesinde dosya yerinde kaliyor,
         *  gerekirse tamami istenebilir.                               */
        static void MsiGunlugunuAktar(string msiLog)
        {
            try
            {
                if (!File.Exists(msiLog)) { Gunluk.Yaz("  msi gunlugu olusmamis: " + msiLog); return; }
                Gunluk.Yaz("  msi gunlugu: " + msiLog);
                string[] satirlar = File.ReadAllLines(msiLog);
                int yazilan = 0;
                for (int i = 0; i < satirlar.Length && yazilan < 40; i++)
                {
                    string t = satirlar[i];
                    if (t.IndexOf("Error", StringComparison.OrdinalIgnoreCase) >= 0
                     || t.IndexOf("failed", StringComparison.OrdinalIgnoreCase) >= 0
                     || t.IndexOf("Return value 3", StringComparison.Ordinal) >= 0
                     || t.IndexOf("MainEngineThread is returning", StringComparison.Ordinal) >= 0)
                    {
                        Gunluk.Yaz("    | " + (t.Length > 220 ? t.Substring(0, 220) + "…" : t));
                        yazilan++;
                    }
                }
                if (yazilan == 0) Gunluk.Yaz("    (gunlukte hata satiri bulunamadi)");

                /*  Bilinen sebepler ayrica isaretleniyor: msi gunlugu uzun
                 *  ve teknik, destek tarafinda "neden" sorusunu tek satirda
                 *  cevaplayabilmek icin.                                  */
                string sebep = BilinenSebep(msiLog);
                if (sebep != null) Gunluk.Yaz("  TESHIS: " + sebep);
            }
            catch (Exception ex) { Gunluk.Hata("MsiGunlugunuAktar", ex); }
        }

        /*  MSI GERCEKTEN MSI MI?
         *
         *  Sahada bunun yoklugu pahaliya mal oldu: sunucu HTML hata
         *  sayfasi dondugunde WebClient bunu basariyla "indirdi" sayiyor,
         *  dosya diske yaziliyor ve program kuruluma geciyordu. Ekranda
         *  yesil tik goruluyor, gercekte elde MSI degil birkac KB'lik
         *  HTML vardi.
         *
         *  Ayni kontrol paketin YANINDAKI dosyaya da uygulaniyor: orasi
         *  indirmeden gecildigi icin uzun sure denetimsizdi, oysa yarim
         *  kopyalanmis bir .msi ayni sessiz hatayi verir.
         *
         *  Iki olcut: makul boyut ve dosya imzasi. MSI bir OLE bilesik
         *  dosyasi, ilk 8 bayti daima D0 CF 11 E0 A1 B1 1A E1.          */
        static void MsiDogrula(string yol, string neyin)
        {
            FileInfo bilgi = new FileInfo(yol);
            Gunluk.Yaz("  dogrulama (" + neyin + "): " + yol);
            Gunluk.Yaz("    boyut: " + (bilgi.Exists ? bilgi.Length.ToString("N0") + " bayt" : "DOSYA YOK"));

            if (!bilgi.Exists || bilgi.Length < 1024 * 1024)
                throw new Exception(neyin + " geçersiz ("
                    + (bilgi.Exists ? bilgi.Length + " bayt" : "dosya yok") + ")");

            byte[] imza = new byte[8];
            using (FileStream fs = File.OpenRead(yol))
                if (fs.Read(imza, 0, 8) != 8) throw new Exception(neyin + " okunamadı");

            byte[] beklenen = { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };
            for (int i = 0; i < 8; i++)
            {
                if (imza[i] != beklenen[i])
                {
                    Gunluk.Yaz("    imza uyusmadi: " + BitConverter.ToString(imza));
                    Gunluk.Yaz("    (dosya MSI degil; sunucu hata sayfasi ya da yarim kopya olabilir)");
                    throw new Exception(neyin + " kurulum paketi değil");
                }
            }
            Gunluk.Yaz("    imza dogru (MSI)");
        }

        /*  Dosyayi yerel gecici klasore kopyalar. Zaten oradaysa
         *  dokunmadan geri doner. Kopyalama basarisiz olursa (yer yok
         *  gibi) ozgun yol kullanilir — kurulum hic denenmemis olmaktansa
         *  denenip hata vermesi yeglenir.                              */
        /*  ARM64 TESPITI
         *
         *  Sahada yasandi (2026-08-28, HAKBILIR — Snapdragon X Plus):
         *  dagittigimiz FortiClient 7.0.14 x64 bir paket ve cekirdek modu
         *  ag suruculeri kuruyor (ftsvnic, FortiFilter, ft_vnic). Windows
         *  on ARM x64 UYGULAMALARI oykunuyor ama SURUCULERI oykunemiyor,
         *  bu yuzden kurulum CA_InstallDrivers adiminda 1603 ile duruyor:
         *
         *    FCSetupWx: Failed to load C:\Windows\system32\difxapi.dll
         *
         *  (System32 ARM64 ikililerini tutuyor, x64 difxapi orada yok.)
         *
         *  Yapilandirmayla cozulecek bir sey degil. Onceden anlayip
         *  soylemek, 131 MB indirip anlasilmaz bir hatayla bitirmekten
         *  iyidir. Fortinet ARM'i ancak 7.4.3'ten itibaren ve "Beta"
         *  olarak destekliyor, ayri bir kurulum dosyasiyla.
         *
         *  .NET Framework 4.0'da RuntimeInformation.OSArchitecture yok;
         *  GetNativeSystemInfo kullaniliyor. "Native" onemli: 32 bit bir
         *  surecte GetSystemInfo oykunulen mimariyi bildirir.           */
        const ushort ISLEMCI_ARM64 = 12;
        const ushort ISLEMCI_ARM   = 5;

        [StructLayout(LayoutKind.Sequential)]
        struct SYSTEM_INFO
        {
            public ushort wProcessorArchitecture;
            public ushort wReserved;
            public uint dwPageSize;
            public IntPtr lpMinimumApplicationAddress;
            public IntPtr lpMaximumApplicationAddress;
            public IntPtr dwActiveProcessorMask;
            public uint dwNumberOfProcessors;
            public uint dwProcessorType;
            public uint dwAllocationGranularity;
            public ushort wProcessorLevel;
            public ushort wProcessorRevision;
        }

        [DllImport("kernel32.dll")]
        static extern void GetNativeSystemInfo(ref SYSTEM_INFO lpSystemInfo);

        static bool ArmMi()
        {
            try
            {
                SYSTEM_INFO si = new SYSTEM_INFO();
                GetNativeSystemInfo(ref si);
                return si.wProcessorArchitecture == ISLEMCI_ARM64
                    || si.wProcessorArchitecture == ISLEMCI_ARM;
            }
            catch { return false; }
        }

        static string YerelKopyaya(string kaynak)
        {
            try
            {
                string klasor = Path.Combine(Path.GetTempPath(), "PusulaConnect");
                Directory.CreateDirectory(klasor);
                string hedef = Path.Combine(klasor, Path.GetFileName(kaynak));

                if (string.Equals(Path.GetFullPath(kaynak), Path.GetFullPath(hedef),
                        StringComparison.OrdinalIgnoreCase))
                {
                    Gunluk.Yaz("  dosya zaten yerel klasorde");
                    return kaynak;
                }

                Gunluk.Yaz("  yerele kopyalaniyor: " + hedef);
                File.Copy(kaynak, hedef, true);
                Gunluk.Yaz("    kopyalandi (" + new FileInfo(hedef).Length.ToString("N0") + " bayt)");
                return hedef;
            }
            catch (Exception ex)
            {
                Gunluk.Hata("YerelKopyaya", ex);
                Gunluk.Yaz("  kopyalanamadi, dosya oldugu yerden kurulacak");
                return kaynak;
            }
        }

        /*  Paketin yanindaki .msi — MIMARIYE gore seciliyor.
         *  Adinda "arm" gecen dosya ARM makineler icin, gecmeyen x64
         *  icin. Ayni klasorde ikisi birden bulunabilsin diye boyle:
         *  tek bir paket her iki makineye de gonderilebiliyor.        */
        string YanindakiMsi()
        {
            try
            {
                bool arm = ArmMi();
                string[] d = Directory.GetFiles(Klasor(), "*.msi");
                string yedek = "";
                for (int i = 0; i < d.Length; i++)
                {
                    string ad = Path.GetFileName(d[i]).ToLowerInvariant();
                    if (ad.IndexOf("forti", StringComparison.Ordinal) < 0) continue;
                    bool dosyaArm = ad.IndexOf("arm", StringComparison.Ordinal) >= 0;
                    if (dosyaArm == arm) return d[i];   // mimari eslesti
                    if (yedek.Length == 0) yedek = d[i];
                }
                /*  Eslesme yoksa dosya KULLANILMIYOR — iki yonde de.
                 *  Adinda "arm" gecen paketi x64 makinede calistirmak da,
                 *  x64 paketini ARM'de calistirmak da kurulamayacagi
                 *  bilinen bir denemedir; 1603 alip kullaniciyi
                 *  saskina cevirmektense hic denememek dogru.
                 *
                 *  (Test bunu yakaladi: koruma once yalniz ARM tarafinda
                 *  vardi, x64 makinede ARM paketi secilebiliyordu.)     */
                if (yedek.Length > 0)
                    Gunluk.Yaz("  paketteki MSI bu islemciyle uyumsuz, kullanilmadi: "
                             + Path.GetFileName(yedek));
            }
            catch { }
            return "";
        }

        /*  Indirme: WebClient + olay tabanli ilerleme. Olaylar WPF'in
         *  dispatcher'ina dusuyor; Nefes() kuyrugu bosalttigi icin
         *  pencere donmuyor.                                          */
        bool indirmeBitti; Exception indirmeHatasi;
        string MsiIndir(string url)
        {
            /*  ALT KLASORE indiriliyor, %TEMP% kokune DEGIL.
             *
             *  Sahada yasandi (2026-08-28, HAKBILIR): FortiClient'in kendi
             *  kurulumu CA_CopyMSIToTemp adiminda MSI'yi
             *  %TEMP%\FortiClientVPN.msi'ye kopyalamaya calisiyor. Dosyayi
             *  biz de tam oraya indirdigimiz icin kaynak ile hedef ayni yol
             *  oluyor, kopyalama "error:2" ile patliyor ve kurulum 1603 ile
             *  duruyor:
             *
             *    MSI_CopyMSIToTemp: failed (error:2)
             *    ...\Temp\FortiClientVPN.msi ==> ...\Temp\\FortiClientVPN.msi
             *
             *  Alt klasorde hedef farkli yol oluyor ve adim gecebiliyor.  */
            string indirmeKlasoru = Path.Combine(Path.GetTempPath(), "PusulaConnect");
            Directory.CreateDirectory(indirmeKlasoru);
            string hedef = Path.Combine(indirmeKlasoru, "FortiClientVPN.msi");
            if (File.Exists(hedef)) { try { File.Delete(hedef); } catch { } }

            indirmeBitti = false; indirmeHatasi = null;
            ServicePointManager.SecurityProtocol =
                SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;

            WebClient wc = new WebClient();
            /*  Ilerleme olayi saniyede onlarca kez tetikleniyor ve Isaretle()
             *  her cagrida gunluge satir yaziyordu; tek indirmede gunluk
             *  760 KB'a cikti, asil teshis satirlari o yiginin icinde
             *  kayboldu. Ekran her olayda guncelleniyor, gunluge yalniz
             *  %10'luk adimlarda yaziliyor.                              */
            int sonKayit = -1;
            wc.DownloadProgressChanged += delegate(object s, DownloadProgressChangedEventArgs e)
            {
                cubuk.Deger = e.ProgressPercentage * 0.25;
                string metin = "FortiClient VPN indiriliyor — %" + e.ProgressPercentage
                    + "  (" + (e.BytesReceived / 1048576) + " / " + (e.TotalBytesToReceive / 1048576) + " MB)";
                int dilim = e.ProgressPercentage / 10;
                if (dilim != sonKayit) { sonKayit = dilim; Isaretle(0, 0, metin); }
                else EkranaYaz(0, metin);
            };
            wc.DownloadFileCompleted += delegate(object s, AsyncCompletedEventArgs e)
            {
                indirmeHatasi = e.Error; indirmeBitti = true;
            };
            Gunluk.Yaz("  indirme basliyor: " + url);
            Gunluk.Yaz("  hedef: " + hedef);
            DateTime t0 = DateTime.Now;
            wc.DownloadFileAsync(new Uri(url), hedef);

            while (!indirmeBitti) { Nefes(); System.Threading.Thread.Sleep(60); }
            wc.Dispose();
            if (indirmeHatasi != null) throw indirmeHatasi;

            double sn = (DateTime.Now - t0).TotalSeconds;
            Gunluk.Yaz("  indirme bitti: " + sn.ToString("F1") + " sn");
            MsiDogrula(hedef, "indirilen dosya");
            return hedef;
        }

        static string KisaHata(Exception ex)
        {
            string m = ex.Message;
            if (m.Length > 60) m = m.Substring(0, 60) + "…";
            return m;
        }

        // ═════════════════════════════════════════════════════════
        //  3) Kullanici bilgileri
        // ═════════════════════════════════════════════════════════
        void SayfaKimlik()
        {
            AdimVurgula(2);
            bBaslik.Text = "Kullanıcı bilgileriniz";
            bAlt.Text = "Bu bilgiler yalnızca bu bilgisayarda saklanır, hiçbir yere gönderilmez.";
            govde.Children.Clear();
            cubuk.Visibility = Visibility.Collapsed;

            govde.Children.Add(Etiket("Kullanıcı adı"));
            kutuKullanici = new TextBox();
            kutuKullanici.Style = Tema.S("ModernTextBox");
            kutuKullanici.FontFamily = Tema.Mono;
            kutuKullanici.Text = ayKullanici;
            kutuKullanici.Margin = new Thickness(0, 0, 0, 16);
            govde.Children.Add(kutuKullanici);

            govde.Children.Add(Etiket("Şifre"));
            kutuSifre = new PasswordBox();
            kutuSifre.Style = Tema.S("ModernPasswordBox");
            kutuSifre.FontFamily = Tema.Mono;
            govde.Children.Add(kutuSifre);

            TextBlock not = new TextBlock();
            not.Text = "Şifreniz uzak masaüstü için Windows kimlik kasasına kaydedilir; "
                     + "bir daha sorulmaz. VPN tarafında ise Fortinet dışarıdan şifre "
                     + "yazılmasına izin vermiyor — onu FortiClient içinde elle "
                     + "gireceksiniz, nasıl yapılacağı son adımda anlatılıyor.";
            not.FontSize = 12;
            not.TextWrapping = TextWrapping.Wrap;
            not.Margin = new Thickness(0, 18, 0, 0);
            not.Foreground = Tema.F("TextMutedBrush");
            govde.Children.Add(not);

            dugmeIleri.Content = "Kaydet ve Bitir";
            dugmeIleri.IsEnabled = true;
            dugmeGeri.Visibility = Visibility.Collapsed;
            durumMetni.Text = "";
            kutuKullanici.Focus();
        }

        UIElement Etiket(string metin)
        {
            TextBlock t = new TextBlock();
            t.Text = metin;
            t.FontSize = 12.5;
            t.Margin = new Thickness(0, 0, 0, 6);
            t.Foreground = Tema.F("TextSecondaryBrush");
            return t;
        }

        bool KimlikKaydet()
        {
            string k = kutuKullanici.Text.Trim();
            string s = kutuSifre.Password;

            if (k.Length == 0)
            {
                MessageBox.Show("Kullanıcı adı boş bırakılamaz.", "Eksik bilgi",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            ayKullanici = k;

            // Kisayolu guncel kullanici adiyla yeniden yaz
            try { RdpYaz(ayTunel, ayRdp, ayDomain, k); } catch { }

            if (s.Length > 0)
            {
                try { RdpKimligiKaydet(ayRdp, ayDomain + "\\" + k, s); }
                catch (Exception ex)
                {
                    MessageBox.Show("Şifre kimlik kasasına kaydedilemedi:\r\n" + ex.Message
                        + "\r\n\r\nUzak masaüstüne bağlanırken şifrenizi elle girebilirsiniz.",
                        "Uyarı", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            return true;
        }

        // ═════════════════════════════════════════════════════════
        //  4) Bitti
        // ═════════════════════════════════════════════════════════
        void SayfaBitti()
        {
            AdimVurgula(3);
            bBaslik.Text = "Hazırsınız";
            bAlt.Text = "Son olarak FortiClient'ta kullanıcı bilgilerinizi bir kez tanıtmanız gerekiyor.";
            govde.Children.Clear();

            /*  Bu adimlar sahada olculdu, tahmin degil. Iki tanesi
             *  kacinilmaz ve musteriye onceden soylenmezse destek
             *  cagrisina donuyor:
             *   · Kullanici adini biz yazamiyoruz. FortiClient onu
             *     DATA1 icinde makineye bagli sifreli tutuyor; kayit
             *     defterindeki promptusername=0 tek basina "Save login"
             *     secmeye yetmiyor, kullanici Edit'ten secmek zorunda.
             *   · Sifre kaydetme secenegi ILK baglantida cikmiyor,
             *     ancak ikinci baglantida beliriyor.                   */
            if (armAtlandi)
            {
                bBaslik.Text = "VPN programı kurulamadı";
                bAlt.Text = "Bu bilgisayar ARM işlemcili. Uzak masaüstü kısayolunuz hazır, "
                          + "ancak VPN bağlantısı için bizimle iletişime geçmeniz gerekiyor.";
                BittiSatiri("1", "Kullandığımız VPN programı ARM işlemcili bilgisayarlara "
                               + "kurulamıyor; bu bir ayar sorunu değil, uyumluluk sınırı.");
                BittiSatiri("2", "Size uygun bir bağlantı yöntemi hazırlayabilmemiz için "
                               + "bizi arayın — bu bilgisayara özel bir çözüm gerekiyor.");
                BittiSatiri("3", "Masaüstündeki \"" + ayTunel + "\" kısayolu oluşturuldu; "
                               + "VPN bağlantısı sağlandıktan sonra çalışacak.");

                TextBlock armSon = new TextBlock();
                armSon.Text = "Kayıt dosyasını bize göndermeniz teşhisi hızlandırır.";
                armSon.FontSize = 12;
                armSon.Margin = new Thickness(0, 14, 0, 0);
                armSon.Foreground = Tema.F("TextMutedBrush");
                govde.Children.Add(armSon);

                dugmeIleri.Content = "Kapat";
                dugmeGeri.Visibility = Visibility.Visible;
                dugmeGeri.Content = "Kaydı Masaüstüne Al";
                dugmeGeri.MinWidth = 170;
                dugmeGeri.Click -= KapatTiklandi;
                dugmeGeri.Click -= KayitKaydet;
                dugmeGeri.Click += KayitKaydet;
                durumMetni.Text = "";
                return;
            }

            BittiSatiri("1", "FortiClient'ı açın. \"" + ayTunel
                           + "\" bağlantısının yanındaki düzenle (kalem) simgesine tıklayın.");
            BittiSatiri("2", "Authentication satırında \"Save login\" seçeneğini işaretleyin. "
                           + "Açılan kutuya kullanıcı adınızı yazıp Save deyin:");
            KullaniciAdiKutusu();
            BittiSatiri("3", "Bağlanın ve şifrenizi yazın. İlk bağlantıda şifre kaydetme "
                           + "seçeneği çıkmaz — bu normaldir.");
            BittiSatiri("4", "Bağlantıyı kesip ikinci kez bağlanın. Bu sefer şifreyi kaydetme "
                           + "seçeneği çıkacak, işaretleyin.");
            BittiSatiri("5", "Bağlantı kurulduktan sonra masaüstündeki \"" + ayTunel
                           + "\" kısayoluna çift tıklayın.");

            TextBlock son = new TextBlock();
            son.Text = "Uzak masaüstü şifreniz kaydedildi, o bir daha sorulmayacak. "
                     + "Sorun yaşarsanız bize ulaşın.";
            son.FontSize = 12;
            son.TextWrapping = TextWrapping.Wrap;
            son.Margin = new Thickness(0, 14, 0, 0);
            son.Foreground = Tema.F("TextMutedBrush");
            govde.Children.Add(son);

            dugmeIleri.Content = "Kapat";

            /*  Kayit dosyasini musteri bize gonderebilsin diye ikincil
             *  dugme burada "Kaydi Masaustune Al"a donusuyor. Kayit
             *  %ProgramData% altinda ve musteriye o yolu tarif etmek
             *  telefonda zor; masaustune tek tikla cikiyor.            */
            dugmeGeri.Visibility = Visibility.Visible;
            dugmeGeri.Content = "Kaydı Masaüstüne Al";
            dugmeGeri.MinWidth = 170;
            dugmeGeri.Click -= KapatTiklandi;
            dugmeGeri.Click -= KayitKaydet;
            dugmeGeri.Click += KayitKaydet;

            durumMetni.Text = "";
        }

        void KayitKaydet(object g, RoutedEventArgs e)
        {
            try
            {
                string yol = Gunluk.MasaustuneKopyala();
                if (yol == null)
                {
                    MessageBox.Show("Kayıt dosyası bulunamadı.", "Pusula Connect",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                durumMetni.Text = "Kayıt masaüstüne alındı: " + Path.GetFileName(yol);
                durumMetni.Foreground = Tema.F("SuccessBrush");
            }
            catch (Exception ex)
            {
                Gunluk.Hata("KayitKaydet", ex);
                MessageBox.Show("Kayıt kopyalanamadı:\r\n" + ex.Message, "Pusula Connect",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        void BittiSatiri(string no, string metin)
        {
            Grid g = new Grid();
            g.Margin = new Thickness(0, 0, 0, 9);
            g.ColumnDefinitions.Add(Sutun(22));
            g.ColumnDefinitions.Add(Sutun(-1));

            TextBlock n = new TextBlock();
            n.Text = no;
            n.FontSize = 12.5;
            n.FontWeight = FontWeights.SemiBold;
            n.Foreground = Tema.F("BrandPrimaryBrush");
            g.Children.Add(n);

            TextBlock m = new TextBlock();
            m.Text = metin;
            m.FontSize = 12.5;
            m.TextWrapping = TextWrapping.Wrap;
            m.Foreground = Tema.F("TextPrimaryBrush");
            Grid.SetColumn(m, 1);
            g.Children.Add(m);

            govde.Children.Add(g);
        }

        /// Kullanici adi FortiClient'a ELLE yazilacagi icin one cikarilir;
        /// duz metin arasinda kaybolursa yanlis yaziliyor.
        void KullaniciAdiKutusu()
        {
            Border kutu = new Border();
            kutu.Background = Tema.F("HoverBackgroundBrush");
            kutu.BorderBrush = Tema.F("BrandPrimaryBrush");
            kutu.BorderThickness = new Thickness(1);
            kutu.CornerRadius = new CornerRadius(6);
            kutu.Padding = new Thickness(12, 8, 12, 8);
            kutu.Margin = new Thickness(22, 1, 0, 11);
            kutu.HorizontalAlignment = HorizontalAlignment.Left;

            TextBlock t = new TextBlock();
            t.Text = ayKullanici;
            t.FontFamily = Tema.Mono;
            t.FontSize = 13.5;
            t.FontWeight = FontWeights.SemiBold;
            t.Foreground = Tema.F("BrandSecondaryBrush");
            kutu.Child = t;

            govde.Children.Add(kutu);
        }

        // ─────────────────────────────────────────────────────────
        void KapatTiklandi(object g, RoutedEventArgs e) { Close(); }

        void IleriTiklandi(object g, RoutedEventArgs e)
        {
            if (aktifAdim == 0) SayfaKurulum();
            else if (aktifAdim == 1) SayfaKimlik();
            else if (aktifAdim == 2) { if (KimlikKaydet()) SayfaBitti(); }
            else Close();
        }

        // ═════════════════════════════════════════════════════════
        //  Sistem islemleri
        // ═════════════════════════════════════════════════════════

        /*  DATA1 alanina DOKUNULMUYOR: kullanici adi ve sifreyi tutan
         *  "EncLM ..." blobu makineye bagli anahtarla sifreli, disaridan
         *  yazilamaz. Kullanici ilk baglantida bilgilerini bir kez girer,
         *  FortiClient blobu kendisi olusturur.                          */
        static void VpnProfiliYaz(string tunel, string sunucu)
        {
            RegistryKey k = Registry.LocalMachine.CreateSubKey(
                @"SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels\" + tunel);
            if (k == null) throw new Exception("Kayıt defteri anahtarı açılamadı");
            using (k)
            {
                k.SetValue("Server", sunucu, RegistryValueKind.String);
                k.SetValue("Description", tunel, RegistryValueKind.String);

                /*  promptusername = 0  ->  FortiClient'ta "Save login".
                 *  1 yapilirsa "Prompt on login" olur ve kullanici adi
                 *  HER baglantida yeniden sorulur — istedigimiz bu degil.
                 *  0'da kullanici adi ilk girildiginde FortiClient kendi
                 *  DATA1 blobuna yaziyor ve bir daha sormuyor. Zaten
                 *  sahadaki calisan profillerin hepsi 0.                 */
                k.SetValue("promptusername", 0, RegistryValueKind.DWord);
                k.SetValue("promptcertificate", 0, RegistryValueKind.DWord);
                k.SetValue("ServerCert", "0", RegistryValueKind.String);
                k.SetValue("dual_stack", 0, RegistryValueKind.DWord);
                k.SetValue("sso_enabled", 0, RegistryValueKind.DWord);
                k.SetValue("use_external_browser", 0, RegistryValueKind.DWord);
                k.SetValue("azure_auto_login", 0, RegistryValueKind.DWord);
            }
        }

        /*  .rdp duz metin; SIFRE ICERMEZ. Ortak masaustune yaziliyor ki
         *  makinedeki her kullanici gorsun.                             */
        static string RdpYaz(string ad, string sunucu, string domain, string kullanici)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("full address:s:" + sunucu);
            if (kullanici != null && kullanici.Length > 0)
                sb.AppendLine("username:s:" + domain + "\\" + kullanici);
            sb.AppendLine("screen mode id:i:2");
            sb.AppendLine("use multimon:i:0");
            sb.AppendLine("session bpp:i:32");
            sb.AppendLine("compression:i:1");
            sb.AppendLine("keyboardhook:i:2");
            sb.AppendLine("audiocapturemode:i:0");
            sb.AppendLine("audiomode:i:2");
            /*  Yerel kaynak yonlendirmeleri — Terminal 1'deki mevcut
             *  kullanicilarin ayariyla ayni olsun diye acik birakiliyor.
             *  SURUCULER BILEREK KAPALI (drivestoredirect bos): musteri
             *  diskini oturuma bagladigimizda hem guvenlik hem de yavas
             *  baglantida gozle gorulur yavaslama oluyor.               */
            sb.AppendLine("redirectprinters:i:1");
            sb.AppendLine("redirectclipboard:i:1");
            sb.AppendLine("redirectsmartcards:i:1");   // Smart cards / Windows Hello
            sb.AppendLine("redirectwebauthn:i:1");     // WebAuthn (guvenlik anahtarlari)
            sb.AppendLine("redirectcomports:i:1");     // Ports (COM/LPT)
            sb.AppendLine("drivestoredirect:s:");      // Surucular: kapali
            sb.AppendLine("camerastoredirect:s:*");    // Video yakalama aygitlari
            sb.AppendLine("devicestoredirect:s:*");    // Diger PnP aygitlari
            sb.AppendLine("autoreconnection enabled:i:1");
            sb.AppendLine("authentication level:i:2");
            sb.AppendLine("prompt for credentials:i:0");
            sb.AppendLine("negotiate security layer:i:1");
            sb.AppendLine("bandwidthautodetect:i:1");
            sb.AppendLine("networkautodetect:i:1");

            /*  Once ortak masaustu (makinedeki her kullanici gorsun).
             *  Yolun bos gelmesi degil, YAZMANIN patlamasi da mumkun —
             *  program yonetici haklariyla calismiyorsa C:\Users\Public\
             *  Desktop'a erisim reddediliyor. O durumda sessizce kendi
             *  masaustune dusuyoruz; kisayolsuz kalmaktan iyidir.        */
            string ortak = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            string kendi = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            if (ortak != null && ortak.Length > 0)
            {
                try
                {
                    string y = Path.Combine(ortak, ad + ".rdp");
                    File.WriteAllText(y, sb.ToString(), Encoding.Unicode);
                    return y;
                }
                catch { }
            }

            string dosya = Path.Combine(kendi, ad + ".rdp");
            File.WriteAllText(dosya, sb.ToString(), Encoding.Unicode);
            return dosya;
        }

        // ── Windows kimlik kasasi (CredWrite) ──
        // cmdkey yerine API: sifre komut satirinda gorunmesin.
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct CREDENTIAL
        {
            public uint Flags; public uint Type;
            public string TargetName; public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public uint CredentialBlobSize; public IntPtr CredentialBlob;
            public uint Persist; public uint AttributeCount;
            public IntPtr Attributes; public string TargetAlias; public string UserName;
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

        static void RdpKimligiKaydet(string sunucu, string kullanici, string sifre)
        {
            byte[] blob = Encoding.Unicode.GetBytes(sifre);
            IntPtr p = Marshal.AllocCoTaskMem(blob.Length);
            try
            {
                Marshal.Copy(blob, 0, p, blob.Length);
                CREDENTIAL c = new CREDENTIAL();
                c.Type = 2;                       // CRED_TYPE_DOMAIN_PASSWORD
                c.TargetName = "TERMSRV/" + sunucu;
                c.CredentialBlob = p;
                c.CredentialBlobSize = (uint)blob.Length;
                c.Persist = 2;                    // CRED_PERSIST_LOCAL_MACHINE
                c.UserName = kullanici;
                if (!CredWrite(ref c, 0))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            finally { Marshal.FreeCoTaskMem(p); }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    public class Program
    {
        [STAThread]
        public static void Main()
        {
            Gunluk.Baslat();

            Application uyg = new Application();
            uyg.ShutdownMode = ShutdownMode.OnMainWindowClose;

            // Beklenmedik hata da kayda dussun; aksi halde pencere kapanir
            // ve geriye hicbir iz kalmaz.
            AppDomain.CurrentDomain.UnhandledException += delegate(object o, UnhandledExceptionEventArgs e)
            {
                Exception ex = e.ExceptionObject as Exception;
                if (ex != null) Gunluk.Hata("YakalanmayanHata", ex);
            };
            uyg.DispatcherUnhandledException += delegate(object o,
                System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
            {
                Gunluk.Hata("ArayuzHatasi", e.Exception);
            };
            try
            {
                Tema.Yukle();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Tema yüklenemedi:\r\n" + ex.Message,
                    "Pusula Kurulum", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            uyg.Run(new AnaPencere());
        }
    }
}
