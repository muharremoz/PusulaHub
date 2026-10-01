using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace PusulaAktarim
{
    /// <summary>
    /// Resim küçültme — aktarımdan ayrı araç. JPEG'leri AYNI ÇÖZÜNÜRLÜKTE daha düşük (ama gözle fark
    /// edilmeyen) kalitede yeniden kaydeder; gömülü küçük resim (EXIF thumbnail) atılır, yön bilgisi kalır.
    ///
    /// Kurallar:
    ///  • Dosya adı ve uzantısı değişmez (Pusula raporları resmi model + '.jpg' ile bulur).
    ///  • Yalnız JPEG; CMYK JPEG atlanır (GDI+ renkleri bozar).
    ///  • Yeni dosya en az %10 küçük değilse orijinal yerinde kalır.
    ///  • Önce geçici dosyaya yazılır, sonra File.Replace — yarıda kalırsa bozuk resim olmaz.
    ///  • Yedek açıksa orijinal "{kök}_orijinal\..." altına aynı yapıyla kopyalanır (varsa üzerine yazılmaz).
    /// </summary>
    internal static class ResimKucultucu
    {
        private static readonly string[] JpegUzantilari = { ".jpg", ".jpeg", ".jpe", ".jfif" };
        private const double EnAzKazanc = 0.10;

        private sealed class Aday
        {
            public string Yol;
            public string Kok;
            public long Boyut;
        }

        private static readonly object Kilit = new object();
        private static List<Aday> _adaylar = new List<Aday>();
        private static CancellationTokenSource _iptal;
        /// <summary>Her tarama yeni numara alır; başlatma bu numarayla istenir. Başka pencereden yapılan tarama eski seçimi sessizce değiştirmesin.</summary>
        private static int _taramaNo;

        // Çalışma durumu
        private static bool _suruyor, _bitti, _durduruldu;
        private static int _toplam, _islenen, _kucultulen, _atlanan, _hataSayisi;
        private static long _onceBayt, _sonraBayt;
        private static readonly List<string> _hatalar = new List<string>();
        private static readonly List<string> _yedekKlasorleri = new List<string>();
        private static int _kalite;

        // ------------------------------------------------------------ tarama

        public static object Tara(IEnumerable<string> klasorler, int esikKb)
        {
            lock (Kilit) if (_suruyor) throw new KullaniciHatasi("Küçültme sürüyor; bitmesini bekleyin veya durdurun.");
            var esik = Math.Max(0, esikKb) * 1024L;
            var adaylar = new List<Aday>();
            var ozet = new List<object>();
            var sure = Stopwatch.StartNew();
            var eksik = false;
            foreach (var kok in klasorler.Where(k => !string.IsNullOrWhiteSpace(k)).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!Directory.Exists(kok)) { ozet.Add(new { kok, var = false, adet = 0, bayt = 0L }); continue; }
                int adet = 0; long bayt = 0;
                var yigin = new Stack<string>();
                yigin.Push(kok);
                while (yigin.Count > 0)
                {
                    if (sure.Elapsed > TimeSpan.FromMinutes(2)) { eksik = true; break; }
                    var d = yigin.Pop();
                    try
                    {
                        foreach (var f in new DirectoryInfo(d).EnumerateFiles())
                        {
                            if (f.Length <= esik || !JpegUzantilari.Contains(f.Extension.ToLowerInvariant())) continue;
                            adaylar.Add(new Aday { Yol = f.FullName, Kok = kok.TrimEnd('\\'), Boyut = f.Length });
                            adet++; bayt += f.Length;
                        }
                        foreach (var alt in Directory.EnumerateDirectories(d))
                        {
                            // Daha önceki çalıştırmanın yedek klasörüne girme.
                            if (alt.EndsWith("_orijinal", StringComparison.OrdinalIgnoreCase)) continue;
                            yigin.Push(alt);
                        }
                    }
                    catch { /* erişim yok */ }
                }
                ozet.Add(new { kok, var = true, adet, bayt });
            }
            lock (Kilit)
            {
                _adaylar = adaylar;
                _bitti = false;
                _taramaNo++;
            }
            int no;
            lock (Kilit) no = _taramaNo;
            return new
            {
                taramaNo = no,
                adet = adaylar.Count,
                bayt = adaylar.Sum(a => a.Boyut),
                eksik,
                klasorler = ozet,
                // Örnek seçimi için en büyükler
                ornekler = adaylar.OrderByDescending(a => a.Boyut).Take(30).Select(a => new { yol = a.Yol, boyut = a.Boyut }).ToList(),
            };
        }

        // ------------------------------------------------------------ örnek / önizleme

        public static object Ornek(string yol, int kalite)
        {
            var orijinal = File.ReadAllBytes(yol);
            var (yeni, gen, yuk, neden) = Kucult(orijinal, kalite);
            return new
            {
                yol,
                orijinal = orijinal.LongLength,
                yeni = yeni?.LongLength,
                genislik = gen,
                yukseklik = yuk,
                atlanir = yeni == null || yeni.LongLength > orijinal.LongLength * (1 - EnAzKazanc),
                neden,
            };
        }

        /// <summary>Önizleme görüntüsü: kalite null → orijinal dosya, değilse küçültülmüş hâli.</summary>
        public static DosyaYaniti Goruntu(string yol, int? kalite)
        {
            var orijinal = File.ReadAllBytes(yol);
            var veri = kalite == null ? orijinal : (Kucult(orijinal, kalite.Value).veri ?? orijinal);
            return new DosyaYaniti { Icerik = veri, DosyaAdi = Path.GetFileName(yol), Tur = "image/jpeg" };
        }

        // ------------------------------------------------------------ çalıştırma

        public static object Baslat(int kalite, bool yedekle, int taramaNo)
        {
            List<Aday> liste;
            lock (Kilit)
            {
                if (_suruyor) throw new KullaniciHatasi("Küçültme zaten sürüyor.");
                if (_adaylar.Count == 0) throw new KullaniciHatasi("Önce tarama yapın; küçültülecek resim yok.");
                if (taramaNo != _taramaNo) throw new KullaniciHatasi("Tarama başka bir pencereden yenilenmiş; seçimin doğru olması için yeniden tarayın.", 409);
                liste = _adaylar.ToList();
                _suruyor = true; _bitti = false; _durduruldu = false;
                _toplam = liste.Count; _islenen = _kucultulen = _atlanan = _hataSayisi = 0;
                _onceBayt = _sonraBayt = 0;
                _hatalar.Clear();
                _yedekKlasorleri.Clear();
                _kalite = kalite;
                if (yedekle) _yedekKlasorleri.AddRange(liste.Select(a => a.Kok + "_orijinal").Distinct(StringComparer.OrdinalIgnoreCase));
                _iptal = new CancellationTokenSource();
            }
            var iptal = _iptal.Token;
            Task.Run(() =>
            {
                try
                {
                    Parallel.ForEach(liste,
                        new ParallelOptions { MaxDegreeOfParallelism = Math.Max(1, Environment.ProcessorCount - 1), CancellationToken = iptal },
                        a => Isle(a, kalite, yedekle));
                }
                catch (OperationCanceledException) { lock (Kilit) _durduruldu = true; }
                catch (Exception e) { lock (Kilit) _hatalar.Add(e.Message); }
                finally
                {
                    lock (Kilit) { _suruyor = false; _bitti = true; }
                }
            });
            return Durum();
        }

        public static object Durdur()
        {
            lock (Kilit) _iptal?.Cancel();
            return Durum();
        }

        public static object Durum()
        {
            lock (Kilit)
            {
                return new
                {
                    suruyor = _suruyor,
                    bitti = _bitti,
                    durduruldu = _durduruldu,
                    toplam = _toplam,
                    islenen = _islenen,
                    kucultulen = _kucultulen,
                    atlanan = _atlanan,
                    hataSayisi = _hataSayisi,
                    hatalar = _hatalar.Take(20).ToList(),
                    onceBayt = _onceBayt,
                    sonraBayt = _sonraBayt,
                    kalite = _kalite,
                    yedekKlasorleri = _yedekKlasorleri.ToList(),
                };
            }
        }

        private static void Isle(Aday a, int kalite, bool yedekle)
        {
            try
            {
                var orijinal = File.ReadAllBytes(a.Yol);
                var (yeni, _, _, _) = Kucult(orijinal, kalite);
                if (yeni == null || yeni.LongLength > orijinal.LongLength * (1 - EnAzKazanc))
                {
                    lock (Kilit) { _atlanan++; _islenen++; }
                    return;
                }

                var fi = new FileInfo(a.Yol);
                var yazma = fi.LastWriteTimeUtc;
                if (yedekle)
                {
                    var goreli = a.Yol.Substring(a.Kok.Length).TrimStart('\\');
                    var yedek = Path.Combine(a.Kok + "_orijinal", goreli);
                    Directory.CreateDirectory(Path.GetDirectoryName(yedek));
                    // Önceki çalıştırmanın yedeği gerçek orijinaldir — üzerine yazma.
                    if (!File.Exists(yedek)) File.Copy(a.Yol, yedek);
                }
                var gecici = a.Yol + ".kucult.tmp";
                File.WriteAllBytes(gecici, yeni);
                File.Replace(gecici, a.Yol, null, true);
                try { File.SetLastWriteTimeUtc(a.Yol, yazma); } catch { }

                lock (Kilit)
                {
                    _kucultulen++; _islenen++;
                    _onceBayt += orijinal.LongLength;
                    _sonraBayt += yeni.LongLength;
                }
            }
            catch (Exception e)
            {
                try { File.Delete(a.Yol + ".kucult.tmp"); } catch { }
                lock (Kilit)
                {
                    _hataSayisi++; _islenen++;
                    if (_hatalar.Count < 50) _hatalar.Add(Path.GetFileName(a.Yol) + ": " + e.Message);
                }
            }
        }

        // ------------------------------------------------------------ kodlama

        private static ImageCodecInfo _jpegKodek;
        private static ImageCodecInfo JpegKodek =>
            _jpegKodek ?? (_jpegKodek = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid));

        /// <summary>Aynı çözünürlükte yeniden kodlar. JPEG değilse / CMYK ise veri null döner (neden ile).</summary>
        private static (byte[] veri, int gen, int yuk, string neden) Kucult(byte[] orijinal, int kalite)
        {
            using (var giris = new MemoryStream(orijinal))
            using (var img = Image.FromStream(giris, true, false))
            {
                if (!img.RawFormat.Equals(ImageFormat.Jpeg)) return (null, img.Width, img.Height, "JPEG değil");
                if ((img.Flags & (int)ImageFlags.ColorSpaceCmyk) != 0)
                    return (null, img.Width, img.Height, "CMYK JPEG — atlanır");

                // Gömülü küçük resim ve eski nicemleme tabloları (0x5000-0x5FFF) atılır; yön (0x0112) ve diğer EXIF kalır.
                foreach (var id in img.PropertyIdList.Where(i => i >= 0x5000 && i <= 0x5FFF).ToList())
                {
                    try { img.RemovePropertyItem(id); } catch { }
                }

                using (var cikis = new MemoryStream())
                using (var p = new EncoderParameters(1))
                {
                    p.Param[0] = new EncoderParameter(Encoder.Quality, (long)Math.Max(50, Math.Min(100, kalite)));
                    img.Save(cikis, JpegKodek, p);
                    return (cikis.ToArray(), img.Width, img.Height, null);
                }
            }
        }
    }
}
