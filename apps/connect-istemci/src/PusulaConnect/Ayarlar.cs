using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    /// <summary>
    /// Kullanıcının uygulama ayarları (Ayarlar sayfası). %LOCALAPPDATA%\PusulaConnect2\ayarlar.json.
    /// "Windows ile başlat" dosyada tutulmaz: gerçeği HKCU\...\Run kaydıdır (kullanıcı orayı başka yerden
    /// de kapatabilir). Sürücü yönlendirme BİLEREK ayar değil — her zaman kapalı.
    /// </summary>
    internal sealed class Ayarlar
    {
        /// <summary>Oturum açılınca doğrudan tam ekrana geç.</summary>
        public bool TamEkran { get; set; }
        public bool Yazici { get; set; } = true;
        public bool Pano { get; set; } = true;
        /// <summary>Uzak oturumun sesi bu bilgisayarda çalınsın.</summary>
        public bool Ses { get; set; }
        /// <summary>Uygulama açılınca (sunucuya erişilebiliyorsa) kendiliğinden bağlan. 2FA açıksa kod yine sorulur.</summary>
        public bool OtomatikBaglan { get; set; }

        [JsonIgnore]
        public bool WindowsIleBaslat => BaslangicKaydi() != null;

        private static readonly object Kilit = new object();
        private static Ayarlar _simdiki;
        private static string Dosya => Path.Combine(Kimlik.Klasor, "ayarlar.json");
        private const string RunAnahtari = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunAdi = "Pusula Connect";

        public static Ayarlar Simdiki
        {
            get
            {
                lock (Kilit)
                {
                    if (_simdiki != null) return _simdiki;
                    try { _simdiki = File.Exists(Dosya) ? JsonConvert.DeserializeObject<Ayarlar>(File.ReadAllText(Dosya)) : null; }
                    catch (Exception e) { Gunluk.Yaz("Ayarlar okunamadı, varsayılanlar kullanılıyor: " + e.Message); }
                    return _simdiki ?? (_simdiki = new Ayarlar());
                }
            }
        }

        /// <summary>Arayüzden gelen kısmi değişiklik ({ tamEkran: true } gibi) uygulanır ve kaydedilir.</summary>
        public static void Degistir(JObject d)
        {
            if (d == null) return;
            lock (Kilit)
            {
                var a = Simdiki;
                bool? B(string ad) => d[ad]?.Type == JTokenType.Boolean ? d.Value<bool>(ad) : (bool?)null;
                a.TamEkran = B("tamEkran") ?? a.TamEkran;
                a.Yazici = B("yazici") ?? a.Yazici;
                a.Pano = B("pano") ?? a.Pano;
                a.Ses = B("ses") ?? a.Ses;
                a.OtomatikBaglan = B("otomatikBaglan") ?? a.OtomatikBaglan;
                var w = B("windowsIleBaslat");
                if (w.HasValue) BaslangicAyarla(w.Value);
                File.WriteAllText(Dosya, JsonConvert.SerializeObject(a, Formatting.Indented));
            }
            Gunluk.Yaz("Ayarlar değişti: " + d.ToString(Formatting.None));
        }

        public object Gorunum() => new
        {
            tamEkran = TamEkran,
            yazici = Yazici,
            pano = Pano,
            ses = Ses,
            otomatikBaglan = OtomatikBaglan,
            windowsIleBaslat = WindowsIleBaslat,
        };

        private static string BaslangicKaydi()
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(RunAnahtari)) return k?.GetValue(RunAdi) as string; }
            catch { return null; }
        }

        private static void BaslangicAyarla(bool ac)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunAnahtari))
            {
                if (ac) k.SetValue(RunAdi, "\"" + Application.ExecutablePath + "\"");
                else if (k.GetValue(RunAdi) != null) k.DeleteValue(RunAdi);
            }
        }
    }
}
