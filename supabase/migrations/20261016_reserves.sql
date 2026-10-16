-- Reserve drivers added from admin.html, so a new reserve never needs a commit or a deploy.
--
-- The site merges these rows with the reserves already in data/drivers.json (XMK, KIE) every time it loads.
-- A reserve can be placed in the results so everyone else's finishing positions are right; they can't be
-- picked and score for nobody. If this table can't be read the site carries on with the built-in reserves.
--
-- Everyone can read `reserves` (the name is shown on the results pages). Only profiles with is_admin = true
-- can add or remove a row. Discord handles are kept apart in `reserve_contacts`, which only admins can read,
-- so they are not exposed through the public API.

create table public.reserves (
  code       text        primary key check (code ~ '^[A-Z0-9]{3}$'),
  name       text        not null check (char_length(btrim(name)) between 1 and 40),
  simgrid    text        check (simgrid is null or char_length(btrim(simgrid)) between 1 and 60),  -- null: no SimGrid account
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid        references public.profiles (id) on delete set null
);

create table public.reserve_contacts (
  code    text primary key references public.reserves (code) on delete cascade,
  discord text not null check (char_length(btrim(discord)) between 1 and 60)
);

alter table public.reserves enable row level security;
alter table public.reserve_contacts enable row level security;

revoke all on public.reserves, public.reserve_contacts from anon, authenticated;
grant select on public.reserves to anon, authenticated;
grant insert, delete on public.reserves to authenticated;
grant select, insert on public.reserve_contacts to authenticated;

create policy "reserves are public" on public.reserves
  for select to anon, authenticated using (true);

create policy "admins add reserves" on public.reserves
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins remove reserves" on public.reserves
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins read contacts" on public.reserve_contacts
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins add contacts" on public.reserve_contacts
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

-- who added it, set by the database so the browser cannot fake it
create function public.stamp_reserve() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

revoke execute on function public.stamp_reserve() from public, anon, authenticated;

create trigger reserves_stamp
  before insert on public.reserves
  for each row execute function public.stamp_reserve();

-- A reserve that appears in saved results can't be removed: the results would then name a driver the site
-- no longer knows, and that whole round would be ignored until it was fixed.
create function public.guard_reserve_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.round_results r where r.content ~* ('\m' || old.code || '\M')) then
    raise exception 'Reserve % is in saved results, so it cannot be removed', old.code using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_reserve_delete() from public, anon, authenticated;

create trigger reserves_guard_delete
  before delete on public.reserves
  for each row execute function public.guard_reserve_delete();

-- the first batch of reserves
insert into public.reserves (code, name, simgrid) values
  ('KAR', 'KaR3Nyeeee',          'KaR3Nyeeee'),
  ('BVE', 'Bvessier',            'Bvessier'),
  ('FAN', 'фанат жидких с 2008', null),
  ('CAM', 'cameron_rowlands1234', null),
  ('ARC', 'arcxlight',           null),
  ('ALE', 'AlexisMotorsport',    null),
  ('FGO', 'Faze_Goma',           null);

insert into public.reserve_contacts (code, discord) values
  ('KAR', 'KaR3Nyeeee'),
  ('BVE', 'sylvainvessier'),
  ('FAN', 'фанат жидких с 2008'),
  ('CAM', 'cameron_rowlands1234'),
  ('ARC', 'arcxlight'),
  ('ALE', 'AlexisMotorsport'),
  ('FGO', 'Faze_Goma');
