-- ============================================================================
-- Faz 4: Vault (Şifre Kasası) — mssql → Supabase (hub schema)
-- ============================================================================
-- password/history.password: AES-256-GCM ciphertext (ENCRYPTION_KEY app'te) →
-- ciphertext OLDUĞU GİBİ taşınır, aynı key ile çözülür. RLS + hub-only erişim.
-- ============================================================================

create table if not exists hub.vault_entries (
  id                  uuid primary key default gen_random_uuid(),
  category            text        not null default 'server',
  title               text        not null,
  username            text        not null,
  password            text        not null,           -- AES ciphertext
  host                text,
  url                 text,
  notes               text,
  is_favorite         boolean     not null default false,
  password_changed_at timestamptz default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists vault_entries_title_idx on hub.vault_entries (title);

create table if not exists hub.vault_password_history (
  id             uuid primary key default gen_random_uuid(),
  vault_entry_id uuid not null references hub.vault_entries(id) on delete cascade,
  password       text not null,                        -- AES ciphertext
  changed_at     timestamptz not null default now()
);
create index if not exists vault_pw_history_entry_idx on hub.vault_password_history (vault_entry_id, changed_at desc);

create table if not exists hub.vault_access_log (
  id             uuid primary key default gen_random_uuid(),
  vault_entry_id uuid not null references hub.vault_entries(id) on delete cascade,
  action         text not null,
  created_at     timestamptz not null default now()
);
create index if not exists vault_access_entry_idx on hub.vault_access_log (vault_entry_id, created_at desc);

alter table hub.vault_entries          enable row level security;
alter table hub.vault_password_history enable row level security;
alter table hub.vault_access_log       enable row level security;

create policy "hub authed full" on hub.vault_entries          for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.vault_password_history for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.vault_access_log       for all to authenticated using (true) with check (true);

grant all on hub.vault_entries, hub.vault_password_history, hub.vault_access_log to authenticated, service_role;
