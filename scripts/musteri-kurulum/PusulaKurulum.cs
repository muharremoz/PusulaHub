/*  Pusula Musteri Kurulum
 *  ----------------------
 *  Musteriye giden tek dosya. Cift tiklanir; yonetici iznini manifest
 *  uzerinden kendisi ister. Yaptigi is:
 *      1) FortiClient VPN kurulumu (sessiz, yanindaki MSI'dan)
 *      2) VPN profilini olusturur (HKLM ... Sslvpn\Tunnels)
 *      3) Masaustune RDP kisayolu birakir
 *
 *  SIFRE GOMULMEZ. Kullanici adi hazir gelir, sifreyi kullanici ilk
 *  baglantida bir kez kendisi girer; FortiClient ve Windows kendi
 *  kasalarinda saklar.
 *
 *  Ayarlar yanindaki ayarlar.ini dosyasindan okunur; yoksa formdaki
 *  alanlardan elle girilebilir.
 *
 *  DERLEME: derle.bat  (csc.exe, .NET Framework 4.x)
 *  NOT: C# 5 ile derleniyor -- string interpolation ($""), ?. operatoru
 *  ve ifade govdeli uyeler KULLANILMAZ (bkz. CLAUDE.md agent kurallari).
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PusulaKurulum
{
    public class AnaForm : Form
    {
        // ── Renkler: Hub'in nötr tonlariyla ayni cizgide ──
        static readonly Color RenkZemin  = Color.FromArgb(247, 247, 248);
        static readonly Color RenkKart   = Color.White;
        static readonly Color RenkMetin  = Color.FromArgb(23, 23, 23);
        static readonly Color RenkSolgun = Color.FromArgb(107, 114, 128);
        static readonly Color RenkVurgu  = Color.FromArgb(23, 23, 23);
        static readonly Color RenkYesil  = Color.FromArgb(4, 120, 87);
        static readonly Color RenkKirmizi= Color.FromArgb(185, 28, 28);
        static readonly Color RenkCizgi  = Color.FromArgb(229, 229, 229);

        TextBox kutuFirma, kutuKullanici, kutuVpn, kutuRdp, kutuTunel;
        Button  dugmeKur;
        Panel   panelAdimlar;
        Label   etiketDurum;
        List<AdimSatiri> adimlar = new List<AdimSatiri>();

        string msiYolu = "";

        public AnaForm()
        {
            Text            = "Pusula Kurulum";
            ClientSize      = new Size(560, 560);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox     = false;
            StartPosition   = FormStartPosition.CenterScreen;
            BackColor       = RenkZemin;
            Font            = new Font("Segoe UI", 9F);

            KurArayuz();
            AyarlariYukle();
            MsiBul();
        }

        // ─────────────────────────────────────────────────────────────
        //  Arayuz
        // ─────────────────────────────────────────────────────────────
        void KurArayuz()
        {
            Panel baslik = new Panel();
            baslik.Dock = DockStyle.Top;
            baslik.Height = 68;
            baslik.BackColor = RenkKart;
            Controls.Add(baslik);

            Label l1 = new Label();
            l1.Text = "Pusula Bağlantı Kurulumu";
            l1.Font = new Font("Segoe UI Semibold", 14F);
            l1.ForeColor = RenkMetin;
            l1.SetBounds(24, 14, 400, 26);
            l1.AutoSize = false;
            baslik.Controls.Add(l1);

            Label l2 = new Label();
            l2.Text = "VPN ve uzak masaüstü bağlantınız hazırlanacak";
            l2.ForeColor = RenkSolgun;
            l2.Font = new Font("Segoe UI", 8.5F);
            l2.SetBounds(26, 40, 460, 18);
            baslik.Controls.Add(l2);

            Panel cizgi = new Panel();
            cizgi.Dock = DockStyle.Top; cizgi.Height = 1; cizgi.BackColor = RenkCizgi;
            Controls.Add(cizgi);
            cizgi.BringToFront();

            int y = 92;
            kutuFirma     = AlanEkle("Firma kodu",        ref y);
            kutuKullanici = AlanEkle("Kullanıcı adı",     ref y);
            kutuVpn       = AlanEkle("VPN sunucusu",      ref y);
            kutuRdp       = AlanEkle("Uzak masaüstü",     ref y);
            kutuTunel     = AlanEkle("Bağlantı adı",      ref y);

            dugmeKur = new Button();
            dugmeKur.Text = "Kurulumu Başlat";
            dugmeKur.SetBounds(24, y + 8, 512, 38);
            dugmeKur.FlatStyle = FlatStyle.Flat;
            dugmeKur.FlatAppearance.BorderSize = 0;
            dugmeKur.BackColor = RenkVurgu;
            dugmeKur.ForeColor = Color.White;
            dugmeKur.Font = new Font("Segoe UI Semibold", 10F);
            dugmeKur.Cursor = Cursors.Hand;
            dugmeKur.Click += new EventHandler(KurTiklandi);
            Controls.Add(dugmeKur);

            panelAdimlar = new Panel();
            panelAdimlar.SetBounds(24, y + 58, 512, 130);
            panelAdimlar.BackColor = RenkKart;
            panelAdimlar.BorderStyle = BorderStyle.FixedSingle;
            panelAdimlar.Visible = false;
            Controls.Add(panelAdimlar);

            etiketDurum = new Label();
            etiketDurum.SetBounds(24, y + 196, 512, 60);
            etiketDurum.ForeColor = RenkSolgun;
            etiketDurum.Font = new Font("Segoe UI", 8.5F);
            Controls.Add(etiketDurum);
        }

        TextBox AlanEkle(string etiket, ref int y)
        {
            Label l = new Label();
            l.Text = etiket;
            l.ForeColor = RenkSolgun;
            l.Font = new Font("Segoe UI", 8.5F);
            l.SetBounds(24, y, 150, 16);
            Controls.Add(l);

            TextBox t = new TextBox();
            t.SetBounds(180, y - 3, 356, 24);
            t.BorderStyle = BorderStyle.FixedSingle;
            t.Font = new Font("Consolas", 9.5F);
            Controls.Add(t);

            y += 32;
            return t;
        }

        // ─────────────────────────────────────────────────────────────
        //  Ayarlar
        // ─────────────────────────────────────────────────────────────
        static string Klasor()
        {
            return Path.GetDirectoryName(Application.ExecutablePath);
        }

        void AyarlariYukle()
        {
            // Varsayilanlar
            kutuVpn.Text   = "vpn.pusulanet.net:17443";
            kutuRdp.Text   = "10.15.2.5";
            kutuTunel.Text = "Pusula";

            string ini = Path.Combine(Klasor(), "ayarlar.ini");
            if (!File.Exists(ini)) return;

            try
            {
                string[] satirlar = File.ReadAllLines(ini, Encoding.UTF8);
                for (int i = 0; i < satirlar.Length; i++)
                {
                    string s = satirlar[i].Trim();
                    if (s.Length == 0 || s.StartsWith("#") || s.StartsWith(";")) continue;
                    int e = s.IndexOf('=');
                    if (e <= 0) continue;
                    string ad = s.Substring(0, e).Trim().ToLowerInvariant();
                    string dg = s.Substring(e + 1).Trim();

                    if (ad == "firma")     kutuFirma.Text     = dg;
                    else if (ad == "kullanici") kutuKullanici.Text = dg;
                    else if (ad == "vpn")  kutuVpn.Text       = dg;
                    else if (ad == "rdp")  kutuRdp.Text       = dg;
                    else if (ad == "tunel") kutuTunel.Text    = dg;
                }
            }
            catch { /* ini bozuksa varsayilanlarla devam */ }
        }

        void MsiBul()
        {
            try
            {
                string[] dosyalar = Directory.GetFiles(Klasor(), "*.msi");
                for (int i = 0; i < dosyalar.Length; i++)
                {
                    string ad = Path.GetFileName(dosyalar[i]).ToLowerInvariant();
                    if (ad.Contains("forti")) { msiYolu = dosyalar[i]; break; }
                }
            }
            catch { }

            if (msiYolu.Length == 0)
            {
                etiketDurum.ForeColor = RenkKirmizi;
                etiketDurum.Text = "Uyarı: FortiClient kurulum dosyası (.msi) bu klasörde bulunamadı.\r\n"
                                 + "VPN profili ve kısayol yine de oluşturulur, ancak program kurulmaz.";
            }
        }

        // ─────────────────────────────────────────────────────────────
        //  Adim gostergesi
        // ─────────────────────────────────────────────────────────────
        class AdimSatiri
        {
            public Label Isaret;
            public Label Metin;
        }

        void AdimlariHazirla(string[] basliklar)
        {
            panelAdimlar.Controls.Clear();
            adimlar.Clear();
            int y = 12;
            for (int i = 0; i < basliklar.Length; i++)
            {
                Label isaret = new Label();
                isaret.Text = "○";
                isaret.ForeColor = RenkSolgun;
                isaret.Font = new Font("Segoe UI", 10F);
                isaret.SetBounds(14, y, 22, 20);
                panelAdimlar.Controls.Add(isaret);

                Label metin = new Label();
                metin.Text = basliklar[i];
                metin.ForeColor = RenkSolgun;
                metin.SetBounds(38, y + 2, 450, 18);
                panelAdimlar.Controls.Add(metin);

                AdimSatiri a = new AdimSatiri();
                a.Isaret = isaret; a.Metin = metin;
                adimlar.Add(a);
                y += 26;
            }
            panelAdimlar.Visible = true;
            Application.DoEvents();
        }

        void AdimDurum(int i, bool basarili, string metin)
        {
            if (i < 0 || i >= adimlar.Count) return;
            AdimSatiri a = adimlar[i];
            a.Isaret.Text = basarili ? "✓" : "✕";
            a.Isaret.ForeColor = basarili ? RenkYesil : RenkKirmizi;
            a.Metin.ForeColor = RenkMetin;
            if (metin != null && metin.Length > 0) a.Metin.Text = metin;
            Application.DoEvents();
        }

        void AdimCalisiyor(int i)
        {
            if (i < 0 || i >= adimlar.Count) return;
            adimlar[i].Isaret.Text = "→";
            adimlar[i].Isaret.ForeColor = RenkMetin;
            adimlar[i].Metin.ForeColor = RenkMetin;
            Application.DoEvents();
        }

        // ─────────────────────────────────────────────────────────────
        //  Kurulum
        // ─────────────────────────────────────────────────────────────
        void KurTiklandi(object gonderen, EventArgs e)
        {
            string kullanici = kutuKullanici.Text.Trim();
            string vpn       = kutuVpn.Text.Trim();
            string rdp       = kutuRdp.Text.Trim();
            string tunel     = kutuTunel.Text.Trim();

            if (kullanici.Length == 0 || vpn.Length == 0 || rdp.Length == 0 || tunel.Length == 0)
            {
                MessageBox.Show("Kullanıcı adı, VPN sunucusu, uzak masaüstü ve bağlantı adı boş bırakılamaz.",
                                "Eksik bilgi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            dugmeKur.Enabled = false;
            dugmeKur.Text = "Kuruluyor…";
            etiketDurum.ForeColor = RenkSolgun;
            etiketDurum.Text = "";

            AdimlariHazirla(new string[] {
                "FortiClient VPN kuruluyor",
                "VPN profili oluşturuluyor",
                "Masaüstü kısayolu oluşturuluyor"
            });

            bool hepsiTamam = true;

            // 1) FortiClient
            AdimCalisiyor(0);
            try
            {
                if (Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Fortinet\FortiClient") != null)
                {
                    AdimDurum(0, true, "FortiClient VPN — zaten kurulu");
                }
                else if (msiYolu.Length == 0)
                {
                    AdimDurum(0, false, "FortiClient VPN — kurulum dosyası yok, atlandı");
                    hepsiTamam = false;
                }
                else
                {
                    ProcessStartInfo psi = new ProcessStartInfo("msiexec.exe",
                        "/i \"" + msiYolu + "\" /qn /norestart");
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    Process p = Process.Start(psi);
                    p.WaitForExit();
                    if (p.ExitCode == 0 || p.ExitCode == 3010)
                        AdimDurum(0, true, "FortiClient VPN — kuruldu");
                    else
                    {
                        AdimDurum(0, false, "FortiClient VPN — hata (kod " + p.ExitCode + ")");
                        hepsiTamam = false;
                    }
                }
            }
            catch (Exception ex)
            {
                AdimDurum(0, false, "FortiClient VPN — " + ex.Message);
                hepsiTamam = false;
            }

            // 2) VPN profili
            AdimCalisiyor(1);
            try
            {
                VpnProfiliYaz(tunel, vpn);
                AdimDurum(1, true, "VPN profili — " + tunel);
            }
            catch (Exception ex)
            {
                AdimDurum(1, false, "VPN profili — " + ex.Message);
                hepsiTamam = false;
            }

            // 3) RDP kisayolu
            string rdpYolu = "";
            AdimCalisiyor(2);
            try
            {
                rdpYolu = RdpDosyasiYaz(tunel, rdp, kullanici);
                AdimDurum(2, true, "Masaüstü kısayolu — " + Path.GetFileName(rdpYolu));
            }
            catch (Exception ex)
            {
                AdimDurum(2, false, "Masaüstü kısayolu — " + ex.Message);
                hepsiTamam = false;
            }

            dugmeKur.Text = hepsiTamam ? "Kurulum Tamamlandı" : "Kurulum Bitti (uyarılarla)";

            etiketDurum.ForeColor = RenkMetin;
            etiketDurum.Text =
                "Sırada: FortiClient'ı açın, \"" + tunel + "\" bağlantısını seçin.\r\n"
              + "Kullanıcı adınız: " + kullanici + "  —  şifrenizi bir kez girin, kaydedin.\r\n"
              + "VPN bağlandıktan sonra masaüstündeki kısayola çift tıklayın.";

            if (hepsiTamam)
            {
                MessageBox.Show(
                    "Kurulum tamamlandı.\r\n\r\n"
                  + "1) FortiClient'ı açıp \"" + tunel + "\" bağlantısını seçin\r\n"
                  + "2) Kullanıcı adı: " + kullanici + "\r\n"
                  + "   Şifrenizi girin (kaydettirirseniz bir daha sorulmaz)\r\n"
                  + "3) Bağlandıktan sonra masaüstündeki kısayola çift tıklayın",
                    "Hazır", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        /*  DATA1 alanina DOKUNULMUYOR: mevcut profillerde kullanici adini
         *  tutan "EncLM ..." blobu makineye bagli anahtarla sifreli, baska
         *  bilgisayara tasinamaz. promptusername = 1 vererek FortiClient'in
         *  kullanici adi/sifreyi bir kez sormasini sagliyoruz.            */
        static void VpnProfiliYaz(string tunelAdi, string sunucu)
        {
            string yol = @"SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels\" + tunelAdi;
            RegistryKey k = Registry.LocalMachine.CreateSubKey(yol);
            if (k == null) throw new Exception("Kayıt defteri anahtarı açılamadı");
            using (k)
            {
                k.SetValue("Server",               sunucu,   RegistryValueKind.String);
                k.SetValue("Description",          tunelAdi, RegistryValueKind.String);
                k.SetValue("promptusername",       1,        RegistryValueKind.DWord);
                k.SetValue("promptcertificate",    0,        RegistryValueKind.DWord);
                k.SetValue("ServerCert",           "0",      RegistryValueKind.String);
                k.SetValue("dual_stack",           0,        RegistryValueKind.DWord);
                k.SetValue("sso_enabled",          0,        RegistryValueKind.DWord);
                k.SetValue("use_external_browser", 0,        RegistryValueKind.DWord);
                k.SetValue("azure_auto_login",     0,        RegistryValueKind.DWord);
            }
        }

        /*  .rdp duz metindir ve SIFRE ICERMEZ. Kullanici adi hazir gelir;
         *  sifreyi Windows ilk baglantida sorar ve onay verilirse kendi
         *  kimlik kasasinda saklar.                                       */
        static string RdpDosyasiYaz(string kisayolAdi, string sunucu, string kullanici)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("full address:s:" + sunucu);
            sb.AppendLine("username:s:PUSULADC\\" + kullanici);
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

            // Ortak masaustu: makinedeki tum kullanicilar gorsun.
            string masaustu = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            if (masaustu == null || masaustu.Length == 0)
                masaustu = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

            string dosya = Path.Combine(masaustu, kisayolAdi + ".rdp");
            File.WriteAllText(dosya, sb.ToString(), Encoding.Unicode);
            return dosya;
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
