-- ============================================================================
-- BİRLEŞİK PLATFORM — Faz 4: Hub domain verisi → Supabase (schema izolasyonu)
-- Başlangıç modülü: Notes + CalendarEvents + Settings
-- ============================================================================
-- Karar (Faz 1): her app'in domain verisi KENDİ schema'sında (public = ortak kimlik).
-- Bu migration additive — CRM public şemasına ve Hub mssql'ine dokunmaz.
-- Uygulama: self-hosted VPS'e SSH+psql (Supabase MCP eski cloud'a bakıyor, kullanma).
--
-- created_by: mssql'de `CreatedBy` bir isim string'iydi ('Admin'). Birleşik modelde
-- auth.users(id) uuid'sine bağlanır; veri kopyalanırken 'Admin' → admin@ uuid eşlenir.
-- ============================================================================

create schema if not exists hub;

grant usage on schema hub to anon, authenticated, service_role;
alter default privileges in schema hub grant all on tables    to authenticated, service_role;
alter default privileges in schema hub grant all on sequences to authenticated, service_role;

-- ── hub.notes ───────────────────────────────────────────────────────────────
create table if not exists hub.notes (
  id         uuid primary key default gen_random_uuid(),
  title      text        not null default 'Yeni Not',
  content    text,
  tags       text,
  color      text        not null default '#ffffff',
  pinned     boolean     not null default false,
  created_by uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_pinned_updated_idx on hub.notes (pinned desc, updated_at desc);

-- ── hub.calendar_events ─────────────────────────────────────────────────────
create table if not exists hub.calendar_events (
  id              uuid primary key default gen_random_uuid(),
  title           text        not null,
  description     text,
  start_date      timestamptz not null,
  end_date        timestamptz not null,
  all_day         boolean     not null default false,
  color           text        not null default '#3b82f6',
  type            text        not null default 'event',
  recurrence_type text,
  recurrence_end  date,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists calendar_events_start_idx on hub.calendar_events (start_date);

-- ── hub.settings ────────────────────────────────────────────────────────────
create table if not exists hub.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ── RLS: tek-tenant iç ürün — kimliği doğrulanmış kullanıcı tam erişim ───────
-- (Hub erişimi middleware'de app_access claim ile ayrıca gate'leniyor.)
alter table hub.notes           enable row level security;
alter table hub.calendar_events enable row level security;
alter table hub.settings        enable row level security;

create policy "hub authed full" on hub.notes           for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.calendar_events for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.settings        for all to authenticated using (true) with check (true);

grant all on hub.notes, hub.calendar_events, hub.settings to authenticated, service_role;
