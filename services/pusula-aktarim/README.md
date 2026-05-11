# Pusula Aktarım Servisi

Müşterilerin veri (.bak) ve resim klasörlerini yüklediği servis.

## Kurulum

Sunucu: **10.15.2.6** (Ubuntu, Pusula müşteri hizmet ağında)
Dizin: `/opt/pusula-aktarim/`
Port: 5000 (nginx 80 → 5000 reverse proxy)
Public URL: `http://aktarim.pusulanet.net/{token}` (VPN'den)

```bash
cd /opt/pusula-aktarim
npm install fastify @fastify/multipart better-sqlite3
pm2 start server.js --name aktarim
pm2 save
```

### Env (`.env`)
```
TRANSFER_SERVICE_KEY=<Hub ile aynı>
STAGING_ROOT=/opt/pusula-aktarim/staging
PORT=5000
```

## Mimari

- **State**: SQLite (`aktarim.db`) — source of truth burada
- **Hub** (10.10.10.5): Admin UI, Ubuntu'ya HTTP proxy yapar (`X-Service-Key` auth)
- **Müşteri**: VPN üzerinden `aktarim.pusulanet.net` (10.15.2.6'ya çözer)
- **Dosyalar**: `staging/{token}/data/` ve `staging/{token}/images/<relPath>`

## Endpoint'ler

### Admin (X-Service-Key header zorunlu)
- `GET /admin/sessions` — liste
- `POST /admin/sessions` — yeni aktarım oluştur (`{companyId, firmaName, expiresInDays, notes}`)
- `POST /admin/sessions/:id/cancel` — iptal
- `DELETE /admin/sessions/:id` — sil

### Public (token-only)
- `GET /:token` — müşteri HTML sayfası
- `GET /api/info/:token` — durum bilgisi
- `POST /api/upload/:token/data` — .bak yükle (multipart)
- `POST /api/upload/:token/image` — tek resim yükle (`relPath` field ile)
- `POST /api/upload/:token/images-done` — toplu sayaç
- `POST /api/upload/:token/complete` — aktarım tamamlandı

## Sonraki Adım

Yüklenen dosyaların `staging/`'den SQL ve Depo sunucularına otomatik taşınması — `complete` endpoint'inde tetiklenecek.
