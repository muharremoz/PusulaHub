-- ============================================================================
-- CPU firma TOPLAMI olarak hesaplanır (RAM ile aynı taban)
-- ============================================================================
-- SORUN
--   Aynı satırda iki farklı taban vardı:
--       avg_ram_mb = sum(kullanıcı)   → firma toplamı
--       avg_cpu    = avg(kullanıcı)   → ortalama kullanıcı
--   Yeni peak_cpu firma toplamı olduğu için CPU'da yine "peak < avg" görünüyor
--   (778: avg %1.1 = 3 kullanıcının ortalaması, peak %0.5 = anlık toplam).
--   Ayrıca firmanın sunucuya gerçek CPU yükü kullanıcı sayısı katı kadar eksik
--   raporlanıyordu: 3 kullanıcı × %1 → gerçekte %3, kolonda %1.
--
-- ÇÖZÜM
--   avg_cpu ve companies.usage_cpu artık sum(). RAM zaten böyleydi; CPU da
--   "firmanın toplam yükü" oluyor ve peak ile karşılaştırılabilir hale geliyor.
--
-- NOT: Geçmiş satırlar olduğu gibi kalıyor — user_daily_usage'daki kullanıcı
--   kırılımı duruyor, istenirse geriye dönük yeniden hesaplanabilir. Bugünün
--   satırı ilk poller turunda düzelir.
-- ============================================================================

create or replace function hub.update_company_usage_post()
returns void language plpgsql as $$
begin
  update hub.companies c set
    -- Firmanın sunucudaki TOPLAM yükü (kullanıcıların ortalaması değil)
    usage_cpu = coalesce((select round(sum(u.avg_cpu)::numeric,1) from hub.user_daily_usage u where u.firma_no = c.company_id and u.date = current_date), 0),
    usage_ram = coalesce((select round((sum(u.avg_ram_mb)/1024.0)::numeric,2) from hub.user_daily_usage u where u.firma_no = c.company_id and u.date = current_date), 0)
  where c.company_id is not null;

  insert into hub.company_usage_daily (company_id, date, avg_cpu, peak_cpu, avg_ram_mb, peak_ram_mb, user_count, db_mb, disk_mb)
  select s.company_id, current_date, s.avg_cpu, s.peak_cpu, s.avg_ram_mb, s.peak_ram_mb, s.user_count, s.db_mb, s.disk_mb
  from (
    with firma_today as (
      select firma_no,
             round(sum(avg_cpu)::numeric,1)    avg_cpu,
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
