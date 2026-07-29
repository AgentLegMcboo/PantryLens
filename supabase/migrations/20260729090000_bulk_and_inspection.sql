-- Brings the schema in line with how MESA and similar pantries actually work.
--
-- Three gaps this closes:
--
--  1. INSPECTION. Volunteers check every item for expiration, rust, dents and
--     broken seals before it is shelved. There was nowhere to record the result,
--     so a dented can looked identical to a good one and could be packed.
--
--  2. BULK DONATIONS. Large grocery and food-bank drops are weighed and the
--     weight is recorded — nobody counts individual cans. There was no way to
--     log a donation at all without inventing a can count.
--
--  3. DONOR SOURCE. `source` records HOW an item was entered (donation / audit /
--     manual), not WHO it came from. Grocery rescue and food-bank stock have
--     different handling, and a recall means tracing back to a donor.

-- ---------------------------------------------------------------- inventory

alter table public.inventory
  add column if not exists condition text not null default 'ok'
    check (condition in ('ok', 'dented', 'rusted', 'seal_broken', 'expired')),
  add column if not exists source_org text
    check (source_org is null or source_org in ('grocery', 'food_bank', 'drive', 'individual', 'other')),
  add column if not exists source_name text,
  add column if not exists bulk_lot_id uuid;

comment on column public.inventory.condition is
  'Result of the manual inspection step. Anything other than ''ok'' is held out of box building until a human clears it.';

-- date_added already exists and is the FIFO basis — index it so "oldest first"
-- stays cheap as the table grows.
create index if not exists inventory_pantry_date_added_idx
  on public.inventory (pantry_id, date_added);

create index if not exists inventory_pantry_expiration_idx
  on public.inventory (pantry_id, expiration);

-- ---------------------------------------------------------------- bulk_lots

-- Weight is the recorded truth, because it is what the pantry actually measures.
-- est_units is a derived estimate so a weighed load can still feed box building;
-- it is always presented to volunteers as an estimate, never as a count.
create table if not exists public.bulk_lots (
  id          uuid primary key default gen_random_uuid(),
  pantry_id   uuid not null references public.pantries(id) on delete cascade,
  category    text not null check (category in
                ('grain','vegetable','protein','breakfast','snack','hygiene','baby','unknown')),
  weight_lbs  numeric(8,2) not null check (weight_lbs >= 0),
  est_units   integer not null default 0 check (est_units >= 0),
  expiration  date,
  date_added  date not null default current_date,
  source_org  text check (source_org is null or source_org in
                ('grocery','food_bank','drive','individual','other')),
  source_name text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists bulk_lots_pantry_idx on public.bulk_lots (pantry_id);

alter table public.inventory
  drop constraint if exists inventory_bulk_lot_id_fkey;
alter table public.inventory
  add constraint inventory_bulk_lot_id_fkey
  foreign key (bulk_lot_id) references public.bulk_lots(id) on delete set null;

alter table public.bulk_lots enable row level security;

-- Reuses the SECURITY DEFINER helper added in 20260729080000 so this policy
-- cannot recurse the way the original membership policy did.
drop policy if exists "Users can manage bulk lots in their pantries" on public.bulk_lots;
create policy "Users can manage bulk lots in their pantries"
on public.bulk_lots for all
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));

-- ---------------------------------------------------------------- pantries

-- Rough pounds-per-unit per category, used to turn a weighed lot into an
-- estimated unit count. Defaults are guesses — calibrate against real MESA
-- weigh-ins once the team has visited.
alter table public.pantries
  add column if not exists lbs_per_unit jsonb not null default
  '{"grain":1.2,"vegetable":1.0,"protein":1.0,"breakfast":1.5,"snack":0.5,"hygiene":1.0,"baby":0.8,"unknown":1.0}'::jsonb;
