using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
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

        private IsKaydi _is;
        private Aktarici _aktarici;
        private CancellationTokenSource _aktarimIptal;
        private bool _aktarimSuruyor;
        private bool _yuklemeBildirildi;

        public Uygulama(ServisIstemci servis)
        {
            _servis = servis;
            // Kayıtlı oturum (DPAPI) varsa kod sormadan sürdür — yarım aktarım kaldığı yerden.
            var token = IsKaydi.TokenOku();
            if (token != null)
            {
                _asama = "acilis";
                _ = Task.Run(() => KayitliOturum(token));
            }
        }

        private async Task KayitliOturum(string token)
        {
            _servis.Token = token;
            try
            {
                var oturum = await _servis.Oturum();
                lock (_kilit) _oturum = oturum;
                Asama("sqlAraniyor");
                await OtomatikBaglan();
            }
            catch (ServisHatasi e) when (e.DurumKodu != 0)
            {
                // Süresi dolmuş / iptal / tamamlanmış → kodla yeniden giriş.
                IsKaydi.TokenSil();
                _servis.Token = null;
                Asama("giris", e.DurumKodu == 401 ? null : e.Message);
            }
            catch (Exception)
            {
                // Bağlantı yok — kod ekranında internet uyarısıyla bekle; token saklı kalır.
                _servis.Token = null;
                Asama("giris", "Pusula sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edip kodu yeniden girin.");
            }
        }

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
                    aktarim = _is == null ? null : new
                    {
                        ogeler = _is.Ogeler,
                        sikistir = _is.Sikistir,
                        suruyor = _aktarimSuruyor,
                        bitti = _is.Bitti,
                        bilgi = _aktarici?.Bilgi,
                        bildirildi = _yuklemeBildirildi,
                        yedekKlasoru = Yedekleyici.Klasor,
                    },
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
            IsKaydi.TokenYaz(_servis.Token);
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
            // Yarım aktarım varsa taramayı atla, kaldığı yerden sür.
            var kayit = IsKaydi.Oku(OturumId);
            if (kayit != null && kayit.Ogeler.Count > 0)
            {
                lock (_kilit) { _is = kayit; _ilerleme = null; }
                Asama("aktarim");
                if (!kayit.Bitti) AktarimiCalistir();
                else _ = Task.Run(YuklemeyiBildir);
                return Task.CompletedTask;
            }
            return KesifBaslat();
        }

        private string OturumId { get { lock (_kilit) return _oturum?.Value<string>("id"); } }

        // ------------------------------------------------------------ aktarım

        public Task<object> AktarimBaslat(IEnumerable<string> secilen)
        {
            var adlar = (secilen ?? Enumerable.Empty<string>()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            KesifRaporu k;
            lock (_kilit) k = _kesif;
            if (k == null) throw new KullaniciHatasi("Önce tarama tamamlanmalı.");
            if (adlar.Count == 0) throw new KullaniciHatasi("Aktarılacak en az bir veritabanı seçin.");
            if (!k.Sql.Yerel)
                throw new KullaniciHatasi("SQL Server bu bilgisayarda değil (" + k.Sql.MakineAdi + "). Uygulamayı SQL Server'ın kurulu olduğu bilgisayarda çalıştırın.");
            var vtler = k.Veritabanlari.Where(v => adlar.Contains(v.Ad, StringComparer.OrdinalIgnoreCase)).ToList();
            var cevrimdisi = vtler.Where(v => v.Durum != "ONLINE").Select(v => v.Ad).ToList();
            if (cevrimdisi.Count > 0) throw new KullaniciHatasi("Çevrimdışı veritabanı yedeklenemez: " + string.Join(", ", cevrimdisi));

            // Her öğe yüklenince yerel yedek silinir → en büyük tek yedeğe yer yeter (+ %20 pay).
            var oran = k.Sql.SikistirmaVar ? 0.5 : 1.0;
            var gerekli = (long)(vtler.Max(v => v.VeriMb) * oran * 1.2 * 1024 * 1024);
            var bos = Yedekleyici.BosYer();
            if (bos >= 0 && bos < gerekli)
                throw new KullaniciHatasi($"{System.IO.Path.GetPathRoot(Yedekleyici.Klasor)} sürücüsünde yer yetersiz: en az {gerekli / 1048576:N0} MB boş yer gerekli, {bos / 1048576:N0} MB var.");

            var kayit = new IsKaydi { OturumId = OturumId, Sikistir = k.Sql.SikistirmaVar };
            foreach (var v in vtler.OrderByDescending(v => v.Tur == "transfer").ThenBy(v => v.Ad))
            {
                kayit.Ogeler.Add(new IsOgesi
                {
                    Ad = v.Ad,
                    Yol = v.Ad + ".bak",
                    YerelYol = System.IO.Path.Combine(Yedekleyici.Klasor, v.Ad + ".bak"),
                    VeriMb = v.VeriMb,
                });
            }
            kayit.Yaz();
            lock (_kilit) { _is = kayit; _yuklemeBildirildi = false; }
            Asama("aktarim");
            AktarimiCalistir();
            return Task.FromResult(Durum());
        }

        public Task<object> Duraklat()
        {
            _aktarimIptal?.Cancel();
            return Task.FromResult(Durum());
        }

        /// <summary>Uygulama kapanıyor: süren yedek/yükleme kesilir, iş kaydı yazılır.</summary>
        public void Kapat()
        {
            try { _aktarimIptal?.Cancel(); } catch { }
            try { _is?.Yaz(); } catch { }
        }

        public Task<object> Devam()
        {
            if (_is == null) throw new KullaniciHatasi("Sürdürülecek aktarım yok.");
            AktarimiCalistir();
            return Task.FromResult(Durum());
        }

        private void AktarimiCalistir()
        {
            lock (_kilit)
            {
                if (_aktarimSuruyor) return;
                _aktarimSuruyor = true;
                _aktarimIptal = new CancellationTokenSource();
                _aktarici = new Aktarici(_is, _sql, _servis, () => { });
            }
            var iptal = _aktarimIptal.Token;
            _ = Task.Run(async () =>
            {
                try { await _aktarici.Calistir(iptal); }
                catch (OperationCanceledException) { }
                catch (Exception e) { lock (_kilit) _mesaj = "Aktarım durdu: " + e.GetBaseException().Message; }
                finally { lock (_kilit) _aktarimSuruyor = false; }
                if (_is.Bitti) await YuklemeyiBildir();
            });
        }

        /// <summary>Hepsi yüklendi → servise haber (3. aşamada sunucu geri yüklemeyi başlatır).</summary>
        private async Task YuklemeyiBildir()
        {
            try
            {
                await _servis.Tamamla();
                lock (_kilit) _yuklemeBildirildi = true;
            }
            catch (Exception e)
            {
                lock (_kilit) _mesaj = "Yükleme bitti ama Pusula'ya bildirilemedi: " + e.Message;
            }
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
