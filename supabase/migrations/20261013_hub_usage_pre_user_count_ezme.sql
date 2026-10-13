-- ============================================================================
-- update_company_usage_pre artık hub.companies.user_count'a YAZMAZ
-- ============================================================================
-- 20260722_hub_poller_rpcs.sql bu fonksiyonun sonunda
--   update hub.companies set user_count = (ad_users OU sayımı)
-- yapıyordu. Ama user_count = LİSANS HAKKI (firma-sync → hub.sync_firmalar,
-- Pusula API UserCount ya da user_count_elle). İki süreç 5 dk'da bir aynı
-- alanı eziyordu; AD'de kullanıcısı olmayan/kurulmamış firmada hak 0 görünüyor,
-- sihirbaz "Kullanıcı hakkı bulunmuyor" diyordu, elle hak (user_count_elle)
-- da işe yaramıyordu (13.10.2026: 4308, 6036; 2278 elle 6 iken 7 görünüyordu).
-- AD kullanıcı sayısı gereken yerler onu ad_users'tan kendisi sayıyor
-- (api/firma/companies → userCount). Diğer adımlar aynen korunur.
-- ============================================================================

create or replace function hub.update_company_usage_pre()
returns void
language plpgsql
as $function$
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

  -- user_count'a dokunulmaz: lisans hakkıdır (hub.sync_firmalar yazar).
end $function$;

-- Elle hak verilmiş firmalarda değeri hemen geri getir (sync zaten coalesce(user_count_elle, ...) yazar)
update hub.companies set user_count = user_count_elle where user_count_elle is not null;
