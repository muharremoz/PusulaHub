-- ============================================================================
-- Faz 4: Messages (mesaj sistemi) — mssql → Supabase (hub schema)
-- messages / message_recipients / message_templates + read_count RPC
-- ============================================================================
-- server_id: agent-store agent id (hub uuid DEĞİL) → text. Şablon created_by isim string.
-- Veri katmanı (messages-db/templates-db) service-role ile erişir (poller/agent context).
-- ============================================================================

create table if not exists hub.messages (
  id             uuid primary key default gen_random_uuid(),
  subject        text        not null,
  body           text        not null,
  type           text        not null default 'info',
  priority       text        not null default 'normal',
  recipient_type text        not null,
  company_id     uuid,
  company_name   text,
  sender_user_id uuid,
  sender_name    text        not null,
  sent_at        timestamptz not null default now(),
  total_count    int         not null default 0,
  read_count     int         not null default 0
);
create index if not exists messages_sent_at_idx on hub.messages (sent_at desc);

create table if not exists hub.message_recipients (
  id            bigint generated always as identity primary key,
  message_id    uuid not null references hub.messages(id) on delete cascade,
  server_id     text not null,
  server_name   text,
  username      text not null,
  status        text not null default 'pending',
  delivered_at  timestamptz,
  read_at       timestamptz,
  error_message text
);
create index if not exists mr_message_idx on hub.message_recipients (message_id);
create index if not exists mr_lookup_idx  on hub.message_recipients (message_id, username);
create index if not exists mr_server_idx  on hub.message_recipients (server_id, status);

create table if not exists hub.message_templates (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  subject     text        not null,
  body        text        not null,
  type        text        not null default 'info',
  priority    text        not null default 'normal',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Atomik ReadCount artışı (read-modify-write yerine)
create or replace function hub.inc_message_read(p_id uuid, p_n int)
returns void language sql as $$
  update hub.messages set read_count = read_count + p_n where id = p_id;
$$;
grant execute on function hub.inc_message_read(uuid, int) to authenticated, service_role;

alter table hub.messages           enable row level security;
alter table hub.message_recipients enable row level security;
alter table hub.message_templates  enable row level security;

create policy "hub authed full" on hub.messages           for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.message_recipients for all to authenticated using (true) with check (true);
create policy "hub authed full" on hub.message_templates  for all to authenticated using (true) with check (true);

grant all on hub.messages, hub.message_recipients, hub.message_templates to authenticated, service_role;
