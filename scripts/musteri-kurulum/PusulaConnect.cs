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
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;

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
            dugmeGeri.Click += delegate { Close(); };
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
            Nefes();
        }

        void KurulumuYurut()
        {
            bool sorunsuz = true;

            // ── 1) MSI: once yanindaki dosya, yoksa indir ──
            Isaretle(0, 0, null);
            string yerel = YanindakiMsi();
            if (yerel.Length > 0)
            {
                indirilenMsi = yerel;
                Isaretle(0, 1, "Kurulum dosyası pakette bulundu");
                cubuk.Deger = 25;
            }
            else if (ayMsiUrl.Length == 0)
            {
                Isaretle(0, 2, "Kurulum dosyası yok ve indirme adresi tanımsız");
                sorunsuz = false;
            }
            else
            {
                try { indirilenMsi = MsiIndir(ayMsiUrl); Isaretle(0, 1, "FortiClient VPN indirildi"); }
                catch (Exception ex) { Isaretle(0, 2, "İndirme hatası: " + KisaHata(ex)); sorunsuz = false; }
            }

            // ── 2) Kurulum ──
            Isaretle(1, 0, null);
            try
            {
                if (Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Fortinet\FortiClient") != null)
                    Isaretle(1, 1, "FortiClient VPN zaten kurulu");
                else if (indirilenMsi.Length == 0)
                { Isaretle(1, 3, "Kurulum atlandı (dosya yok)"); sorunsuz = false; }
                else
                {
                    ProcessStartInfo psi = new ProcessStartInfo("msiexec.exe",
                        "/i \"" + indirilenMsi + "\" /qn /norestart");
                    psi.UseShellExecute = false; psi.CreateNoWindow = true;
                    Process p = Process.Start(psi);
                    while (!p.HasExited) { Nefes(); System.Threading.Thread.Sleep(120); }
                    if (p.ExitCode == 0 || p.ExitCode == 3010) Isaretle(1, 1, "FortiClient VPN kuruldu");
                    else { Isaretle(1, 2, "Kurulum hatası (kod " + p.ExitCode + ")"); sorunsuz = false; }
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

            durumMetni.Text = sorunsuz ? "Kurulum tamamlandı." : "Kurulum bitti, bazı adımlar atlandı.";
            durumMetni.Foreground = sorunsuz ? Tema.F("SuccessBrush") : Tema.F("WarningBrush");
            dugmeIleri.IsEnabled = true;
            dugmeIleri.Content = "Devam";
        }

        string YanindakiMsi()
        {
            try
            {
                string[] d = Directory.GetFiles(Klasor(), "*.msi");
                for (int i = 0; i < d.Length; i++)
                    if (Path.GetFileName(d[i]).ToLowerInvariant().Contains("forti")) return d[i];
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
            string hedef = Path.Combine(Path.GetTempPath(), "FortiClientVPN.msi");
            if (File.Exists(hedef)) { try { File.Delete(hedef); } catch { } }

            indirmeBitti = false; indirmeHatasi = null;
            ServicePointManager.SecurityProtocol =
                SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;

            WebClient wc = new WebClient();
            wc.DownloadProgressChanged += delegate(object s, DownloadProgressChangedEventArgs e)
            {
                cubuk.Deger = e.ProgressPercentage * 0.25;
                Isaretle(0, 0, "FortiClient VPN indiriliyor — %" + e.ProgressPercentage
                    + "  (" + (e.BytesReceived / 1048576) + " / " + (e.TotalBytesToReceive / 1048576) + " MB)");
            };
            wc.DownloadFileCompleted += delegate(object s, AsyncCompletedEventArgs e)
            {
                indirmeHatasi = e.Error; indirmeBitti = true;
            };
            wc.DownloadFileAsync(new Uri(url), hedef);

            while (!indirmeBitti) { Nefes(); System.Threading.Thread.Sleep(60); }
            wc.Dispose();
            if (indirmeHatasi != null) throw indirmeHatasi;
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
            dugmeGeri.Visibility = Visibility.Collapsed;
            durumMetni.Text = "";
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
            Application uyg = new Application();
            uyg.ShutdownMode = ShutdownMode.OnMainWindowClose;
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
