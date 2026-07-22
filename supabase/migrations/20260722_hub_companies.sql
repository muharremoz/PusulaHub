-- ============================================================================
-- Faz 4: Companies — mssql → Supabase (hub schema, AYRI — CRM ile birleştirme YOK)
-- ============================================================================
-- İki anahtar: id (nvarchar(50) PK, PARS) + company_id (nvarchar(20) firkod iş
-- anahtarı — ADUsers.OU, CompanyTags, route [firkod] param buna bağlı).
-- id text olarak korunur (uuid'e zorlanmaz — PARS formatı garanti değil).
-- ============================================================================

create table if not exists hub.companies (
  id               text primary key,
  name             text        not null,
  sector           text,
  contact_person   text,
  contact_email    text,
  contact_phone    text,
  user_count       int         not null default 0,
  user_capacity    int         not null default 0,
  status           text,
  contract_start   date,
  contract_end     date,
  quota_cpu        double precision not null default 0,
  quota_ram        double precision not null default 0,
  quota_disk       double precision not null default 0,
  usage_cpu        double precision not null default 0,
  usage_ram        double precision not null default 0,
  usage_disk       double precision not null default 0,
  db_quota         int         not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  company_id       text,                                -- firkod (iş anahtarı)
  windows_server_id text,
  ad_server_id     text,
  sql_server_id    text,
  file_server_id   text,
  file_storage_mb  int         default 0
);
create index if not exists companies_company_id_idx on hub.companies (company_id);
create index if not exists companies_name_idx        on hub.companies (name);
create index if not exists companies_adserver_idx    on hub.companies (ad_server_id) where ad_server_id is not null;

-- CompanyTags (firkod bazlı etiketler)
create table if not exists hub.company_tags (
  id         bigint generated always as identity primary key,
  company_id text not null,                             -- firkod
  tag        text not null,
  created_at timestamptz default now()
);
create index if not exists company_tags_company_idx on hub.company_tags (company_id);

-- CompanyUserCredentials (firma kullanıcı erişim bilgileri — şifre AES ciphertext)
create table if not exists hub.company_user_credentials (
  id         uuid primary key default gen_random_uuid(),
  company_id text        not null,
  username   text        not null,
  password   text        not null,                      -- AES ciphertext
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_user_creds_company_idx on hub.company_user_credentials (company_id);

alter table hub.companies                enable row level security;
alter table hub.company_tags             enable row level security;
alter table hub.company_user_credentials enable row level security;

create policy "hub authed full" on hub.companies                for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.company_tags             for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.company_user_credentials for all to authenticated using (true) with check (true);

grant all on hub.companies, hub.company_tags, hub.company_user_credentials to authenticated, service_role;
