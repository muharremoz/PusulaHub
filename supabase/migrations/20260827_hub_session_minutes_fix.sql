-- ═══════════════════════════════════════════════════════════════════════
--  user_daily_usage.session_minutes — 30 KAT ŞİŞİK, düzeltiliyor
-- ═══════════════════════════════════════════════════════════════════════
--
--  SORUN
--  Fonksiyon her örnekte `session_minutes + 5` yazıyordu; bu, poller'ın
--  5 dakikada bir çalıştığı varsayımıydı. Poller 10 SANİYEDE bir çalışıyor
--  (agent-poller.ts → POLL_INTERVAL_MS = 10_000). Sonuç: alan gerçek
--  sürenin 30 katını gösteriyor — bir kullanıcı için tek günde 762 saat
--  gibi imkânsız değerler oluşmuştu.
--
--  KANIT (2026-08-27 ölçümü)
--  En yüksek sample_count = 8641. 10 saniyelik örneklemenin bir gündeki
--  teorik tavanı 8640. Değerler tam tavana oturuyor; 5 dakikalık aralıkta
--  tavan 288 olurdu. Nisan'dan bugüne tüm aylar aynı desende, yani aralık
--  hiç değişmemiş ve geçmiş veriyi topluca düzeltmek güvenli.
--
--  ETKİ
--  Bugün hiçbir uygulama kodu bu alanı OKUMUYOR, dolayısıyla kullanıcıya
--  yanlış bir rakam gösterilmiyordu. Düzeltmenin sebebi gizli tuzak:
--  ileride biri bu alandan rapor üretirse 30 kat yanlış sonuç alırdı.
--
--  ÇÖZÜM
--  Sabit "+5" yerine örnekleme aralığı parametre olarak geliyor ve süre
--  sample_count'tan TÜRETİLİYOR. Böylece tek doğruluk kaynağı poller'daki
--  POLL_INTERVAL_MS oluyor; aralık değişirse burası kendiliğinden uyar.
--  Türetilmiş olduğu için mevcut satırlar da günün ilk örneğinde kendini
--  düzeltir.
--
--  NOT — imza değişikliği
--  Parametre eklendiği için `create or replace` YETMEZ: farklı imza yeni
--  bir aşırı yükleme yaratır ve PostgREST iki aday arasında kalıp hata
--  verir. Eski sürüm önce düşürülüyor. Migration tek transaction içinde
--  çalıştığı için arada çağrı kaybı olmuyor.
--
--  p_interval_sec'in varsayılanı var: migration deploy'dan önce çalışırsa
--  parametreyi henüz göndermeyen eski uygulama sürümü de çalışmaya devam
--  eder.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists hub.poller_user_usage(text, jsonb);

create or replace function hub.poller_user_usage(
  p_server       text,
  p_items        jsonb,
  p_interval_sec int default 10
)
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
      -- Toplama DEĞİL türetme: örnek sayısı × aralık. Eski satırlardaki
      -- şişik değer de böylece ilk güncellemede düzeliyor.
      session_minutes = round(((sample_count + 1) * p_interval_sec) / 60.0)::int,
      sample_count    = sample_count + 1,
      firma_no        = coalesce(firma_no, v_firma)
    where date = current_date and username = v_user and server = p_server;

    if not found then
      insert into hub.user_daily_usage (date, username, firma_no, server, avg_cpu, avg_ram_mb, session_minutes, sample_count)
      values (current_date, v_user, v_firma, p_server, (rec->>'cpu')::float, (rec->>'ram')::float,
              round(p_interval_sec / 60.0)::int, 1);
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

-- ── Geçmiş veriyi düzelt ────────────────────────────────────────────────
-- Tüm satırlar 10 saniyelik örneklemeyle toplandı (yukarıdaki kanıt).
-- 8640'ı aşan birkaç satır var; onlar geliştirme poller'ının prod ile aynı
-- anda yazdığı günlerin izi (bkz. server.ts'teki uyarı) ve burada
-- düzeltilmiyor — sample_count'ları da şişik, veriyi uydurmak yerine
-- olduğu gibi bırakmak dürüst olan.
update hub.user_daily_usage
set    session_minutes = round((sample_count * 10) / 60.0)::int
where  session_minutes is distinct from round((sample_count * 10) / 60.0)::int;
