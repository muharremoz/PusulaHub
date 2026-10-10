using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    internal sealed class ServisHatasi : Exception
    {
        public int DurumKodu { get; }
        public ServisHatasi(string mesaj, int kod) : base(mesaj) { DurumKodu = kod; }
    }

    /// <summary>services/pusula-connect ile konuşma. Adres PUSULA_CONNECT_URL ile değiştirilebilir.</summary>
    internal sealed class ServisIstemci
    {
        public const string VarsayilanAdres = "https://aktarim.pusulanet.net/connect/";
        public static readonly string Surum =
            Assembly.GetExecutingAssembly().GetName().Version is Version v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.0.0";

        private readonly HttpClient _http;
        public string Adres { get; }
        public string Token { get; set; }

        public ServisIstemci(string adres)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            Adres = adres.EndsWith("/") ? adres : adres + "/";
            _http = new HttpClient { BaseAddress = new Uri(Adres), Timeout = TimeSpan.FromSeconds(20) };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("PusulaConnect/" + Surum);
            _http.DefaultRequestHeaders.Add("X-Surum", Surum);
        }

        public async Task<JObject> Kayit(string kod, string makine)
        {
            var j = await Gonder(HttpMethod.Post, "api/kayit", new { kod, surum = Surum, makine });
            Token = j.Value<string>("token");
            return (JObject)j["kayit"];
        }

        public Task<JObject> Profil() => Gonder(HttpMethod.Get, "api/profil", null);
        public Task<JObject> SurumBilgisi() => Gonder(HttpMethod.Get, "api/surum", null);

        // İki adımlı doğrulama (bkz. services/pusula-connect: /api/2fa/*)
        public Task<JObject> IkiBaslat() => Gonder(HttpMethod.Post, "api/2fa/baslat", new { });
        public Task<JObject> IkiOnayla(string kod) => Gonder(HttpMethod.Post, "api/2fa/onayla", new { kod });
        public Task<JObject> IkiDogrula(string kod) => Gonder(HttpMethod.Post, "api/2fa/dogrula", new { kod });
        public Task<JObject> IkiKapat(string kod) => Gonder(HttpMethod.Post, "api/2fa/kapat", new { kod });

        // Uygulama şifresi (bkz. services/pusula-connect: /api/uygulama-sifresi/*). Şifre yerelde saklanmaz, yalnız serviste özeti durur.
        public Task<JObject> UygSifreAc(string sifre) => Gonder(HttpMethod.Post, "api/uygulama-sifresi/ac", new { sifre });
        public Task<JObject> UygSifreDogrula(string sifre) => Gonder(HttpMethod.Post, "api/uygulama-sifresi/dogrula", new { sifre });
        public Task<JObject> UygSifreDegistir(string eski, string yeni) => Gonder(HttpMethod.Post, "api/uygulama-sifresi/degistir", new { eski, yeni });
        public Task<JObject> UygSifreKapat(string sifre) => Gonder(HttpMethod.Post, "api/uygulama-sifresi/kapat", new { sifre });
        public string IndirmeAdresi => Adres + "indir";

        // Hub izleme merkezi: canlı durum (~60 sn) ve olay kaydı. Hata yutulur — izleme asıl işi bozmasın.
        public Task<JObject> Nabiz(object durum) => Gonder(HttpMethod.Post, "api/nabiz", durum);
        /// <summary>Pusula'nın istediği günlüğü yükler (nabız yanıtında gunlukIste).</summary>
        public Task<JObject> GunlukYukle(string metin) => Gonder(HttpMethod.Post, "api/gunluk", new { metin });

        // Duyurular (Hub → müşteri). Nabız yanıtındaki imza değişince liste yeniden çekilir.
        public async Task<JArray> Duyurular()
        {
            var j = await GonderHam(HttpMethod.Get, "api/duyurular", null).ConfigureAwait(false);
            return j as JArray ?? new JArray();
        }
        /// <summary>Hub'daki güncel şifre (Hub'dan sıfırlanınca). 2FA açıksa kod şart; yanıtta kasaAnahtari da gelir.</summary>
        public Task<JObject> Sifre(string kod) => Gonder(HttpMethod.Post, "api/sifre", new { kod });
        /// <summary>Sayım modu: Hub'dan server.xml bilgisi + paket adresi/özeti (2FA açıksa kod şart).</summary>
        public Task<JObject> Sayim(string kod, string tur) => Gonder(HttpMethod.Post, "api/sayim", new { kod, tur });
        /// <summary>Eski program sayımı için firmanın veritabanları (Hub'dan, sirket.guvenlik).</summary>
        public Task<JObject> SayimVeritabanlari() => Gonder(HttpMethod.Get, "api/sayim/veritabanlari", null);
        /// <summary>Firmanın veritabanları ve son yedek zamanları (salt gösterim).</summary>
        public Task<JObject> Yedekler() => Gonder(HttpMethod.Get, "api/yedekler", null);
        public Task<JObject> DuyuruOkundu(string id) => Gonder(HttpMethod.Post, "api/duyurular/" + Uri.EscapeDataString(id) + "/okundu", new { });
        public async Task Olay(string tur, object ayrinti = null)
        {
            if (Token == null) return;
            try { await Gonder(HttpMethod.Post, "api/olay", new { tur, ayrinti }).ConfigureAwait(false); }
            catch (Exception e) { Gunluk.Yaz("Olay gönderilemedi (" + tur + "): " + e.Message); }
        }

        private async Task<JObject> Gonder(HttpMethod yontem, string yol, object govde) =>
            await GonderHam(yontem, yol, govde).ConfigureAwait(false) as JObject ?? new JObject();

        /// <summary>Yanıt nesne ya da dizi olabilir (duyuru listesi dizi döner).</summary>
        private async Task<JToken> GonderHam(HttpMethod yontem, string yol, object govde)
        {
            using (var istek = new HttpRequestMessage(yontem, yol))
            {
                if (Token != null) istek.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
                if (govde != null) istek.Content = new StringContent(JsonConvert.SerializeObject(govde), Encoding.UTF8, "application/json");
                HttpResponseMessage yanit;
                try { yanit = await _http.SendAsync(istek).ConfigureAwait(false); }
                catch (Exception e) { throw new ServisHatasi("Pusula sunucusuna ulaşılamadı (" + e.GetBaseException().Message + ")", 0); }
                var metin = await yanit.Content.ReadAsStringAsync().ConfigureAwait(false);
                JToken j = null;
                try { j = string.IsNullOrWhiteSpace(metin) ? new JObject() : JToken.Parse(metin); } catch { }
                if (!yanit.IsSuccessStatusCode)
                    throw new ServisHatasi((j as JObject)?.Value<string>("hata") ?? $"Sunucu hatası ({(int)yanit.StatusCode})", (int)yanit.StatusCode);
                return j ?? new JObject();
            }
        }
    }
}
