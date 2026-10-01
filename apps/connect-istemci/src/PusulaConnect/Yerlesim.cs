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

        private static void EskiyiKenaraAl(string exe)
        {
            var eski = exe + ".eski" + DateTime.Now.Ticks;
            File.Move(exe, eski);   // çalışıyor olsa da yeniden adlandırılabilir
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

        /// <summary>Yeni sürümü indirip kurulu kopyanın yerine koyar ve yeniden başlatır.</summary>
        public static async Task Guncelle(string indirmeAdresi, Action kapat)
        {
            Directory.CreateDirectory(KuruluKlasor);
            var yeni = KuruluExe + ".yeni";
            using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
            using (var akis = await http.GetStreamAsync(indirmeAdresi))
            using (var f = File.Create(yeni))
                await akis.CopyToAsync(f);
            // Gerçekten exe mi (sunucu hata sayfası dönebilir) — "MZ" + makul boyut
            var fi = new FileInfo(yeni);
            var bas = new byte[2];
            using (var f = File.OpenRead(yeni)) f.Read(bas, 0, 2);
            if (fi.Length < 200 * 1024 || bas[0] != 'M' || bas[1] != 'Z') { File.Delete(yeni); throw new Exception("İndirilen güncelleme geçersiz"); }
            if (File.Exists(KuruluExe)) EskiyiKenaraAl(KuruluExe);
            File.Move(yeni, KuruluExe);
            Gunluk.Yaz("Güncellendi → " + SurumOku(KuruluExe) + ", yeniden başlatılıyor");
            Process.Start(new ProcessStartInfo(KuruluExe, "--guncellendi") { UseShellExecute = true, WorkingDirectory = KuruluKlasor });
            kapat();
        }
    }
}
