-- company_pars_users: diğer hub tablolarıyla aynı erişim modeli (RLS + authenticated tam erişim)
alter table hub.company_pars_users enable row level security;
drop policy if exists "hub authed full" on hub.company_pars_users;
create policy "hub authed full" on hub.company_pars_users
  for all to authenticated using (true) with check (true);
