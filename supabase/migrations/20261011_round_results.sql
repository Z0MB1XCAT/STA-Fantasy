-- Round results saved from admin.html. `content` is the same plain text as data/rounds/NN.txt, so the
-- site parses it with the same code. A row here wins over the file in the repo; with no row the repo
-- file is used, so nothing breaks if this table is empty or unreachable.
--
-- Everyone can read it (results are public). Only profiles with is_admin = true can write, and
-- is_admin cannot be changed from the browser (players may only update display_name and team_name).

create table public.round_results (
  round_id   integer     primary key references public.rounds (id) on delete cascade,
  content    text        not null check (char_length(content) between 1 and 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid        references public.profiles (id) on delete set null
);

alter table public.round_results enable row level security;

revoke all on public.round_results from anon, authenticated;
grant select on public.round_results to anon, authenticated;
grant insert, update on public.round_results to authenticated;

create policy "results are public" on public.round_results
  for select to anon, authenticated using (true);

create policy "admins add results" on public.round_results
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins edit results" on public.round_results
  for update to authenticated
  using      (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

-- who saved it and when, set by the database so the browser cannot fake it
create function public.stamp_round_result() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

revoke execute on function public.stamp_round_result() from public, anon, authenticated;

create trigger round_results_stamp
  before insert or update on public.round_results
  for each row execute function public.stamp_round_result();
