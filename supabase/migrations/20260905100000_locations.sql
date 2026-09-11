-- Where a thing physically is.
--
-- Category says what an item IS; it says nothing about where to walk to find it.
-- A volunteer holding a pick list for twelve boxes currently criss-crosses the
-- room, because the list is grouped by the only axis the app knows about. Real
-- pantries are organised by shelf, freezer, back room, and the pick list should
-- follow the floor plan.
--
-- A table rather than a text column on inventory, so renaming "Shelf A" to
-- "Canned goods" happens once instead of across four hundred rows.

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  name text not null,
  -- The order a volunteer actually walks them in, which is rarely alphabetical.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- One "Shelf A" per pantry, however it was capitalised on the day.
create unique index if not exists locations_pantry_name_idx
  on public.locations (pantry_id, lower(name));

create index if not exists locations_pantry_order_idx
  on public.locations (pantry_id, sort_order);

alter table public.locations enable row level security;

drop policy if exists "Members can manage locations in their pantries" on public.locations;
create policy "Members can manage locations in their pantries"
on public.locations for all
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));

-- ON DELETE SET NULL, emphatically not CASCADE. Deleting a shelf must never
-- delete the food that was on it — the stock is real whether or not the pantry
-- still describes the room that way.
alter table public.inventory
  add column if not exists location_id uuid references public.locations(id) on delete set null;

create index if not exists inventory_location_idx
  on public.inventory (pantry_id, location_id);

comment on column public.inventory.location_id is
  'Where this sits in the room. Null means unassigned, which is a normal state, not an error.';

-- Same treatment the other synced tables got, so a shelf added on one phone
-- appears on another — deletes included. See 20260905090000.
alter table public.locations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'locations'
  ) then
    execute 'alter publication supabase_realtime add table public.locations';
  end if;
end
$$;
