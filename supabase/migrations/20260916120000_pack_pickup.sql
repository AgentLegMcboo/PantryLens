-- Packed is not the same as given out.
--
-- Packing used to record every item as 'given_out' the moment the checklist
-- was finished. But pantries pack ahead: boxes are made up on Tuesday for a
-- Thursday distribution, and some are never collected at all. Reports was
-- counting food as having reached families while it was still sitting in boxes
-- by the door, and nothing in the app showed that those boxes existed.
--
-- Now a batch has two stages:
--
--  PACKED     Stock leaves the shelf (the cans really are in boxes), and each
--             line is recorded as 'packed', tied to its pack run. The run
--             remembers what the box was and how many were made.
--  COLLECTED  As families pick boxes up, collect_boxes moves that share of
--             the batch to 'given_out'. Reports' "given out" now means what
--             funders mean by it.

-- ------------------------------------------------------------- stock_exits

-- The reason check was declared inline, so Postgres named it
-- stock_exits_reason_check.
alter table public.stock_exits drop constraint if exists stock_exits_reason_check;
alter table public.stock_exits
  add constraint stock_exits_reason_check
  check (reason in ('given_out', 'discarded', 'correction', 'packed'));

-- Which batch a packed line, or the given-out share of it, belongs to. SET NULL
-- rather than CASCADE: the exit record is history and outlives the batch.
alter table public.stock_exits
  add column if not exists pack_run_id uuid references public.pack_runs(id) on delete set null;

create index if not exists stock_exits_pack_run_idx
  on public.stock_exits (pack_run_id)
  where pack_run_id is not null;

-- ------------------------------------------------------------- pack_runs

alter table public.pack_runs
  add column if not exists box_name text,
  -- What one box holds, by category, after family-size scaling.
  add column if not exists per_box jsonb,
  add column if not exists units_taken integer not null default 0,
  add column if not exists boxes_collected integer not null default 0;

-- Packs from before this migration already recorded their food as given out.
-- They are closed as fully collected, so they don't resurface as boxes waiting
-- for a pickup that already happened, and don't get counted a second time.
update public.pack_runs
set units_taken = coalesce((result->>'units_taken')::integer, 0),
    boxes_collected = boxes
where box_name is null and per_box is null and boxes_collected = 0;

alter table public.pack_runs drop constraint if exists pack_runs_collected_range;
alter table public.pack_runs
  add constraint pack_runs_collected_range
  check (boxes_collected >= 0 and boxes_collected <= boxes);

-- "Still waiting for someone", as a column. The app lists these, and the REST
-- API can't compare two columns in a filter, so the comparison lives here. A
-- batch where nothing could be packed has nothing to hand out and never counts.
alter table public.pack_runs
  add column if not exists ready boolean
  generated always as (boxes_collected < boxes and units_taken > 0) stored;

create index if not exists pack_runs_ready_idx
  on public.pack_runs (pantry_id, created_at desc)
  where ready;

-- ------------------------------------------------------------- pack_boxes, v2

/**
 * Same transaction, locking and idempotency as the first version (see
 * 20260913090000_pack_boxes.sql). What changed:
 *
 *  - Lines are recorded as 'packed', linked to the run, not 'given_out'.
 *  - The run stores the box's name and per-box contents for the "Ready to go"
 *    list.
 *  - `box_name` and `per_box` default to null, so a phone still running the
 *    previous build can keep packing.
 *
 * Local variables are deliberately named differently from pack_runs' columns.
 * Inside PL/pgSQL an identifier that could be either is an error, and
 * `units_taken` is now both.
 */
drop function if exists public.pack_boxes(uuid, uuid, integer, jsonb);

create or replace function public.pack_boxes(
  target_pantry uuid,
  run_id uuid,
  box_count integer,
  lines jsonb,
  box_name text default null,
  per_box jsonb default null
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
  taken_total integer := 0;
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
  if pack_boxes.per_box is not null and jsonb_typeof(pack_boxes.per_box) <> 'object' then
    raise exception 'per_box must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(lines) as l
    where (l->>'count')::integer < 0
  ) then
    raise exception 'Counts cannot be negative' using errcode = '22023';
  end if;

  insert into public.pack_runs (id, pantry_id, boxes, created_by, box_name, per_box)
  values (
    run_id,
    target_pantry,
    coalesce(box_count, 0),
    caller,
    nullif(trim(pack_boxes.box_name), ''),
    pack_boxes.per_box
  )
  on conflict (id) do nothing;

  if not found then
    select r.result into outcome
    from public.pack_runs as r
    where r.id = run_id and r.pantry_id = target_pantry;
    return coalesce(outcome, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

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
        (pantry_id, item_name, category, count, reason, recorded_by, pack_run_id)
      values
        (target_pantry, inv.name, inv.category, take, 'packed', caller, run_id);

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

      if lot.est_units - take <= 0 then
        delete from public.bulk_lots where id = lot.id;
      else
        update public.bulk_lots
        set est_units = lot.est_units - take,
            weight_lbs = round(lot.weight_lbs * (lot.est_units - take) / lot.est_units, 2)
        where id = lot.id;
      end if;

      insert into public.stock_exits
        (pantry_id, item_name, category, count, reason, recorded_by, pack_run_id)
      values
        (target_pantry, 'Bulk ' || lot.category || ' (weighed lot)', lot.category,
         take, 'packed', caller, run_id);

    else
      raise exception 'Unknown line kind: %', line.kind using errcode = '22023';
    end if;

    taken_total := taken_total + take;
  end loop;

  insert into public.activities (pantry_id, text, "time", icon)
  values (
    target_pantry,
    format(
      'Packed %s × %s, %s %s off the shelf%s',
      coalesce(box_count, 0),
      coalesce(nullif(trim(pack_boxes.box_name), ''), 'box'),
      taken_total,
      case when taken_total = 1 then 'unit' else 'units' end,
      case when jsonb_array_length(shortfalls) > 0 then ' (some lines were short)' else '' end
    ),
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'archive-outline'
  );

  outcome := jsonb_build_object(
    'units_taken', taken_total,
    'shortfalls', shortfalls,
    'replayed', false
  );

  update public.pack_runs
  set result = outcome,
      units_taken = taken_total
  where id = run_id;

  return outcome;
end;
$$;

-- Revoked from anon explicitly as well as public. Supabase grants EXECUTE on
-- new functions to anon by default, so revoking from public alone left
-- signed-out callers able to reach the function body. That body refused them,
-- but this refuses them at the door.
revoke execute on function public.pack_boxes(uuid, uuid, integer, jsonb, text, jsonb) from public, anon;
grant execute on function public.pack_boxes(uuid, uuid, integer, jsonb, text, jsonb) to authenticated;

-- ------------------------------------------------------------- collect_boxes

/**
 * Hands out boxes from a packed batch.
 *
 * PROPORTIONAL, AND EXACT IN TOTAL. Individual boxes aren't tracked, so each
 * packed line is given out in proportion to the boxes collected. The cumulative
 * share after k of n boxes is floor(count × k / n), and the whole count once
 * k = n. Each hand-out records the difference from the previous one, so 7 tins
 * across 5 boxes go out as 1, 1, 2, 1, 2: never a fractional tin, and always 7
 * in total.
 *
 * COMPARE-AND-SET. The caller says how many boxes it believes are already
 * collected. If the batch has moved on, nothing happens and the current state
 * comes back. So a retry after a dropped connection can't hand out the same
 * box twice. The app sends taps one at a time, so its own quick taps always
 * match.
 */
create or replace function public.collect_boxes(
  run_id uuid,
  box_count integer,
  expected_collected integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  batch public.pack_runs%rowtype;
  before_count integer;
  after_count integer;
  line record;
  handed integer;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if box_count is null or box_count < 1 then
    raise exception 'Hand out at least one box' using errcode = '22023';
  end if;

  select * into batch
  from public.pack_runs
  where id = collect_boxes.run_id
  for update;

  if not found then
    raise exception 'No such pack' using errcode = 'P0002';
  end if;
  if not public.is_pantry_member(batch.pantry_id) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  before_count := batch.boxes_collected;

  if expected_collected is distinct from before_count then
    return jsonb_build_object(
      'applied', false, 'boxes', batch.boxes, 'boxes_collected', before_count
    );
  end if;

  after_count := least(batch.boxes, before_count + box_count);
  if after_count = before_count then
    return jsonb_build_object(
      'applied', false, 'boxes', batch.boxes, 'boxes_collected', before_count
    );
  end if;

  for line in
    select e.item_name, e.category, e.count
    from public.stock_exits as e
    where e.pack_run_id = batch.id and e.reason = 'packed'
  loop
    handed :=
      (case when after_count >= batch.boxes then line.count
            else floor(line.count::numeric * after_count / batch.boxes)::integer end)
      -
      (case when before_count >= batch.boxes then line.count
            else floor(line.count::numeric * before_count / batch.boxes)::integer end);

    if handed > 0 then
      insert into public.stock_exits
        (pantry_id, item_name, category, count, reason, recorded_by, pack_run_id)
      values
        (batch.pantry_id, line.item_name, line.category, handed, 'given_out', caller, batch.id);
    end if;
  end loop;

  update public.pack_runs set boxes_collected = after_count where id = batch.id;

  -- One line when a whole batch is gone, rather than one per box. A distribution
  -- morning would otherwise bury the activity log in "handed out 1 box".
  if after_count = batch.boxes then
    insert into public.activities (pantry_id, text, "time", icon)
    values (
      batch.pantry_id,
      format('All %s × %s picked up', batch.boxes, coalesce(batch.box_name, 'box')),
      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'hand-heart-outline'
    );
  end if;

  return jsonb_build_object(
    'applied', true, 'boxes', batch.boxes, 'boxes_collected', after_count
  );
end;
$$;

revoke execute on function public.collect_boxes(uuid, integer, integer) from public, anon;
grant execute on function public.collect_boxes(uuid, integer, integer) to authenticated;

-- ------------------------------------------------------------- realtime

-- So a box handed out at the front desk disappears from the list on the phone
-- in the back room.
alter table public.pack_runs replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pack_runs'
     ) then
    execute 'alter publication supabase_realtime add table public.pack_runs';
  end if;
end
$$;
