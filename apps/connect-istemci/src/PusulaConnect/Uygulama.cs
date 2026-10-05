using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace PusulaConnect
{
    /// <summary>
    /// Durum + işlemler. Arayüz her şeyi GET /durum'dan okur.
    ///   acilis → kayıtlı cihaz varsa profil tazelenir
    ///   kayit  → kurulum kodu bekleniyor
    ///   hazir  → ana ekran (kontroller + Bağlan)
    /// </summary>
    internal sealed class Uygulama
    {
        private readonly ServisIstemci _servis;
        private readonly object _kilit = new object();
        private string _asama = "acilis";
        private JObject _kayit;              // { firmaId, firmaAdi, kullanici, profil }
        private string _mesaj;
        private bool _servisErisim = true;

        /// <summary>
        /// Gömülü oturum (Program bağlar → ConnectPenceresi.OturumAc). Null ise (WebView2 yok, tarayıcıda
        /// çalışıyor) yedek yol: mstsc. Geri çağrı (mesaj, şifreHatalı) oturum bitince gelir.
        /// </summary>
        public Action<RdpAyar, Action<string, bool, int>> OturumAc;
        public Func<bool> OturumAcikMi;
        /// <summary>Açık gömülü oturumu keser (kayıt Pusula'dan kapatılınca).</summary>
        public Action OturumKes;
        private string _oturumMesaji;

        // kontroller
        private string _fortiSurum;
        private bool _profilDogru;
        private (bool erisim, int ms, string hata) _terminal;
        private DateTime _terminalZaman;
        private string _rdpKullanici;
        private bool _vpnKullaniciAdi;      // FortiClient'ta bu tünel için kullanıcı adı kayıtlı mı
        private string _vpnSifre = "yok";   // FortiClient'ta şifre: kayitli | isaretsiz | yok (Fortinet.SifreKayitDurumu)
        private bool _vpnKuruluyor;
        private JObject _vpnDurum;
        private string _sonSurum;
        private bool _guncelleniyor;
        private string _minSurum, _sonSha256, _sonImza, _guncellemeNotlari, _guncellemeHatasi;
        private int _guncellemeYuzde;

        // duyurular (Hub → müşteri)
        private JArray _duyurular = new JArray();
        /// <summary>Veritabanı yedekleri (ana ekran kartı): { simdi, liste, zaman, hata, yenileniyor }. 30 dk'da bir ve elle.</summary>
        private JObject _yedekler;
        private DateTime _yedekZaman = DateTime.MinValue;
        private int _yedekTazeleniyor;
        private string _duyuruImza;
        private int _duyuruTazeleniyor;
        /// <summary>Yeni (okunmamış, daha önce bildirilmemiş) duyuru geldi: (başlık, metin, önem). Program tepside bildirim gösterir.</summary>
        public Action<string, string, string> Bildir;

        public Action Kapat { get; set; }

        public Uygulama(ServisIstemci servis)
        {
            _servis = servis;
            _ = Task.Run(GuncellemeDongusu);
            var token = Kimlik.Token();
            if (token == null) { _asama = "kayit"; return; }
            _servis.Token = token;
            _kayit = Kimlik.Profil();
            _asama = _kayit != null ? "hazir" : "kayit";
            // Yerel denetim (FortiClient, VPN ayarı, şifre, sunucu) diskteki profille hemen başlar — servisten
            // profilin gelmesini beklerse ilk ekran birkaç saniye boş/yanlış görünüyordu. ProfilTazele sonra yeniden denetler.
            if (_kayit != null) _ = Task.Run(Kontrol);
            _ = Task.Run(ProfilTazele);
        }

        /// <summary>Hub'da profil değiştiyse (VPN adresi, terminal) yeni değerler gelir. Servise ulaşılamazsa son bilinenle devam.</summary>
        private async Task ProfilTazele()
        {
            try
            {
                KayitUygula(await _servis.Profil());
                var onceki = Yerlesim.OncekiSurumAl();
                if (onceki != null) _ = _servis.Olay("guncellendi", onceki + " → " + ServisIstemci.Surum);
                else _ = _servis.Olay("uygulama_acildi", ServisIstemci.Surum);
            }
            catch (ServisHatasi e) when (e.DurumKodu == 401 || e.DurumKodu == 410)
            {
                KaydiKapat(e.Message);
            }
            catch (Exception e)
            {
                lock (_kilit) _servisErisim = false;
                Gunluk.Yaz("Profil tazelenemedi (son bilinen kullanılıyor): " + e.Message);
            }
            _ = Task.Run(GuncellemeyeBak);
            _ = Task.Run(() => DuyurulariTazele());
            _ = Task.Run(() => YedekleriTazele());
            await SifreyiEsitle();
            await SayimiEsitle();
            await Kontrol();
        }

        private void KayitUygula(JObject k)
        {
            Kimlik.ProfilYaz(k);
            // Pusula 2FA'yı sıfırladıysa eski kasa dosyası artık çözülemez — temizle (kullanıcı şifreyi yeniden girer)
            if (k["ikiAdim"]?.Value<bool?>("aktif") != true && Rdp.KasaliSifreVar) Rdp.KasaliSil();
            lock (_kilit) { _kayit = k; _asama = "hazir"; _servisErisim = true; _profilImza = k.Value<string>("profilImza"); _sayimImza = k.Value<string>("sayimImza"); }
        }

        // ------------------------------------------------------------ Hub'dan gelen değişiklikler (sunucu, şifre)

        private string _profilImza;
        /// <summary>Hub'daki sayım (SQL) bilgisinin imzası — kayıt/nabız yanıtından; Sayim.UygulananImza'dan farklıysa server.xml yenilenir.</summary>
        private string _sayimImza;
        private int _profilYenileniyor;
        private bool _sifreBekliyor;          // 2FA açık: yeni şifre bir sonraki bağlanmada kodla alınacak
        private string _sifreBilgi;
        private DateTime _sifreBilgiZaman;

        /// <summary>Nabızda profil imzası değişti: Hub'da sunucu ya da şifre değişmiş — profili tazele, şifreyi eşitle.</summary>
        private async Task ProfilYenile()
        {
            if (Interlocked.Exchange(ref _profilYenileniyor, 1) == 1) return;
            try
            {
                var eskiRdp = P("rdp");
                KayitUygula(await _servis.Profil());
                var yeniRdp = P("rdp");
                if (eskiRdp != null && yeniRdp != null && eskiRdp != yeniRdp)
                {
                    Gunluk.Yaz("Sunucu bilgisi Pusula'dan güncellendi: " + eskiRdp + " → " + yeniRdp);
                    Rdp.SifreSil(eskiRdp);
                }
                await SifreyiEsitle();
                await SayimiEsitle();
                await Kontrol();
            }
            catch (Exception e) { Gunluk.Yaz("Profil yenilenemedi: " + e.Message); }
            finally { Interlocked.Exchange(ref _profilYenileniyor, 0); }
        }

        /// <summary>Son alınan/bilinen Hub şifre sürümü — aynı şifre tekrar tekrar çekilmesin.</summary>
        private static string BilinenSurumDosyasi => System.IO.Path.Combine(Kimlik.Klasor, "sifre-surumu.txt");
        private static string BilinenSurum
        {
            get { try { return System.IO.File.Exists(BilinenSurumDosyasi) ? System.IO.File.ReadAllText(BilinenSurumDosyasi).Trim() : null; } catch { return null; } }
            set { try { if (value == null) System.IO.File.Delete(BilinenSurumDosyasi); else System.IO.File.WriteAllText(BilinenSurumDosyasi, value); } catch { } }
        }
        private string HubSurum { get { lock (_kilit) return _kayit?.Value<string>("sifreSurumu"); } }
        /// <summary>"Hub'da şifre yoktu" işareti — sonradan Hub'dan sıfırlanınca fark (yeni sürüm) görülsün.</summary>
        private const string YokSurum = "-";

        /// <summary>
        /// Hub'da şifre sıfırlandıysa (sürüm değişti) ya da hiç kayıtlı şifre yoksa yeni şifreyi Hub'dan al.
        /// 2FA açıksa kod gerektiği için bekletilir; bir sonraki bağlanmada kodla alınır.
        /// Kayıtlı şifre geçersiz çıkıp silinmişse ve Hub'daki aynı sürümse tekrar çekilmez (döngü olmasın; kullanıcı girer).
        /// </summary>
        private async Task SifreyiEsitle()
        {
            var hub = HubSurum;
            var bilinen = BilinenSurum;
            var iki = IkiAktif;
            var kayitli = iki ? Rdp.KasaliSifreVar : Rdp.YerelSifreVar;
            // Hub'da şifre yok: bunu not et ("-") — sonradan Hub'dan şifre sıfırlanırsa değişiklik sayılır
            if (hub == null) { if (kayitli && bilinen == null) BilinenSurum = YokSurum; return; }
            if (hub == bilinen) return;
            // Eski sürümden gelen cihaz, Hub'da şifre zaten varken: kullanıcının girdiği şifreyi güncel kabul et
            if (kayitli && bilinen == null) { BilinenSurum = hub; return; }
            if (iki)
            {
                lock (_kilit) { _sifreBekliyor = true; SifreBilgi("Şifreniz Pusula tarafından değiştirildi. Bağlanırken doğrulama kodunu girdiğinizde yeni şifre otomatik alınır."); }
                return;
            }
            try
            {
                var j = await _servis.Sifre(null);
                Rdp.YerelKaydet(j.Value<string>("sifre"));
                var rdp = P("rdp"); if (rdp != null) Rdp.SifreSil(rdp);
                BilinenSurum = j.Value<string>("sifreSurumu") ?? hub;
                lock (_kilit) { _oturumMesaji = null; SifreBilgi(kayitli ? "Şifreniz Pusula tarafından değiştirildi; yeni şifre otomatik alındı." : "Oturum şifreniz Pusula'dan alındı; elle girmeniz gerekmez.", ilk: !kayitli); }
                Gunluk.Yaz("RDP şifresi Pusula'dan alındı (" + (kayitli ? "değişti" : "ilk") + ")");
                _ = _servis.Olay("sifre_guncellendi", kayitli ? "değişti" : "ilk");
            }
            catch (ServisHatasi e) when (e.DurumKodu == 404) { BilinenSurum = hub; /* Hub'da şifre yok: kullanıcı girer */ }
            catch (Exception e) { Gunluk.Yaz("Şifre Pusula'dan alınamadı: " + e.Message); }
        }

        /// <summary>ilk: şifre ilk kurulumda alındı (değişmedi) — arayüz "değişti" demez; kart VPN bağlanana kadar kalır.</summary>
        private void SifreBilgi(string m, bool ilk = false) { _sifreBilgi = m; _sifreBilgiZaman = DateTime.Now; _sifreBilgiIlk = ilk; }
        private bool _sifreBilgiIlk;

        private JObject Profil { get { lock (_kilit) return _kayit?["profil"] as JObject; } }
        /// <summary>Bu cihazda iki adımlı doğrulama açık mı (servisten gelen kayıt).</summary>
        // Bu açılışta doğru kodla gelen kasa anahtarı (yalnız bellekte). "Pusula bağlantısında kod sor" kapalıysa
        // bağlanırken bununla çözülür. _kilitAcik: açılış kilidi bu açılışta açıldı mı.
        private string _kasaAnahtari;
        private bool _kilitAcik;

        /// <summary>Bağlanmak için kod gerekiyor mu: bağlantıda sorulacak, ya da anahtar henüz yok, ya da yeni şifre bekleniyor.</summary>
        private bool KodGerekli
        {
            get
            {
                if (!IkiAktif) return false;
                lock (_kilit) return Ayarlar.Simdiki.IkiBaglanti || _kasaAnahtari == null || _sifreBekliyor;
            }
        }

        private bool IkiAktif { get { lock (_kilit) return _kayit?["ikiAdim"]?.Value<bool?>("aktif") == true; } }
        private void IkiDurumYaz(bool aktif)
        {
            lock (_kilit)
            {
                if (_kayit == null) return;
                _kayit["ikiAdim"] = new JObject { ["aktif"] = aktif };
                Kimlik.ProfilYaz(_kayit);
            }
        }
        private string P(string ad) => Profil?.Value<string>(ad);
        private int RdpPort => Profil?.Value<int?>("rdpPort") ?? 3389;

        // Sunucu adı DNS ile çözülemezse (modem/ISS özel adres yanıtını düşürüyor) profildeki IP'ye düşülür.
        private bool _dnsYok;
        /// <summary>Bağlanılacak adres: ad çözülüyorsa ad, çözülmüyorsa ve IP biliniyorsa IP.</summary>
        private string RdpHedef { get { var ip = P("rdpIp"); lock (_kilit) return _dnsYok && !string.IsNullOrEmpty(ip) ? ip : P("rdp"); } }

        /// <summary>Adı dener; çözülmezse IP ile yoklar. Sonuç _dnsYok'a yazılır (bir kez değişince günlüğe ve olaya düşer).</summary>
        private async Task<(bool erisim, int ms, string hata)> SunucuyuYokla()
        {
            var rdp = P("rdp");
            if (rdp == null) return (false, 0, "profil yok");
            var ip = P("rdpIp");
            var dnsYok = !string.IsNullOrEmpty(ip) && !await Rdp.AdCozulur(rdp);
            bool onceki; lock (_kilit) { onceki = _dnsYok; _dnsYok = dnsYok; }
            if (dnsYok != onceki)
            {
                Gunluk.Yaz(dnsYok ? "Sunucu adı çözülemedi (" + rdp + "), IP ile devam: " + ip : "Sunucu adı yeniden çözülüyor (" + rdp + ")");
                if (dnsYok) _ = _servis.Olay("dns_cozulemedi", new { ad = rdp, ip });
            }
            return await Rdp.Yokla(dnsYok ? ip : rdp, RdpPort);
        }

        public object Durum()
        {
            lock (_kilit)
            {
                if (_vpnKuruluyor)
                {
                    _vpnDurum = VpnKurulumu.Durum() ?? _vpnDurum;
                    if (_vpnDurum?.Value<bool>("bitti") == true)
                    {
                        _vpnKuruluyor = false;
                        var vh = _vpnDurum.Value<string>("hata");
                        // Ayarlar hemen yeniden okunur (yerel kayıt defteri, hızlı): tam denetim birkaç sn sürdüğü için
                        // arada eski "ayar eksik" sonucu kalıyor, "VPN ayarını güncelleyin" alanı gidip geri geliyordu.
                        if (vh == null)
                        {
                            try
                            {
                                var tunel = P("tunel"); var vpn = P("vpn");
                                _fortiSurum = Fortinet.KuruluSurum();
                                _profilDogru = tunel != null && vpn != null && Fortinet.ProfilDogru(tunel, vpn) && Fortinet.SertifikaUyarisiKapali();
                                _vpnKullaniciAdi = tunel != null && Fortinet.KullaniciAdiTanimli(tunel);
                            }
                            catch (Exception e) { Gunluk.Yaz("Kurulum sonrası ayar okunamadı: " + e.Message); }
                        }
                        _ = _servis.Olay(vh == null ? "vpn_kuruldu" : "vpn_kurulum_hatasi", vh);
                        // Ayar değişti ve eski bağlantı kesildi: FortiClient yeni ayarla açılır, kullanıcı yeniden bağlanır.
                        if (_vpnDurum.Value<bool?>("vpnKesildi") == true)
                        {
                            _terminal.erisim = false;
                            try { var fc = Fortinet.ExeYolu(); if (fc != null) Process.Start(new ProcessStartInfo(fc) { UseShellExecute = true }); }
                            catch (Exception e) { Gunluk.Yaz("FortiClient açılamadı: " + e.Message); }
                        }
                        _ = Task.Run(Kontrol);
                    }
                }
                return new
                {
                    asama = _asama,
                    surum = ServisIstemci.Surum,
                    makine = Environment.MachineName,
                    kayit = _kayit,
                    mesaj = _mesaj,
                    servisErisim = _servisErisim,
                    kontroller = new
                    {
                        forti = new { kurulu = _fortiSurum != null, surum = _fortiSurum },
                        profil = new { dogru = _profilDogru, kullaniciAdi = _vpnKullaniciAdi, sifre = _vpnSifre },
                        terminal = new { erisim = _terminal.erisim, ms = _terminal.ms, hata = _terminal.hata, zaman = _terminalZaman == default ? null : _terminalZaman.ToString("s"), dnsYok = _dnsYok },
                        rdpSifre = new { kayitli = _rdpKullanici != null, kullanici = _rdpKullanici },
                    },
                    vpnKurulum = new { suruyor = _vpnKuruluyor, durum = _vpnDurum },
                    ikiAdim = new
                    {
                        aktif = _kayit?["ikiAdim"]?.Value<bool?>("aktif") == true,
                        // Açılışta kod: doğrulanana kadar arayüz kilit ekranı gösterir
                        kilitli = _kayit?["ikiAdim"]?.Value<bool?>("aktif") == true && Ayarlar.Simdiki.IkiAcilis && !_kilitAcik,
                        kodGerekli = _kayit?["ikiAdim"]?.Value<bool?>("aktif") == true && (Ayarlar.Simdiki.IkiBaglanti || _kasaAnahtari == null || _sifreBekliyor),
                    },
                    // Pusula'dan şifre güncellemesi: bekleyen (2FA) sürekli, bilgi mesajı 3 dk görünür
                    sifreGuncelleme = new
                    {
                        bekliyor = _sifreBekliyor,
                        ilk = _sifreBilgiIlk,
                        // İlk kurulumda kullanıcı bu şifreyi FortiClient'a girecek: VPN bağlanana kadar görünür
                        mesaj = _sifreBekliyor || DateTime.Now - _sifreBilgiZaman < TimeSpan.FromMinutes(3) || (_sifreBilgiIlk && !_terminal.erisim) ? _sifreBilgi : null,
                    },
                    oturum = new { acik = OturumAcikMi?.Invoke() == true, mesaj = _oturumMesaji },
                    ayarlar = Ayarlar.Simdiki.Gorunum(),
                    yazdirma = YaziciAjani.KisaDurum(),
                    rfid = RfidYardimcisi.KisaDurum(),
                    sayim = Sayim.KisaDurum(),
                    duyurular = _duyurular,
                    yedekler = _yedekler,
                    guncelleme = new
                    {
                        mevcut = _sonSurum != null && Yerlesim.SurumKarsilastir(_sonSurum, ServisIstemci.Surum) > 0,
                        surum = _sonSurum,
                        suruyor = _guncelleniyor,
                        yuzde = _guncellemeYuzde,
                        notlar = _guncellemeNotlari,
                        // Servisin desteklediği en düşük sürümün altında: yalnız uyarı (bağlanma engellenmez)
                        zorunlu = _minSurum != null && Yerlesim.SurumKarsilastir(ServisIstemci.Surum, _minSurum) < 0,
                        hata = _guncellemeHatasi,
                    },
                    gunluk = Gunluk.Dosya,
                };
            }
        }

        // ------------------------------------------------------------ kayıt

        public async Task<object> Kayit(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Kurulum kodunu girin.");
            var k = await _servis.Kayit(kod.Trim(), Environment.MachineName);
            Kimlik.Kaydet(_servis.Token, k);
            Gunluk.Yaz("Cihaz kaydedildi: " + k.Value<string>("kullanici") + " / " + k.Value<string>("firmaId"));
            lock (_kilit) { _kayit = k; _asama = "hazir"; _mesaj = null; }
            _ = Task.Run(Kontrol);
            return Durum();
        }

        public object KayitSil()
        {
            // Kayıtla birlikte bu cihazdaki şifre de gider (yeni kodla başka kullanıcı gelebilir)
            var rdp = P("rdp");
            if (rdp != null) Rdp.SifreSil(rdp);
            Rdp.YerelSil();
            Rdp.KasaliSil();
            Gunluk.Yaz("Cihaz kaydı kaldırıldı (kullanıcı)");
            try { _servis.Olay("kayit_kaldirildi").Wait(3000); } catch { }
            Kimlik.Sil();
            BilinenSurum = null;
            lock (_kilit) { _kayit = null; _asama = "kayit"; _servis.Token = null; _duyurular = new JArray(); _duyuruImza = null; _yedekler = null; _profilImza = null; _sifreBekliyor = false; _sifreBilgi = null; _kasaAnahtari = null; _kilitAcik = false; }
            return Durum();
        }

        // ------------------------------------------------------------ kontroller

        private int _kontrolSuruyor;

        private int _kontrolTekrar;   // denetim sürerken yeni istek geldi (ör. profil değişti) → bitince bir kez daha

        public async Task Kontrol()
        {
            if (Interlocked.Exchange(ref _kontrolSuruyor, 1) == 1) { Interlocked.Exchange(ref _kontrolTekrar, 1); return; }
            try
            {
                var rdp = P("rdp");
                var forti = Fortinet.KuruluSurum();
                // Sertifika uyarısı açık kalmışsa da "VPN ayarını güncelleyin" çıkar (eski kurulumlar bir kez günceller)
                var profil = P("tunel") != null && P("vpn") != null && Fortinet.ProfilDogru(P("tunel"), P("vpn")) && Fortinet.SertifikaUyarisiKapali();
                // 2FA açıkken kasa anahtarlı dosyada, kapalıyken yerel DPAPI dosyasında
                var rdpKullanici = (IkiAktif ? Rdp.KasaliSifreVar : Rdp.YerelSifreVar) ? _kayit?.Value<string>("kullanici") : null;
                var vpnKullaniciAdi = P("tunel") != null && Fortinet.KullaniciAdiTanimli(P("tunel"));
                var vpnSifre = P("tunel") != null ? Fortinet.SifreKayitDurumu(P("tunel")) : "yok";
                var t = await SunucuyuYokla();
                lock (_kilit)
                {
                    _fortiSurum = forti; _profilDogru = profil; _rdpKullanici = rdpKullanici; _vpnKullaniciAdi = vpnKullaniciAdi; _vpnSifre = vpnSifre;
                    _terminal = t; _terminalZaman = DateTime.Now;
                }
            }
            finally
            {
                Interlocked.Exchange(ref _kontrolSuruyor, 0);
                if (Interlocked.Exchange(ref _kontrolTekrar, 0) == 1) _ = Task.Run(Kontrol);
            }
            await NabizGonder(false);
        }

        public async Task<object> KontrolEt()
        {
            await Kontrol();
            return Durum();
        }

        // ------------------------------------------------------------ işlemler

        public object VpnKur()
        {
            var profil = (JObject)(Profil ?? throw new KullaniciHatasi("Önce kurulum kodunu girin.")).DeepClone();
            // VPN kullanıcı adı = Pusula oturum kullanıcısı (Connect 1.5'te de aynı ad); yönetici adımı FortiClient'a yazar.
            lock (_kilit) profil["kullanici"] = _kayit?.Value<string>("kullanici");
            if (!VpnKurulumu.Baslat(profil))
                throw new KullaniciHatasi("Yönetici izni verilmedi. VPN programını kurmak için açılan Windows penceresinde \"Evet\"i seçin.");
            lock (_kilit) { _vpnKuruluyor = true; _vpnDurum = null; }
            return Durum();
        }

        public object VpnAc()
        {
            var exe = Fortinet.ExeYolu() ?? throw new KullaniciHatasi("FortiClient kurulu değil.");
            Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true });
            return Durum();
        }

        public async Task<object> SifreKaydet(string sifre, string kod = null)
        {
            if (string.IsNullOrEmpty(sifre)) throw new KullaniciHatasi("Şifreyi girin.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            if (IkiAktif)
            {
                // 2FA açık: şifre kasa anahtarıyla saklanır; anahtar yalnız doğru kodla gelir
                if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
                var j = await _servis.IkiDogrula(kod.Trim());
                Rdp.KasaliKaydet(sifre, j.Value<string>("kasaAnahtari"));
                Rdp.SifreSil(rdp);
                Rdp.YerelSil();
                BilinenSurum = HubSurum ?? YokSurum;
                lock (_kilit) { _oturumMesaji = null; _sifreBekliyor = false; }
                Gunluk.Yaz("RDP şifresi kaydedildi (2FA kasası)");
                _ = _servis.Olay("sifre_kaydedildi", "2FA kasası");
                await Kontrol();
                return Durum();
            }
            Rdp.YerelKaydet(sifre);
            Rdp.SifreSil(rdp);
            BilinenSurum = HubSurum ?? YokSurum;
            lock (_kilit) _oturumMesaji = null;
            Gunluk.Yaz("RDP şifresi kaydedildi (" + rdp + ")");
            _ = _servis.Olay("sifre_kaydedildi");
            await Kontrol();
            return Durum();
        }

        public async Task<object> SifreSil()
        {
            var rdp = P("rdp");
            if (rdp != null) Rdp.SifreSil(rdp);
            Rdp.KasaliSil();
            Rdp.YerelSil();
            _ = _servis.Olay("sifre_silindi");
            await Kontrol();
            return Durum();
        }

        public async Task<object> Baglan(string kod = null)
        {
            if (OturumAcikMi?.Invoke() == true) throw new KullaniciHatasi("Oturum zaten açık.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            var t = await SunucuyuYokla();
            var hedef = RdpHedef;
            lock (_kilit) { _terminal = t; _terminalZaman = DateTime.Now; }
            if (!t.erisim)
                throw new KullaniciHatasi("Pusula sunucusuna ulaşılamıyor. Önce VPN'e bağlanın (FortiClient → Bağlan), sonra tekrar deneyin.");
            string kullanici;
            lock (_kilit) kullanici = _kayit?.Value<string>("kullanici");
            string sifre;
            var iki = IkiAktif;
            bool bekliyor; lock (_kilit) bekliyor = _sifreBekliyor;
            if (iki && bekliyor)
            {
                // Pusula şifreyi değiştirmiş: aynı kodla yeni şifre + kasa anahtarı gelir, kasaya yazılır
                if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
                var j = await _servis.Sifre(kod.Trim());
                sifre = j.Value<string>("sifre");
                Rdp.KasaliKaydet(sifre, j.Value<string>("kasaAnahtari"));
                BilinenSurum = j.Value<string>("sifreSurumu") ?? HubSurum;
                lock (_kilit) { _sifreBekliyor = false; _kasaAnahtari = j.Value<string>("kasaAnahtari"); SifreBilgi("Şifreniz Pusula tarafından değiştirildi; yeni şifre alındı."); }
                Gunluk.Yaz("RDP şifresi Pusula'dan alındı (2FA kodu ile)");
                _ = _servis.Olay("sifre_guncellendi", "2FA ile");
            }
            else if (iki)
            {
                if (!Rdp.KasaliSifreVar) throw new KullaniciHatasi("Önce oturum şifresini kaydedin.");
                string anahtar;
                if (!KodGerekli && string.IsNullOrWhiteSpace(kod))
                {
                    lock (_kilit) anahtar = _kasaAnahtari;   // açılışta kodla alındı
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
                    anahtar = (await _servis.IkiDogrula(kod.Trim())).Value<string>("kasaAnahtari");
                    lock (_kilit) _kasaAnahtari = anahtar;
                }
                sifre = Rdp.KasaliOku(anahtar);
            }
            else
            {
                if (!Rdp.YerelSifreVar) throw new KullaniciHatasi("Önce oturum şifresini kaydedin.");
                sifre = Rdp.YerelOku();
            }
            lock (_kilit) _oturumMesaji = null;
            var ad = P("tunel") ?? "Pusula";
            var ac = OturumAc;
            if (ac != null)
            {
                var ay = Ayarlar.Simdiki;
                ac(new RdpAyar
                {
                    Ad = ad, Sunucu = hedef, Port = RdpPort, Domain = P("domain"), Kullanici = kullanici, Sifre = sifre,
                    TamEkran = ay.TamEkran, Yazici = ay.Yazici, Pano = ay.Pano, Ses = ay.Ses,
                    // Akıllı kart ve konum yönlendirmesi kaldırıldı (03.10.2026): ayar yok, hep kapalı
                    AkilliKart = false, Portlar = ay.Portlar, Konum = false, Kamera = ay.Kamera,
                    Aygitlar = ay.Aygitlar, Suruculer = ay.Suruculer,
                }, OturumBitti);
                _oturumBaslangic = DateTime.Now;
                _ = _servis.Olay("oturum_acildi", new { sunucu = rdp, ms = t.ms, ikiAdim = iki, dpi = Ekran.Dpi(null) });
                _ = Task.Run(() => NabizGonder(true));
                Gunluk.Yaz("Oturum açılıyor (uygulama içinde" + (iki ? ", 2FA doğrulandı" : "") + ") → " + rdp + " (" + t.ms + " ms)");
            }
            else
            {
                Rdp.Baglan(ad, hedef, RdpPort, P("domain"), kullanici, sifre);
                Gunluk.Yaz("RDP başlatıldı (mstsc" + (iki ? ", 2FA doğrulandı" : "") + ") → " + rdp + " (" + t.ms + " ms)");
            }
            return Durum();
        }

        /// <summary>
        /// Kayıtlı oturum şifresini ekranda göster — VPN (FortiClient) şifresi aynı ve oraya otomatik yazılamıyor.
        /// 2FA açıksa kod şart; Pusula şifreyi değiştirmiş ve bekliyorsa aynı kodla yeni şifre alınır, kasaya yazılır.
        /// </summary>
        // ------------------------------------------------------------ sayım modu

        private int _sayimEsitleniyor;

        /// <summary>
        /// Sayım kuruluysa ve Hub'daki SQL bilgisi (login/şifre/sunucu/resim) diske yazılandan farklıysa
        /// server.xml yeniden yazılır. 2FA açıksa kod gerektiği için bekletilir; kullanıcı Ayarlar > Sayım'dan
        /// kodla yeniler. SifreyiEsitle ile aynı desen.
        /// </summary>
        private async Task SayimiEsitle()
        {
            if (!Sayim.Kurulu) return;
            string hub; lock (_kilit) hub = _sayimImza;
            if (hub == null) return;
            if (hub == Sayim.UygulananImza) { Sayim.GuncellemeBekliyor = false; return; }
            if (IkiAktif) { Sayim.GuncellemeBekliyor = true; return; }
            if (Interlocked.Exchange(ref _sayimEsitleniyor, 1) == 1) return;
            try
            {
                var j = await _servis.Sayim(null);
                if (j["bilgi"] == null) return;
                Sayim.Guncelle((JObject)j["bilgi"]);
                Gunluk.Yaz("Sayım SQL bilgisi Pusula'dan güncellendi");
                _ = _servis.Olay("sayim_bilgisi_guncellendi", "otomatik");
            }
            catch (Exception e) { Gunluk.Yaz("Sayım bilgisi güncellenemedi: " + e.Message); }
            finally { Interlocked.Exchange(ref _sayimEsitleniyor, 0); }
        }

        /// <summary>Hub'dan sayım bilgisini alır (2FA açıksa kodla), paketi arka planda kurar. İlerleme Durum().sayim.</summary>
        public async Task<object> SayimKur(string kod)
        {
            var j = await SayimBilgisi(kod);
            Sayim.KurBaslat((JObject)j["bilgi"], (JObject)j["paket"], _servis.Adres, _servis.Token);
            _ = _servis.Olay("sayim_kurulum_baslatildi", j["paket"]?.Value<string>("surum"));
            return Durum();
        }

        /// <summary>server.xml / lic.xml'i Hub'daki güncel bilgiyle yeniden yazar (paket indirilmez).</summary>
        public async Task<object> SayimGuncelle(string kod)
        {
            var j = await SayimBilgisi(kod);
            Sayim.Guncelle((JObject)j["bilgi"]);
            _ = _servis.Olay("sayim_bilgisi_guncellendi");
            // Arayüz yanıtı TAM durum olarak alır (setDurum) — yalnız sayım özeti dönerse ekran boş kalır
            return Durum();
        }

        private async Task<JObject> SayimBilgisi(string kod)
        {
            if (IkiAktif && string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
            var j = await _servis.Sayim(IkiAktif ? kod.Trim() : null);
            if (j["bilgi"] == null || j["paket"] == null) throw new KullaniciHatasi("Sayım bilgisi alınamadı.");
            return j;
        }

        public async Task<object> SifreGoster(string kod)
        {
            string sifre;
            if (IkiAktif)
            {
                if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
                bool bekliyor; lock (_kilit) bekliyor = _sifreBekliyor;
                if (bekliyor)
                {
                    var j = await _servis.Sifre(kod.Trim());
                    sifre = j.Value<string>("sifre");
                    Rdp.KasaliKaydet(sifre, j.Value<string>("kasaAnahtari"));
                    BilinenSurum = j.Value<string>("sifreSurumu") ?? HubSurum;
                    lock (_kilit) _sifreBekliyor = false;
                    _ = _servis.Olay("sifre_guncellendi", "2FA ile");
                }
                else
                {
                    if (!Rdp.KasaliSifreVar) throw new KullaniciHatasi("Bu bilgisayarda kayıtlı şifre yok.");
                    var j = await _servis.IkiDogrula(kod.Trim());
                    sifre = Rdp.KasaliOku(j.Value<string>("kasaAnahtari"));
                }
            }
            else
            {
                if (!Rdp.YerelSifreVar) throw new KullaniciHatasi("Bu bilgisayarda kayıtlı şifre yok.");
                sifre = Rdp.YerelOku();
            }
            Gunluk.Yaz("Oturum şifresi ekranda gösterildi (VPN için)");
            _ = _servis.Olay("sifre_gosterildi");
            return new { sifre };
        }

        public object AyarKaydet(JObject d)
        {
            try { Ayarlar.Degistir(d); }
            catch (Exception e) { throw new KullaniciHatasi("Ayar kaydedilemedi: " + e.Message); }
            _ = _servis.Olay("ayar_degisti", d);
            _ = Task.Run(() => NabizGonder(true));
            return Durum();
        }

        public async Task<object> GuncellemeDenetle()
        {
            await GuncellemeyeBak();
            return Durum();
        }

        /// <summary>Gömülü oturum bitti. Kayıtlı şifre yanlışsa silinir → arayüzde şifre formu yeniden çıkar.</summary>
        private void OturumBitti(string mesaj, bool sifreHatali, int neden)
        {
            if (sifreHatali)
            {
                if (IkiAktif) Rdp.KasaliSil(); else Rdp.YerelSil();
                Gunluk.Yaz("Kayıtlı RDP şifresi geçersiz, silindi");
                _ = _servis.Olay("sifre_gecersiz");
            }
            var sure = _oturumBaslangic == default ? (TimeSpan?)null : DateTime.Now - _oturumBaslangic;
            _oturumBaslangic = default;
            _ = _servis.Olay(mesaj == null ? "oturum_bitti" : "oturum_hatasi", new
            {
                neden,
                mesaj,
                sureDk = sure.HasValue ? Math.Round(sure.Value.TotalMinutes, 1) : (double?)null,
            });
            lock (_kilit) _oturumMesaji = mesaj;
            _ = Task.Run(async () => { await Kontrol(); await NabizGonder(true); });
        }

        // ------------------------------------------------------------ izleme (Hub)

        private DateTime _sonNabizGonderim, _oturumBaslangic;
        private int _nabizSuruyor;

        /// <summary>
        /// "Windows 11 Pro 24H2 (26100)" — Environment.OSVersion uygulama bildirimi olmadan 6.2 döner;
        /// gerçek değer kayıt defterinde. Windows 11 de ProductName'de "Windows 10" yazar → yapı no ile düzeltilir.
        /// </summary>
        private static string WindowsSurumu()
        {
            try
            {
                using (var k = Microsoft.Win32.RegistryKey.OpenBaseKey(Microsoft.Win32.RegistryHive.LocalMachine, Microsoft.Win32.RegistryView.Registry64)
                    .OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    var ad = k?.GetValue("ProductName") as string ?? "Windows";
                    var yapi = k?.GetValue("CurrentBuild") as string ?? "";
                    if (int.TryParse(yapi, out var y) && y >= 22000) ad = ad.Replace("Windows 10", "Windows 11");
                    var surum = k?.GetValue("DisplayVersion") as string ?? k?.GetValue("ReleaseId") as string;
                    return ad + (surum != null ? " " + surum : "") + (yapi != "" ? " (" + yapi + ")" : "") + (Environment.Is64BitOperatingSystem ? "" : " 32 bit");
                }
            }
            catch { return Environment.OSVersion.VersionString; }
        }

        /// <summary>Canlı durum servise: ~60 sn'de bir (Kontrol'den), oturum açılıp kapanınca hemen.</summary>
        /// <summary>
        /// Servis kaydı reddetti (kod/cihaz Hub'dan iptal edildi = 410, token geçersiz = 401): açık oturum kesilir,
        /// bu bilgisayardaki şifreler silinir, kod ekranına dönülür. Eskiden yalnız açılışta bakılıyordu; açık
        /// uygulama/oturum iptalden sonra çalışmaya devam ediyordu — artık nabızda (~1 dk) da yakalanır.
        /// </summary>
        private void KaydiKapat(string mesaj)
        {
            string rdp;
            lock (_kilit)
            {
                if (_asama == "kayit" && _kayit == null && _servis.Token == null) return;
                rdp = P("rdp");
            }
            Gunluk.Yaz("Cihaz kaydı Pusula tarafından kapatıldı / geçersiz: " + mesaj);
            try { if (OturumAcikMi?.Invoke() == true) OturumKes?.Invoke(); } catch (Exception e) { Gunluk.Yaz("Oturum kesilemedi: " + e.Message); }
            try { if (rdp != null) Rdp.SifreSil(rdp); Rdp.YerelSil(); Rdp.KasaliSil(); } catch (Exception e) { Gunluk.Yaz("Şifreler silinemedi: " + e.Message); }
            Kimlik.Sil();
            BilinenSurum = null;
            lock (_kilit)
            {
                _kayit = null; _asama = "kayit"; _mesaj = mesaj; _servis.Token = null; _duyurular = new JArray(); _duyuruImza = null;
                _profilImza = null; _sifreBekliyor = false; _sifreBilgi = null; _kasaAnahtari = null; _kilitAcik = false;
            }
        }

        private async Task NabizGonder(bool zorla)
        {
            if (_servis.Token == null) return;
            if (!zorla && DateTime.Now - _sonNabizGonderim < TimeSpan.FromSeconds(55)) return;
            if (Interlocked.Exchange(ref _nabizSuruyor, 1) == 1) return;
            try
            {
                object durum;
                lock (_kilit)
                {
                    if (_asama != "hazir") return;
                    durum = new
                    {
                        oturum = OturumAcikMi?.Invoke() == true,
                        terminal = new { erisim = _terminal.erisim, ms = _terminal.ms },
                        dnsYok = _dnsYok,
                        os = WindowsSurumu(),
                        forti = _fortiSurum,
                        vpnProfil = new { dogru = _profilDogru, kullaniciAdi = _vpnKullaniciAdi, sifre = _vpnSifre },
                        sifreKayitli = _rdpKullanici != null,
                        ayarlar = Ayarlar.Simdiki.Gorunum(),
                    };
                }
                var yanit = await _servis.Nabiz(durum);
                _sonNabizGonderim = DateTime.Now;
                // Token döndürme: önce diske (DPAPI), sonra belleğe — kayıt başarısızsa eski tokenla devam (servis 15 dk daha kabul eder)
                var yeniToken = yanit.Value<string>("yeniToken");
                if (!string.IsNullOrEmpty(yeniToken))
                {
                    try { Kimlik.TokenYaz(yeniToken); _servis.Token = yeniToken; Gunluk.Yaz("Servis tokenı yenilendi"); }
                    catch (Exception e) { Gunluk.Yaz("Yeni token kaydedilemedi: " + e.Message); }
                }
                // Açılışta servis yoktuysa "ulaşılamadı" uyarısı kalıyordu: başarılı nabız kaldırır
                lock (_kilit) _servisErisim = true;
                // Yayındaki duyurular ya da okunma durumları değiştiyse listeyi yeniden çek
                var pImza = yanit.Value<string>("profilImza");
                string bilinenImza; lock (_kilit) bilinenImza = _profilImza;
                if (pImza != null && pImza != bilinenImza) _ = Task.Run(ProfilYenile);
                // Sayım modu: Hub'daki SQL bilgisi değiştiyse server.xml yenilenir (RDP/VPN ile aynı akış)
                var sImza = yanit.Value<string>("sayimImza");
                if (sImza != null) { lock (_kilit) _sayimImza = sImza; _ = Task.Run(SayimiEsitle); }
                var imza = yanit["duyuru"]?.Value<string>("imza");
                string onceki; lock (_kilit) onceki = _duyuruImza;
                if (imza != null && imza != onceki) _ = Task.Run(() => DuyurulariTazele(imza));
                // Yedek kartı 30 dk'da bir tazelenir (servis zaten 5 dk önbellekli)
                if (DateTime.Now - _yedekZaman > TimeSpan.FromMinutes(30)) _ = Task.Run(() => YedekleriTazele());
            }
            catch (ServisHatasi e) when (e.DurumKodu == 0) { lock (_kilit) _servisErisim = false; /* ağ yok: sonra tekrar */ }
            catch (ServisHatasi e) when (e.DurumKodu == 401 || e.DurumKodu == 410) { KaydiKapat(e.Message); }
            catch { /* servis yoksa sonra tekrar */ }
            finally { Interlocked.Exchange(ref _nabizSuruyor, 0); }
        }

        // ------------------------------------------------------------ yedekler

        /// <summary>Firmanın yedek bilgisini servisten çeker; hata olursa kartta "alınamadı" görünür, eski liste korunur.</summary>
        private async Task YedekleriTazele()
        {
            if (_servis.Token == null) return;
            if (Interlocked.Exchange(ref _yedekTazeleniyor, 1) == 1) return;
            lock (_kilit) { if (_yedekler != null) _yedekler["yenileniyor"] = true; }
            try
            {
                var j = await _servis.Yedekler();
                j["zaman"] = DateTime.Now.ToString("s");
                j["hata"] = null;
                j["yenileniyor"] = false;
                lock (_kilit) _yedekler = j;
                _yedekZaman = DateTime.Now;
            }
            catch (Exception e)
            {
                lock (_kilit)
                {
                    _yedekler = _yedekler ?? new JObject { ["liste"] = new JArray() };
                    _yedekler["hata"] = "Yedek bilgisi alınamadı: " + e.Message;
                    _yedekler["yenileniyor"] = false;
                }
                _yedekZaman = DateTime.Now.AddMinutes(-25);   // 5 dk sonra tekrar dene
            }
            finally { Interlocked.Exchange(ref _yedekTazeleniyor, 0); }
        }

        /// <summary>Ana ekrandaki Yenile düğmesi.</summary>
        public async Task<object> YedekleriYenile()
        {
            await YedekleriTazele();
            return Durum();
        }

        // ------------------------------------------------------------ duyurular

        /// <summary>Daha önce tepside bildirilen duyurular — uygulama yeniden açılınca aynı duyuru tekrar bildirilmesin.</summary>
        private static string BildirilenDosyasi => System.IO.Path.Combine(Kimlik.Klasor, "duyuru-bildirilen.txt");

        /// <summary>Listeyi çeker; yeni duyuruları bildirir. imza: nabızda gelen — başarıyla çekilince saklanır, aynı imza için tekrar çekilmez.</summary>
        private async Task DuyurulariTazele(string imza = null)
        {
            if (_servis.Token == null) return;
            if (Interlocked.Exchange(ref _duyuruTazeleniyor, 1) == 1) return;
            try
            {
                var liste = await _servis.Duyurular();
                var yeniler = new System.Collections.Generic.List<JToken>();
                var bildirilen = new System.Collections.Generic.HashSet<string>();
                try { if (System.IO.File.Exists(BildirilenDosyasi)) foreach (var s in System.IO.File.ReadAllLines(BildirilenDosyasi)) bildirilen.Add(s.Trim()); } catch { }
                foreach (var d in liste)
                {
                    var id = d.Value<string>("id");
                    if (id != null && d["okundu"]?.Type == JTokenType.Null && bildirilen.Add(id)) yeniler.Add(d);
                }
                if (yeniler.Count > 0)
                {
                    // Yalnız yayındakiler saklanır (dosya büyümesin)
                    var yayinda = new System.Collections.Generic.HashSet<string>();
                    foreach (var d in liste) yayinda.Add(d.Value<string>("id"));
                    try { System.IO.File.WriteAllLines(BildirilenDosyasi, System.Linq.Enumerable.Where(bildirilen, yayinda.Contains)); } catch { }
                }
                lock (_kilit) { _duyurular = liste; if (imza != null) _duyuruImza = imza; }
                foreach (var d in yeniler)
                {
                    Gunluk.Yaz("Yeni duyuru: " + d.Value<string>("baslik"));
                    try { Bildir?.Invoke(d.Value<string>("baslik"), d.Value<string>("metin"), d.Value<string>("onem")); } catch { }
                }
            }
            catch (Exception e) { Gunluk.Yaz("Duyurular alınamadı: " + e.Message); }
            finally { Interlocked.Exchange(ref _duyuruTazeleniyor, 0); }
        }

        public async Task<object> DuyuruOkundu(string id)
        {
            if (string.IsNullOrEmpty(id)) throw new KullaniciHatasi("Duyuru belirtilmedi.");
            await _servis.DuyuruOkundu(id);
            lock (_kilit)
            {
                foreach (var d in _duyurular)
                    if (d.Value<string>("id") == id && d["okundu"]?.Type == JTokenType.Null) d["okundu"] = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
            }
            return Durum();
        }

        // ------------------------------------------------------------ iki adımlı doğrulama

        /// <summary>Yeni TOTP gizlisi → { gizli, uri }. Arayüz QR olarak gösterir; onaylanana kadar etkin değil.</summary>
        public async Task<object> IkiBaslat()
        {
            var j = await _servis.IkiBaslat();
            return new { gizli = j.Value<string>("gizli"), uri = j.Value<string>("uri") };
        }

        /// <summary>
        /// İlk kod doğrulanınca etkinleşir. Şifre yeniden alınır (kimlik kasasındaki okunamaz), kasa anahtarıyla
        /// saklanır ve kimlik kasasından silinir — artık mstsc ile kodsuz bağlanılamaz.
        /// </summary>
        public async Task<object> IkiOnayla(string kod, string sifre)
        {
            if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            // Şifre kullanıcıdan istenmez: önce Pusula'daki güncel şifre (2FA henüz açık değil → kodsuz), olmazsa bu bilgisayarda kayıtlı olan.
            if (string.IsNullOrEmpty(sifre))
            {
                try { sifre = (await _servis.Sifre(null)).Value<string>("sifre"); }
                catch (Exception e) { Gunluk.Yaz("2FA açılırken şifre Pusula'dan alınamadı: " + e.Message); }
                if (string.IsNullOrEmpty(sifre) && Rdp.YerelSifreVar) sifre = Rdp.YerelOku();
                if (string.IsNullOrEmpty(sifre)) throw new KullaniciHatasi("Oturum şifreniz bulunamadı. Önce ana ekrandan oturum şifresini kaydedin, sonra iki adımlı doğrulamayı açın.");
            }
            var j = await _servis.IkiOnayla(kod.Trim());
            Rdp.KasaliKaydet(sifre, j.Value<string>("kasaAnahtari"));
            lock (_kilit) { _kasaAnahtari = j.Value<string>("kasaAnahtari"); _kilitAcik = true; }
            Rdp.SifreSil(rdp);
            Rdp.YerelSil();
            IkiDurumYaz(true);
            Gunluk.Yaz("İki adımlı doğrulama açıldı");
            await Kontrol();
            return Durum();
        }

        /// <summary>
        /// Açılış kilidi: doğru kodla kasa anahtarı alınır ve bu açılış boyunca bellekte tutulur. Pusula şifreyi
        /// değiştirmişse aynı kodla yeni şifre de alınıp kasaya yazılır.
        /// </summary>
        public async Task<object> IkiKilitAc(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
            bool bekliyor; lock (_kilit) bekliyor = _sifreBekliyor;
            string anahtar;
            if (bekliyor)
            {
                var j = await _servis.Sifre(kod.Trim());
                anahtar = j.Value<string>("kasaAnahtari");
                Rdp.KasaliKaydet(j.Value<string>("sifre"), anahtar);
                BilinenSurum = j.Value<string>("sifreSurumu") ?? HubSurum;
                lock (_kilit) { _sifreBekliyor = false; SifreBilgi("Şifreniz Pusula tarafından değiştirildi; yeni şifre alındı."); }
                _ = _servis.Olay("sifre_guncellendi", "2FA ile (açılış)");
            }
            else anahtar = (await _servis.IkiDogrula(kod.Trim())).Value<string>("kasaAnahtari");
            lock (_kilit) { _kasaAnahtari = anahtar; _kilitAcik = true; }
            Gunluk.Yaz("Açılış kilidi açıldı (2FA)");
            return Durum();
        }

        /// <summary>Kapatırken şifre kasadan çözülüp yerel dosyaya geri yazılır (kullanıcı yeniden girmez).</summary>
        public async Task<object> IkiKapat(string kod)
        {
            if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
            var j = await _servis.IkiKapat(kod.Trim());
            var anahtar = j.Value<string>("kasaAnahtari");
            var rdp = P("rdp");
            if (anahtar != null && rdp != null && Rdp.KasaliSifreVar)
            {
                try
                {
                    Rdp.YerelKaydet(Rdp.KasaliOku(anahtar));
                }
                catch (Exception e) { Gunluk.Yaz("2FA kapatılırken şifre geri yazılamadı: " + e.Message); }
            }
            Rdp.KasaliSil();
            IkiDurumYaz(false);
            lock (_kilit) { _kasaAnahtari = null; _kilitAcik = false; }
            Gunluk.Yaz("İki adımlı doğrulama kapatıldı");
            await Kontrol();
            return Durum();
        }

        // ------------------------------------------------------------ güncelleme

        /// <summary>Açıkken de yeni sürüm aranır (açılıştaki ilk bakış ProfilTazele'de). Bulunursa arayüz alt ortada bildirir.</summary>
        private async Task GuncellemeDongusu()
        {
            for (;;)
            {
                await Task.Delay(TimeSpan.FromMinutes(30));
                if (!_guncelleniyor) await GuncellemeyeBak();
            }
        }

        private async Task GuncellemeyeBak()
        {
            try
            {
                var s = await _servis.SurumBilgisi();
                lock (_kilit)
                {
                    _sonSurum = s.Value<string>("son");
                    _minSurum = s.Value<string>("min");
                    _sonSha256 = s.Value<string>("sha256");
                    _sonImza = s.Value<string>("imza");
                    _guncellemeNotlari = s.Value<string>("notlar");
                    // İmzasız yayın yok sayılır (0.3.7+): servis ele geçirilip imzasız exe konursa kullanıcıya güncelleme hiç sunulmaz
                    if (_sonSurum != null && string.IsNullOrEmpty(_sonImza)) { Gunluk.Yaz("Yayındaki sürüm " + _sonSurum + " imzasız — yok sayıldı"); _sonSurum = null; }
                }
                if (_sonSurum != null && Yerlesim.SurumKarsilastir(_sonSurum, ServisIstemci.Surum) > 0)
                    Gunluk.Yaz("Yeni sürüm var: " + _sonSurum);
            }
            catch { }
        }

        public object Guncelle()
        {
            // Oturum açıkken uygulama yeniden başlarsa bağlantı kopar
            if (OturumAcikMi?.Invoke() == true) throw new KullaniciHatasi("Önce bağlantıyı kesin, sonra güncelleyin.");
            string sha, imza;
            lock (_kilit)
            {
                if (_guncelleniyor) return Durum();
                _guncelleniyor = true;
                _guncellemeYuzde = 0;
                _guncellemeHatasi = null;
                sha = _sonSha256;
                imza = _sonImza;
            }
            Gunluk.Yaz("Güncelleme indiriliyor: " + _sonSurum);
            _ = Task.Run(async () =>
            {
                try { await Yerlesim.Guncelle(_servis.IndirmeAdresi, sha, imza, y => { lock (_kilit) _guncellemeYuzde = y; }, () => Kapat?.Invoke()); }
                catch (Exception e)
                {
                    Gunluk.Yaz("Güncelleme hatası: " + e.Message);
                    lock (_kilit) { _guncelleniyor = false; _guncellemeHatasi = "Güncelleme yapılamadı: " + e.Message; }
                }
            });
            return Durum();
        }
    }
}
