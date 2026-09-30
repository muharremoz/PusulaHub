using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PusulaAktarim
{
    /// <summary>Bir API isteği — yönlendiriciye verilen şey.</summary>
    internal sealed class Istek
    {
        public string Yontem;
        public string Yol;
        public JObject Govde;

        public string Metin(string ad) => Govde?[ad]?.Type == JTokenType.Null ? null : Govde?[ad]?.ToString();
        public bool Mantik(string ad) => Govde?[ad]?.Type == JTokenType.Boolean && Govde[ad].Value<bool>();
        public int Sayi(string ad) =>
            Govde?[ad]?.Type == JTokenType.Integer ? Govde[ad].Value<int>() : 0;
        public Dictionary<string, string> Sozluk(string ad) =>
            Govde?[ad] is JObject o ? o.Properties().ToDictionary(x => x.Name, x => x.Value?.ToString()) : new Dictionary<string, string>();
    }

    /// <summary>JSON yerine dosya döndüren API yanıtı (Excel dışa aktarım).</summary>
    internal sealed class DosyaYaniti
    {
        public byte[] Icerik;
        public string DosyaAdi;
        public string Tur;
    }

    /// <summary>API'nin kullanıcıya gösterilecek hatası (4xx). Mesaj olduğu gibi ekrana gider.</summary>
    internal sealed class KullaniciHatasi : Exception
    {
        public int Kod { get; }
        public KullaniciHatasi(string mesaj, int kod = 400) : base(mesaj) { Kod = kod; }
    }

    /// <summary>
    /// Yalnız 127.0.0.1'i dinleyen küçük HTTP sunucusu.
    ///
    /// NEDEN HttpListener DEĞİL: o, Windows'un HTTP.sys katmanını kullanır ve
    /// bazı adres/port kombinasyonları için yönetici izni + URL kaydı ister.
    /// Uygulama müşteri PC'sinde standart kullanıcıyla da çalışmalı; doğrudan
    /// TCP üzerinde küçük bir sunucu hiçbir sistem ayarı gerektirmiyor.
    ///
    /// GÜVENLİK (makinedeki başka bir program ya da tarayıcıda açık kötü niyetli
    /// bir site bu porta istek atabilir):
    ///   1. Yalnız geri döngü (loopback) adresi — ağdan erişilemez.
    ///   2. Her API isteğinde X-Aktarim-Anahtar başlığı = açılışta üretilen
    ///      rastgele anahtar. Başka bir site bu başlığı ekleyemez (CORS
    ///      ön-kontrolü yanıtlanmıyor), anahtarı da bilemez.
    ///   3. Host başlığı 127.0.0.1:port / localhost:port olmalı (DNS rebinding).
    ///   4. Origin varsa kendi adresimiz olmalı.
    /// Statik dosyalar (arayüzün kendisi) anahtarsız verilir — gizli değiller.
    /// </summary>
    internal sealed class YerelSunucu
    {
        private readonly TcpListener _dinleyici;
        private readonly Func<Istek, Task<object>> _api;
        private readonly Dictionary<string, byte[]> _dosyalar;
        private readonly CancellationTokenSource _dur = new CancellationTokenSource();

        public int Port { get; }
        public string Anahtar { get; }
        public string Adres => $"http://127.0.0.1:{Port}/";

        public YerelSunucu(Func<Istek, Task<object>> api)
        {
            _api = api;
            _dosyalar = GomuluDosyalar();
            Anahtar = RastgeleAnahtar();
            _dinleyici = new TcpListener(IPAddress.Loopback, 0);
            _dinleyici.Start();
            Port = ((IPEndPoint)_dinleyici.LocalEndpoint).Port;
        }

        public void Baslat() => Task.Run(DinlemeDongusu);

        public void Durdur()
        {
            _dur.Cancel();
            try { _dinleyici.Stop(); } catch { }
        }

        private async Task DinlemeDongusu()
        {
            while (!_dur.IsCancellationRequested)
            {
                TcpClient istemci;
                try { istemci = await _dinleyici.AcceptTcpClientAsync().ConfigureAwait(false); }
                catch { if (_dur.IsCancellationRequested) return; continue; }
                _ = Task.Run(() => Isle(istemci));
            }
        }

        private async Task Isle(TcpClient istemci)
        {
            using (istemci)
            using (var akis = istemci.GetStream())
            {
                istemci.ReceiveTimeout = 30_000;
                try
                {
                    var (yontem, yol, basliklar, govde) = await Oku(akis).ConfigureAwait(false);
                    if (yontem == null) return;
                    await Yanitla(akis, yontem, yol, basliklar, govde).ConfigureAwait(false);
                }
                catch (Exception e)
                {
                    try { await Yaz(akis, 500, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Sunucu hatası: " + e.Message)); }
                    catch { }
                }
            }
        }

        // ------------------------------------------------------------ istek okuma

        private const int AzamiGovde = 50 * 1024 * 1024; // 50 MB — büyük betik yapıştırma

        private static async Task<(string, string, Dictionary<string, string>, byte[])> Oku(NetworkStream akis)
        {
            var tampon = new List<byte>(4096);
            var parca = new byte[8192];
            int basBitis = -1;
            while (basBitis < 0)
            {
                var n = await akis.ReadAsync(parca, 0, parca.Length).ConfigureAwait(false);
                if (n <= 0) return (null, null, null, null);
                tampon.AddRange(parca.Take(n));
                basBitis = BasBitisi(tampon);
                if (tampon.Count > 64 * 1024 && basBitis < 0) throw new InvalidDataException("Başlık çok büyük");
            }

            var baslikMetni = Encoding.ASCII.GetString(tampon.GetRange(0, basBitis).ToArray());
            var satirlar = baslikMetni.Split(new[] { "\r\n" }, StringSplitOptions.None);
            var ilk = satirlar[0].Split(' ');
            if (ilk.Length < 2) return (null, null, null, null);

            var basliklar = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in satirlar.Skip(1))
            {
                var i = s.IndexOf(':');
                if (i > 0) basliklar[s.Substring(0, i).Trim()] = s.Substring(i + 1).Trim();
            }

            var uzunluk = 0;
            if (basliklar.TryGetValue("Content-Length", out var u) && !int.TryParse(u, out uzunluk))
                throw new InvalidDataException("Content-Length");
            if (uzunluk > AzamiGovde) throw new InvalidDataException("Gövde çok büyük");

            var govde = new byte[uzunluk];
            var elde = Math.Min(uzunluk, tampon.Count - (basBitis + 4));
            tampon.CopyTo(basBitis + 4, govde, 0, elde);
            while (elde < uzunluk)
            {
                var n = await akis.ReadAsync(govde, elde, uzunluk - elde).ConfigureAwait(false);
                if (n <= 0) break;
                elde += n;
            }
            return (ilk[0].ToUpperInvariant(), ilk[1], basliklar, govde);
        }

        private static int BasBitisi(List<byte> b)
        {
            for (var i = 3; i < b.Count; i++)
                if (b[i - 3] == 13 && b[i - 2] == 10 && b[i - 1] == 13 && b[i] == 10) return i - 3;
            return -1;
        }

        // ------------------------------------------------------------ yanıt

        private async Task Yanitla(NetworkStream akis, string yontem, string hamYol,
            Dictionary<string, string> basliklar, byte[] govde)
        {
            // 3) Host denetimi — DNS rebinding.
            basliklar.TryGetValue("Host", out var host);
            if (host != $"127.0.0.1:{Port}" && host != $"localhost:{Port}")
            {
                await Yaz(akis, 421, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("Geçersiz adres."));
                return;
            }

            var yol = hamYol.Split('?')[0];
            if (!yol.StartsWith("/api/", StringComparison.Ordinal))
            {
                if (yontem != "GET") { await Yaz(akis, 405, "text/plain", new byte[0]); return; }
                await StatikVer(akis, yol);
                return;
            }

            // 4) Origin (varsa) bizim olmalı.
            if (basliklar.TryGetValue("Origin", out var koken) &&
                koken != $"http://127.0.0.1:{Port}" && koken != $"http://localhost:{Port}")
            {
                await JsonYaz(akis, 403, new { hata = "İzin verilmeyen kaynak." });
                return;
            }
            // 2) Anahtar.
            basliklar.TryGetValue("X-Aktarim-Anahtar", out var anahtar);
            if (!SabitZamanEsit(anahtar, Anahtar))
            {
                await JsonYaz(akis, 401, new { hata = "Oturum anahtarı geçersiz. Uygulamayı tepsi simgesinden yeniden açın." });
                return;
            }
            if (yontem != "GET" && yontem != "POST") { await JsonYaz(akis, 405, new { hata = "Yöntem desteklenmiyor." }); return; }

            JObject json = null;
            if (govde.Length > 0)
            {
                try { json = JObject.Parse(Encoding.UTF8.GetString(govde)); }
                catch { await JsonYaz(akis, 400, new { hata = "Geçersiz JSON." }); return; }
            }

            try
            {
                var sonuc = await _api(new Istek { Yontem = yontem, Yol = yol.Substring(4), Govde = json }).ConfigureAwait(false);
                if (sonuc is DosyaYaniti d)
                {
                    // Dosya adı RFC 5987 biçiminde (Türkçe karakter olabilir).
                    await Yaz(akis, 200, d.Tur, d.Icerik, "no-store",
                        "Content-Disposition: attachment; filename*=UTF-8''" + Uri.EscapeDataString(d.DosyaAdi) + "\r\n");
                    return;
                }
                await JsonYaz(akis, 200, sonuc ?? new { tamam = true });
            }
            catch (KullaniciHatasi e) { await JsonYaz(akis, e.Kod, new { hata = e.Message }); }
            catch (ServisHatasi e) { await JsonYaz(akis, e.DurumKodu == 0 ? 502 : 400, new { hata = e.Message }); }
            catch (Exception e) { await JsonYaz(akis, 500, new { hata = e.Message }); }
        }

        internal static readonly JsonSerializerSettings JsonAyar = new JsonSerializerSettings
        {
            // Rapor sınıfları C# adlandırmasıyla (Veritabanlari) — JSON'da veritabanlari.
            // Sözlük anahtarları (guvenlik sütun adları) olduğu gibi kalır.
            // CamelCasePropertyNamesContractResolver sözlük anahtarlarını da çeviriyor
            // (KOD → kod) — o yüzden anahtarları işlemeyen strateji.
            ContractResolver = new Newtonsoft.Json.Serialization.DefaultContractResolver
            {
                NamingStrategy = new Newtonsoft.Json.Serialization.CamelCaseNamingStrategy { ProcessDictionaryKeys = false },
            },
            NullValueHandling = NullValueHandling.Include,
            DateFormatHandling = DateFormatHandling.IsoDateFormat,
            Culture = CultureInfo.InvariantCulture,
        };

        private static Task JsonYaz(NetworkStream akis, int kod, object veri) =>
            Yaz(akis, kod, "application/json; charset=utf-8",
                Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(veri, JsonAyar)));

        private async Task StatikVer(NetworkStream akis, string yol)
        {
            var anahtar = yol == "/" ? "index.html" : Uri.UnescapeDataString(yol.TrimStart('/'));
            // Tek sayfa uygulaması: bilinmeyen yol → index.html.
            if (!_dosyalar.TryGetValue(anahtar, out var icerik) && !_dosyalar.TryGetValue("index.html", out icerik))
            {
                await Yaz(akis, 404, "text/plain; charset=utf-8",
                    Encoding.UTF8.GetBytes("Arayüz dosyaları bu exe'ye gömülmemiş (web/dist derlenmeden derlenmiş)."));
                return;
            }
            if (!_dosyalar.ContainsKey(anahtar)) anahtar = "index.html";
            await Yaz(akis, 200, Tur(anahtar), icerik,
                anahtar == "index.html" ? "no-store" : "public, max-age=31536000, immutable");
        }

        private static async Task Yaz(NetworkStream akis, int kod, string tur, byte[] govde, string onbellek = "no-store",
            string ekBaslik = null)
        {
            var sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(kod).Append(' ').Append(Durum(kod)).Append("\r\n");
            sb.Append("Content-Type: ").Append(tur).Append("\r\n");
            sb.Append("Content-Length: ").Append(govde.Length).Append("\r\n");
            sb.Append("Cache-Control: ").Append(onbellek).Append("\r\n");
            sb.Append("X-Content-Type-Options: nosniff\r\n");
            sb.Append("Referrer-Policy: no-referrer\r\n");
            if (ekBaslik != null) sb.Append(ekBaslik);
            if (tur.StartsWith("text/html", StringComparison.Ordinal))
            {
                // Monaco (2. aşama) blob: işçi + satır içi stil kullanır.
                sb.Append("Content-Security-Policy: default-src 'self'; script-src 'self'; ")
                  .Append("style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; ")
                  .Append("worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'\r\n");
            }
            sb.Append("Connection: close\r\n\r\n");
            var bas = Encoding.ASCII.GetBytes(sb.ToString());
            await akis.WriteAsync(bas, 0, bas.Length).ConfigureAwait(false);
            if (govde.Length > 0) await akis.WriteAsync(govde, 0, govde.Length).ConfigureAwait(false);
        }

        private static string Durum(int kod)
        {
            switch (kod)
            {
                case 200: return "OK";
                case 400: return "Bad Request";
                case 401: return "Unauthorized";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 405: return "Method Not Allowed";
                case 409: return "Conflict";
                case 421: return "Misdirected Request";
                case 502: return "Bad Gateway";
                default: return kod >= 500 ? "Server Error" : "Status";
            }
        }

        private static string Tur(string ad)
        {
            switch (Path.GetExtension(ad).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".ico": return "image/x-icon";
                case ".woff2": return "font/woff2";
                case ".woff": return "font/woff";
                case ".ttf": return "font/ttf";
                default: return "application/octet-stream";
            }
        }

        // ------------------------------------------------------------ yardımcılar

        private static Dictionary<string, byte[]> GomuluDosyalar()
        {
            var sonuc = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            var asm = Assembly.GetExecutingAssembly();
            foreach (var ad in asm.GetManifestResourceNames())
            {
                // MSBuild RecursiveDir'i ters bölüyle verir: "web/assets\x.js".
                var norm = ad.Replace('\\', '/');
                if (!norm.StartsWith("web/", StringComparison.Ordinal)) continue;
                using (var s = asm.GetManifestResourceStream(ad))
                using (var m = new MemoryStream())
                {
                    s.CopyTo(m);
                    sonuc[norm.Substring(4)] = m.ToArray();
                }
            }
            return sonuc;
        }

        private static string RastgeleAnahtar()
        {
            var b = new byte[32];
            using (var r = RandomNumberGenerator.Create()) r.GetBytes(b);
            return Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private static bool SabitZamanEsit(string a, string b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            var fark = 0;
            for (var i = 0; i < a.Length; i++) fark |= a[i] ^ b[i];
            return fark == 0;
        }
    }
}
