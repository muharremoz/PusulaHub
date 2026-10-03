# Pusula Connect 2 — konsept

**Durum:** taslak (2026-10-01). Karar verilmedi; bu belge "nasıl olur" sorusunun cevabı.

## Fikir

Müşterinin bilgisayarında **tek Pusula uygulaması**: bağlantıyı kurar (VPN + RDP), veriyi taşır
(Aktarım), bağlantı sorununu teşhis eder, Pusula'dan duyuru/güncelleme alır. Bugün bunlar üç ayrı
şey: Pusula Connect (kurulum sihirbazı), Aktarım 2 (veri), Bağlantı Testi (terminal içi araç).

## Bugün elimizde olan

| Parça | Nerede | Ne yapıyor |
|---|---|---|
| Pusula Connect 1.5 | `scripts/musteri-kurulum/PusulaConnect.cs` (WPF, csc ile derleniyor) | FortiClient MSI indir + sessiz kur (ARM ayrımı), VPN profili (`HKLM\SOFTWARE\Fortinet\FortiClient\Sslvpn\Tunnels\Pusula`), RDP şifresi Windows kimlik kasasına (CredWrite `TERMSRV/…`), masaüstüne `.rdp` |
| Hub kurulum paketi | `apps/web/src/lib/kurulum-paketi.ts` | Kullanıcı başına zip: nötr exe + `ayarlar.ini` (firma, kullanıcı, vpn, rdp, domain, msiurl). CRM de aynı paketi indiriyor |
| Aktarım 2 | `apps/aktarim-istemci` + `services/pusula-aktarim2` | Uygulama iskeleti (WebView2 + yerel sunucu + React/shadcn), kodla giriş, servis, parça yükleme, dağıtım `/v2/indir` |
| Bağlantı Testi | terminallerde (memory: baglanti-testi-araci) | RDP içinden bağlantı kanıtı |

**Kimlik bilgisi (01.10.2026 denendi, Connect 1.5 notunu düzeltir):** FortiClient'ın kendi aracı
`FCConfig.exe -m vpn -f x.conf -o import -p <8+ karakter> -q` (yönetici) ile **kullanıcı adı önceden
yazılabiliyor**: XML'deki düz metin `<username>` FortiClient tarafından `DATA1`'e şifrelenir. Dosya
**BOM'suz UTF-8** olmalı (BOM'luyu sessizce atlar), `-o import` çalışır (`importvpn` değil), diğer
tünellere dokunmaz. **Şifre yazılamıyor** (`<password>` ve `save_password` yok sayıldı; "Save Password"
FortiGate portal ayarına bağlı) — kullanıcı ilk bağlantıda şifresini bir kez girer. Connect 2 (0.1.1+)
kullanıcı adını yazar ve kısa bir bağlantı rehberi gösterir.

## Nasıl olur

**İskelet Aktarım 2'nin kendisi** (C# net48 + WebView2 + gömülü React arayüz + Pusula servisi).
Aktarım 2'de çözülen her şey (tek kopya, kapatma onayı, DPAPI, sürüm kontrolü, dağıtım) hazır gelir.

### Modüller

| Modül | Ne yapar | Kaynak |
|---|---|---|
| **Bağlantı** | FortiClient kurulu mu/sürümü, profil var mı, VPN açık mı (terminale ulaşılıyor mu), RDP kimliği kayıtlı mı → tek ekranda durum + "Bağlan" | Connect 1.5'ten taşınır |
| **Bağlan** | VPN kapalıysa FortiClient'ı öne getirir (yukarıdaki sınır); açıksa RDP'yi başlatır (.rdp dosyası uygulamanın içinde üretilir, masaüstünde dosyaya gerek kalmaz) | Connect 1.5 `RdpYaz` |
| **Aktarım** | Hub'da firmaya aktarım açılmışsa görünür | Aktarım 2 |
| **Teşhis** | DNS, VPN, 3389, gecikme, paket kaybı → "raporu Pusula'ya gönder" (ps3.databag DNS vakası kendiliğinden çıkardı) | Bağlantı Testi + api-erisim-kontrol.ps1 |
| **Duyurular** | Hub'dan firmaya/kullanıcıya mesaj; bakım bildirimi | yeni (Hub mesajlaşmanın PC karşılığı) |
| **Güncelleme** | Uygulama kendini günceller (servis sürüm verir, imzalı exe iner, değiştirilir) | Aktarım 2 min_surum'un otomatiği |

Sonraki faz: **gömülü RDP** (Windows'un `mstscax` bileşeni uygulama penceresinde: Pusula logolu
pencere, otomatik yeniden bağlanma, kalite göstergesi) ve **RemoteApp** (Pusula programı yerel program
gibi açılır — Thinstuff desteği ayrıca araştırılacak).

### Kimlik / kurulum

İki seçenek (karar gerekiyor):
1. **Hub'dan kurulum kodu** (Aktarım 2 gibi): zip yerine "indir + kodu gir". Kod kullanıcıyı ve
   firmayı belirler, profil (vpn, rdp, domain) servisten gelir → VPN adresi değişince yeni dosya gerekmez.
2. **AD kullanıcı adı + şifre** ile giriş: servis AD'de doğrular (servis LAN'da, AD'ye erişir). Kullanıcı
   zaten bildiği bilgiyle girer; RDP kimliği aynı anda kaydedilir.

Öneri: kurulumda **kod** (kim olduğunu Pusula belirler), günlük kullanımda kayıtlı oturum (DPAPI).

### Yetki

FortiClient kurulumu ve `HKLM` profil **yönetici** ister. Ana uygulama normal kullanıcıyla çalışır;
yalnız "VPN kur/onar" adımı yönetici olarak kendini ayrı süreçte çalıştırır (UAC bir kez sorar).
Kurulum paketi (MSI/Program Files) ilk sürümde gerekmez — tek exe, kendini `%LOCALAPPDATA%`'ya kopyalar
ve Başlat menüsü + masaüstü kısayolu oluşturur.

### Güvenlik

- **Kod imzalama sertifikası** gerekli: VPN kuran + RDP açan + kendini güncelleyen imzasız exe
  antivirüse uzaktan erişim aracı gibi görünür. (Aktarım 2 de şu an imzasız.)
- Güncellemeler imzalı; imza tutmazsa uygulanmaz.
- Hub'dan cihaz iptali (kayıp PC): oturum tokenı servis tarafında kapatılır.
- Şifreler yalnız Windows kimlik kasası / DPAPI'de; servise gitmez.

## Aşamalar

| # | İçerik | Sonuç |
|---|---|---|
| 1 | Kabuk: Aktarım 2 iskeleti "Pusula Connect" adıyla; kurulum kodu; Bağlantı modülü (Connect 1.5 mantığı taşınır); Bağlan (RDP); kendini güncelleme | Connect 1.5'in yerine geçebilir (zip yerine kod) |
| 2 | Aktarım modülü içeri; Teşhis modülü | Tek uygulama |
| 3 | Duyurular | Hub → müşteri PC'si kanalı |
| 4 | Gömülü RDP / RemoteApp araştırması | Windows RDP yerine Pusula penceresi |

Connect 1.5 ve Aktarım 2 değişmeden durur; Connect 2 memnun edince onların yerine geçer.

## Kararlar (2026-10-01)

1. **Kimlik: Hub'dan kurulum kodu.** Kod kullanıcıyı + firmayı belirler; profil servisten gelir;
   cihaz kayıtlı oturumla (DPAPI) sürer.
2. **Kod imzalama sonraya.** İlk sürümler imzasız (SmartScreen uyarısı beklenir).
3. **Ayrı uygulama.** Connect 2 kendi exe'si; Aktarım 2 ayrı kalır (içine taşınmaz).

## Güvenlik notları (03.10.2026 gözden geçirmesi)

Tehdit senaryoları ve karar: bir müşteri bilgisayarı ele geçirilirse tek gerçek koruma 2FA'dır (token + yerel
şifre DPAPI ile aynı Windows kullanıcısına açıktır). Servis ya da anahtar ele geçirilirse etki alanını
daraltan üç önlem alındı:

1. **Ayrı servis anahtarı.** Hub ↔ Connect servisi `CONNECT_SERVICE_KEY` ile konuşur; Aktarım'la ortak
   `TRANSFER_SERVICE_KEY` yalnız bu değişken boşken (geçiş) kabul edilir. Ayarlanacağı yerler: Hub (Coolify env),
   servis (`/opt/pusula-connect/.env`), geliştirme (`apps/web/.env.local`). Serviste `CONNECT_KASA_ANAHTARI`
   DB'deki 2FA kayıtlarının şifreleme tuzudur, boşsa `TRANSFER_SERVICE_KEY`; **asla değiştirilmez**.
   Hub `/api/hub/connect/sifre` ayrıca kullanıcının serviste iptal edilmemiş bir cihazı olmasını şart koşar.
2. **İmzalı güncelleme.** `scripts/connect-yayinla.sh` exe'yi `~/.ssh/pusula-connect-imza.pem` (RSA-3072,
   çevrimdışı, sunucuya gitmez) ile imzalar → `PusulaConnect.exe.sig`; servis `/api/surum`'da `imza` verir;
   istemci (`GuncellemeImzasi.cs`, gömülü açık anahtar) imzasız/yanlış imzalı yayını kurmaz, imzasız yayını
   hiç göstermez. Anahtar kaybolursa yeni sürüm yayınlanamaz — yedeğini güvenli yerde tut. Anahtar
   değiştirilecekse önce eski anahtarla, yeni açık anahtarı içeren bir sürüm yayınlanır.
3. **Token döndürme.** Servis nabızda 7 günden eski tokenı yeniler (`yeniToken`); eski token 15 dk daha geçer.
   İstemci yeni tokenı DPAPI ile yazıp belleğe alır. Çalınan tokenın ömrü böylece en çok 7 gün + 15 dk.

Alınmayan/ertelenen: 2FA'yı Hub'dan zorunlu kılma, sertifika sabitleme, kod üretme yetkisini ayırma,
yazdırma yardımcısı güvenlik duvarı kuralını terminal IP'leriyle sınırlama.
