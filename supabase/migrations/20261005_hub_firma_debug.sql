-- Firma debug izleme kayıtları.
--
-- Pusula programı kendi klasöründe `debugsql.txt` VARSA çalıştırdığı her SQL'i
-- oraya yazar. Hub (firma detay → Debug) ve SQL Konsol (CRM üzerinden) bu
-- dosyayı terminal sunucusunda agent ile açar, okur, siler.
--
-- Her izleyici bir satır. Aynı dosyayı birden çok izleyici okuyabilir; dosya
-- ancak SON izleyici durunca silinir. 10 dk okunmayan satırı poller kapatır
-- (sekme kapandı / konsol çöktü) — dosya sunucuda büyüyüp kalmasın.

create table if not exists hub.firma_debug (
  id           uuid        primary key default gen_random_uuid(),
  company_id   text        not null,
  server_id    text        not null,
  subfolder    text        not null,
  path         text        not null,
  kaynak       text        not null default 'hub',   -- hub | sql-konsol
  started_by   text,
  started_at   timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  stopped_at   timestamptz,
  stop_reason  text                                  -- kullanici | zaman-asimi | boyut | dosya-yok
);

create index if not exists firma_debug_aktif_idx
  on hub.firma_debug (server_id, path) where stopped_at is null;

alter table hub.firma_debug enable row level security;
drop policy if exists "hub authed full" on hub.firma_debug;
create policy "hub authed full" on hub.firma_debug
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on hub.firma_debug to authenticated, service_role;
