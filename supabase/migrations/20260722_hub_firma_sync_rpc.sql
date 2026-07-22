-- ============================================================================
-- Faz 4: firma-sync RPC — mssql MERGE Companies karşılığı (tek çağrı)
-- ============================================================================
-- Firma API'den gelen liste (jsonb array) → hub.companies partial upsert.
-- firkod (company_id) eşleşirse SADECE name/email/phone/user_count/contract_end
-- güncellenir (diğer alanlar korunur); yoksa yeni firma insert edilir.
-- MERGE semantiği birebir; lisans geçerli tarih değilse contract_end korunur/varsayılır.
-- ============================================================================

create or replace function hub.sync_firmalar(p jsonb)
returns int
language plpgsql
as $$
declare
  rec       jsonb;
  n         int := 0;
  v_lisans  text;
  v_date    date;
begin
  for rec in select * from jsonb_array_elements(p) loop
    v_lisans := rec->>'lisans';
    -- TRY_CAST karşılığı: yalnız YYYY-MM-DD desenini date'e çevir, aksi halde null
    v_date := case when v_lisans ~ '^\d{4}-\d{2}-\d{2}' then (left(v_lisans,10))::date else null end;

    update hub.companies set
      name          = rec->>'firma',
      contact_email = rec->>'email',
      contact_phone = rec->>'phone',
      user_count    = coalesce((rec->>'userCount')::int, 0),
      contract_end  = coalesce(v_date, contract_end)
    where company_id = rec->>'firkod';

    if not found then
      insert into hub.companies
        (id, company_id, name, sector, contact_person, contact_email, contact_phone,
         user_count, user_capacity, status, contract_start, contract_end, created_at)
      values
        (gen_random_uuid()::text, rec->>'firkod', rec->>'firma', '', '', rec->>'email', rec->>'phone',
         coalesce((rec->>'userCount')::int, 0), 0, 'active', current_date,
         coalesce(v_date, current_date + interval '1 year'), now());
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function hub.sync_firmalar(jsonb) to authenticated, service_role;
