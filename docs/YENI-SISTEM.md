# Yeni Sistem — Deploy & Geliştirme (PusulaHub)

> **ESKİ SİSTEM ARTIK KULLANILMIYOR.** 10.10.10.5 (ofis sunucusu), PM2, `C:\PusulaProd`,
> `ecosystem.prod.config.js`, on-prem MSSQL (PusulaHub DB) — **hepsi emekliye ayrıldı.**
> `docs/prod-server.md` yalnız eski prod'a erişim/emeklilik için referanstır. Geliştirme + dağıtım
> aşağıdaki birleşik platformdadır.

## Birleşik Platform

- **Tek self-hosted Supabase** — `https://supabase.pusulanet.net` (VPS `10.15.2.7`). Tek `auth.users`.
  Kimlik `public.users` + erişim `public.user_apps`. Hub domain verisi **`hub` Postgres şemasında**.
- Hepsi Coolify'da, alt-domain'lerde. SSO cookie `.pusulanet.net`. Login **Switch**'te.

## Bu uygulama (Hub)

| | |
|---|---|
| Domain | `https://hub.pusulanet.net` |
| Coolify app UUID | `wizev44qqhe5njtzqweoe37x` |
| Git branch (deploy) | `main` |
| Self-hosted runner | `pusula-vps-hub` |
| Coolify base_directory | `/apps/web` (monorepo: pnpm + turbo) |
| Sunucu | **custom `server.ts`** (`node -r tsx/cjs server.ts`), port **4242**, `0.0.0.0` |
| Arka plan | `startPolling()` (agent-poller) + `startFirmaSync()` server.ts içinde (in-process) |
| Veri | Supabase — `getSupabaseServer()` (authenticated, UI route) · **`getSupabaseAdmin()`** (service-role, poller/agent/messages, session'sız) · `.schema("hub")` hub tabloları |

- Hub'ın yönettiği cihazlar (5 agent `10.15.2.x`, AD, IIS, SQL) **Coolify VPS ile aynı ağda** → poller/AD/IIS/SQL
  yönetimi Coolify container'ından doğrudan. On-prem worker GEREKMEZ.

## Deploy — otomatik

`main`'e push → runner → Coolify deploy. Build: `pnpm --filter web build`, start: `pnpm --filter web start`.
```bash
git push origin main
```
Coolify dashboard → PusulaHub → Deployments (loglar). ⚠️ fqdn `\\` bozulması → 503 kontrol et.

## Env (Coolify → PusulaHub)

Non-secret: `NEXT_PUBLIC_SUPABASE_URL=https://supabase.pusulanet.net`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_COOKIE_DOMAIN=.pusulanet.net`, `NEXT_PUBLIC_SWITCH_URL=https://switch.pusulanet.net`.
Gizli (Coolify'da): **`SUPABASE_SERVICE_ROLE_KEY`** (poller/messages şart), `ENCRYPTION_KEY` (vault/SQL şifre çözer —
eski prod'daki DEĞERLE aynı olmalı), `AGENT_SECRET`, `INTERNAL_APP_KEY`, `FIRMA_API_*`, `KUMA_*`, `UPTIME_KUMA_*` vb.
`DB_*` (eski mssql) GEREKMEZ.

## Kullanıcı & yetki

- **Kullanıcı oluşturma CRM'de.** Hub `/users` yalnız **modül/sayfa izinlerini** düzenler (`user_permissions`);
  yeni kullanıcı POST → 403 (CRM'e yönlendirir). App erişimi (`user_apps`) CRM'de atanır.

## DB / migration

DB değişikliği: VPS'e SSH + `docker exec supabase-db-p127ik4ru8fgovgmuc9qj9uq psql`. **Supabase MCP eski cloud'a
bakar, KULLANMA.** SQL'i `supabase/migrations/`'a koy. PostgREST'e yeni şema açmak: authenticator role
`pgrst.db_schemas` + `notify pgrst, 'reload config/schema'` (+ Coolify Supabase service env `PGRST_DB_SCHEMAS`).

## Fastify (aktarım vb.)

`services/pusula-aktarim` gibi on-prem servisler `10.15.2.6`'da kalabilir; Hub HTTP ile tüketir.
