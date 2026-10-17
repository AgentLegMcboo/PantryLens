-- Messages a volunteer sends to everyone in the pantry, shown in the app's
-- Notifications (the bell). First use: "We need protein and grains" from the
-- Needs screen, so the team knows what to look out for in donations.
create table if not exists public.pantry_alerts (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists pantry_alerts_pantry_created_idx
  on public.pantry_alerts (pantry_id, created_at desc);

alter table public.pantry_alerts enable row level security;

drop policy if exists "Members can read alerts" on public.pantry_alerts;
create policy "Members can read alerts"
on public.pantry_alerts for select
using (public.is_pantry_member(pantry_id));

drop policy if exists "Members can send alerts" on public.pantry_alerts;
create policy "Members can send alerts"
on public.pantry_alerts for insert
with check (public.is_pantry_member(pantry_id) and created_by = auth.uid());

drop policy if exists "Senders can delete their alerts" on public.pantry_alerts;
create policy "Senders can delete their alerts"
on public.pantry_alerts for delete
using (created_by = auth.uid());

-- Live delivery to phones that already have the app open.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_alerts'
     ) then
    execute 'alter publication supabase_realtime add table public.pantry_alerts';
  end if;
end $$;
