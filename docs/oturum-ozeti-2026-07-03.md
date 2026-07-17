# Oturum Özeti — 2026-06/07 (format öncesi yedek)

> Bu dosya bilgisayara format atılmadan önce, oturumdaki işlerin ve **lokal
> makinede duran Claude memory dosyalarının** kaybolmaması için hazırlandı.
> Format sonrası: repoyu klonla, aşağıdaki "Memory geri yükleme" bölümünü uygula.

---

## 1) Bu oturumda yapılan işler

### Kod değişiklikleri (commit'lendi + deploy edildi)

| Commit | İş |
|---|---|
| `c46d32b` | **TV bant genişliği tile'ı** — `/tv` ekranı sol kolonuna API sunucusu (ens192) canlı internet trafiği: indirme/yükleme Mbps + günlük/aylık GB + canlı sparkline. Yeni: `lib/bandwidth.ts` (proxy adapter, 2sn cache), `/api/tv/bandwidth` (oturumsuz route, token server-side). Env: `BANDWIDTH_API_URL` (prod `.env.production`'a eklendi). |
| `cf2a6c6` | **Erişim bilgileri modal'ı** — (a) kopyalama bug'ı: Hub HTTP olduğu için `navigator.clipboard` devre dışı → `execCommand` fallback'i textarea'yı `document.body`'ye ekleyince Radix Dialog FocusScope focus'u geri çalıyor, seçim boşalıyor → "kopyalandı" der pano boş. Fix: textarea artık **açık dialog'un içine** eklenip focus veriliyor (`lib/clipboard.ts`). (b) "Metin Olarak Kopyala" çıktısı sihirbazdaki `customerMessage` (step-run.tsx) formatına birebir çevrildi. |
| `753e6c4` | **Türkçe arama + Geri 2-tık** — (a) `foldTr()`: diakritik-bağımsız Türkçe arama (İ/I/ı→i, ş→s, ç→c, ğ→g, ö→o, ü→u). JS `toLowerCase()` "İ"yi `i̇` (i + combining dot) yapıp "elit" aramasını bozuyordu. (b) URL→firma auto-select useEffect'inden `selectedFirma` dependency'si kaldırıldı: Geri'de `setSelectedFirma(null)` sonrası effect eski `urlFirkod` ile firmayı geri seçiyordu → 2 tık gerekiyordu. |

### Sunucu / altyapı işleri (kod değil)

- **A&G STONE (343) test firması tamamen temizlendi** — Hub DB (Companies, ADUsers, CompanyUsageDaily×16, SQLDatabases) + AD (`OU=343` + kullanıcı `343.pusula` + grup `343_users`) + **gerçek SQL veritabanı `343_Pusula_Test` DROP edildi**. Sonuç: Dashboard kullanıcı sayısı (44) = canlı AD (44), birebir tuttu.
- **Dashboard firma sayısı farkı açıklandı** — Dashboard 30 vs AD 32 OU. Fark = **boş OU'lar `1453` ve `1900`** (kullanıcısız iç firmalar: Pusula/Bilkar). Kalıntı değil, normal.
- **Switch login "Sunucuya ulaşılamadı" çözüldü** — SQL motoru ayaktaydı ama **TCP 1433 listener'ı ölüydü**. Detay: `sql-tcp-listener-dead` memory'si (aşağıda).
- **DC dış NTP'ye bağlandı** ⭐ — PDC emulator **PUSULAPC (10.15.2.4)** saatini **Local CMOS Clock**'tan alıyordu (tüm domain'in saati anakart saatine bağlıydı). `tr.pool.ntp.org`'a bağlandı:
  ```
  w32tm /config /manualpeerlist:tr.pool.ntp.org,0x8 /syncfromflags:manual /reliable:yes /update
  Restart-Service W32Time ; w32tm /resync /rediscover
  ```
  Sonuç: Source `tr.pool.ntp.org`, Stratum 4, gerçek harici referans. Registry'ye yazıldı → **reboot'ta kalıcı**. Member sunucular (Terminal 1 vb.) DC'yi otomatik takip eder.
- **Terminal 1'de "tarih/saat kuruluşunuz tarafından yönetiliyor"** — Bu **normal domain davranışı**, özel kısıt değil. Member server saatini W32Time domain hiyerarşisinden (`Type=NT5DS`) DC'den alır, elle değiştirilmez. Uygulanan GPO'lar: `Default Domain Policy` + `Rdp_Camera`. Saat değişecekse **DC'de** değiştirilir, üyeler takip eder.
- **4646.bascilar2 parolası güncellendi** — AD (RDP) sıfırlandı + `CompanyUserCredentials` şifreli kaydı eşitlendi (modal eski şifreyi gösteriyordu). **VPN (FortiGate) hâlâ manuel** — FortiGate yerel kullanıcısı, API entegrasyonu yok: `User & Authentication → User Definition → 4646.bascilar2 → Password`.
  > Doğru yol: firma detayındaki **"parola sıfırla"** aksiyonu (`POST /api/companies/[firkod]/users/action`, `reset-password`) AD + şifreli kaydı **tek seferde** günceller. Manuel AD reset yaparsan DB kaydı geride kalır.

---

## 2) Öğrenilen kritik teknik notlar

### Agent `/api/exec` tuzakları (CLAUDE.md'dekine ek)
Agent JSON'u regex-parse ediyor, şunlar **bozuluyor**:
- Çift tırnak `"` → yasak (CLAUDE.md'de yazılı).
- **`>` redirect** → `>`'ye dönüp komutu kırıyor.
- **Boşluk içeren tek-tırnaklı string** (`Write-Output '== Başlık =='`) → tokenlara ayrılıyor.
- **Dosya okuma** (`Get-Content` UTF-16 secedit .inf) → boş dönebiliyor.

**Çalışan kalıp:** tırnaksız, boşluksuz argümanlı tek komutlar (`w32tm /query /status`, `gpresult /scope computer /r`, `netdom query fsmo`). Etiket için `Write-Output` kullanma; her komutu ayrı çağır.

### Lokal makinede build YOK
`C:\Projeler\...\PusulaHub` altında **`node_modules` kurulu değil** → `tsc`/`next build` yerelde tüm projede patlar (mevcut dosyalar dahil, sahte hata). LSP diagnostic'leri de bu yüzden gürültülü. **Gerçek doğrulama prod'da** (`10.10.10.5`, `C:\PusulaProd\`) `pnpm build` ile yapılır.

### Deploy akışı
```powershell
# prod: 10.10.10.5, Administrator
cd C:\PusulaProd\PusulaHub ; git pull origin main
pm2 stop hub-watcher
cd apps\web ; pnpm build          # BAŞARILIYSA restart, değilse eski sürüm ayakta kalsın
pm2 restart hub ; pm2 start hub-watcher
```

### Sunucu envanteri (bu oturumda teyit edilen)
| Rol | IP | Hostname |
|---|---|---|
| Prod (Hub/Switch/SpareFlow) | 10.10.10.5 | — |
| Active Directory / **PDC emulator** (tüm FSMO) | 10.15.2.4 | **PUSULAPC** |
| SQL | 10.15.2.2 | PUSULASQL |
| **Terminal 1** | 10.15.2.5 | **PUSULARDP** |
| Depo | 10.15.2.200 | PUSULARESIM |
| Ubuntu (Fastify + Kuma) | 10.15.2.6 | — |

Domain: `pusuladc.local` · Firmalar OU: `OU=<firkod>,OU=Firmalar,DC=pusuladc,DC=local`

---

## 3) Format sonrası — Memory geri yükleme

Claude memory dosyaları lokalde duruyordu ve **format ile silinir**. Format sonrası
şu dizini oluşturup dosyaları geri yaz:

```
C:\Users\<KULLANICI>\.claude\projects\C--Projeler-Pusula-Yaz-l-m-PusulaHub\memory\
```

### `MEMORY.md`
```markdown
# Memory Index

- [Approval before deploy](approval-before-deploy.md) — local commit otomatik; push + deploy onaylı
- [CRM Switch parkta](crm-switch-pending-https.md) — Pusula CRM entegrasyonu app.pusulanet.net HTTPS bekliyor (schemeful-cross-site cookie)
- [SQL TCP listener ölü](sql-tcp-listener-dead.md) — Switch/Hub "Sunucuya ulaşılamadı": SQL motoru ayakta ama TCP 1433 ölü → MSSQLSERVER restart
```

### `approval-before-deploy.md`
```markdown
---
name: approval-before-deploy
description: Local commit otomatik; push ve prod deploy için mutlaka kullanıcı onayı al
metadata:
  type: feedback
---

**Local commit OTOMATİK, push + deploy ONAYLI** (2026-06-30 güncellemesi).

- **Local `git commit`:** İş yaparken önemli/anlamlı değişiklikleri **otomatik commit et** — her seferinde sormaya gerek yok. Mantıklı, açıklayıcı commit mesajı yaz (Co-Authored-By satırı dahil).
- **`git push`:** Onaysız YAPMA. Push öncesi kullanıcıya sor.
- **Prod deploy (10.10.10.5 `git pull && pnpm build && pm2 restart`):** Onaysız YAPMA. Ayrı onay iste.

**Why:** Kullanıcı commit'lerin otomatik birikmesini istiyor (iş kaybolmasın) ama dışarı çıkan adımları (GitHub'a push, prod'a deploy) kendi kontrolünde tutmak istiyor.

**How to apply:** Önemli düzenleme bitince → otomatik local commit → çalışmaya devam. Push/deploy gerektiğinde → "push edeyim mi / deploy edeyim mi?" diye sor → onaylanınca yap.
```

### `sql-tcp-listener-dead.md`
```markdown
---
name: sql-tcp-listener-dead
description: Switch/Hub "Sunucuya ulaşılamadı" — SQL motoru ayakta ama TCP 1433 listener ölü, fix MSSQLSERVER restart
metadata:
  type: project
---

**Belirti:** Switch login "Sunucuya ulaşılamadı" (veya Hub DB çağrıları ESOCKET `Could not connect to localhost:1433`). 10.10.10.5 prod.

**Yanıltıcı nokta:** SQL servisi (MSSQLSERVER) `Running` görünür, `Get-NetTCPConnection` 1433'ü `0.0.0.0` dinliyor gösterir, registry config doğru (ListenOnAllIPs=1, TcpPort=1433). AMA `Test-NetConnection 127.0.0.1 -Port 1433` → **False**, node `mssql`/tedious bağlanamaz. Motor canlı çünkü `.NET SqlClient` (Server=localhost) **Shared Memory** kullanır, TCP'yi atlar — bu yüzden PowerShell SqlClient komutları çalışırken Switch/Hub (node mssql, sadece TCP 1433) kırılır.

**Kök neden:** SQL'in TCP listener thread'i ölmüş/hung (ERRORLOG'da `XTP_MEMORY_CONSUMER` bellek olayı dökümü, sqlservr WorkingSet anormal düşük ~0.38GB).

**Fix:** MSSQLSERVER servisini restart → TCP listener temiz yeniden bağlanır. ~15-30sn kesinti, Hub/Switch pool'ları otomatik reconnect. Firma DB'leri 10.15.2.2'de ayrı, etkilenmez.

**Doğrulama:** `Test-NetConnection 127.0.0.1 -Port 1433` True + node mssql `SELECT 1` OK. İlk yaşandığında (2026-06-24) kullanıcı manuel restart etti, düzeldi.
```

### `crm-switch-pending-https.md`
```markdown
---
name: crm-switch-pending-https
description: Pusula CRM Switch entegrasyonu app.pusulanet.net HTTPS olana kadar parkta
metadata:
  type: project
---

**Pusula CRM (crm.pusulanet.net) Switch/sidebar entegrasyonu PARKTA** — `app.pusulanet.net` HTTPS olana kadar bekliyor.

**Durum:** CRM ayrı bir cloud uygulaması, kendi Supabase auth'u var. Switch'e iframe ile gömülmüştü (`/apps/crm` → tam ekran iframe) ki gateway URL'i korunsun. CRM iframe'lenmeye izin veriyor ve crm.pusulanet.net + app.pusulanet.net aynı site (pusulanet.net).

**Engel:** `app.pusulanet.net` şu an **HTTP** (10.10.10.5 LAN). CRM HTTPS. Farklı şema → **schemeful-cross-site** → CRM'in `SameSite=Lax` Supabase cookie'leri iframe'de gönderilmiyor → login döngüsü.

**Çözüm:** `app.pusulanet.net`'e trusted HTTPS. LAN-only olduğu için HTTP-01 olmaz → **DNS-01** gerekir. DNS TurkHost'ta (API yok) → kullanıcı **Cloudflare'e geçmeyi planlıyor (henüz değil)**. HTTPS gelince iframe sorunsuz çalışır.

**Geri eklemek için (HTTPS sonrası):** apps.config.ts + Hub/SpareFlow app-switcher.tsx'deki yorumlu `crm` bloklarını aç + Switch `src/app/apps/crm/page.tsx` iframe sayfasını geri ekle. **crm.svg logoları + DB grant'leri (Apps 'crm' + 21 UserApps) DURUYOR** — sadece kod geri gelecek.
```

---

## 4) Format sonrası kontrol listesi

- [ ] Repo klonla: `git clone https://github.com/muharremoz/PusulaHub.git`
- [ ] Yukarıdaki memory dosyalarını `~/.claude/projects/.../memory/` altına geri yaz
- [ ] Gerekirse `pnpm install` (yerelde build isteniyorsa — bu makinede kurulu değildi)
- [ ] `.env.local` **bu makinede yoktu** (sadece `.env.local.example`) → yedeklenecek bir şey yok
- [ ] **Prod `.env.production` 10.10.10.5'te**, formattan etkilenmez (`BANDWIDTH_API_URL`, `ENCRYPTION_KEY` vb. orada)
- [ ] PuTTY/plink kuruluysa tekrar kur (`C:\Program Files\PuTTY\plink.exe` — Kuma SSH işleri için)

---

## 5) Açık kalan işler

- **VPN (FortiGate)** — `4646.bascilar2` parolası FortiGate arayüzünden manuel güncellenmeli.
- **app.pusulanet.net HTTPS** (Cloudflare DNS-01) → sonra CRM iframe geri eklenecek.
- `TODO.md`'deki sihirbaz sağlamlaştırma maddeleri (SQL restore timeout, agent 60sn timeout, rollback, resume/detached job) duruyor.
