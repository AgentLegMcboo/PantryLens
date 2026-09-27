-- Counting a shelf, as opposed to adding to one.
--
-- Shelf Audit has existed since the first build and has never once audited
-- anything. Its reviewed results called the same addItems() as a donation, so
-- "re-counting" Shelf A inserted a second set of rows on top of the first. A
-- pantry that audited weekly to stay accurate watched its inventory climb every
-- week, and the screen said "before it replaces what is on the shelf" while it
-- did the opposite.
--
-- An audit is the act of overwriting the book with what is physically there.
-- Three things follow, and all three are why this needs to be one server-side
-- call rather than a handful of writes from the phone:
--
--  1. It is a REPLACEMENT, over a scope. Counting Shelf A entitles you to say
--     "Shelf A holds exactly this" — which means lowering counts and deleting
--     rows, not just adding. An intake can only ever say "+n".
--
--  2. It must be all or nothing. A correction that applied four of its seven
--     lines and then lost the connection leaves a shelf in a state that is
--     neither the old count nor the new one, and nobody can tell which lines
--     landed.
--
--  3. The difference is the point. What the shelf said before, what it says
--     now, and who counted it is the record that makes the number trustworthy;
--     the corrected count on its own is just another number of unknown origin.
--
-- Auditing is deliberately NOT manager-only. Counting a shelf is the work, and
-- the people doing the work are volunteers.

create table if not exists public.shelf_audits (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,

  location_id uuid references public.locations(id) on delete set null,
  -- Snapshot, not a join. The record has to outlive the shelf being renamed or
  -- removed — "we counted Shelf A in September" stays true either way.
  location_name text not null,

  counted_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  photos integer not null default 0,

  -- The variance. units_after - units_before is the number that says whether
  -- this pantry's counts can be believed.
  units_before integer not null,
  units_after integer not null,

  rows_corrected integer not null default 0,
  rows_added integer not null default 0,
  rows_removed integer not null default 0,
  rows_unchanged integer not null default 0,
  -- Lines that were left alone because the row had changed underneath the
  -- count, and rows on the shelf the count never mentioned. Both are reported
  -- rather than guessed at.
  rows_skipped integer not null default 0,
  rows_untouched integer not null default 0
);

create index if not exists shelf_audits_pantry_time_idx
  on public.shelf_audits (pantry_id, occurred_at desc);

alter table public.shelf_audits enable row level security;

drop policy if exists "Members can read shelf audits" on public.shelf_audits;
create policy "Members can read shelf audits"
on public.shelf_audits for select
using (public.is_pantry_member(pantry_id));

-- Written only by apply_shelf_audit, which is the only thing that knows the
-- before-figures are true. A hand-written audit record would be a claim about a
-- count that never happened.
revoke insert, update, delete on public.shelf_audits from anon, authenticated;
grant select on public.shelf_audits to authenticated;

-- ------------------------------------------------------------- applying one

/**
 * Applies a counted shelf, in one transaction.
 *
 * `lines` is the reconciled list the volunteer confirmed, one entry per thing
 * on that shelf:
 *
 *   { "item_id": uuid|null,   -- null means "found something not on the books"
 *     "expected": int|null,   -- the count this line was reconciled against
 *     "name": text,
 *     "category": text,
 *     "count": int,           -- what is physically there. 0 deletes the row.
 *     "expiration": date|null }
 *
 * `expected` is a compare-and-set. If the row has changed since the count was
 * reconciled — someone else shelved a donation onto it while the volunteer was
 * walking back — the line is SKIPPED and reported rather than applied. Physical
 * count beats the book, but only for the shelf the counter actually saw, and
 * they did not see a case that arrived afterwards.
 *
 * Rows on the shelf that `lines` never mentions are left exactly as they are
 * and reported as untouched. Silence is not evidence of absence: this function
 * deletes only what it was explicitly told is gone.
 */
create or replace function public.apply_shelf_audit(
  target_pantry uuid,
  target_location uuid,
  photo_count integer,
  lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  loc_name text;
  line jsonb;
  cur public.inventory%rowtype;
  item uuid;
  expected integer;
  new_count integer;
  units_before integer := 0;
  units_after integer := 0;
  n_corrected integer := 0;
  n_added integer := 0;
  n_removed integer := 0;
  n_unchanged integer := 0;
  n_skipped integer := 0;
  n_untouched integer := 0;
  touched uuid[] := '{}';
  conflicts jsonb := '[]'::jsonb;
  audit_id uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  select name into loc_name
  from public.locations
  where id = target_location and pantry_id = target_pantry;

  if loc_name is null then
    raise exception 'That shelf is not part of this pantry' using errcode = 'P0002';
  end if;

  -- Hold the shelf for the length of the transaction. Two volunteers counting
  -- the same shelf at once is unlikely; a pack run taking stock off it midway
  -- through is not.
  perform 1
  from public.inventory
  where pantry_id = target_pantry and location_id = target_location
  for update;

  select coalesce(sum(count), 0) into units_before
  from public.inventory
  where pantry_id = target_pantry and location_id = target_location;

  for line in select * from jsonb_array_elements(lines)
  loop
    new_count := coalesce((line->>'count')::integer, 0);
    item := nullif(line->>'item_id', '')::uuid;

    -- Something on the shelf that was never on the books.
    if item is null then
      if new_count > 0 then
        insert into public.inventory
          (pantry_id, name, category, count, expiration, date_added, source,
           location_id, condition, confidence)
        values
          (target_pantry,
           coalesce(nullif(trim(line->>'name'), ''), 'Unlabeled item'),
           coalesce(nullif(line->>'category', ''), 'unknown'),
           new_count,
           nullif(line->>'expiration', '')::date,
           current_date,
           'shelf_audit',
           target_location,
           'ok',
           1.0);
        n_added := n_added + 1;
      end if;
      continue;
    end if;

    select * into cur
    from public.inventory
    where id = item and pantry_id = target_pantry;

    if not found then
      n_skipped := n_skipped + 1;
      conflicts := conflicts || jsonb_build_object(
        'name', line->>'name', 'reason', 'gone');
      continue;
    end if;

    expected := nullif(line->>'expected', '')::integer;
    if expected is not null and cur.count <> expected then
      n_skipped := n_skipped + 1;
      conflicts := conflicts || jsonb_build_object(
        'name', cur.name, 'reason', 'changed',
        'expected', expected, 'actual', cur.count);
      continue;
    end if;

    touched := touched || item;

    if new_count = cur.count then
      n_unchanged := n_unchanged + 1;

    elsif new_count <= 0 then
      -- Stock that is not there has to leave the books through the same door as
      -- everything else, or the reports stop adding up. 'correction' and not
      -- 'given_out': nobody can say where it went, and counting it as handed
      -- out would inflate the one number funders read first.
      insert into public.stock_exits
        (pantry_id, item_name, category, count, reason, recorded_by)
      values
        (target_pantry, cur.name, cur.category, cur.count, 'correction', caller);

      delete from public.inventory where id = item;
      n_removed := n_removed + 1;

    else
      if new_count < cur.count then
        insert into public.stock_exits
          (pantry_id, item_name, category, count, reason, recorded_by)
        values
          (target_pantry, cur.name, cur.category, cur.count - new_count,
           'correction', caller);
      end if;

      update public.inventory set count = new_count where id = item;
      n_corrected := n_corrected + 1;
    end if;
  end loop;

  select count(*) into n_untouched
  from public.inventory
  where pantry_id = target_pantry
    and location_id = target_location
    and not (id = any(touched));

  select coalesce(sum(count), 0) into units_after
  from public.inventory
  where pantry_id = target_pantry and location_id = target_location;

  insert into public.shelf_audits
    (pantry_id, location_id, location_name, counted_by, photos,
     units_before, units_after, rows_corrected, rows_added, rows_removed,
     rows_unchanged, rows_skipped, rows_untouched)
  values
    (target_pantry, target_location, loc_name, caller, coalesce(photo_count, 0),
     units_before, units_after, n_corrected, n_added, n_removed,
     n_unchanged, n_skipped, n_untouched)
  returning id into audit_id;

  return jsonb_build_object(
    'audit_id', audit_id,
    'location_name', loc_name,
    'units_before', units_before,
    'units_after', units_after,
    'corrected', n_corrected,
    'added', n_added,
    'removed', n_removed,
    'unchanged', n_unchanged,
    'skipped', n_skipped,
    'untouched', n_untouched,
    'conflicts', conflicts
  );
end;
$$;

revoke execute on function public.apply_shelf_audit(uuid, uuid, integer, jsonb) from public;
grant execute on function public.apply_shelf_audit(uuid, uuid, integer, jsonb) to authenticated;

-- ------------------------------------------------------------- realtime

alter table public.shelf_audits replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shelf_audits'
     ) then
    execute 'alter publication supabase_realtime add table public.shelf_audits';
  end if;
end
$$;
