-- Packing boxes, as one transaction on the server.
--
-- Deductions used to happen on the phone, one row at a time: read the count,
-- subtract, write the result back. That is a lost update waiting to happen. Two
-- volunteers packing at once both read "10 tins", one writes 6, the other writes
-- 7, and the shelf ends up claiming 7 when 3 are left. The old code said so in a
-- comment and did it anyway.
--
-- Here every deduction is a relative `count = count - n` against a row locked
-- FOR UPDATE, inside a single transaction. A second pack of the same stock waits
-- for the first to commit and then subtracts from what is actually left.
--
-- It also writes each deduction to stock_exits as 'given_out'. Boxes packed
-- through the checklist never reached Reports before, which made "food
-- distributed", the number funders ask for first, wrong by exactly the amount
-- the pantry's main workflow moves.

-- ------------------------------------------------------------- pack runs

-- One row per press of "Finish". The id is minted on the phone once per
-- checklist, so a retry after a dropped connection is recognised as the same
-- pack instead of deducting the shelf twice. Now that a failed pack shows an
-- error with a way to try again, that retry is a real thing a volunteer will do.
create table if not exists public.pack_runs (
  id uuid primary key,
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  boxes integer not null default 0,
  -- What pack_boxes returned, so a replayed request gets the same answer.
  result jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pack_runs_pantry_time_idx
  on public.pack_runs (pantry_id, created_at desc);

alter table public.pack_runs enable row level security;

drop policy if exists "Members can read pack runs in their pantries" on public.pack_runs;
create policy "Members can read pack runs in their pantries"
on public.pack_runs for select
using (public.is_pantry_member(pantry_id));

-- No insert/update policy: rows are only written by pack_boxes.

-- ------------------------------------------------------------- pack_boxes

/**
 * Deducts a packed checklist from the shelf.
 *
 * `lines` is [{kind: 'item' | 'lot', id, count}, ...]. Returns
 * {units_taken, shortfalls: [{id, wanted, taken}], replayed}.
 *
 * WHEN STOCK HAS RUN OUT. If a line asks for more than the row now holds
 * (someone else packed it first), this takes what is there and reports the
 * difference instead of failing the whole pack. The volunteer has already
 * finished a full checklist. If they physically filled the boxes, the stock
 * existed and the records were behind, and aborting would leave everything
 * they packed un-deducted. Counts never go below zero, and every shortfall is
 * handed back for the app to show.
 *
 * DEADLOCKS. Rows are locked in ascending id order, whatever order the lines
 * arrive in. Two packs touching the same rows always queue in the same order,
 * so neither can end up holding a lock the other is waiting for.
 */
create or replace function public.pack_boxes(
  target_pantry uuid,
  run_id uuid,
  box_count integer,
  lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  line record;
  inv public.inventory%rowtype;
  lot public.bulk_lots%rowtype;
  take integer;
  units_taken integer := 0;
  shortfalls jsonb := '[]'::jsonb;
  outcome jsonb;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;
  if run_id is null then
    raise exception 'run_id is required' using errcode = '22023';
  end if;
  if lines is null or jsonb_typeof(lines) <> 'array' then
    raise exception 'lines must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(lines) as l
    where (l->>'count')::integer < 0
  ) then
    raise exception 'Counts cannot be negative' using errcode = '22023';
  end if;

  -- Claim the run. If another request with this id is still in flight, the
  -- conflicting insert waits for it to commit. Either way, a second request
  -- with the same id never deducts anything.
  insert into public.pack_runs (id, pantry_id, boxes, created_by)
  values (run_id, target_pantry, coalesce(box_count, 0), caller)
  on conflict (id) do nothing;

  if not found then
    select r.result into outcome
    from public.pack_runs as r
    where r.id = run_id and r.pantry_id = target_pantry;
    return coalesce(outcome, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  -- One pass per row: duplicate lines for the same row are summed, and rows
  -- are visited in id order so locks are always taken in the same order.
  for line in
    select l->>'kind' as kind,
           (l->>'id')::uuid as row_id,
           sum((l->>'count')::integer) as qty
    from jsonb_array_elements(lines) as l
    group by 1, 2
    having sum((l->>'count')::integer) > 0
    order by 2
  loop
    if line.kind = 'item' then
      -- Scoped to this pantry: an id from anywhere else simply is not found.
      select * into inv
      from public.inventory
      where id = line.row_id and pantry_id = target_pantry
      for update;

      if not found then
        shortfalls := shortfalls
          || jsonb_build_object('id', line.row_id, 'wanted', line.qty, 'taken', 0);
        continue;
      end if;

      take := least(inv.count, line.qty);
      if take < line.qty then
        shortfalls := shortfalls
          || jsonb_build_object('id', line.row_id, 'wanted', line.qty, 'taken', take);
      end if;
      if take <= 0 then
        continue;
      end if;

      if inv.count - take <= 0 then
        delete from public.inventory where id = inv.id;
      else
        update public.inventory set count = count - take where id = inv.id;
      end if;

      insert into public.stock_exits
        (pantry_id, item_name, category, count, reason, recorded_by)
      values
        (target_pantry, inv.name, inv.category, take, 'given_out', caller);

    elsif line.kind = 'lot' then
      select * into lot
      from public.bulk_lots
      where id = line.row_id and pantry_id = target_pantry
      for update;

      if not found then
        shortfalls := shortfalls
          || jsonb_build_object('id', line.row_id, 'wanted', line.qty, 'taken', 0);
        continue;
      end if;

      take := least(lot.est_units, line.qty);
      if take < line.qty then
        shortfalls := shortfalls
          || jsonb_build_object('id', line.row_id, 'wanted', line.qty, 'taken', take);
      end if;
      if take <= 0 then
        continue;
      end if;

      -- Weight is the recorded truth and units are the estimate, so both come
      -- down together, in proportion.
      if lot.est_units - take <= 0 then
        delete from public.bulk_lots where id = lot.id;
      else
        update public.bulk_lots
        set est_units = lot.est_units - take,
            weight_lbs = round(lot.weight_lbs * (lot.est_units - take) / lot.est_units, 2)
        where id = lot.id;
      end if;

      insert into public.stock_exits
        (pantry_id, item_name, category, count, reason, recorded_by)
      values
        (target_pantry, 'Bulk ' || lot.category || ' (weighed lot)', lot.category,
         take, 'given_out', caller);

    else
      raise exception 'Unknown line kind: %', line.kind using errcode = '22023';
    end if;

    units_taken := units_taken + take;
  end loop;

  insert into public.activities (pantry_id, text, "time", icon)
  values (
    target_pantry,
    format(
      'Packed %s %s, %s %s off the shelf%s',
      coalesce(box_count, 0),
      case when coalesce(box_count, 0) = 1 then 'box' else 'boxes' end,
      units_taken,
      case when units_taken = 1 then 'unit' else 'units' end,
      case when jsonb_array_length(shortfalls) > 0 then ' (some lines were short)' else '' end
    ),
    -- Same ISO shape the app writes, so the dashboard's "3m ago" can parse it.
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'archive-outline'
  );

  outcome := jsonb_build_object(
    'units_taken', units_taken,
    'shortfalls', shortfalls,
    'replayed', false
  );
  update public.pack_runs set result = outcome where id = run_id;
  return outcome;
end;
$$;

revoke execute on function public.pack_boxes(uuid, uuid, integer, jsonb) from public;
grant execute on function public.pack_boxes(uuid, uuid, integer, jsonb) to authenticated;
