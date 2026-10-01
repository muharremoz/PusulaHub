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
        public Action<RdpAyar, Action<string, bool>> OturumAc;
        public Func<bool> OturumAcikMi;
        private string _oturumMesaji;

        // kontroller
        private string _fortiSurum;
        private bool _profilDogru;
        private (bool erisim, int ms, string hata) _terminal;
        private DateTime _terminalZaman;
        private string _rdpKullanici;
        private bool _vpnKullaniciAdi;      // FortiClient'ta bu tünel için kullanıcı adı kayıtlı mı
        private bool _vpnKuruluyor;
        private JObject _vpnDurum;
        private string _sonSurum;
        private bool _guncelleniyor;

        public Action Kapat { get; set; }

        public Uygulama(ServisIstemci servis)
        {
            _servis = servis;
            var token = Kimlik.Token();
            if (token == null) { _asama = "kayit"; return; }
            _servis.Token = token;
            _kayit = Kimlik.Profil();
            _asama = _kayit != null ? "hazir" : "kayit";
            _ = Task.Run(ProfilTazele);
        }

        /// <summary>Hub'da profil değiştiyse (VPN adresi, terminal) yeni değerler gelir. Servise ulaşılamazsa son bilinenle devam.</summary>
        private async Task ProfilTazele()
        {
            try
            {
                var k = await _servis.Profil();
                Kimlik.ProfilYaz(k);
                // Pusula 2FA'yı sıfırladıysa eski kasa dosyası artık çözülemez — temizle (kullanıcı şifreyi yeniden girer)
                if (k["ikiAdim"]?.Value<bool?>("aktif") != true && Rdp.KasaliSifreVar) Rdp.KasaliSil();
                lock (_kilit) { _kayit = k; _asama = "hazir"; _servisErisim = true; }
            }
            catch (ServisHatasi e) when (e.DurumKodu == 401 || e.DurumKodu == 410)
            {
                Gunluk.Yaz("Cihaz kaydı geçersiz: " + e.Message);
                Kimlik.Sil();
                lock (_kilit) { _kayit = null; _asama = "kayit"; _mesaj = e.Message; }
            }
            catch (Exception e)
            {
                lock (_kilit) _servisErisim = false;
                Gunluk.Yaz("Profil tazelenemedi (son bilinen kullanılıyor): " + e.Message);
            }
            _ = Task.Run(GuncellemeyeBak);
            await Kontrol();
        }

        private JObject Profil { get { lock (_kilit) return _kayit?["profil"] as JObject; } }
        /// <summary>Bu cihazda iki adımlı doğrulama açık mı (servisten gelen kayıt).</summary>
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
                        profil = new { dogru = _profilDogru, kullaniciAdi = _vpnKullaniciAdi },
                        terminal = new { erisim = _terminal.erisim, ms = _terminal.ms, hata = _terminal.hata, zaman = _terminalZaman == default ? null : _terminalZaman.ToString("s") },
                        rdpSifre = new { kayitli = _rdpKullanici != null, kullanici = _rdpKullanici },
                    },
                    vpnKurulum = new { suruyor = _vpnKuruluyor, durum = _vpnDurum },
                    ikiAdim = new { aktif = _kayit?["ikiAdim"]?.Value<bool?>("aktif") == true },
                    oturum = new { acik = OturumAcikMi?.Invoke() == true, mesaj = _oturumMesaji },
                    ayarlar = Ayarlar.Simdiki.Gorunum(),
                    guncelleme = new
                    {
                        mevcut = _sonSurum != null && Yerlesim.SurumKarsilastir(_sonSurum, ServisIstemci.Surum) > 0,
                        surum = _sonSurum,
                        suruyor = _guncelleniyor,
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
            Kimlik.Sil();
            lock (_kilit) { _kayit = null; _asama = "kayit"; _servis.Token = null; }
            return Durum();
        }

        // ------------------------------------------------------------ kontroller

        private int _kontrolSuruyor;

        public async Task Kontrol()
        {
            if (Interlocked.Exchange(ref _kontrolSuruyor, 1) == 1) return;
            try
            {
                var rdp = P("rdp");
                var forti = Fortinet.KuruluSurum();
                var profil = P("tunel") != null && P("vpn") != null && Fortinet.ProfilDogru(P("tunel"), P("vpn"));
                // 2FA açıkken kasa anahtarlı dosyada, kapalıyken yerel DPAPI dosyasında
                var rdpKullanici = (IkiAktif ? Rdp.KasaliSifreVar : Rdp.YerelSifreVar) ? _kayit?.Value<string>("kullanici") : null;
                var vpnKullaniciAdi = P("tunel") != null && Fortinet.KullaniciAdiTanimli(P("tunel"));
                var t = rdp != null ? await Rdp.Yokla(rdp, RdpPort) : (false, 0, "profil yok");
                lock (_kilit)
                {
                    _fortiSurum = forti; _profilDogru = profil; _rdpKullanici = rdpKullanici; _vpnKullaniciAdi = vpnKullaniciAdi;
                    _terminal = t; _terminalZaman = DateTime.Now;
                }
            }
            finally { Interlocked.Exchange(ref _kontrolSuruyor, 0); }
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
                lock (_kilit) _oturumMesaji = null;
                Gunluk.Yaz("RDP şifresi kaydedildi (2FA kasası)");
                await Kontrol();
                return Durum();
            }
            Rdp.YerelKaydet(sifre);
            Rdp.SifreSil(rdp);
            lock (_kilit) _oturumMesaji = null;
            Gunluk.Yaz("RDP şifresi kaydedildi (" + rdp + ")");
            await Kontrol();
            return Durum();
        }

        public async Task<object> SifreSil()
        {
            var rdp = P("rdp");
            if (rdp != null) Rdp.SifreSil(rdp);
            Rdp.KasaliSil();
            Rdp.YerelSil();
            await Kontrol();
            return Durum();
        }

        public async Task<object> Baglan(string kod = null)
        {
            if (OturumAcikMi?.Invoke() == true) throw new KullaniciHatasi("Oturum zaten açık.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            var t = await Rdp.Yokla(rdp, RdpPort);
            lock (_kilit) { _terminal = t; _terminalZaman = DateTime.Now; }
            if (!t.erisim)
                throw new KullaniciHatasi("Pusula sunucusuna ulaşılamıyor. Önce VPN'e bağlanın (FortiClient → Bağlan), sonra tekrar deneyin.");
            string kullanici;
            lock (_kilit) kullanici = _kayit?.Value<string>("kullanici");
            string sifre;
            var iki = IkiAktif;
            if (iki)
            {
                if (string.IsNullOrWhiteSpace(kod)) throw new KullaniciHatasi("Doğrulama uygulamasındaki kodu girin.");
                if (!Rdp.KasaliSifreVar) throw new KullaniciHatasi("Önce oturum şifresini kaydedin.");
                var j = await _servis.IkiDogrula(kod.Trim());
                sifre = Rdp.KasaliOku(j.Value<string>("kasaAnahtari"));
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
                    Ad = ad, Sunucu = rdp, Port = RdpPort, Domain = P("domain"), Kullanici = kullanici, Sifre = sifre,
                    TamEkran = ay.TamEkran, Yazici = ay.Yazici, Pano = ay.Pano, Ses = ay.Ses,
                    AkilliKart = ay.AkilliKart, Portlar = ay.Portlar, Konum = ay.Konum, Kamera = ay.Kamera,
                    Aygitlar = ay.Aygitlar, Suruculer = ay.Suruculer,
                }, OturumBitti);
                Gunluk.Yaz("Oturum açılıyor (uygulama içinde" + (iki ? ", 2FA doğrulandı" : "") + ") → " + rdp + " (" + t.ms + " ms)");
            }
            else
            {
                Rdp.Baglan(ad, rdp, RdpPort, P("domain"), kullanici, sifre);
                Gunluk.Yaz("RDP başlatıldı (mstsc" + (iki ? ", 2FA doğrulandı" : "") + ") → " + rdp + " (" + t.ms + " ms)");
            }
            return Durum();
        }

        public object AyarKaydet(JObject d)
        {
            try { Ayarlar.Degistir(d); }
            catch (Exception e) { throw new KullaniciHatasi("Ayar kaydedilemedi: " + e.Message); }
            return Durum();
        }

        public async Task<object> GuncellemeDenetle()
        {
            await GuncellemeyeBak();
            return Durum();
        }

        /// <summary>Gömülü oturum bitti. Kayıtlı şifre yanlışsa silinir → arayüzde şifre formu yeniden çıkar.</summary>
        private void OturumBitti(string mesaj, bool sifreHatali)
        {
            if (sifreHatali)
            {
                if (IkiAktif) Rdp.KasaliSil(); else Rdp.YerelSil();
                Gunluk.Yaz("Kayıtlı RDP şifresi geçersiz, silindi");
            }
            lock (_kilit) _oturumMesaji = mesaj;
            _ = Task.Run(Kontrol);
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
            if (string.IsNullOrEmpty(sifre)) throw new KullaniciHatasi("Oturum şifrenizi girin.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            var j = await _servis.IkiOnayla(kod.Trim());
            Rdp.KasaliKaydet(sifre, j.Value<string>("kasaAnahtari"));
            Rdp.SifreSil(rdp);
            Rdp.YerelSil();
            IkiDurumYaz(true);
            Gunluk.Yaz("İki adımlı doğrulama açıldı");
            await Kontrol();
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
            Gunluk.Yaz("İki adımlı doğrulama kapatıldı");
            await Kontrol();
            return Durum();
        }

        // ------------------------------------------------------------ güncelleme

        private async Task GuncellemeyeBak()
        {
            try
            {
                var s = await _servis.SurumBilgisi();
                lock (_kilit) _sonSurum = s.Value<string>("son");
            }
            catch { }
        }

        public object Guncelle()
        {
            lock (_kilit)
            {
                if (_guncelleniyor) return Durum();
                _guncelleniyor = true;
            }
            _ = Task.Run(async () =>
            {
                try { await Yerlesim.Guncelle(_servis.IndirmeAdresi, () => Kapat?.Invoke()); }
                catch (Exception e)
                {
                    Gunluk.Yaz("Güncelleme hatası: " + e.Message);
                    lock (_kilit) { _guncelleniyor = false; _mesaj = "Güncelleme yapılamadı: " + e.Message; }
                }
            });
            return Durum();
        }
    }
}
