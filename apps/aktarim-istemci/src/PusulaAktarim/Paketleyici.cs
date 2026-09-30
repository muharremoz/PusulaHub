using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using Newtonsoft.Json;

namespace PusulaAktarim
{
    /// <summary>
    /// Çok sayıda küçük dosyayı (77 bin resim gibi) az sayıda pakete toplar: her dosya
    /// ayrı istek olsa saatler sürer. Biçim (servisteki paketiAc ile aynı):
    ///   "PKT1" + uint32 LE başlık uzunluğu + başlık JSON [{ y, b }] + baytlar art arda.
    /// Paket yeniden üretilebilir (dosya listesi iş kaydında) — yarıda kalırsa baştan yazılır.
    /// </summary>
    internal static class Paketleyici
    {
        public const long AzamiBoyut = 256L * 1024 * 1024;
        public const int AzamiDosya = 20000;

        public static string Klasor => Path.Combine(Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\", "PusulaAktarim", "Paket");

        public static readonly string[] ResimUzantilari = { ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp" };

        /// <summary>Kökteki dosyaları (alt klasörler dahil) boyut/sayı sınırına göre gruplar.</summary>
        public static List<List<string>> Planla(string kok, Func<string, bool> suzgec)
        {
            var dosyalar = new List<(string yol, long boyut)>();
            var yigin = new Stack<string>();
            yigin.Push(kok);
            while (yigin.Count > 0)
            {
                var d = yigin.Pop();
                try
                {
                    foreach (var f in new DirectoryInfo(d).EnumerateFiles())
                    {
                        if ((f.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0 && f.Name.Equals("Thumbs.db", StringComparison.OrdinalIgnoreCase)) continue;
                        if (suzgec != null && !suzgec(f.Name)) continue;
                        dosyalar.Add((Goreli(kok, f.FullName), f.Length));
                    }
                    foreach (var alt in Directory.EnumerateDirectories(d)) yigin.Push(alt);
                }
                catch { /* erişilemeyen klasör atlanır */ }
            }
            dosyalar.Sort((a, b) => string.CompareOrdinal(a.yol, b.yol));

            var paketler = new List<List<string>>();
            var simdiki = new List<string>();
            long boyut = 0;
            foreach (var (yol, b) in dosyalar)
            {
                if (simdiki.Count > 0 && (boyut + b > AzamiBoyut || simdiki.Count >= AzamiDosya))
                {
                    paketler.Add(simdiki);
                    simdiki = new List<string>();
                    boyut = 0;
                }
                simdiki.Add(yol);
                boyut += b;
            }
            if (simdiki.Count > 0) paketler.Add(simdiki);
            return paketler;
        }

        /// <summary>Paketi yazar; kaybolan dosyalar atlanır. İlerleme 0-100.</summary>
        public static void Yaz(string kok, IList<string> dosyalar, string hedef, Action<int> ilerleme, CancellationToken iptal)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(hedef));
            var mevcut = new List<(string yol, FileInfo fi)>();
            foreach (var y in dosyalar)
            {
                var fi = new FileInfo(Path.Combine(kok, y.Replace('/', '\\')));
                if (fi.Exists) mevcut.Add((y, fi));
            }
            var baslik = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(mevcut.Select(x => new { y = x.yol, b = x.fi.Length })));
            var gecici = hedef + ".yaziliyor";
            using (var c = new FileStream(gecici, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20))
            {
                c.Write(Encoding.ASCII.GetBytes("PKT1"), 0, 4);
                c.Write(BitConverter.GetBytes((uint)baslik.Length), 0, 4);
                c.Write(baslik, 0, baslik.Length);
                var tampon = new byte[1 << 20];
                for (var i = 0; i < mevcut.Count; i++)
                {
                    iptal.ThrowIfCancellationRequested();
                    var (_, fi) = mevcut[i];
                    long yazilan = 0;
                    using (var k = new FileStream(fi.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16))
                    {
                        int n;
                        while (yazilan < fi.Length && (n = k.Read(tampon, 0, (int)Math.Min(tampon.Length, fi.Length - yazilan))) > 0)
                        {
                            c.Write(tampon, 0, n);
                            yazilan += n;
                        }
                    }
                    // Okurken dosya küçüldüyse başlıktaki boyut tutsun diye sıfırla doldur.
                    if (yazilan < fi.Length) c.Write(new byte[fi.Length - yazilan], 0, (int)(fi.Length - yazilan));
                    if (i % 200 == 0) ilerleme(i * 100 / Math.Max(1, mevcut.Count));
                }
            }
            if (File.Exists(hedef)) File.Delete(hedef);
            File.Move(gecici, hedef);
            ilerleme(100);
        }

        private static string Goreli(string kok, string tam)
        {
            var k = kok.TrimEnd('\\', '/') + "\\";
            return (tam.StartsWith(k, StringComparison.OrdinalIgnoreCase) ? tam.Substring(k.Length) : Path.GetFileName(tam)).Replace('\\', '/');
        }
    }
}
