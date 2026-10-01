using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace PusulaAktarim
{
    /// <summary>
    /// Arayüzdeki dosya/klasör seçicinin (Windows penceresi yerine uygulama içi gezgin) veri kaynağı.
    /// Yol boşsa sürücüler + hızlı erişim; doluysa o klasörün alt klasörleri ve (istenirse) dosyaları.
    /// Gizli/sistem öğeler atlanır; erişim yoksa hata metni döner, istisna fırlamaz.
    /// </summary>
    internal static class DosyaGezgini
    {
        private const int DosyaSiniri = 3000;

        public static object Listele(string yol, bool dosyalar, string[] uzantilar)
        {
            if (string.IsNullOrWhiteSpace(yol)) return Kokler();

            yol = yol.Trim();
            if (yol.Length == 2 && yol[1] == ':') yol += "\\";
            DirectoryInfo d;
            try
            {
                d = new DirectoryInfo(yol);
                if (!d.Exists) return new { yol, ust = UstYol(yol), hata = "Klasör bulunamadı.", ogeler = new object[0] };
            }
            catch (Exception e)
            {
                return new { yol, ust = (string)null, hata = e.Message, ogeler = new object[0] };
            }

            var ogeler = new List<object>();
            string hata = null;
            try
            {
                foreach (var k in d.EnumerateDirectories().Where(Gorunur).OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase))
                    ogeler.Add(new { ad = k.Name, yol = k.FullName, klasor = true, boyut = (long?)null, tarih = Tarih(k) });

                if (dosyalar)
                {
                    var uz = new HashSet<string>((uzantilar ?? new string[0]).Select(x => x.StartsWith(".") ? x.ToLowerInvariant() : "." + x.ToLowerInvariant()));
                    var n = 0;
                    foreach (var f in d.EnumerateFiles().Where(Gorunur).OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase))
                    {
                        if (uz.Count > 0 && !uz.Contains(f.Extension.ToLowerInvariant())) continue;
                        if (++n > DosyaSiniri) { hata = $"İlk {DosyaSiniri:N0} dosya gösteriliyor."; break; }
                        ogeler.Add(new { ad = f.Name, yol = f.FullName, klasor = false, boyut = (long?)f.Length, tarih = Tarih(f) });
                    }
                }
            }
            catch (UnauthorizedAccessException) { hata = "Bu klasöre erişim izni yok."; }
            catch (Exception e) { hata = e.Message; }

            return new { yol = d.FullName, ust = UstYol(d.FullName), hata, ogeler };
        }

        private static object Kokler()
        {
            var suruculer = new List<object>();
            foreach (var s in DriveInfo.GetDrives())
            {
                if (s.DriveType != DriveType.Fixed && s.DriveType != DriveType.Removable && s.DriveType != DriveType.Network) continue;
                try
                {
                    if (!s.IsReady) continue;
                    suruculer.Add(new
                    {
                        ad = string.IsNullOrWhiteSpace(s.VolumeLabel) ? s.Name.TrimEnd('\\') : $"{s.VolumeLabel} ({s.Name.TrimEnd('\\')})",
                        yol = s.RootDirectory.FullName,
                        klasor = true,
                        surucu = true,
                        bos = (long?)s.AvailableFreeSpace,
                        toplam = (long?)s.TotalSize,
                    });
                }
                catch { /* hazır olmayan sürücü */ }
            }
            var hizli = new[]
            {
                ("Masaüstü", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)),
                ("Belgeler", Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)),
                ("İndirilenler", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads")),
            }.Where(x => !string.IsNullOrEmpty(x.Item2) && Directory.Exists(x.Item2)).Select(x => new { ad = x.Item1, yol = x.Item2 }).ToList();
            return new { yol = "", ust = (string)null, hata = (string)null, ogeler = suruculer, hizli };
        }

        private static bool Gorunur(FileSystemInfo f)
        {
            try { return (f.Attributes & (FileAttributes.Hidden | FileAttributes.System)) == 0; }
            catch { return false; }
        }

        private static string Tarih(FileSystemInfo f)
        {
            try { return f.LastWriteTime.ToString("s"); } catch { return null; }
        }

        private static string UstYol(string yol)
        {
            try { return Directory.GetParent(yol)?.FullName ?? ""; } catch { return ""; }
        }
    }
}
