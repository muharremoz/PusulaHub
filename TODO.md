# PusulaHub — TODO

Biriken iş listesi. Tamamlananlar `✅` ile işaretlenir ve üstte kalır, ileride "yapmıştık, nasıl çözmüştük" için log niteliğinde.

---

## İzleme (Uptime Kuma Entegrasyonu)

### Yapılacak

_Şimdilik boş._

### Yapıldı

- ✅ Uptime Kuma kurulumu (Docker, `/opt/uptime-kuma/data`, LAN-only `10.15.2.6:3001`)
- ✅ 11 monitor JSON import (5 ping + 6 http/dns)
- ✅ Telegram notification (bot `8695637214:...`, chat_id kullanıcı tarafından eklendi)
- ✅ Hub `/api/monitoring` endpoint'i + `lib/kuma.ts` (Prometheus parser, 30sn cache)
- ✅ `/monitoring` sayfası gerçek veriye bağlandı (mock temizlendi, skeleton/error/empty state)
- ✅ Fastify API monitor'e `X-API-Key` header eklendi + URL `/backup/stats`'a yönlendirildi (root 400 veriyor)
- ✅ Pusula Kur monitor URL'si `/health`'a yönlendirildi (root + `/status` 404; `/health` 200 JSON upstream/downstream durumu döner)
- ✅ Döviz kaynakları için 5 keyword monitor eklendi (Datshop, Ozankur, Altınkaynak, TCMB, Pusula) — hepsi `/health` JSON'ında kaynağa özel `"status":"ok"` pattern'ini arar. Telegram notification bağlı. Script: `kuma-add-exchange-monitors.sql`.
- ✅ Heartbeat bar (Kuma tarzı, dakikalık) — Kuma SQLite'tan SSH + sqlite3 ile son 100 beat, her bar = tek beat. `lib/kuma-history.ts` (30 sn cache, BEAT_LIMIT=100), `/api/monitoring?history=1`. Page'de 25 slot gösterir, shadcn Tooltip ile hover detay (tarih + durum + ping). Windows bağımlılığı: `plink.exe` (CLAUDE.md'de path). — Not: Önce 30 günlük daily bucket yapıldı, sonra Kuma gibi dakikalık beat'e çevrildi.
- ✅ `/tv` full-bleed karanlık izleme sayfası — 4K 55" TV için kiosk tarzı. Sidebar/header yok (`tv/layout.tsx` ana `(main)` dışında). Üst şerit: başlık + büyük özet banner ("X/Y ÇEVRİMİÇİ" yeşil glow veya "X SİSTEM ÇEVRİMDIŞI" kırmızı yanıp sönen) + dijital saat/tarih. Ana grid: 4 kolon, DOWN → en üste sıralı + kırmızı ring pulse, döviz birleşik tile (col-span-2, 5 kaynak iç grid). 30sn auto-refresh. Heartbeat bar/uptime% yok (canlı izleme). Alt şerit: son güncelleme + Kuma bağlantı dot.
- ✅ Kuma monitor CRUD (Hub Socket.IO client) — `lib/kuma-client.ts` socket.io-client üstünden login + add/editMonitor/deleteMonitor. `POST /api/servers` → otomatik ping monitor (60sn interval, Telegram notification id=1 bağlı). `PATCH` → Name/IP değişirse editMonitor. `DELETE` → ada göre deleteMonitor. Hata durumunda `kumaSafeCall` ile sessizce loglanır, Hub response'u bozulmaz. Env: `KUMA_ADMIN_USER`, `KUMA_ADMIN_PASSWORD`.
- ✅ Döviz Kurları tek birleşik kart (`/monitoring`) — 5 döviz monitor'ü ("Döviz - X") `ExchangeCard` içinde kaynak listesi olarak gösterilir (durum noktası + ping + uptime %). 2×2 span kaplar, agregat statü: biri down ise down, biri warning ise warning, aksi up. Filtre sekmeleri grubu agregat statüye göre gösterir/gizler.
- ✅ Dashboard'a "İZLEME" KPI kartı eklendi — canlı `X/Y` + DOWN isimleri + uyarı durumu, `/monitoring`'e tıklanabilir link, 30 sn otomatik yenile.
- ✅ CLAUDE.md'ye Ubuntu sunucu (SSH, Fastify, Kuma) bölümü eklendi

---

## Üretim Sunucusuna Taşıma (10.10.10.5)

### Yapılacak

_Şimdilik boş._

### Yapıldı

- ✅ Windows Server 2019 (10.10.10.5) prod sunucusu kuruldu — SQL Server 2022 + SSMS yüklendi, `PusulaHub` ve `SpareFlow` DB'leri açıldı, dev'den restore edildi (Companies 5632, customers 41 vs.).
- ✅ `setup-prod.ps1` ile tek tık kurulum — Node + Git + pnpm + pm2 yüklendi (winget Server 2019'da yok, Git/Node MSI elle kuruldu, sonrası script). 3 repo `C:\PusulaProd\` altına klonlandı, `.env.production` rastgele secret'larla üretildi.
- ✅ `ecosystem.prod.config.js`'de **NODE_ENV=production env'i her 3 app'e** eklendi — eksikse `apps/web/server.ts` dev modda kalıyor, `.env.production` yüklenmiyor, `Login failed for user SA` veriyor. Yeni env için `pm2 delete + start` zorunlu (sadece restart yetmez).
- ✅ Hub layout.tsx SessionProvider tipinde cast lokal'de unutulmuştu, prod build'i patlatıyordu — `as unknown as Parameters<typeof SessionProvider>[0]["session"]` cast commit'lendi (`8dd5619`).
- ✅ SpareFlow build için 4 paket eksikti — `@supabase/supabase-js`, `drizzle-orm@0.43.1-f677fb2` (canary, MSSQL desteği bu özel branch'te), `ssh2`, `@radix-ui/react-dialog` elle eklendi. Drizzle resmi 0.45.2'de bile `mssql-core`/`node-mssql` subpath'leri yok — kod sahibi commit'lerken `pnpm add` yapmamış, lokal canary versiyonuna güveniyordu.
- ✅ PM2 boot startup (`pm2-startup install`) — Windows reboot sonrası 3 process otomatik kalkar.

---

## Kayıt İçin — Şu An Çalışan Durum

- **Ubuntu 10.15.2.6:** Fastify API (pm2 `fastify-api`, :3000) + Uptime Kuma (docker, :3001)
- **Kuma admin:** `muharrem.oz@pusulanet.net` / `4Dr616R4wwqA`
- **Kuma metrics API key:** `uk1_l-jozwsUDnKTqtTttP8POfK89thi2a9hxsSaj2XC` (Hub `.env.local`'de)
- **Fastify admin key:** `69432a3c21bcb005cb0cfd2df2b22c266efeab5a4096e0500ace5a77bdd24f1a`
- **Prod sunucusu 10.10.10.5 (Windows Server 2019):** SQL Server 2022 (sa: `P67S96L332008%`), DB'ler `PusulaHub` + `SpareFlow`, PM2 altında 3 app: `switch` (:4000), `hub` (:4242), `spareflow` (:4243). Kurulum kökü `C:\PusulaProd\`, log'lar `C:\PusulaProd\logs\`. Panel: **http://10.10.10.5:4000**.
- **Günlük deploy:** `cd C:\PusulaProd\PusulaHub && .\deploy.ps1 [hub|switch|spareflow|all]` — git pull + pnpm install + build + pm2 restart zinciri.
