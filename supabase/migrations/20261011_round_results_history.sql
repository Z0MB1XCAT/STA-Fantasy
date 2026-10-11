-- Keeps every version of a round's results that gets replaced, so a wrong save can be put back.
--
-- A trigger copies the old row here whenever round_results is changed or deleted, so it cannot be skipped by
-- the browser. Only admins can read it, and nobody can write to it directly.

create table public.round_results_history (
  id          bigint      generated always as identity primary key,
  round_id    integer     not null references public.rounds (id) on delete cascade,
  content     text        not null,
  saved_at    timestamptz not null,                                   -- when this version had been saved
  saved_by    uuid        references public.profiles (id) on delete set null,
  replaced_at timestamptz not null default now()
);

create index round_results_history_by_round on public.round_results_history (round_id, replaced_at desc);

alter table public.round_results_history enable row level security;

revoke all on public.round_results_history from anon, authenticated;
grant select on public.round_results_history to authenticated;

create policy "admins read history" on public.round_results_history
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create function public.keep_round_result_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- saving the same text again changes nothing, so there is nothing to keep
  if tg_op = 'UPDATE' and new.content = old.content then
    return new;
  end if;
  insert into public.round_results_history (round_id, content, saved_at, saved_by)
  values (old.round_id, old.content, old.updated_at, old.updated_by);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.keep_round_result_history() from public, anon, authenticated;

create trigger round_results_history_keep
  before update or delete on public.round_results
  for each row execute function public.keep_round_result_history();
