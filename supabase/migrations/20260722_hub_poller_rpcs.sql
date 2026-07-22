-- ============================================================================
-- Faz 4: agent-poller RPC'leri — mssql MERGE/aggregation karşılıkları
-- ============================================================================
-- Poller (Coolify, service-role) canlı sunucu verisini bu RPC'lerle hub'a yazar.
-- Her biri jsonb array alır → Postgres'te işler (REST döngüsü yerine tek çağrı).
-- Tarih granülü: current_date (analitik için yeterli).
-- ============================================================================

-- 1) Başarısız RDP giriş denemeleri (dedup insert). Items JS'te temizlenmiş gelir.
create or replace function hub.poller_failed_logons(p_server_id text, p_server_name text, p_items jsonb)
returns void language plpgsql as $$
declare rec jsonb;
begin
  for rec in select * from jsonb_array_elements(p_items) loop
    insert into hub.failed_logon_attempts (server_id, server_name, timestamp, username, client_ip)
    select p_server_id, p_server_name, (rec->>'timestamp')::timestamptz, rec->>'username', rec->>'clientIp'
    where not exists (
      select 1 from hub.failed_logon_attempts
      where server_id = p_server_id
        and timestamp = (rec->>'timestamp')::timestamptz
        and username  = rec->>'username'
        and client_ip = rec->>'clientIp'
    );
  end loop;
end $$;

-- 2) UserDailyUsage running-average MERGE. Item: {username, cpu, ram}.
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
end $$;

-- 3) AD Users: sunucuya ait tüm satırları sil, yeniden yaz.
create or replace function hub.poller_ad_users(p_server text, p_users jsonb)
returns void language plpgsql as $$
begin
  delete from hub.ad_users where server = p_server;
  insert into hub.ad_users (id, server, username, display_name, email, ou, enabled, last_login, created_at)
  select rec->>'id', p_server, rec->>'username', rec->>'displayName', rec->>'email', rec->>'ou',
         coalesce((rec->>'enabled')::boolean, true), nullif(rec->>'lastLogin','')::timestamptz, current_date
  from jsonb_array_elements(p_users) rec
  on conflict (id) do update set
    server=excluded.server, username=excluded.username, display_name=excluded.display_name,
    email=excluded.email, ou=excluded.ou, enabled=excluded.enabled, last_login=excluded.last_login;
end $$;

-- 4) IIS Sites: sil + yeniden yaz.
create or replace function hub.poller_iis_sites(p_server text, p_sites jsonb)
returns void language plpgsql as $$
begin
  delete from hub.iis_sites where server = p_server;
  insert into hub.iis_sites (id, name, server, status, binding, app_pool, physical_path, firma)
  select rec->>'id', rec->>'name', p_server, rec->>'status', rec->>'binding', rec->>'appPool', rec->>'physicalPath', rec->>'firma'
  from jsonb_array_elements(p_sites) rec
  on conflict (id) do update set
    name=excluded.name, status=excluded.status, binding=excluded.binding, app_pool=excluded.app_pool,
    physical_path=excluded.physical_path, firma=coalesce(excluded.firma, hub.iis_sites.firma);
end $$;

-- 5) SQL Databases: sil + yeniden yaz. (SKIP + normalizeDbStatus JS'te.)
create or replace function hub.poller_sql_databases(p_server text, p_dbs jsonb)
returns void language plpgsql as $$
begin
  delete from hub.sql_databases where server = p_server;
  insert into hub.sql_databases (id, name, server, firma_no, size_mb, status, last_backup, last_diff_backup,
                                 last_backup_start, last_diff_backup_start, tables, recovery_model, owner, data_file_path, log_file_path)
  select rec->>'id', rec->>'name', p_server, rec->>'firmaNo', coalesce((rec->>'sizeMB')::int,0), rec->>'status',
         nullif(rec->>'lastBackup','')::timestamptz, nullif(rec->>'lastDiffBackup','')::timestamptz,
         nullif(rec->>'lastBackupStart','')::timestamptz, nullif(rec->>'lastDiffBackupStart','')::timestamptz,
         coalesce((rec->>'tables')::int,0), rec->>'recoveryModel', rec->>'owner', rec->>'dataFilePath', rec->>'logFilePath'
  from jsonb_array_elements(p_dbs) rec
  on conflict (id) do update set
    name=excluded.name, firma_no=excluded.firma_no, size_mb=excluded.size_mb, status=excluded.status,
    last_backup=excluded.last_backup, last_diff_backup=excluded.last_diff_backup,
    last_backup_start=excluded.last_backup_start, last_diff_backup_start=excluded.last_diff_backup_start,
    tables=excluded.tables, recovery_model=excluded.recovery_model, owner=excluded.owner,
    data_file_path=excluded.data_file_path, log_file_path=excluded.log_file_path;
end $$;

-- 6) File storage: {firkod, mb}[] → companies.file_storage_mb
create or replace function hub.poller_set_file_storage(p_items jsonb)
returns void language plpgsql as $$
declare rec jsonb;
begin
  for rec in select * from jsonb_array_elements(p_items) loop
    update hub.companies set file_storage_mb = (rec->>'mb')::int where company_id = rec->>'firkod';
  end loop;
end $$;

-- 7a) updateCompanyUsage PRE: kotalar + backfill + user_count (collectFileStorage öncesi)
create or replace function hub.update_company_usage_pre()
returns void language plpgsql as $$
begin
  update hub.companies set db_quota = 1  where coalesce(db_quota, 0)   = 0;
  update hub.companies set quota_disk = 25 where coalesce(quota_disk, 0) = 0;

  -- file_server_id fallback (ilk File-rollü sunucu)
  update hub.companies c set file_server_id = (
    select s.id from hub.servers s join hub.server_roles r on r.server_id = s.id where r.role = 'File' limit 1
  )
  where c.file_server_id is null and coalesce(c.user_count, 0) > 0
    and exists (select 1 from hub.servers s join hub.server_roles r on r.server_id = s.id where r.role = 'File');

  -- windows_server_id backfill (kullanıcının en güncel/çok kayıtlı RDP sunucusu)
  update hub.companies c set windows_server_id = (
    select s.id from hub.user_daily_usage u join hub.servers s on s.name = u.server
    where u.firma_no = c.company_id group by s.id order by max(u.date) desc, count(*) desc limit 1
  )
  where (c.windows_server_id is null or c.windows_server_id = '')
    and c.ad_server_id is not null and c.ad_server_id <> ''
    and exists (select 1 from hub.user_daily_usage u join hub.servers s on s.name = u.server where u.firma_no = c.company_id);

  -- sql_server_id backfill (yalnız sistemde TEK SQL sunucu varsa)
  update hub.companies c set sql_server_id = (
    select s.id from hub.servers s join hub.server_roles r on r.server_id = s.id where r.role = 'SQL' limit 1
  )
  where (c.sql_server_id is null or c.sql_server_id = '')
    and c.ad_server_id is not null and c.ad_server_id <> ''
    and (select count(*) from hub.servers s join hub.server_roles r on r.server_id = s.id where r.role = 'SQL') = 1;

  -- user_count ← ad_users OU sayımı
  update hub.companies c set user_count = (select count(*) from hub.ad_users a where a.ou = c.company_id)
  where c.company_id is not null;
end $$;

-- 7b) updateCompanyUsage POST: bugünkü usage + company_usage_daily upsert (collectFileStorage sonrası)
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
             round(avg(avg_cpu)::numeric,1) avg_cpu, round(max(avg_cpu)::numeric,1) peak_cpu,
             round(sum(avg_ram_mb)::numeric,1) avg_ram_mb, round(max(avg_ram_mb)::numeric,1) peak_ram_mb,
             count(distinct username) user_count
      from hub.user_daily_usage where date = current_date and firma_no is not null group by firma_no
    ),
    firma_db as (select firma_no, sum(size_mb)::int db_mb from hub.sql_databases where firma_no is not null group by firma_no),
    firma_disk as (select company_id firma_no, file_storage_mb disk_mb from hub.companies where company_id is not null)
    select coalesce(f.firma_no, d.firma_no, k.firma_no) company_id,
           f.avg_cpu, f.peak_cpu, f.avg_ram_mb, f.peak_ram_mb, f.user_count, d.db_mb, k.disk_mb
    from firma_today f
    full outer join firma_db d   on d.firma_no = f.firma_no
    full outer join firma_disk k on k.firma_no = coalesce(f.firma_no, d.firma_no)
    where coalesce(f.firma_no, d.firma_no, k.firma_no) is not null
      and (f.avg_cpu is not null or d.db_mb is not null or k.disk_mb is not null)
  ) s
  on conflict (company_id, date) do update set
    avg_cpu=excluded.avg_cpu, peak_cpu=excluded.peak_cpu, avg_ram_mb=excluded.avg_ram_mb,
    peak_ram_mb=excluded.peak_ram_mb, user_count=excluded.user_count, db_mb=excluded.db_mb,
    disk_mb=excluded.disk_mb, updated_at=now();
end $$;

grant execute on function hub.poller_failed_logons(text,text,jsonb), hub.poller_user_usage(text,jsonb),
  hub.poller_ad_users(text,jsonb), hub.poller_iis_sites(text,jsonb), hub.poller_sql_databases(text,jsonb),
  hub.poller_set_file_storage(jsonb), hub.update_company_usage_pre(), hub.update_company_usage_post()
  to authenticated, service_role;
