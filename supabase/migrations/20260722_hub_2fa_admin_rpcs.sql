-- Cross-app 2-admin TOTP approval (SpareFlow vb.) — birleşik platform.
-- Eski Hub AppUsers.TwoFactorSecret KALDIRILDI; TOTP artık Supabase MFA
-- (auth.mfa_factors). Secret alt uygulamaya sızmaz: SECURITY DEFINER RPC'ler
-- yalnız service_role'e verilir, secret'ı yalnız verify-admin route'una döner.

-- Hedef app'te admin olan + doğrulanmış TOTP faktörü olan yöneticiler.
create or replace function public.hub_two_factor_admins(p_app_id text)
returns table (id uuid, full_name text, email text)
language sql
security definer
set search_path = public, auth
as $$
  select distinct u.id, coalesce(u.name, u.email) as full_name, u.email
  from public.users u
  left join public.user_apps ua on ua.user_id = u.id and ua.app_id = p_app_id
  where u.active = true
    and (u.role = 'admin' or ua.role = 'admin')
    and exists (
      select 1 from auth.mfa_factors f
      where f.user_id = u.id and f.factor_type = 'totp' and f.status = 'verified'
    )
  order by full_name;
$$;

-- Tek kullanıcı + app rolü + doğrulanmış TOTP secret'ı (verify-admin için).
create or replace function public.hub_admin_totp(p_email text, p_app_id text)
returns table (id uuid, full_name text, email text, is_admin boolean, secret text)
language sql
security definer
set search_path = public, auth
as $$
  select u.id,
         coalesce(u.name, u.email) as full_name,
         u.email,
         (u.role = 'admin' or ua.role = 'admin') as is_admin,
         (
           select f.secret from auth.mfa_factors f
           where f.user_id = u.id and f.factor_type = 'totp' and f.status = 'verified'
           order by f.updated_at desc limit 1
         ) as secret
  from public.users u
  left join public.user_apps ua on ua.user_id = u.id and ua.app_id = p_app_id
  where lower(u.email) = lower(p_email)
    and u.active = true
  limit 1;
$$;

revoke all on function public.hub_two_factor_admins(text) from public, anon, authenticated;
revoke all on function public.hub_admin_totp(text, text) from public, anon, authenticated;
grant execute on function public.hub_two_factor_admins(text) to service_role;
grant execute on function public.hub_admin_totp(text, text) to service_role;
