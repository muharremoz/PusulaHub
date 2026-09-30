using System;
using System.Collections.Generic;
using System.IO;
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
                        // Paketlerin dosya listesi (on binlerce yol) ekrana gitmez.
                        ogeler = _is.Ogeler.Select(o => new { o.Tip, o.Tur, o.Ad, o.Durum, o.Yuzde, o.Boyut, o.Gonderilen, o.Hata, o.VeriMb }).ToList(),
                        sikistir = _is.Sikistir,
                        suruyor = _aktarimSuruyor,
                        bitti = _is.Bitti,
                        bilgi = _aktarici?.Bilgi,
                        bildirildi = _yuklemeBildirildi,
                        yedekKlasoru = Yedekleyici.Klasor,
                        sunucu = _sunucu == null ? null : new
                        {
                            durum = _sunucu.Value<string>("durum"),
                            asama = _sunucu.Value<string>("asama"),
                            ilerleme = _sunucu.Value<int?>("ilerleme") ?? 0,
                            hata = _sunucu.Value<string>("hata"),
                        },
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

        /// <summary>
        /// Arayüzün seçimi:
        ///   veritabanlari: [{ ad, eski }]         eski = true → Depo "Eski Datalar"a
        ///   resimler:      [{ yol, altKlasor }]   Depo Resimler\{firma}\{altKlasor}
        ///   eskiDosyalar:  [yol]                  diskteki eski yıl .mdf/.bak/.zip → Eski Datalar
        ///   programlar:    [{ yol, program }]     exe + parametre → terminal Aktarim\{program}
        ///   ekKlasorler:   [yol]                  terminal Aktarim\Ek Dosyalar\{klasör adı}
        /// </summary>
        public Task<object> AktarimBaslat(JObject secim)
        {
            KesifRaporu k;
            JObject oturum;
            lock (_kilit) { k = _kesif; oturum = _oturum; }
            if (k == null) throw new KullaniciHatasi("Önce tarama tamamlanmalı.");
            secim = secim ?? new JObject();
            var hedefler = oturum?["hedefler"] as JObject;
            bool Acik(string h) => hedefler == null || hedefler.Value<bool?>(h) != false;
            var kayit = new IsKaydi { OturumId = OturumId, Sikistir = k.Sql.SikistirmaVar };
            var adlar = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // --- veritabanları
            var vtSecim = (secim["veritabanlari"] as JArray ?? new JArray()).OfType<JObject>().ToList();
            if (vtSecim.Count > 0)
            {
                if (!k.Sql.Yerel)
                    throw new KullaniciHatasi("SQL Server bu bilgisayarda değil (" + k.Sql.MakineAdi + "). Veritabanlarını aktarmak için uygulamayı SQL Server'ın kurulu olduğu bilgisayarda çalıştırın.");
                var vtler = new List<(VeritabaniBilgisi v, bool eski)>();
                foreach (var s in vtSecim)
                {
                    var v = k.Veritabanlari.FirstOrDefault(x => string.Equals(x.Ad, s.Value<string>("ad"), StringComparison.OrdinalIgnoreCase));
                    if (v == null) continue;
                    if (v.Durum != "ONLINE") throw new KullaniciHatasi("Çevrimdışı veritabanı yedeklenemez: " + v.Ad);
                    vtler.Add((v, s.Value<bool?>("eski") == true));
                }
                if (vtler.Any(x => x.eski) && !Acik("depo")) throw new KullaniciHatasi("Bu aktarımda eski yıl alanı kapalı (Depo sunucusu tanımlı değil).");
                // Her yedek yüklenince silinir → en büyük tek yedeğe yer yeter (+ %20 pay).
                var gerekli = (long)(vtler.Max(x => x.v.VeriMb) * (k.Sql.SikistirmaVar ? 0.5 : 1.0) * 1.2 * 1024 * 1024);
                var bos = Yedekleyici.BosYer();
                if (bos >= 0 && bos < gerekli)
                    throw new KullaniciHatasi($"{Path.GetPathRoot(Yedekleyici.Klasor)} sürücüsünde yer yetersiz: en az {gerekli / 1048576:N0} MB boş yer gerekli, {bos / 1048576:N0} MB var.");
                foreach (var (v, eski) in vtler.OrderBy(x => x.eski).ThenByDescending(x => x.v.Tur == "transfer").ThenBy(x => x.v.Ad))
                {
                    kayit.Ogeler.Add(new IsOgesi
                    {
                        Tip = "vt", Tur = eski ? "eski" : "veritabani", Ad = v.Ad, Veritabani = v.Ad,
                        Yol = v.Ad + ".bak", YerelYol = Path.Combine(Yedekleyici.Klasor, v.Ad + ".bak"), VeriMb = v.VeriMb,
                    });
                }
            }

            // --- resim klasörleri → paketler
            foreach (var s in (secim["resimler"] as JArray ?? new JArray()).OfType<JObject>())
            {
                if (!Acik("depo")) throw new KullaniciHatasi("Bu aktarımda resim alanı kapalı (Depo sunucusu tanımlı değil).");
                var kok = s.Value<string>("yol");
                if (string.IsNullOrWhiteSpace(kok) || !Directory.Exists(kok)) throw new KullaniciHatasi("Resim klasörü bulunamadı: " + kok);
                var alt = (s.Value<string>("altKlasor") ?? "").Trim().Trim('\\', '/');
                PaketEkle(kayit, kok, alt, "resim", "Resimler" + (alt.Length > 0 ? " · " + alt : ""),
                    ad => Paketleyici.ResimUzantilari.Contains(Path.GetExtension(ad).ToLowerInvariant()));
            }

            // --- diskteki eski yıl dosyaları
            foreach (var yol in (secim["eskiDosyalar"] as JArray ?? new JArray()).Values<string>())
            {
                if (!Acik("depo")) throw new KullaniciHatasi("Bu aktarımda eski yıl alanı kapalı (Depo sunucusu tanımlı değil).");
                var fi = new FileInfo(yol);
                if (!fi.Exists) throw new KullaniciHatasi("Dosya bulunamadı: " + yol);
                if (!adlar.Add("eski/" + fi.Name)) throw new KullaniciHatasi("Aynı adlı iki eski yıl dosyası seçildi: " + fi.Name);
                kayit.Ogeler.Add(new IsOgesi { Tip = "dosya", Tur = "eski", Ad = fi.Name, Yol = fi.Name, YerelYol = fi.FullName, VeriMb = fi.Length / 1048576.0 });
            }

            // --- program klasörleri: katalogdaki exe + parametre dosyaları
            var katalog = (oturum?["programlar"] as JArray ?? new JArray()).OfType<JObject>().ToList();
            foreach (var s in (secim["programlar"] as JArray ?? new JArray()).OfType<JObject>())
            {
                if (!Acik("rdp")) throw new KullaniciHatasi("Bu aktarımda program alanı kapalı (terminal sunucusu tanımlı değil).");
                var klasor = s.Value<string>("yol");
                var program = s.Value<string>("program");
                if (string.IsNullOrWhiteSpace(program)) throw new KullaniciHatasi("Program klasörü için program seçin: " + klasor);
                if (!Directory.Exists(klasor)) throw new KullaniciHatasi("Program klasörü bulunamadı: " + klasor);
                var tanim = katalog.FirstOrDefault(p => p.Value<string>("name") == program);
                var exeAdi = tanim?.Value<string>("exeName");
                var exeler = Directory.GetFiles(klasor, "*.exe")
                    .Where(f => string.IsNullOrEmpty(exeAdi) || string.Equals(Path.GetFileName(f), exeAdi, StringComparison.OrdinalIgnoreCase)).ToList();
                var parametreler = Directory.GetFiles(klasor, "*arametre*.txt").ToList();
                foreach (var f in exeler.Select(x => (x, false)).Concat(parametreler.Select(x => (x, true))))
                {
                    var ad = Path.GetFileName(f.Item1);
                    if (!adlar.Add("program/" + program + "/" + ad)) continue;
                    kayit.Ogeler.Add(new IsOgesi
                    {
                        Tip = "dosya", Tur = "program", Ad = program + " · " + ad, Yol = program + "/" + ad, YerelYol = f.Item1,
                        VeriMb = new FileInfo(f.Item1).Length / 1048576.0,
                        Meta = new Dictionary<string, object> { ["program"] = program, ["param"] = f.Item2 },
                    });
                }
            }

            // --- ek klasörler → paketler (klasör adıyla)
            foreach (var yol in (secim["ekKlasorler"] as JArray ?? new JArray()).Values<string>())
            {
                if (!Acik("rdp")) throw new KullaniciHatasi("Bu aktarımda ek dosya alanı kapalı (terminal sunucusu tanımlı değil).");
                if (!Directory.Exists(yol)) throw new KullaniciHatasi("Klasör bulunamadı: " + yol);
                var ad = new DirectoryInfo(yol).Name;
                PaketEkle(kayit, yol, ad, "ek", "Ek dosyalar · " + ad, null);
            }

            if (kayit.Ogeler.Count == 0) throw new KullaniciHatasi("Aktarılacak bir şey seçilmedi.");
            kayit.Yaz();
            lock (_kilit) { _is = kayit; _yuklemeBildirildi = false; }
            Asama("aktarim");
            AktarimiCalistir();
            return Task.FromResult(Durum());
        }

        /// <summary>Klasörü paketlere böler; her paket ayrı, devam edebilen öğe.</summary>
        private static void PaketEkle(IsKaydi kayit, string kok, string altKlasor, string hedefTur, string ad, Func<string, bool> suzgec)
        {
            var paketler = Paketleyici.Planla(kok, suzgec);
            if (paketler.Count == 0) throw new KullaniciHatasi("Klasörde gönderilecek dosya yok: " + kok);
            var n = kayit.Ogeler.Count(o => o.Tip == "paket");
            for (var i = 0; i < paketler.Count; i++)
            {
                n++;
                var dosyaAdi = $"{hedefTur}-{n:D4}.pkt";
                kayit.Ogeler.Add(new IsOgesi
                {
                    Tip = "paket", Tur = "paket", Ad = ad + (paketler.Count > 1 ? $" ({i + 1}/{paketler.Count})" : "") + $" · {paketler[i].Count:N0} dosya",
                    Yol = dosyaAdi, YerelYol = Path.Combine(Paketleyici.Klasor, dosyaAdi),
                    KaynakKok = kok, Dosyalar = paketler[i],
                    Meta = new Dictionary<string, object> { ["hedefTur"] = hedefTur, ["altKlasor"] = altKlasor },
                });
            }
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
                return;
            }
            _ = Task.Run(SunucuyuIzle);
        }

        private JObject _sunucu;
        private int _izleniyor;

        /// <summary>Pusula tarafında dosyaların sunuculara taşınmasını izler (tamamlanana kadar).</summary>
        private async Task SunucuyuIzle()
        {
            if (Interlocked.Exchange(ref _izleniyor, 1) == 1) return;
            try
            {
                for (var i = 0; i < 2000; i++)
                {
                    try
                    {
                        var o = await _servis.Oturum();
                        lock (_kilit) _sunucu = o;
                        if (o.Value<string>("durum") == "tamamlandi")
                        {
                            // Bitti: yarım iş kaydı ve oturum tokenı artık gereksiz.
                            _is?.Sil();
                            IsKaydi.TokenSil();
                            return;
                        }
                    }
                    catch { /* bağlantı geçici — bir sonraki turda */ }
                    await Task.Delay(TimeSpan.FromSeconds(5));
                }
            }
            finally { Interlocked.Exchange(ref _izleniyor, 0); }
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
