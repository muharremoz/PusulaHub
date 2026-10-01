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

        // kontroller
        private string _fortiSurum;
        private bool _profilDogru;
        private (bool erisim, int ms, string hata) _terminal;
        private DateTime _terminalZaman;
        private string _rdpKullanici;
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
                        profil = new { dogru = _profilDogru },
                        terminal = new { erisim = _terminal.erisim, ms = _terminal.ms, hata = _terminal.hata, zaman = _terminalZaman == default ? null : _terminalZaman.ToString("s") },
                        rdpSifre = new { kayitli = _rdpKullanici != null, kullanici = _rdpKullanici },
                    },
                    vpnKurulum = new { suruyor = _vpnKuruluyor, durum = _vpnDurum },
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
                var rdpKullanici = rdp != null ? Rdp.KayitliKullanici(rdp) : null;
                var t = rdp != null ? await Rdp.Yokla(rdp, RdpPort) : (false, 0, "profil yok");
                lock (_kilit)
                {
                    _fortiSurum = forti; _profilDogru = profil; _rdpKullanici = rdpKullanici;
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
            var profil = Profil ?? throw new KullaniciHatasi("Önce kurulum kodunu girin.");
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

        public async Task<object> SifreKaydet(string sifre)
        {
            if (string.IsNullOrEmpty(sifre)) throw new KullaniciHatasi("Şifreyi girin.");
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            string kullanici;
            lock (_kilit) kullanici = _kayit?.Value<string>("kullanici");
            var domain = P("domain");
            Rdp.SifreKaydet(rdp, string.IsNullOrEmpty(domain) ? kullanici : domain + "\\" + kullanici, sifre);
            Gunluk.Yaz("RDP şifresi kaydedildi (" + rdp + ")");
            await Kontrol();
            return Durum();
        }

        public async Task<object> SifreSil()
        {
            var rdp = P("rdp");
            if (rdp != null) Rdp.SifreSil(rdp);
            await Kontrol();
            return Durum();
        }

        public async Task<object> Baglan()
        {
            var rdp = P("rdp") ?? throw new KullaniciHatasi("Profil yok.");
            var t = await Rdp.Yokla(rdp, RdpPort);
            lock (_kilit) { _terminal = t; _terminalZaman = DateTime.Now; }
            if (!t.erisim)
                throw new KullaniciHatasi("Pusula sunucusuna ulaşılamıyor. Önce VPN'e bağlanın (FortiClient → Bağlan), sonra tekrar deneyin.");
            string kullanici;
            lock (_kilit) kullanici = _kayit?.Value<string>("kullanici");
            Rdp.Baglan(P("tunel") ?? "Pusula", rdp, RdpPort, P("domain"), kullanici);
            Gunluk.Yaz("RDP başlatıldı → " + rdp + " (" + t.ms + " ms)");
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
