using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

namespace PusulaAktarim
{
    /// <summary>
    /// İş kaydındaki öğeleri sırayla aktarır: yedek → SHA256 → parça parça yükleme →
    /// bitir → yerel yedeği sil. Her adımdan sonra iş kaydı diske yazılır; uygulama
    /// kapanıp açılınca kalınan adımdan sürer (yedek dosyası duruyorsa yeniden alınmaz,
    /// sunucuda alınmış parçalar yeniden gönderilmez).
    /// </summary>
    internal sealed class Aktarici
    {
        private readonly IsKaydi _is;
        private readonly SqlHedef _sql;
        private readonly ServisIstemci _servis;
        private readonly Action _degisti;

        /// <summary>Bağlantı koptuğunda gösterilecek bilgi (hata değil, bekleniyor).</summary>
        public string Bilgi { get; private set; }

        public Aktarici(IsKaydi i, SqlHedef sql, ServisIstemci servis, Action degisti)
        {
            _is = i; _sql = sql; _servis = servis; _degisti = degisti;
        }

        public async Task Calistir(CancellationToken iptal)
        {
            foreach (var o in _is.Ogeler.Where(x => x.Durum != "tamam").ToList())
            {
                iptal.ThrowIfCancellationRequested();
                try
                {
                    o.Hata = null;
                    await Oge(o, iptal).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { Kaydet(); throw; }
                catch (Exception e)
                {
                    o.Durum = "hata";
                    o.Hata = e is ServisHatasi || e is System.Data.SqlClient.SqlException ? e.Message : e.GetBaseException().Message;
                    Kaydet();
                }
            }
        }

        private void Kaydet()
        {
            try { _is.Yaz(); } catch { }
            _degisti();
        }

        private async Task Oge(IsOgesi o, CancellationToken iptal)
        {
            // 1) Yedek — dosya yoksa ya da yedek yarıda kaldıysa baştan.
            var yedekVar = o.Sha256 != null && File.Exists(o.YerelYol) && new FileInfo(o.YerelYol).Length == o.Boyut;
            if (!yedekVar)
            {
                Yedekleyici.KlasoruHazirla();
                o.Durum = "yedekleniyor"; o.Yuzde = 0; o.Gonderilen = 0; o.Sha256 = null;
                Kaydet();
                await Yedekleyici.Al(_sql, o.Ad, o.YerelYol, _is.Sikistir, y => { o.Yuzde = y; _degisti(); }, iptal).ConfigureAwait(false);

                // 2) SHA256 — sunucu bütünü bununla doğrular.
                o.Durum = "hazirlaniyor"; o.Yuzde = 0;
                o.Boyut = new FileInfo(o.YerelYol).Length;
                Kaydet();
                o.Sha256 = await Task.Run(() => Ozet(o, iptal), iptal).ConfigureAwait(false);
                Kaydet();
            }

            // 3) Yükleme — sunucu hangi parçaları aldığını söyler.
            o.Durum = "yukleniyor";
            Kaydet();
            for (var tur = 0; ; tur++)
            {
                var d = await Tekrarla(() => _servis.DosyaBaslat(o.Tur, o.Yol, o.Boyut, o.Sha256, new { veritabani = o.Ad, sikistirma = _is.Sikistir }), iptal).ConfigureAwait(false);
                var id = d.Value<string>("id");
                if (d.Value<string>("durum") == "tamam") break;
                var parcaBoyutu = d.Value<int>("parcaBoyutu");
                var parcaSayisi = d.Value<int>("parcaSayisi");
                var alinan = new System.Collections.Generic.HashSet<int>(d["alinan"].Select(x => (int)x));
                o.Gonderilen = Math.Min(o.Boyut, (long)alinan.Count * parcaBoyutu);
                Kaydet();

                var tampon = new byte[parcaBoyutu];
                using (var f = new FileStream(o.YerelYol, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
                {
                    for (var no = 0; no < parcaSayisi; no++)
                    {
                        if (alinan.Contains(no)) continue;
                        iptal.ThrowIfCancellationRequested();
                        f.Position = (long)no * parcaBoyutu;
                        var n = OkuTam(f, tampon);
                        var parcaNo = no;
                        await Tekrarla(async () =>
                        {
                            // 422 = parça yolda bozuldu → hemen yeniden (3 kez), sonra geçici hata gibi bekle.
                            for (var k = 1; ; k++)
                            {
                                try { await _servis.ParcaGonder(id, parcaNo, tampon, n, iptal).ConfigureAwait(false); return null; }
                                catch (ServisHatasi e) when (e.DurumKodu == 422 && k < 3) { }
                                catch (ServisHatasi e) when (e.DurumKodu == 422) { throw new ServisHatasi(e.Message, 0); }
                            }
                        }, iptal).ConfigureAwait(false);
                        o.Gonderilen += n;
                        o.Yuzde = (int)(o.Gonderilen * 100 / Math.Max(1, o.Boyut));
                        if (no % 8 == 0) Kaydet(); else _degisti();
                    }
                }

                try
                {
                    await Tekrarla(() => _servis.DosyaBitir(id), iptal).ConfigureAwait(false);
                    break;
                }
                catch (ServisHatasi e) when ((e.DurumKodu == 422 || e.DurumKodu == 409) && tur < 2)
                {
                    // 422: bütün tutmadı, sunucu parçaları sıfırladı. 409: eksik parça (yarışta).
                    // İkisinde de /api/dosya yeniden sorulur, eksikler gönderilir.
                }
            }

            // 4) Bitti — yerel yedek silinir (disk dolmasın).
            try { File.Delete(o.YerelYol); } catch { }
            o.Durum = "tamam"; o.Yuzde = 100; o.Gonderilen = o.Boyut;
            Kaydet();
        }

        /// <summary>
        /// Geçici hatalarda (bağlantı, 5xx, 408/429, bozuk parça 422) bekleyip yeniden dener;
        /// kalıcı hatada (4xx) bırakır. Bağlantı gelene kadar sonsuz dener — kullanıcı duraklatabilir.
        /// </summary>
        private async Task<Newtonsoft.Json.Linq.JObject> Tekrarla(Func<Task<Newtonsoft.Json.Linq.JObject>> is_, CancellationToken iptal)
        {
            var bekleme = 3;
            for (var deneme = 1; ; deneme++)
            {
                try
                {
                    var sonuc = await is_().ConfigureAwait(false);
                    if (Bilgi != null) { Bilgi = null; _degisti(); }
                    return sonuc;
                }
                catch (ServisHatasi e) when (Gecici(e.DurumKodu))
                {
                    Bilgi = e.Message + $" — {bekleme} sn sonra yeniden denenecek (deneme {deneme}).";
                    _degisti();
                    await Task.Delay(TimeSpan.FromSeconds(bekleme), iptal).ConfigureAwait(false);
                    bekleme = Math.Min(60, bekleme * 2);
                }
            }
        }

        private static bool Gecici(int kod) => kod == 0 || kod == 408 || kod == 429 || kod >= 500;

        private static int OkuTam(Stream s, byte[] tampon)
        {
            var toplam = 0;
            while (toplam < tampon.Length)
            {
                var n = s.Read(tampon, toplam, tampon.Length - toplam);
                if (n <= 0) break;
                toplam += n;
            }
            return toplam;
        }

        private string Ozet(IsOgesi o, CancellationToken iptal)
        {
            using (var h = SHA256.Create())
            using (var f = new FileStream(o.YerelYol, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
            {
                var tampon = new byte[1 << 20];
                long okunan = 0;
                int n;
                while ((n = f.Read(tampon, 0, tampon.Length)) > 0)
                {
                    iptal.ThrowIfCancellationRequested();
                    h.TransformBlock(tampon, 0, n, null, 0);
                    okunan += n;
                    var y = (int)(okunan * 100 / Math.Max(1, f.Length));
                    if (y != o.Yuzde) { o.Yuzde = y; _degisti(); }
                }
                h.TransformFinalBlock(new byte[0], 0, 0);
                return BitConverter.ToString(h.Hash).Replace("-", "").ToLowerInvariant();
            }
        }
    }
}
