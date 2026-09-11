-- Two things a flat list cannot express.
--
--  1. WHAT A BIN IS FOR. A pantry's tables and bins are labelled by what goes in
--     them — "canned vegetables", "pasta", "cereal". That is not a note; it is a
--     rule, and once the app knows it, a scan can file itself. Sorting stops
--     being a step a volunteer performs and becomes something that already
--     happened by the time they look.
--
--  2. HOW STOCK LEAVES. Until now the only exits were the packing checklist and
--     Delete, which means "given to a family" and "thrown out mouldy" and "I
--     typed this in twice" were all the same event: a row vanishing. Those are
--     the three numbers a pantry actually reports on, and the app was recording
--     none of them.

-- ------------------------------------------------------------- what a bin holds

alter table public.locations
  add column if not exists categories text[] not null default '{}';

comment on column public.locations.categories is
  'Which food categories belong here. Used to file a scan automatically; empty means the place takes anything.';

-- ------------------------------------------------------------- how stock leaves

create table if not exists public.stock_exits (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,

  -- Kept as text rather than a foreign key on purpose: the inventory row is
  -- usually gone by the time anyone reads this, and the point of the record is
  -- that it outlives the thing it describes.
  item_name text not null,
  category text not null,
  count integer not null check (count > 0),

  -- 'given_out'  — went to a household. The number funders ask for first.
  -- 'discarded'  — expired, damaged, unsafe. The waste number.
  -- 'correction' — never really existed; a mistake being undone.
  reason text not null check (reason in ('given_out', 'discarded', 'correction')),

  occurred_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index if not exists stock_exits_pantry_time_idx
  on public.stock_exits (pantry_id, occurred_at desc);

alter table public.stock_exits enable row level security;

drop policy if exists "Members can manage stock exits in their pantries" on public.stock_exits;
create policy "Members can manage stock exits in their pantries"
on public.stock_exits for all
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));
