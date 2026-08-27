/*  Pusula Bağlantı Kurulumu
 *  ------------------------
 *  Musteriye giden tek dosya (~20 KB). Sihirbaz akisi:
 *
 *      1. Karsilama      — ne yapilacagi ozetlenir
 *      2. Kurulum        — MSI indirilir, sessiz kurulur, VPN profili +
 *                          masaustu kisayolu olusturulur
 *      3. Kimlik         — kullanici adi/sifre alinir
 *      4. Bitti          — ne yapilacagi anlatilir
 *
 *  MSI GOMULU DEGIL, indiriliyor: 131 MB'lik dosyayi her musteriye
 *  gondermek yerine kendi sunucumuzdan cekiyoruz. Adres ayarlar.ini'de.
 *
 *  SIFRE HAKKINDA — iki taraf farkli davraniyor, sebebi teknik:
 *    · RDP  : sifre Windows kimlik kasasina yazilabiliyor (CredWrite),
 *             kullanici bir daha sormaz.
 *    · VPN  : FortiClient'in kimlik bilgisi alan bir komut satiri ya da
 *             API'si YOK; DATA1 alani da makineye bagli sifreli oldugu
 *             icin disaridan yazilamiyor. Bu yuzden VPN sifresi ilk
 *             baglantida FortiClient icinde bir kez elle girilir.
 *             (Arastirildi: FortiClient.exe yalnizca -connect/-proxy
 *             destekliyor; FCConfig disa aktarma da calismadi.)
 *
 *  DERLEME: derle.bat   (csc.exe / .NET Framework 4.x)
 *  C# 5 ile derlenir: string interpolation, ?. ve ifade govdeli uye YOK.
 */

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PusulaKurulum
{
    // ═══════════════════════════════════════════════════════════════
    //  Gorsel sabitler
    // ═══════════════════════════════════════════════════════════════
    static class Tema
    {
        public static readonly Color Kenar    = Color.FromArgb(23, 23, 23);
        public static readonly Color KenarAlt = Color.FromArgb(38, 38, 40);
        public static readonly Color Zemin    = Color.White;
        public static readonly Color Metin    = Color.FromArgb(23, 23, 23);
        public static readonly Color Solgun   = Color.FromArgb(115, 115, 122);
        public static readonly Color Cizgi    = Color.FromArgb(232, 232, 234);
        public static readonly Color Yesil    = Color.FromArgb(5, 122, 85);
        public static readonly Color Kirmizi  = Color.FromArgb(190, 30, 30);
        public static readonly Color Amber    = Color.FromArgb(180, 83, 9);

        public static Font Baslik  = new Font("Segoe UI Semibold", 15F);
        public static Font AltYazi = new Font("Segoe UI", 9F);
        public static Font Govde   = new Font("Segoe UI", 9.5F);
        public static Font Kucuk   = new Font("Segoe UI", 8.25F);
        public static Font Mono    = new Font("Consolas", 10F);
        public static Font Dugme   = new Font("Segoe UI Semibold", 9.75F);
    }

    /// Duz, modern buton — WinForms varsayilani kurumsal durmuyor.
    class DuzDugme : Button
    {
        public bool Ikincil = false;
        public DuzDugme()
        {
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Font = Tema.Dugme;
            Cursor = Cursors.Hand;
            Height = 38;
            SetStyle(ControlStyles.OptimizedDoubleBuffer, true);
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Color zemin = Ikincil ? Color.White : Tema.Kenar;
            Color yazi  = Ikincil ? Tema.Metin : Color.White;
            if (!Enabled) { zemin = Color.FromArgb(224, 224, 228); yazi = Tema.Solgun; }

            using (SolidBrush b = new SolidBrush(zemin))
                g.FillRectangle(b, 0, 0, Width, Height);
            if (Ikincil && Enabled)
                using (Pen p = new Pen(Tema.Cizgi))
                    g.DrawRectangle(p, 0, 0, Width - 1, Height - 1);

            TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), yazi,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    /// Ince ilerleme cubugu.
    class Ilerleme : Control
    {
        int _deger;
        public int Deger
        {
            get { return _deger; }
            set { _deger = Math.Max(0, Math.Min(100, value)); Invalidate(); }
        }
        public Ilerleme() { Height = 4; SetStyle(ControlStyles.OptimizedDoubleBuffer, true); }
        protected override void OnPaint(PaintEventArgs e)
        {
            using (SolidBrush b = new SolidBrush(Tema.Cizgi))
                e.Graphics.FillRectangle(b, 0, 0, Width, Height);
            int w = (int)(Width * (_deger / 100.0));
            using (SolidBrush b = new SolidBrush(Tema.Kenar))
                e.Graphics.FillRectangle(b, 0, 0, w, Height);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    public class AnaForm : Form
    {
        // ── Ayarlar ──
        string ayFirma = "", ayKullanici = "", ayVpn = "vpn.pusulanet.net:17443";
        string ayRdp = "10.15.2.5", ayTunel = "Pusula", ayDomain = "PUSULADC";
        string ayMsiUrl = "";

        // ── Arayuz ──
        Panel kenar, icerik;
        Label[] adimEtiket = new Label[4];
        Label[] adimNokta  = new Label[4];
        int aktifAdim = 0;

        Label  bBaslik, bAlt;
        Panel  govde;
        DuzDugme dugmeIleri, dugmeGeri;
        Ilerleme cubuk;
        Label  durumMetni;

        // ── Kurulum durumu ──
        string indirilenMsi = "";
        bool   kurulumTamam = false;
        TextBox kutuKullanici, kutuSifre;

        public AnaForm()
        {
            Text = "Pusula Bağlantı Kurulumu";
            ClientSize = new Size(660, 460);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Tema.Zemin;
            Font = Tema.Govde;

            AyarlariOku();
            ArayuzKur();
            SayfaKarsilama();
        }

        // ─────────────────────────────────────────────────────────
        static string Klasor() { return Path.GetDirectoryName(Application.ExecutablePath); }

        void AyarlariOku()
        {
            string ini = Path.Combine(Klasor(), "ayarlar.ini");
            if (!File.Exists(ini)) return;
            try
            {
                string[] sat = File.ReadAllLines(ini, Encoding.UTF8);
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
            catch { }
        }

        // ─────────────────────────────────────────────────────────
        //  Iskelet
        // ─────────────────────────────────────────────────────────
        void ArayuzKur()
        {
            kenar = new Panel();
            kenar.SetBounds(0, 0, 196, ClientSize.Height);
            kenar.BackColor = Tema.Kenar;
            Controls.Add(kenar);

            Label logo = new Label();
            logo.Text = "PUSULA";
            logo.Font = new Font("Segoe UI Semibold", 13F);
            logo.ForeColor = Color.White;
            logo.SetBounds(26, 30, 150, 24);
            kenar.Controls.Add(logo);

            Label logoAlt = new Label();
            logoAlt.Text = "Bağlantı Kurulumu";
            logoAlt.Font = Tema.Kucuk;
            logoAlt.ForeColor = Color.FromArgb(150, 150, 158);
            logoAlt.SetBounds(27, 54, 160, 16);
            kenar.Controls.Add(logoAlt);

            string[] adlar = { "Karşılama", "Kurulum", "Kullanıcı bilgileri", "Tamamlandı" };
            int y = 116;
            for (int i = 0; i < adlar.Length; i++)
            {
                Label nokta = new Label();
                nokta.Text = "○";
                nokta.Font = new Font("Segoe UI", 9F);
                nokta.ForeColor = Color.FromArgb(110, 110, 118);
                nokta.SetBounds(26, y, 18, 20);
                kenar.Controls.Add(nokta);
                adimNokta[i] = nokta;

                Label e = new Label();
                e.Text = adlar[i];
                e.Font = Tema.Kucuk;
                e.ForeColor = Color.FromArgb(140, 140, 148);
                e.SetBounds(48, y + 2, 140, 18);
                kenar.Controls.Add(e);
                adimEtiket[i] = e;

                y += 34;
            }

            icerik = new Panel();
            icerik.SetBounds(196, 0, ClientSize.Width - 196, ClientSize.Height);
            icerik.BackColor = Tema.Zemin;
            Controls.Add(icerik);

            bBaslik = new Label();
            bBaslik.Font = Tema.Baslik;
            bBaslik.ForeColor = Tema.Metin;
            bBaslik.SetBounds(34, 34, 400, 28);
            icerik.Controls.Add(bBaslik);

            bAlt = new Label();
            bAlt.Font = Tema.AltYazi;
            bAlt.ForeColor = Tema.Solgun;
            bAlt.SetBounds(35, 62, 396, 36);
            icerik.Controls.Add(bAlt);

            govde = new Panel();
            govde.SetBounds(34, 108, 398, 246);
            govde.BackColor = Tema.Zemin;
            icerik.Controls.Add(govde);

            Panel ayirac = new Panel();
            ayirac.SetBounds(0, 372, icerik.Width, 1);
            ayirac.BackColor = Tema.Cizgi;
            icerik.Controls.Add(ayirac);

            cubuk = new Ilerleme();
            cubuk.SetBounds(34, 386, 398, 4);
            cubuk.Visible = false;
            icerik.Controls.Add(cubuk);

            durumMetni = new Label();
            durumMetni.Font = Tema.Kucuk;
            durumMetni.ForeColor = Tema.Solgun;
            durumMetni.SetBounds(34, 396, 260, 32);
            icerik.Controls.Add(durumMetni);

            dugmeIleri = new DuzDugme();
            dugmeIleri.SetBounds(icerik.Width - 34 - 132, 398, 132, 38);
            dugmeIleri.Click += new EventHandler(IleriTiklandi);
            icerik.Controls.Add(dugmeIleri);

            dugmeGeri = new DuzDugme();
            dugmeGeri.Ikincil = true;
            dugmeGeri.Text = "Kapat";
            dugmeGeri.SetBounds(icerik.Width - 34 - 132 - 96, 398, 88, 38);
            dugmeGeri.Click += delegate { Close(); };
            icerik.Controls.Add(dugmeGeri);
        }

        void AdimVurgula(int i)
        {
            aktifAdim = i;
            for (int k = 0; k < adimNokta.Length; k++)
            {
                bool tamam = k < i, aktif = k == i;
                adimNokta[k].Text = tamam ? "✓" : (aktif ? "●" : "○");
                adimNokta[k].ForeColor = tamam ? Color.FromArgb(52, 199, 123)
                                       : (aktif ? Color.White : Color.FromArgb(110, 110, 118));
                adimEtiket[k].ForeColor = aktif ? Color.White
                                        : (tamam ? Color.FromArgb(175, 175, 182) : Color.FromArgb(120, 120, 128));
                adimEtiket[k].Font = aktif ? new Font("Segoe UI Semibold", 8.25F) : Tema.Kucuk;
            }
        }

        // ─────────────────────────────────────────────────────────
        //  1) Karsilama
        // ─────────────────────────────────────────────────────────
        void SayfaKarsilama()
        {
            AdimVurgula(0);
            bBaslik.Text = "Hoş geldiniz";
            bAlt.Text = "Bu program, uzak masaüstü bağlantınız için gereken\r\nayarları sizin yerinize yapar.";
            govde.Controls.Clear();

            int y = 4;
            BilgiSatiri("Firma",           ayFirma.Length > 0 ? ayFirma : "—", ref y);
            BilgiSatiri("Kullanıcı",       ayKullanici.Length > 0 ? ayKullanici : "kurulum sırasında sorulacak", ref y);
            BilgiSatiri("VPN sunucusu",    ayVpn, ref y);
            BilgiSatiri("Uzak masaüstü",   ayRdp, ref y);

            y += 12;
            Label n = new Label();
            n.Text = "Yapılacaklar: FortiClient VPN kurulumu · VPN profili ·\r\nmasaüstü kısayolu · kullanıcı bilgilerinin kaydedilmesi";
            n.Font = Tema.Kucuk;
            n.ForeColor = Tema.Solgun;
            n.SetBounds(0, y, 396, 34);
            govde.Controls.Add(n);

            dugmeIleri.Text = "Kuruluma Başla";
            dugmeIleri.Enabled = true;
            dugmeGeri.Text = "Kapat";
            dugmeGeri.Visible = true;
            cubuk.Visible = false;
            durumMetni.Text = "";
        }

        void BilgiSatiri(string ad, string deger, ref int y)
        {
            Label a = new Label();
            a.Text = ad; a.Font = Tema.Kucuk; a.ForeColor = Tema.Solgun;
            a.SetBounds(0, y + 3, 110, 16);
            govde.Controls.Add(a);

            Label d = new Label();
            d.Text = deger; d.Font = Tema.Mono; d.ForeColor = Tema.Metin;
            d.SetBounds(112, y, 284, 20);
            govde.Controls.Add(d);

            Panel c = new Panel();
            c.SetBounds(0, y + 24, 396, 1); c.BackColor = Tema.Cizgi;
            govde.Controls.Add(c);

            y += 34;
        }

        // ─────────────────────────────────────────────────────────
        //  2) Kurulum
        // ─────────────────────────────────────────────────────────
        List<Label> islemNokta = new List<Label>();
        List<Label> islemMetin = new List<Label>();

        void SayfaKurulum()
        {
            AdimVurgula(1);
            bBaslik.Text = "Kurulum yapılıyor";
            bAlt.Text = "Bu işlem birkaç dakika sürebilir.\r\nLütfen pencereyi kapatmayın.";
            govde.Controls.Clear();
            islemNokta.Clear(); islemMetin.Clear();

            string[] islemler = {
                "FortiClient VPN indiriliyor",
                "FortiClient VPN kuruluyor",
                "VPN profili oluşturuluyor",
                "Masaüstü kısayolu oluşturuluyor"
            };
            int y = 6;
            for (int i = 0; i < islemler.Length; i++)
            {
                Label n = new Label();
                n.Text = "○"; n.Font = new Font("Segoe UI", 10F); n.ForeColor = Tema.Solgun;
                n.SetBounds(0, y, 20, 20);
                govde.Controls.Add(n); islemNokta.Add(n);

                Label m = new Label();
                m.Text = islemler[i]; m.Font = Tema.Govde; m.ForeColor = Tema.Solgun;
                m.SetBounds(24, y + 2, 372, 18);
                govde.Controls.Add(m); islemMetin.Add(m);

                y += 30;
            }

            dugmeIleri.Enabled = false;
            dugmeIleri.Text = "Lütfen bekleyin";
            dugmeGeri.Visible = false;
            cubuk.Visible = true; cubuk.Deger = 0;
            Application.DoEvents();

            KurulumuYurut();
        }

        void Isaretle(int i, int durum, string metin)   // 0=calisiyor 1=tamam 2=hata 3=atlandi
        {
            if (i < 0 || i >= islemNokta.Count) return;
            Label n = islemNokta[i];
            if (durum == 0) { n.Text = "→"; n.ForeColor = Tema.Metin; }
            else if (durum == 1) { n.Text = "✓"; n.ForeColor = Tema.Yesil; }
            else if (durum == 2) { n.Text = "✕"; n.ForeColor = Tema.Kirmizi; }
            else { n.Text = "–"; n.ForeColor = Tema.Amber; }
            islemMetin[i].ForeColor = Tema.Metin;
            if (metin != null && metin.Length > 0) islemMetin[i].Text = metin;
            Application.DoEvents();
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
                    while (!p.HasExited) { Application.DoEvents(); System.Threading.Thread.Sleep(120); }
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

            kurulumTamam = sorunsuz;
            durumMetni.Text = sorunsuz ? "Kurulum tamamlandı." : "Kurulum bitti, bazı adımlar atlandı.";
            durumMetni.ForeColor = sorunsuz ? Tema.Yesil : Tema.Amber;
            dugmeIleri.Enabled = true;
            dugmeIleri.Text = "Devam";
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

        /*  Indirme: WebClient + olay tabanli ilerleme. Buyuk dosyada
         *  pencerenin donmamasi icin DoEvents ile bekleniyor.          */
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
                cubuk.Deger = (int)(e.ProgressPercentage * 0.25);
                Isaretle(0, 0, "FortiClient VPN indiriliyor — %" + e.ProgressPercentage
                    + "  (" + (e.BytesReceived / 1048576) + " / " + (e.TotalBytesToReceive / 1048576) + " MB)");
            };
            wc.DownloadFileCompleted += delegate(object s, AsyncCompletedEventArgs e)
            {
                indirmeHatasi = e.Error; indirmeBitti = true;
            };
            wc.DownloadFileAsync(new Uri(url), hedef);

            while (!indirmeBitti) { Application.DoEvents(); System.Threading.Thread.Sleep(60); }
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

        // ─────────────────────────────────────────────────────────
        //  3) Kullanici bilgileri
        // ─────────────────────────────────────────────────────────
        void SayfaKimlik()
        {
            AdimVurgula(2);
            bBaslik.Text = "Kullanıcı bilgileriniz";
            bAlt.Text = "Bu bilgiler yalnızca bu bilgisayarda saklanır,\r\nhiçbir yere gönderilmez.";
            govde.Controls.Clear();
            cubuk.Visible = false;
            durumMetni.Text = "";

            int y = 6;
            Label l1 = new Label();
            l1.Text = "Kullanıcı adı"; l1.Font = Tema.Kucuk; l1.ForeColor = Tema.Solgun;
            l1.SetBounds(0, y, 200, 16); govde.Controls.Add(l1);
            kutuKullanici = new TextBox();
            kutuKullanici.SetBounds(0, y + 20, 396, 26);
            kutuKullanici.BorderStyle = BorderStyle.FixedSingle;
            kutuKullanici.Font = Tema.Mono;
            kutuKullanici.Text = ayKullanici;
            govde.Controls.Add(kutuKullanici);

            y += 60;
            Label l2 = new Label();
            l2.Text = "Şifre"; l2.Font = Tema.Kucuk; l2.ForeColor = Tema.Solgun;
            l2.SetBounds(0, y, 200, 16); govde.Controls.Add(l2);
            kutuSifre = new TextBox();
            kutuSifre.SetBounds(0, y + 20, 396, 26);
            kutuSifre.BorderStyle = BorderStyle.FixedSingle;
            kutuSifre.Font = Tema.Mono;
            kutuSifre.UseSystemPasswordChar = true;
            govde.Controls.Add(kutuSifre);

            y += 66;
            Label bilgi = new Label();
            bilgi.Text = "Şifreniz uzak masaüstü için Windows kimlik kasasına kaydedilir;\r\n"
                       + "bir daha sorulmaz. VPN şifresini ise FortiClient içinde ilk\r\n"
                       + "bağlantıda bir kez yazmanız gerekir (Fortinet buna izin veriyor).";
            bilgi.Font = Tema.Kucuk; bilgi.ForeColor = Tema.Solgun;
            bilgi.SetBounds(0, y, 396, 52);
            govde.Controls.Add(bilgi);

            dugmeIleri.Text = "Kaydet ve Bitir";
            dugmeIleri.Enabled = true;
            dugmeGeri.Visible = false;
        }

        bool KimlikKaydet()
        {
            string k = kutuKullanici.Text.Trim();
            string s = kutuSifre.Text;
            if (k.Length == 0)
            {
                MessageBox.Show("Kullanıcı adı boş bırakılamaz.", "Eksik bilgi",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                        "Uyarı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            return true;
        }

        // ─────────────────────────────────────────────────────────
        //  4) Bitti
        // ─────────────────────────────────────────────────────────
        void SayfaBitti()
        {
            AdimVurgula(3);
            bBaslik.Text = "Hazırsınız";
            bAlt.Text = "Bağlanmak için aşağıdaki iki adımı izleyin.";
            govde.Controls.Clear();

            string[] adimlar = {
                "1.  FortiClient'ı açın, \"" + ayTunel + "\" bağlantısını seçin.",
                "2.  Kullanıcı adınız hazır: " + ayKullanici,
                "     Şifrenizi bir kez yazın ve \"kaydet\" işaretleyin.",
                "3.  Bağlandıktan sonra masaüstündeki",
                "     \"" + ayTunel + "\" kısayoluna çift tıklayın."
            };
            int y = 8;
            for (int i = 0; i < adimlar.Length; i++)
            {
                Label l = new Label();
                l.Text = adimlar[i];
                l.Font = (i == 1) ? new Font("Consolas", 9.5F) : Tema.Govde;
                l.ForeColor = Tema.Metin;
                l.SetBounds(0, y, 396, 20);
                govde.Controls.Add(l);
                y += 24;
            }

            y += 10;
            Label son = new Label();
            son.Text = "Sorun yaşarsanız bize ulaşın.";
            son.Font = Tema.Kucuk; son.ForeColor = Tema.Solgun;
            son.SetBounds(0, y, 396, 18);
            govde.Controls.Add(son);

            dugmeIleri.Text = "Kapat";
            dugmeGeri.Visible = false;
            durumMetni.Text = "";
        }

        // ─────────────────────────────────────────────────────────
        void IleriTiklandi(object g, EventArgs e)
        {
            if (aktifAdim == 0) SayfaKurulum();
            else if (aktifAdim == 1) SayfaKimlik();
            else if (aktifAdim == 2) { if (KimlikKaydet()) SayfaBitti(); }
            else Close();
        }

        // ═════════════════════════════════════════════════════════
        //  Sistem islemleri
        // ═════════════════════════════════════════════════════════

        /*  DATA1 alanina DOKUNULMUYOR: kullanici adini tutan "EncLM ..."
         *  blobu makineye bagli anahtarla sifreli, disaridan yazilamaz.
         *  promptusername = 1 -> FortiClient bir kez sorar.              */
        static void VpnProfiliYaz(string tunel, string sunucu)
        {
            RegistryKey k = Registry.LocalMachine.CreateSubKey(
                @"SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels\" + tunel);
            if (k == null) throw new Exception("Kayıt defteri anahtarı açılamadı");
            using (k)
            {
                k.SetValue("Server", sunucu, RegistryValueKind.String);
                k.SetValue("Description", tunel, RegistryValueKind.String);
                k.SetValue("promptusername", 1, RegistryValueKind.DWord);
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
            sb.AppendLine("redirectprinters:i:1");
            sb.AppendLine("redirectclipboard:i:1");
            sb.AppendLine("redirectsmartcards:i:0");
            sb.AppendLine("drivestoredirect:s:");
            sb.AppendLine("autoreconnection enabled:i:1");
            sb.AppendLine("authentication level:i:2");
            sb.AppendLine("prompt for credentials:i:0");
            sb.AppendLine("negotiate security layer:i:1");
            sb.AppendLine("bandwidthautodetect:i:1");
            sb.AppendLine("networkautodetect:i:1");

            string mu = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            if (mu == null || mu.Length == 0)
                mu = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string dosya = Path.Combine(mu, ad + ".rdp");
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

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new AnaForm());
        }
    }
}
