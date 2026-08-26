-- ============================================================================
-- hub.permission_packages — Yetkilendirme ekranındaki hazır paketler
-- ============================================================================
-- Paketler önce bileşende sabitti; her değişiklik deploy demekti. Artık burada
-- duruyor ve /permissions ekranından yönetiliyor.
--
-- Paket bir ROL DEĞİL: kişiye uygulandığında modül kümesi user_permissions'a
-- KOPYALANIR, bağ kurulmaz. Paket sonradan değişirse daha önce uygulanmış
-- kişiler etkilenmez. (Rol şablonuna geçilirse bu tablo rolün kendisi olur,
-- sütun eklemek yeter.)
--
-- CRM'deki `public.permission_packages` ile aynı fikir; farkı Hub'ın çoklu
-- uygulama desteği: paket bir app'e ait (app_id), modül kodları o app'in
-- kataloğundan gelir.
-- ============================================================================

create table if not exists hub.permission_packages (
  id          uuid primary key default gen_random_uuid(),
  -- public.apps.id — "hub", "spareflow" …
  app_id      text not null default 'hub',
  name        text not null,
  description text,
  -- Modül anahtarları (lib/permissions.ts MODULES.key). Serbest metin:
  -- yeni modül eklendiğinde migration gerekmesin; geçersiz anahtar
  -- uygulamada zaten yok sayılır.
  modules     text[] not null default '{}',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (app_id, name)
);

create index if not exists permission_packages_sort_idx
  on hub.permission_packages (app_id, sort_order, name);

alter table hub.permission_packages enable row level security;

-- Diğer hub tablolarıyla aynı kural: authenticated tam erişim, anon yok.
-- Yazma ayrıca uygulama tarafında admin'e kısıtlı (API route).
drop policy if exists "hub authed full" on hub.permission_packages;
create policy "hub authed full" on hub.permission_packages
  for all to authenticated using (true) with check (true);

-- updated_at dokunuşu
create or replace function hub.permission_packages_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists permission_packages_touch_trg on hub.permission_packages;
create trigger permission_packages_touch_trg
  before update on hub.permission_packages
  for each row execute function hub.permission_packages_touch();

-- ---------------------------------------------------------------------------
-- Başlangıç paketleri (Hub modülleri — lib/permissions.ts)
-- ---------------------------------------------------------------------------
-- Modül anahtarları: dashboard, servers, companies, company-detail, aktarim,
-- messages, notes, services, databases, iis, active-directory, sql, ports,
-- users, vault, preview
insert into hub.permission_packages (app_id, name, description, modules, sort_order)
values
  ('hub', 'Temel',
   'Panoyu ve sunucu/firma listelerini görür',
   array['dashboard','servers','companies'],
   10),
  ('hub', 'Destek',
   'Günlük destek işi — firma detayı, mesaj, not, hizmet ekranları',
   array['dashboard','servers','companies','company-detail','messages','notes',
         'services','databases','iis','active-directory','sql','ports'],
   20),
  ('hub', 'Yönetici',
   'Destek yetkilerine ek olarak firma aktarımı ve şifre kasası',
   array['dashboard','servers','companies','company-detail','aktarim','messages','notes',
         'services','databases','iis','active-directory','sql','ports','vault'],
   30),
  ('hub', 'Tam',
   'Yetki yönetimi ve geliştirici ekranları dahil her şey',
   array['dashboard','servers','companies','company-detail','aktarim','messages','notes',
         'services','databases','iis','active-directory','sql','ports','users','vault','preview'],
   40)
on conflict (app_id, name) do nothing;
