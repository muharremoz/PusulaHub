using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    /// <summary>
    /// FortiClient kurulumu + VPN profili YÖNETİCİ ister. Uygulamanın kendisi normal
    /// kullanıcıyla çalışır; bu adım için aynı exe "--vpn-kur" ile yönetici olarak ayrı
    /// süreçte başlatılır (UAC bir kez sorar). İki süreç C:\ProgramData\PusulaConnect2
    /// üzerinden konuşur: istek dosyası (profil) → durum dosyası (adım, yüzde, sonuç).
    /// ProgramData seçildi çünkü UAC'de başka bir yönetici hesabı girilirse o hesabın
    /// %LOCALAPPDATA%'sı farklı olur.
    /// </summary>
    internal static class VpnKurulumu
    {
        public static string Klasor
        {
            get
            {
                var k = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PusulaConnect2");
                Directory.CreateDirectory(k);
                return k;
            }
        }

        private static string IstekDosyasi => Path.Combine(Klasor, "vpn-istek.json");
        public static string DurumDosyasi => Path.Combine(Klasor, "vpn-durum.json");

        /// <summary>Normal süreçten: yönetici yardımcısını başlatır. Kullanıcı UAC'yi reddederse false.</summary>
        public static bool Baslat(JObject profil)
        {
            File.WriteAllText(IstekDosyasi, profil.ToString(), Encoding.UTF8);
            try { File.Delete(DurumDosyasi); } catch { }
            var exe = Assembly.GetExecutingAssembly().Location;
            try
            {
                Process.Start(new ProcessStartInfo(exe, "--vpn-kur") { Verb = "runas", UseShellExecute = true });
                return true;
            }
            catch (Win32Exception e) when (e.NativeErrorCode == 1223)   // ERROR_CANCELLED: UAC reddedildi
            {
                return false;
            }
        }

        public static JObject Durum()
        {
            try { return File.Exists(DurumDosyasi) ? JObject.Parse(File.ReadAllText(DurumDosyasi, Encoding.UTF8)) : null; }
            catch { return null; }   // yazılırken okundu — bir sonraki yoklamada
        }

        // ------------------------------------------------------------ yönetici süreci

        private static void DurumYaz(string adim, int yuzde, string mesaj, bool bitti = false, string hata = null, bool vpnKesildi = false)
        {
            var j = new JObject { ["adim"] = adim, ["yuzde"] = yuzde, ["mesaj"] = mesaj, ["bitti"] = bitti, ["hata"] = hata, ["vpnKesildi"] = vpnKesildi, ["zaman"] = DateTime.Now.ToString("s") };
            var gecici = DurumDosyasi + ".tmp";
            File.WriteAllText(gecici, j.ToString(Formatting.None), Encoding.UTF8);
            if (File.Exists(DurumDosyasi)) File.Replace(gecici, DurumDosyasi, null); else File.Move(gecici, DurumDosyasi);
        }

        // ------------------------------------------------------------ otomatik bağlanma

        private static string OtomatikDosyasi => Path.Combine(Klasor, "otomatik-baglan.txt");

        /// <summary>FortiClient'a otomatik bağlanma bu tünel için yazıldı mı (yönetici adımının bıraktığı işaret).</summary>
        public static bool OtomatikTanimli(string tunel)
        {
            try { return File.Exists(OtomatikDosyasi) && File.ReadAllText(OtomatikDosyasi).Trim() == tunel; }
            catch { return false; }
        }

        /// <summary>Normal süreçten: "--vpn-otomatik &lt;tünel&gt;" yönetici olarak; UAC reddedilirse -1, bitince çıkış kodu.</summary>
        public static async System.Threading.Tasks.Task<int> OtomatikYaz(string tunel)
        {
            Process p;
            try { p = Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, "--vpn-otomatik \"" + tunel + "\"") { Verb = "runas", UseShellExecute = true }); }
            catch (Win32Exception e) when (e.NativeErrorCode == 1223) { return -1; }
            using (p)
            {
                for (var i = 0; i < 1200 && !p.HasExited; i++) await System.Threading.Tasks.Task.Delay(100);
                return p.HasExited ? p.ExitCode : -2;
            }
        }

        /// <summary>"--vpn-otomatik &lt;tünel&gt;" yönetici süreci.</summary>
        public static int OtomatikYoneticiOlarak(string[] args)
        {
            var i = Array.IndexOf(args, "--vpn-otomatik");
            var tunel = i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
            if (string.IsNullOrWhiteSpace(tunel)) return 2;
            if (!Fortinet.OtomatikBaglanYaz(tunel)) return 1;
            try { File.WriteAllText(OtomatikDosyasi, tunel); } catch { }
            return 0;
        }

        /// <summary>"--vpn-kur" ile yönetici olarak çalışan kısım. Pencere açmaz.</summary>
        public static int YoneticiOlarakCalistir()
        {
            try
            {
                var p = JObject.Parse(File.ReadAllText(IstekDosyasi, Encoding.UTF8));
                var tunel = p.Value<string>("tunel") ?? "Pusula";
                var vpn = p.Value<string>("vpn");
                Gunluk.Yaz("VPN kurulumu (yönetici) başladı: tünel " + tunel + ", sunucu " + vpn);

                if (Fortinet.KuruluSurum() is string surum)
                {
                    Gunluk.Yaz("FortiClient zaten kurulu: " + surum);
                    DurumYaz("kurulum", 100, "FortiClient zaten kurulu (" + surum + ")");
                }
                else
                {
                    var arm = Fortinet.ArmMi();
                    var adres = arm ? p.Value<string>("msiurlArm") : p.Value<string>("msiurl");
                    if (string.IsNullOrWhiteSpace(adres))
                        throw new Exception(arm ? "Bu bilgisayar ARM işlemcili; uygun FortiClient paketi tanımlı değil. Pusula'ya haber verin." : "FortiClient indirme adresi tanımlı değil.");
                    DurumYaz("indirme", 0, "FortiClient indiriliyor…");
                    var msi = Fortinet.MsiIndir(adres, (y, hiz) =>
                        DurumYaz("indirme", y, "FortiClient indiriliyor… %" + y + (hiz > 0 ? " · " + (hiz / 1048576).ToString("F1") + " MB/sn" : "")));
                    DurumYaz("kurulum", 0, "FortiClient kuruluyor (birkaç dakika sürebilir)…");
                    Fortinet.MsiKur(msi);
                    try { File.Delete(msi); } catch { }
                }

                // Profil değişiyorsa ve tünel eski ayarla açıksa yazdıktan sonra kesilir (eski bağlantı yanıltıcı olmasın).
                var degisiyor = !Fortinet.ProfilDogru(tunel, vpn);
                DurumYaz("profil", 90, "VPN profili yazılıyor…");
                Fortinet.ProfilYaz(tunel, vpn);
                var kullanici = p.Value<string>("kullanici");
                if (!string.IsNullOrWhiteSpace(kullanici))
                {
                    DurumYaz("profil", 95, "Kullanıcı adı FortiClient'a yazılıyor…");
                    Fortinet.KullaniciAdiYaz(tunel, vpn, kullanici);   // başarısızsa elle girilir; kurulumu durdurmaz
                }
                var kesildi = false;
                if (degisiyor && Fortinet.SslVpnBagli())
                {
                    DurumYaz("profil", 97, "Eski VPN bağlantısı kapatılıyor…");
                    kesildi = Fortinet.SslVpnKes();
                    Gunluk.Yaz("VPN ayarı değişti, açık bağlantı " + (kesildi ? "kesildi" : "KESİLEMEDİ"));
                }
                Gunluk.Yaz("VPN kurulumu tamam");
                DurumYaz("tamam", 100, kesildi ? "VPN ayarı güncellendi; yeni ayarla yeniden bağlanın" : "VPN hazır", bitti: true, vpnKesildi: kesildi);
                return 0;
            }
            catch (Exception e)
            {
                Gunluk.Yaz("VPN kurulumu HATA: " + e);
                try { DurumYaz("hata", 0, null, bitti: true, hata: e.Message); } catch { }
                return 1;
            }
        }
    }
}
