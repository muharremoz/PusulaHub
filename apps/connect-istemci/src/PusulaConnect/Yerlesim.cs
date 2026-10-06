using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PusulaConnect
{
    /// <summary>
    /// Kurulum programı yok (ilk sürüm): exe ilk açılışta kendini
    /// %LOCALAPPDATA%\Programs\Pusula Connect altına kopyalar, masaüstü + Başlat menüsü
    /// kısayolu oluşturur. Yönetici gerekmez. Kendini güncelleme de bu kopya üzerinde:
    /// çalışan exe yeniden adlandırılabilir (silinemez) → yeni exe yerine konur → yeniden başlar.
    /// </summary>
    internal static class Yerlesim
    {
        public static string KuruluKlasor => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Pusula Connect");
        public static string KuruluExe => Path.Combine(KuruluKlasor, "PusulaConnect.exe");
        public static string CalisanExe => Application.ExecutablePath;
        public static bool KurulukopyadanMi => string.Equals(Path.GetFullPath(CalisanExe), Path.GetFullPath(KuruluExe), StringComparison.OrdinalIgnoreCase);

        /// <summary>İndirilen exe'den açıldıysa kendini yerleştirir; kısayollar her açılışta onarılır.</summary>
        [System.Runtime.InteropServices.DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int olay, uint bayrak, IntPtr a, IntPtr b);

        /// <summary>Explorer'a "ilişkilendirmeler/ikonlar değişti" der — kısayollardaki eski ikon önbelleği tazelenir.</summary>
        public static void IkonlariTazele()
        {
            try { SHChangeNotify(0x08000000 /* SHCNE_ASSOCCHANGED */, 0 /* SHCNF_IDLIST */, IntPtr.Zero, IntPtr.Zero); }
            catch (Exception e) { Gunluk.Yaz("İkon önbelleği tazelenemedi: " + e.Message); }
        }

        public static void Yerles()
        {
            try
            {
                if (!KurulukopyadanMi)
                {
                    Directory.CreateDirectory(KuruluKlasor);
                    // Kurulu kopya daha yeniyse ezme (eski indirilmiş exe açılmış olabilir).
                    var yeniMi = !File.Exists(KuruluExe) || SurumKarsilastir(SurumOku(CalisanExe), SurumOku(KuruluExe)) >= 0;
                    if (yeniMi)
                    {
                        if (File.Exists(KuruluExe)) EskiyiKenaraAl(KuruluExe);
                        File.Copy(CalisanExe, KuruluExe, true);
                        Gunluk.Yaz("Kendini yerleştirdi: " + KuruluExe);
                    }
                }
                Kisayol(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Pusula Connect.lnk"));
                Kisayol(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Pusula Connect.lnk"));
                foreach (var eski in Directory.GetFiles(KuruluKlasor, "*.eski*")) { try { File.Delete(eski); } catch { } }
            }
            catch (Exception e) { Gunluk.Yaz("Yerleşme hatası: " + e.Message); }
        }

        private static void Kisayol(string yol)
        {
            try
            {
                // WScript.Shell — ek kütüphane gerektirmeyen tek yol (dynamic/Microsoft.CSharp yerine yansıma)
                var tur = Type.GetTypeFromProgID("WScript.Shell");
                var kabuk = Activator.CreateInstance(tur);
                var k = tur.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, kabuk, new object[] { yol });
                var kt = k.GetType();
                kt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, k, new object[] { KuruluExe });
                kt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, k, new object[] { KuruluKlasor });
                kt.InvokeMember("Description", BindingFlags.SetProperty, null, k, new object[] { "Pusula Connect" });
                kt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, k, new object[] { KuruluExe + ",0" });
                kt.InvokeMember("Save", BindingFlags.InvokeMethod, null, k, null);
            }
            catch (Exception e) { Gunluk.Yaz("Kısayol oluşturulamadı (" + yol + "): " + e.Message); }
        }

        private static string EskiyiKenaraAl(string exe)
        {
            var eski = exe + ".eski" + DateTime.Now.Ticks;
            File.Move(exe, eski);   // çalışıyor olsa da yeniden adlandırılabilir
            return eski;
        }

        /// <summary>Başlatılamayan yeni exe kenara (.engellendi), eski exe yerine.</summary>
        private static void GeriAl(string kenardaki)
        {
            try
            {
                var engelli = KuruluExe + ".engellendi";
                if (File.Exists(engelli)) File.Delete(engelli);
                if (File.Exists(KuruluExe)) File.Move(KuruluExe, engelli);
                if (kenardaki != null && File.Exists(kenardaki)) File.Move(kenardaki, KuruluExe);
                try { File.Delete(OncekiSurumDosyasi); } catch { }
                Gunluk.Yaz("Güncelleme geri alındı: yeni sürüm başlatılamadı, eski sürüm yerinde");
            }
            catch (Exception e) { Gunluk.Yaz("Güncelleme geri alınamadı: " + e.Message); }
        }

        public static string SurumOku(string exe)
        {
            try { var v = FileVersionInfo.GetVersionInfo(exe); return $"{v.FileMajorPart}.{v.FileMinorPart}.{v.FileBuildPart}"; }
            catch { return "0.0.0"; }
        }

        public static int SurumKarsilastir(string a, string b)
        {
            var pa = (a ?? "0").Split('.'); var pb = (b ?? "0").Split('.');
            for (var i = 0; i < 3; i++)
            {
                int.TryParse(i < pa.Length ? pa[i] : "0", out var x);
                int.TryParse(i < pb.Length ? pb[i] : "0", out var y);
                if (x != y) return x - y;
            }
            return 0;
        }

        private static string OncekiSurumDosyasi => Path.Combine(Kimlik.Klasor, "guncelleme-onceki.txt");

        /// <summary>Güncellemeden sonraki ilk açılışta önceki sürüm (bir kez döner, dosya silinir); yoksa null.</summary>
        public static string OncekiSurumAl()
        {
            try
            {
                if (!File.Exists(OncekiSurumDosyasi)) return null;
                var s = File.ReadAllText(OncekiSurumDosyasi).Trim();
                File.Delete(OncekiSurumDosyasi);
                return s == ServisIstemci.Surum ? null : s;
            }
            catch { return null; }
        }

        /// <summary>
        /// Yeni sürümü indirir, SHA-256'sını servisin bildirdiğiyle karşılaştırır, kurulu kopyanın yerine koyar
        /// ve yeniden başlatır. Bir önceki sürüm "PusulaConnect.exe.onceki" olarak kalır (elle geri dönüş için).
        /// </summary>
        public static async Task Guncelle(string indirmeAdresi, string beklenenSha256, string imza, Action<int> ilerleme, Action kapat)
        {
            Directory.CreateDirectory(KuruluKlasor);
            var yeni = KuruluExe + ".yeni";
            using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) })
            using (var yanit = await http.GetAsync(indirmeAdresi, HttpCompletionOption.ResponseHeadersRead))
            {
                yanit.EnsureSuccessStatusCode();
                var toplam = yanit.Content.Headers.ContentLength ?? 0;
                using (var akis = await yanit.Content.ReadAsStreamAsync())
                using (var f = File.Create(yeni))
                {
                    var tampon = new byte[81920];
                    long okunan = 0;
                    int n, son = -1;
                    while ((n = await akis.ReadAsync(tampon, 0, tampon.Length)) > 0)
                    {
                        await f.WriteAsync(tampon, 0, n);
                        okunan += n;
                        var yuzde = toplam > 0 ? (int)(okunan * 100 / toplam) : 0;
                        if (yuzde != son) { son = yuzde; ilerleme?.Invoke(yuzde); }
                    }
                }
            }
            // Gerçekten exe mi (sunucu hata sayfası dönebilir) — "MZ" + makul boyut
            var fi = new FileInfo(yeni);
            var bas = new byte[2];
            using (var f = File.OpenRead(yeni)) f.Read(bas, 0, 2);
            if (fi.Length < 200 * 1024 || bas[0] != 'M' || bas[1] != 'Z') { File.Delete(yeni); throw new Exception("İndirilen dosya geçerli bir uygulama değil."); }
            if (!string.IsNullOrEmpty(beklenenSha256))
            {
                string ozet;
                using (var sha = System.Security.Cryptography.SHA256.Create())
                using (var f = File.OpenRead(yeni))
                    ozet = BitConverter.ToString(sha.ComputeHash(f)).Replace("-", "").ToLowerInvariant();
                if (!string.Equals(ozet, beklenenSha256, StringComparison.OrdinalIgnoreCase))
                {
                    File.Delete(yeni);
                    throw new Exception("İndirilen güncelleme doğrulanamadı (özet tutmuyor). Tekrar deneyin.");
                }
            }
            // İmza şart: servis ele geçirilse bile Pusula'nın anahtarıyla imzalanmamış exe kurulmaz.
            if (!GuncellemeImzasi.Dogru(yeni, imza))
            {
                File.Delete(yeni);
                Gunluk.Yaz("Güncelleme REDDEDİLDİ: imza " + (string.IsNullOrEmpty(imza) ? "yok" : "geçersiz"));
                throw new Exception("İndirilen güncelleme Pusula imzası taşımıyor; kurulmadı. Pusula'ya haber verin.");
            }
            var onceki = KuruluExe + ".onceki";
            string kenardaki = null;   // eski exe'nin şimdiki yeri — yeni sürüm açılamazsa geri konur
            if (File.Exists(KuruluExe))
            {
                try { if (File.Exists(onceki)) File.Delete(onceki); File.Move(KuruluExe, onceki); kenardaki = onceki; }
                catch { kenardaki = EskiyiKenaraAl(KuruluExe); }   // çalışan exe yeniden adlandırılabilir
            }
            var yeniSurum = SurumOku(yeni);
            // Yeni sürüm açılınca "x → y güncellendi" olayını bildirebilsin
            try { File.WriteAllText(OncekiSurumDosyasi, ServisIstemci.Surum); } catch { }
            File.Move(yeni, KuruluExe);
            Gunluk.Yaz("Güncellendi → " + yeniSurum + ", yeniden başlatılıyor");
            try
            {
                Process.Start(new ProcessStartInfo(KuruluExe, "--guncellendi") { UseShellExecute = true, WorkingDirectory = KuruluKlasor });
            }
            catch (Exception e)
            {
                // Windows yeni exe'yi çalıştırmadı (ör. Akıllı Uygulama Denetimi / AppLocker "Anwendungssteuerungsrichtlinie"):
                // eski sürüm yerine geri konur — yoksa uygulama kapanınca kısayol engelli exe'yi açar, Connect hiç açılmaz.
                GeriAl(kenardaki);
                throw new GuncellemeEngellendi("Windows yeni sürümün çalışmasını engelledi; mevcut sürümle devam ediliyor. (" + e.Message + ")");
            }
            kapat();
        }
    }

    /// <summary>Yeni sürüm indirildi/doğrulandı ama Windows çalıştırmadı (uygulama denetimi ilkesi).</summary>
    internal sealed class GuncellemeEngellendi : Exception
    {
        public GuncellemeEngellendi(string mesaj) : base(mesaj) { }
    }
}
