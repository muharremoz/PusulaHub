using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace PusulaAktarim
{
    /// <summary>
    /// Uygulamanın durumu ve adımları. Arayüz her şeyi GET /durum'dan okur.
    ///
    /// Aşamalar:
    ///   giris        → aktarım kodu bekleniyor
    ///   sqlAraniyor  → yerel SQL Server'a otomatik bağlanma deneniyor
    ///   sqlGiris     → otomatik bağlanılamadı, elle giriş
    ///   kesif        → datalar/klasörler taranıyor
    ///   hazir        → keşif bitti, rapor gösteriliyor (2. aşamada: seçim + yükleme)
    /// </summary>
    internal sealed class Uygulama
    {
        private readonly ServisIstemci _servis;
        private readonly object _kilit = new object();

        private string _asama = "giris";
        private JObject _oturum;
        private SqlHedef _sql;
        private readonly List<object> _sqlDenemeleri = new List<object>();
        private string _ilerleme;
        private KesifRaporu _kesif;
        private string _kesifHatasi;
        private bool _kesifGonderildi;
        private string _mesaj;

        public Uygulama(ServisIstemci servis) { _servis = servis; }

        public object Durum()
        {
            lock (_kilit)
            {
                return new
                {
                    asama = _asama,
                    makine = Environment.MachineName,
                    surum = ServisIstemci.Surum,
                    oturum = _oturum,
                    sql = _sql == null ? null : new { sunucu = _sql.Sunucu, kaynak = _sql.Kaynak, kullanici = _sql.Kullanici },
                    sqlDenemeleri = _sqlDenemeleri.ToList(),
                    yerelSunucular = SqlBaglanti.YerelOrnekler(),
                    ilerleme = _ilerleme,
                    kesif = _kesif,
                    kesifHatasi = _kesifHatasi,
                    kesifGonderildi = _kesifGonderildi,
                    mesaj = _mesaj,
                };
            }
        }

        private void Asama(string a, string mesaj = null)
        {
            lock (_kilit) { _asama = a; _mesaj = mesaj; }
        }

        // ------------------------------------------------------------ giriş

        public async Task<object> Giris(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Aktarım kodunu girin.");
            var oturum = await _servis.Giris(kod.Trim(), Environment.MachineName);
            lock (_kilit) { _oturum = oturum; }
            Asama("sqlAraniyor");
            _ = Task.Run(OtomatikBaglan);
            return Durum();
        }

        // ------------------------------------------------------------ SQL bağlantısı

        private async Task OtomatikBaglan()
        {
            lock (_kilit) { _sqlDenemeleri.Clear(); _ilerleme = "SQL Server aranıyor…"; }
            SqlHedef ilkBasarili = null;
            foreach (var aday in SqlBaglanti.Adaylar())
            {
                lock (_kilit) _ilerleme = "Bağlanılıyor: " + aday.Sunucu + (aday.Kullanici == null ? " (Windows oturumu)" : " (" + aday.Kullanici + ")");
                var hata = await SqlBaglanti.Dene(aday);
                lock (_kilit) _sqlDenemeleri.Add(new { sunucu = aday.Sunucu, kaynak = aday.Kaynak, hata });
                if (hata != null) continue;
                if (await SqlBaglanti.SirketVar(aday)) { await Baglandi(aday); return; }
                if (ilkBasarili == null) ilkBasarili = aday;
            }
            if (ilkBasarili != null) { await Baglandi(ilkBasarili); return; }
            lock (_kilit) _ilerleme = null;
            Asama("sqlGiris", "SQL Server'a otomatik bağlanılamadı. Sunucu adını ve SQL kullanıcısını girin.");
        }

        public async Task<object> ElleBaglan(string sunucu, string kullanici, string sifre)
        {
            if (string.IsNullOrWhiteSpace(sunucu)) throw new KullaniciHatasi("SQL Server adını girin (ör. . ya da .\\SQLEXPRESS).");
            var h = new SqlHedef
            {
                Sunucu = sunucu.Trim(),
                Kullanici = string.IsNullOrWhiteSpace(kullanici) ? null : kullanici.Trim(),
                Sifre = sifre,
                Kaynak = string.IsNullOrWhiteSpace(kullanici) ? "windows" : "elle",
            };
            var hata = await SqlBaglanti.Dene(h);
            if (hata != null) throw new KullaniciHatasi("Bağlanılamadı: " + hata);
            await Baglandi(h);
            return Durum();
        }

        private Task Baglandi(SqlHedef h)
        {
            lock (_kilit) { _sql = h; }
            return KesifBaslat();
        }

        // ------------------------------------------------------------ keşif

        public Task<object> YenidenKesif()
        {
            if (_sql == null) throw new KullaniciHatasi("Önce SQL Server'a bağlanın.");
            _ = Task.Run(KesifBaslat);
            return Task.FromResult(Durum());
        }

        private async Task KesifBaslat()
        {
            lock (_kilit) { _kesif = null; _kesifHatasi = null; _kesifGonderildi = false; }
            Asama("kesif");
            try
            {
                var rapor = await Kesif.Calistir(_sql, m => { lock (_kilit) _ilerleme = m; });
                lock (_kilit) { _kesif = rapor; _ilerleme = "Rapor Pusula'ya gönderiliyor…"; }
                try
                {
                    await _servis.KesifGonder(rapor);
                    lock (_kilit) _kesifGonderildi = true;
                }
                catch (Exception e)
                {
                    lock (_kilit) _kesifHatasi = "Rapor gönderilemedi: " + e.Message;
                }
            }
            catch (Exception e)
            {
                lock (_kilit) _kesifHatasi = "Tarama tamamlanamadı: " + e.GetBaseException().Message;
            }
            lock (_kilit) _ilerleme = null;
            Asama("hazir");
        }
    }
}
