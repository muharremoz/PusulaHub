-- ============================================================================
-- company_usage_daily.peak_cpu / peak_ram_mb — hatalı zirve hesabının düzeltmesi
-- ============================================================================
-- SORUN
--   update_company_usage_post zirveyi şöyle hesaplıyordu:
--       avg_ram_mb  = sum(kullanıcıların günlük ortalaması)   → firma toplamı
--       peak_ram_mb = max(kullanıcıların günlük ortalaması)   → TEK kullanıcı
--   Yani "zirve" firmanın en yüksek anı değil, en çok kaynak kullanan tek
--   kullanıcının gün ortalamasıydı. Birden fazla kullanıcısı olan HER firmada
--   peak < avg çıkıyordu (4646: avg 643 MB, peak 344 MB). CPU'da da aynısı.
--   Gerçek zirve hiç ölçülmüyordu: user_daily_usage yalnız çalışan ortalama
--   tutuyor, örneklem bazında max tutmuyor.
--
-- ÇÖZÜM
--   Zirve, ÖLÇÜM ANINDA yakalanır. poller_user_usage her 5 dakikada bir sunucu
--   başına kullanıcı örneklemi gönderiyor; bu örneklemde firmanın kullanıcıları
--   toplanıp o günün zirvesiyle karşılaştırılır (greatest). Böylece peak =
--   "firmanın toplam kullanımının gün içinde gördüğü en yüksek değer".
--
--   Firma birden fazla sunucuya yayılmışsa zirve sunucu başına tutulup toplanır
--   (üst sınır: iki sunucunun zirvesi aynı ana denk gelmemiş olabilir). Pratikte
--   bir firmanın kullanıcıları tek RDP sunucusunda olduğu için bu tam değerdir.
-- ============================================================================

-- 1) Örneklem anındaki firma zirvesi (sunucu bazında)
create table if not exists hub.company_usage_peak (
  company_id  text not null,
  date        date not null,
  server      text not null,
  peak_cpu    double precision not null default 0,
  peak_ram_mb double precision not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (company_id, date, server)
);
create index if not exists company_usage_peak_date_idx on hub.company_usage_peak (date);

alter table hub.company_usage_peak enable row level security;
do $$ begin
  create policy "hub authed full" on hub.company_usage_peak for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant all on hub.company_usage_peak to authenticated, service_role;

-- 2) poller_user_usage: kullanıcı ortalamalarına ek olarak firma zirvesini yakala
create or replace function hub.poller_user_usage(p_server text, p_items jsonb)
returns void language plpgsql as $$
declare rec jsonb; v_user text; v_firma text; v_bare text;
begin
  for rec in select * from jsonb_array_elements(p_items) loop
    v_user := rec->>'username';
    -- FirmaNo: 1) ad_users.ou, 2) username "NNNN." prefix (DOMAIN\ toleranslı)
    select ou into v_firma from hub.ad_users where username = v_user limit 1;
    if v_firma is null then
      v_bare := regexp_replace(v_user, '^.*\\', '');
      v_firma := substring(v_bare from '^(\d+)\.');
    end if;

    update hub.user_daily_usage set
      avg_cpu         = round(((avg_cpu * sample_count + (rec->>'cpu')::float) / (sample_count + 1))::numeric, 2),
      avg_ram_mb      = round(((avg_ram_mb * sample_count + (rec->>'ram')::float) / (sample_count + 1))::numeric, 1),
      session_minutes = session_minutes + 5,
      sample_count    = sample_count + 1,
      firma_no        = coalesce(firma_no, v_firma)
    where date = current_date and username = v_user and server = p_server;

    if not found then
      insert into hub.user_daily_usage (date, username, firma_no, server, avg_cpu, avg_ram_mb, session_minutes, sample_count)
      values (current_date, v_user, v_firma, p_server, (rec->>'cpu')::float, (rec->>'ram')::float, 5, 1);
    end if;
  end loop;

  -- Bu örneklemin firma bazında TOPLAMI → günün zirvesiyle karşılaştır.
  -- Kullanıcı adından firma çözümü yukarıdakiyle aynı mantık.
  insert into hub.company_usage_peak (company_id, date, server, peak_cpu, peak_ram_mb)
  select f.firma, current_date, p_server, sum(f.cpu), sum(f.ram)
  from (
    select coalesce(
             (select a.ou from hub.ad_users a where a.username = e->>'username' limit 1),
             substring(regexp_replace(e->>'username', '^.*\\', '') from '^(\d+)\.')
           ) as firma,
           coalesce((e->>'cpu')::float, 0) as cpu,
           coalesce((e->>'ram')::float, 0) as ram
    from jsonb_array_elements(p_items) e
  ) f
  where f.firma is not null
  group by f.firma
  -- ON CONFLICT içinde hedef tablo şemasız adıyla anılır (hub.… yazılırsa
  -- "missing FROM-clause entry" hatası verir).
  on conflict (company_id, date, server) do update set
    peak_cpu    = greatest(company_usage_peak.peak_cpu,    excluded.peak_cpu),
    peak_ram_mb = greatest(company_usage_peak.peak_ram_mb, excluded.peak_ram_mb),
    updated_at  = now();
end $$;

-- 3) update_company_usage_post: zirveyi artık company_usage_peak'ten al
create or replace function hub.update_company_usage_post()
returns void language plpgsql as $$
begin
  update hub.companies c set
    usage_cpu = coalesce((select round(avg(u.avg_cpu)::numeric,1) from hub.user_daily_usage u where u.firma_no = c.company_id and u.date = current_date), 0),
    usage_ram = coalesce((select round((sum(u.avg_ram_mb)/1024.0)::numeric,2) from hub.user_daily_usage u where u.firma_no = c.company_id and u.date = current_date), 0)
  where c.company_id is not null;

  insert into hub.company_usage_daily (company_id, date, avg_cpu, peak_cpu, avg_ram_mb, peak_ram_mb, user_count, db_mb, disk_mb)
  select s.company_id, current_date, s.avg_cpu, s.peak_cpu, s.avg_ram_mb, s.peak_ram_mb, s.user_count, s.db_mb, s.disk_mb
  from (
    with firma_today as (
      select firma_no,
             round(avg(avg_cpu)::numeric,1) avg_cpu,
             round(sum(avg_ram_mb)::numeric,1) avg_ram_mb,
             count(distinct username) user_count
      from hub.user_daily_usage where date = current_date and firma_no is not null group by firma_no
    ),
    -- Zirve: örneklem anında yakalanan firma toplamı. Firma birden fazla
    -- sunucudaysa sunucu zirveleri toplanır (üst sınır).
    firma_peak as (
      select company_id firma_no,
             round(sum(peak_cpu)::numeric,1)    peak_cpu,
             round(sum(peak_ram_mb)::numeric,1) peak_ram_mb
      from hub.company_usage_peak where date = current_date group by company_id
    ),
    firma_db as (select firma_no, sum(size_mb)::int db_mb from hub.sql_databases where firma_no is not null group by firma_no),
    firma_disk as (select company_id firma_no, file_storage_mb disk_mb from hub.companies where company_id is not null)
    select coalesce(f.firma_no, d.firma_no, k.firma_no) company_id,
           f.avg_cpu, p.peak_cpu, f.avg_ram_mb, p.peak_ram_mb, f.user_count, d.db_mb, k.disk_mb
    from firma_today f
    full outer join firma_db d   on d.firma_no = f.firma_no
    full outer join firma_disk k on k.firma_no = coalesce(f.firma_no, d.firma_no)
    left join firma_peak p       on p.firma_no = coalesce(f.firma_no, d.firma_no, k.firma_no)
    where coalesce(f.firma_no, d.firma_no, k.firma_no) is not null
      and (f.avg_cpu is not null or d.db_mb is not null or k.disk_mb is not null)
  ) s
  on conflict (company_id, date) do update set
    avg_cpu=excluded.avg_cpu, peak_cpu=excluded.peak_cpu, avg_ram_mb=excluded.avg_ram_mb,
    peak_ram_mb=excluded.peak_ram_mb, user_count=excluded.user_count, db_mb=excluded.db_mb,
    disk_mb=excluded.disk_mb, updated_at=now();
end $$;

-- 4) Geçmişteki hatalı zirveler geri kazanılamaz (örneklem bazında max hiç
--    tutulmamış). Yanlış sayı göstermektense NULL bırakılıyor: UI "—" gösterir.
--    Bugünün satırı bir sonraki poller turunda (≤5 dk) doğru değerle dolar.
update hub.company_usage_daily set peak_cpu = null, peak_ram_mb = null;
