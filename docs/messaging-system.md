# PusulaHub — Kullanıcı Mesajlaşma Sistemi

Sunucu yöneticilerinin yönetilen Windows sunucularındaki aktif kullanıcılara anlık popup mesaj göndermesini ve "Okudum, Anladım" onaylarını takip etmesini sağlar.

---

## Genel Akış

```
Hub UI (tab-messages)
    ↓  POST /api/servers/{id}/notify
Hub API Route
    ↓  POST /api/notify  (X-Api-Key)
PusulaAgent (Windows Service, SYSTEM)
    ↓  WTS SessionInjector.Inject()
PusulaNotify.exe (kullanıcı oturumuna inject edilir)
    ↓  Popup gösterilir
Kullanıcı "Okudum, Anladım" tıklar
    ↓  POST http://127.0.0.1:{agentPort}/api/ack  (localhost)
PusulaAgent → _pendingAcks listesine ekler
    ↓  Hub bir sonraki /api/report poll'unda pendingAcks alır
Hub Poller → markMessageRead()
    ↓
Tab-messages yenile → okundu bilgisi görünür
```

---

## Bileşenler

### 1. Hub Tarafı

#### `apps/web/src/app/api/servers/[id]/notify/route.ts`
- `POST` — Mesajı agent'a iletir
- `msgId` (UUID) + `sentAt` üretir
- Agent'ın `/api/notify` endpoint'ine `{msgId, title, body, type, from, sentAt}` POST eder
- Başarı durumunda `logSentMessage()` çağırır
- `hubUrl` gerekmez — ACK artık localhost üzerinden akar

#### `apps/web/src/app/api/servers/[id]/messages/route.ts`
- `GET` — Gönderilen mesaj geçmişini döndürür
- **Anlık yenileme:** Her istekte agent'ın `/api/report`'unu çekerek `pendingAcks` işler
- 5 sn timeout; agent ulaşılamazsa eski veriyi döndürür

#### `apps/web/src/app/api/agent/message-ack/route.ts`
- `POST {msgId, username}` — Doğrudan hub'a ACK gönderim (artık kullanılmıyor, eski yöntem)

#### `apps/web/src/lib/agent-store.ts`
```ts
logSentMessage(msg)           // Mesajı in-memory log'a ekler
markMessageRead(msgId, user)  // Okundu bilgisini kaydeder
getSentMessages(agentId)      // Son 50 mesajı döndürür
```

#### `apps/web/src/lib/agent-poller.ts`
- `/api/report` yanıtında `pendingAcks` alanı varsa her biri için `markMessageRead()` çağırır

#### `apps/web/src/components/server-detail/tab-messages.tsx`
- Mesaj oluşturma formu (şablon seçimi, tip, başlık, içerik)
- Hedef seçimi (tüm oturumlar / bireysel)
- **Gönderilen Mesajlar** bölümü: tip badge, başlık, saat, `X/Y okundu` sayacı
- Satıra tıklayınca açılır → mesaj önizleme + kim okudu + okuma saati
- Her 15 saniyede otomatik yenileme + manuel yenile butonu

---

### 2. Agent Tarafı (`apps/agent/windows/`)

#### `PusulaAgent.cs` — İlgili Bölümler

**`/api/notify` handler:**
```
1. body JSON'una agentPort ekler (PusulaNotify için)
2. JSON'u base64'e encode eder
3. body içinde "targetUsernames":["a","b"] varsa yalnız eşleşen oturumlara inject
   (yoksa tüm aktif oturumlara)
4. Inject edilen oturum sayısını döndürür
```

**Payload'a `targetUsernames` eklenmesi (opsiyonel):**
- Hub `selected` modunda gönderdiğinde her sunucu için yalnızca seçili kullanıcı
  adlarını içeren bir array gönderir: `"targetUsernames": ["ali", "veli"]`
- Agent `WTSQuerySessionInformation(WTSUserName)` ile her oturumun kullanıcısını
  alır, normalize eder (`DOMAIN\user` → `user`, lowercase), listede yoksa skip
- Alan yoksa geriye dönük davranış: tüm aktif oturumlara inject

**`SessionInjector` (P/Invoke):**
- `WTSEnumerateSessions` → aktif oturumları listeler
- `WTSQueryUserToken` → kullanıcı token'ı alır
- `CreateEnvironmentBlock` + `CreateProcessAsUser` → PusulaNotify.exe'yi oturuma inject eder
- SYSTEM yetkisiyle çalışır → GPO kısıtlamaları etkisiz

**`/api/ack` handler (localhost-only):**
```
- Sadece 127.0.0.1 veya ::1'den gelen istekleri kabul eder
- API key gerekmez
- {msgId, username} → _pendingAcks listesine ekler
```

**`/api/report` handler:**
```
- Normal metrik yanıtına pendingAcks[] alanı ekler
- pendingAcks listesini temizler (pop & clear)
```

**`AgentService` (Windows Service):**
- `--service` flag ile başlatılır
- SYSTEM yetkisiyle çalışır → oturuma inject etme yetkisi var
- Sunucu yeniden başlayınca otomatik başlar

#### `PusulaNotify.cs`

Bağımsız WinForms uygulaması. `PusulaAgent.exe` tarafından kullanıcı oturumuna inject edilir.

**Argüman:** `PusulaNotify.exe <base64Data>`

**base64Data (UTF-8 JSON):**
```json
{
  "msgId": "uuid",
  "title": "Mesaj Başlığı",
  "body": "Mesaj içeriği",
  "type": "info | warning | urgent",
  "from": "Pusula Yazılım",
  "sentAt": "2026-04-04T19:00:00Z",
  "agentPort": 8585
}
```

**Tasarım:**
- Ekranın sağ alt köşesinde 480px genişliğinde yuvarlak köşeli popup
- `info` → mavi, `warning` → amber, `urgent` → kırmızı tema
- Kullanıcı adı + gönderim saati gösterilir
- "Okudum, Anladım" butonu → ACK gönderir, kapatır
- 5 dakika sonra otomatik kapanır

**ACK gönderimi:**
```
POST http://127.0.0.1:{agentPort}/api/ack
{"msgId": "...", "username": "..."}
```
Localhost bağlantısı → GPO/güvenlik duvarı engelleyemez.

---

## Deploy

### Güncelleme Gerektiren Dosyalar

| Değişiklik | Kopyalanacak Dosyalar |
|---|---|
| Sadece hub değişikliği | Yok (git pull + next build) |
| Agent mantığı değişti | `PusulaAgent.cs` + `KUR.bat` |
| Notify popup değişti | `PusulaNotify.cs` + `KUR.bat` |
| İkisi de değişti | `PusulaAgent.cs` + `PusulaNotify.cs` + `KUR.bat` |

### KUR.bat Adımları
1. `PusulaAgent.exe` derle (`csc.exe` ile)
2. `PusulaNotify.exe` derle
3. Eski servisi durdur + sil
4. `sc create PusulaAgent ... --service start= auto` ile kur
5. `sc start PusulaAgent`

> **Önemli:** Sunucudaki `csc.exe` eski .NET Framework (2.0/3.5) versiyonu olabilir.
> C# 6.0+ özellikleri (`?.`, `=>` method body, `$""`) **kullanılmaz**.

---

## Bilinen Kısıtlamalar ve Çözümler

### GPO — Kullanıcı Uygulama Kısıtlaması
**Sorun:** Kullanıcılar uygulama çalıştıramaz.
**Çözüm:** SYSTEM servis `CreateProcessAsUser` ile inject eder. GPO kullanıcı kısıtlamaları SYSTEM prosesini etkilemez.

### GPO — Ağ Kısıtlaması
**Sorun:** Kullanıcı prosesleri dışarıya HTTP bağlantısı açamaz.
**Çözüm:** PusulaNotify.exe hub'a değil, aynı makinedeki agent'a `localhost` üzerinden POST eder.

### Oturum Açık Değilse
**Durum:** `WTSEnumerateSessions` aktif oturum bulamazsa inject yapılmaz.
**Sonuç:** `sessions: 0` döner, toast "Aktif oturum bulunamadı" gösterir.

### csc.exe Eski Versiyon
**Sorun:** Derleme hatası — `CS1525`, `CS1519`, `CS1002`.
**Çözüm:** C# 6.0+ sözdizimi kullanma. Özellikle kaçınılacaklar:
- `?.` → `if (x != null) x.Method()` kullan
- `static int Foo() => ...` → `{ return ...; }` bloğuna çevir
- `$"string {var}"` → `"string " + var` kullan
