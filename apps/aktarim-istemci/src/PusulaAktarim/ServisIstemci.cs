using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PusulaAktarim
{
    /// <summary>Aktarım 2 servisinin döndürdüğü hata. Mesaj kullanıcıya olduğu gibi gösterilir.</summary>
    internal sealed class ServisHatasi : Exception
    {
        public int DurumKodu { get; }
        public ServisHatasi(string mesaj, int kod) : base(mesaj) { DurumKodu = kod; }
    }

    /// <summary>
    /// services/pusula-aktarim2 ile konuşma. Adres PUSULA_AKTARIM_URL ile değiştirilebilir
    /// (geliştirmede yerel servis). İstemci Hub'la hiç konuşmaz.
    /// </summary>
    internal sealed class ServisIstemci
    {
        public const string VarsayilanAdres = "https://aktarim.pusulanet.net/v2/";
        public static readonly string Surum =
            Assembly.GetExecutingAssembly().GetName().Version is Version v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.0.0";

        private readonly HttpClient _http;
        /// <summary>Parçalar için ayrı istemci: zaman aşımını istek başına biz veriyoruz.</summary>
        private readonly HttpClient _parcaHttp;
        private string _token;

        public string Adres { get; }
        public bool GirisYapildi => _token != null;

        public ServisIstemci(string adres)
        {
            // net48 bazı eski Windows'ta TLS 1.2'yi kendiliğinden açmıyor.
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Adres = adres.EndsWith("/") ? adres : adres + "/";
            _http = new HttpClient { BaseAddress = new Uri(Adres), Timeout = TimeSpan.FromSeconds(60) };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("PusulaAktarim/" + Surum);
            _parcaHttp = new HttpClient { BaseAddress = new Uri(Adres), Timeout = System.Threading.Timeout.InfiniteTimeSpan };
            _parcaHttp.DefaultRequestHeaders.UserAgent.ParseAdd("PusulaAktarim/" + Surum);
        }

        public async Task<JObject> Giris(string kod, string makine)
        {
            var j = await Gonder(HttpMethod.Post, "api/giris", new { kod, surum = Surum, makine });
            _token = j.Value<string>("token");
            return (JObject)j["oturum"];
        }

        public Task<JObject> Oturum() => Gonder(HttpMethod.Get, "api/oturum", null);
        public Task<JObject> KesifGonder(object rapor) => Gonder(HttpMethod.Post, "api/kesif", rapor);

        /// <summary>Kayıtlı token (DPAPI) ile oturumu sürdür; geçersizse null.</summary>
        public string Token { get => _token; set => _token = value; }

        /// <summary>Dosya yüklemesini başlatır/sürdürür → { id, parcaBoyutu, parcaSayisi, alinan[] }.</summary>
        public Task<JObject> DosyaBaslat(string tur, string yol, long boyut, string sha256, object meta) =>
            Gonder(HttpMethod.Post, "api/dosya", new { tur, yol, boyut, sha256, meta });

        public Task<JObject> Tamamla() => Gonder(HttpMethod.Post, "api/tamamla", new { });

        public Task<JObject> DosyaBitir(string id) => Gonder(HttpMethod.Post, "api/dosya/" + id + "/bitir", new { });

        /// <summary>Tek parça — ham bayt, SHA256 başlıkta. Parça başına uzun zaman aşımı (yavaş hat).</summary>
        public async Task ParcaGonder(string id, int no, byte[] veri, int uzunluk, System.Threading.CancellationToken iptal)
        {
            string sha;
            using (var h = System.Security.Cryptography.SHA256.Create())
                sha = BitConverter.ToString(h.ComputeHash(veri, 0, uzunluk)).Replace("-", "").ToLowerInvariant();
            using (var istek = new HttpRequestMessage(HttpMethod.Put, "api/dosya/" + id + "/parca/" + no))
            using (var zaman = System.Threading.CancellationTokenSource.CreateLinkedTokenSource(iptal))
            {
                zaman.CancelAfter(TimeSpan.FromMinutes(10));
                istek.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
                istek.Headers.Add("X-Parca-Sha256", sha);
                istek.Content = new ByteArrayContent(veri, 0, uzunluk);
                istek.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
                HttpResponseMessage yanit;
                try { yanit = await _parcaHttp.SendAsync(istek, zaman.Token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!iptal.IsCancellationRequested)
                {
                    throw new ServisHatasi("Parça gönderimi zaman aşımına uğradı.", 0);
                }
                catch (Exception e) when (!(e is OperationCanceledException))
                {
                    throw new ServisHatasi("Bağlantı koptu (" + e.GetBaseException().Message + ")", 0);
                }
                using (yanit)
                {
                    if (yanit.IsSuccessStatusCode) return;
                    var metin = await yanit.Content.ReadAsStringAsync().ConfigureAwait(false);
                    string mesaj = null;
                    try { mesaj = JObject.Parse(metin).Value<string>("hata"); } catch { }
                    throw new ServisHatasi(mesaj ?? $"Sunucu hatası ({(int)yanit.StatusCode})", (int)yanit.StatusCode);
                }
            }
        }

        private async Task<JObject> Gonder(HttpMethod yontem, string yol, object govde)
        {
            using (var istek = new HttpRequestMessage(yontem, yol))
            {
                if (_token != null) istek.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
                if (govde != null)
                    istek.Content = new StringContent(JsonConvert.SerializeObject(govde, YerelSunucu.JsonAyar), Encoding.UTF8, "application/json");
                HttpResponseMessage yanit;
                try { yanit = await _http.SendAsync(istek).ConfigureAwait(false); }
                catch (Exception e)
                {
                    throw new ServisHatasi("Pusula sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin. (" + e.GetBaseException().Message + ")", 0);
                }
                var metin = await yanit.Content.ReadAsStringAsync().ConfigureAwait(false);
                JObject j = null;
                try { j = string.IsNullOrWhiteSpace(metin) ? new JObject() : JObject.Parse(metin); } catch { }
                if (!yanit.IsSuccessStatusCode)
                    throw new ServisHatasi(j?.Value<string>("hata") ?? $"Sunucu hatası ({(int)yanit.StatusCode})", (int)yanit.StatusCode);
                return j ?? new JObject();
            }
        }
    }
}
