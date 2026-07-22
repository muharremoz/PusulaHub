-- ============================================================================
-- Faz 4: Kullanım analitiği — mssql → Supabase (hub schema)
-- company_usage_daily (~535k), user_daily_usage, company_weekly_usage
-- ============================================================================
-- Poller bu tabloları yazar. company_usage_daily büyük → COPY ile taşınır.
-- company_id = firkod (companies.company_id).
-- ============================================================================

create table if not exists hub.company_usage_daily (
  company_id   text not null,
  date         date not null,
  avg_cpu      double precision,
  peak_cpu     double precision,
  avg_ram_mb   double precision,
  peak_ram_mb  double precision,
  user_count   int,
  db_mb        int,
  disk_mb      int,
  updated_at   timestamptz not null default now(),
  primary key (company_id, date)
);
create index if not exists company_usage_daily_date_idx on hub.company_usage_daily (date);

create table if not exists hub.user_daily_usage (
  id              bigint generated always as identity primary key,
  date            date not null,
  username        text not null,
  firma_no        text,
  server          text not null,
  avg_cpu         double precision not null default 0,
  avg_ram_mb      double precision not null default 0,
  session_minutes int not null default 0,
  sample_count    int not null default 0
);
create index if not exists user_daily_usage_date_idx on hub.user_daily_usage (date);
create index if not exists user_daily_usage_user_idx on hub.user_daily_usage (username);

create table if not exists hub.company_weekly_usage (
  id         bigint generated always as identity primary key,
  company_id text not null,
  day        text not null,
  day_order  int not null,
  cpu        double precision not null default 0,
  ram        double precision not null default 0,
  disk       double precision not null default 0
);
create index if not exists company_weekly_usage_company_idx on hub.company_weekly_usage (company_id);

alter table hub.company_usage_daily  enable row level security;
alter table hub.user_daily_usage     enable row level security;
alter table hub.company_weekly_usage enable row level security;

create policy "hub authed full" on hub.company_usage_daily  for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.user_daily_usage     for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.company_weekly_usage for all to authenticated using (true) with check (true);

grant all on hub.company_usage_daily, hub.user_daily_usage, hub.company_weekly_usage to authenticated, service_role;
