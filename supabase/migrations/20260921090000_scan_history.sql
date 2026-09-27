-- What the model said, kept.
--
-- A scan produces two things: what the AI proposed, and what the volunteer
-- accepted. Until now the app saved the second and threw away the first. The
-- consequences were larger than a missing table:
--
--  * The PRD's headline metric — "post-verification accuracy ≥ 95%" — is a
--    comparison between the proposal and the truth, and the proposal was
--    deleted at the moment of saving. The number could be asserted and never
--    computed. For a project whose central claim is AI recognition, that is the
--    one statistic worth being able to prove.
--  * "It got the shelf wrong yesterday" was unreproducible. No photo, no
--    detection, nothing to look at.
--  * An inventory row said `source: 'donation'` and could say nothing more
--    about where it came from.
--  * Corrections are the training signal, and only NAME corrections survived,
--    in product_aliases. Wrong counts, missed items and phantom detections left
--    no trace at all.
--
-- Three tables' worth of shape, in two tables and a foreign key:
--
--   scans        one row per press of the shutter, including the ones nobody
--                ever saved — a scan so wrong the volunteer gave up is itself a
--                measurement, and only a row written BEFORE review can record
--                it.
--   scan_items   one row per candidate the model proposed, holding both what it
--                said and what the human did about it.
--   inventory.scan_id  where this row came from.

-- ------------------------------------------------------------- scans

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  scanned_by uuid references auth.users(id) on delete set null,

  -- Matches inventory.source, so a saved row and the scan that produced it
  -- describe themselves the same way.
  mode text not null check (mode in ('donation', 'shelf_audit', 'manual')),

  started_at timestamptz not null default now(),
  -- Null means nobody ever finished reviewing it. Not a failure to clean up:
  -- the abandonment rate is a real measure of how well the model is doing.
  verified_at timestamptz,

  -- photos_read < photos_sent means part of what was photographed never
  -- reached the model, which is the difference between "the AI missed it" and
  -- "the AI never saw it" — a distinction accuracy figures live or die on.
  photos_sent integer not null default 0,
  photos_read integer not null default 0,
  /** Object paths in the scan-photos bucket. Emptied when photos are pruned. */
  photo_paths text[] not null default '{}',
  photos_pruned_at timestamptz,

  items_detected integer not null default 0,
  items_saved integer not null default 0,
  units_saved integer not null default 0,

  /** Round trip for the vision call, so "it takes about a minute" becomes data. */
  duration_ms integer,
  model text,
  error text
);

create index if not exists scans_pantry_time_idx
  on public.scans (pantry_id, started_at desc);

-- ------------------------------------------------------------- candidates

create table if not exists public.scan_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  -- Denormalised so row-level security on this table needs no join, and so a
  -- pantry's data all carries its own pantry_id.
  pantry_id uuid not null references public.pantries(id) on delete cascade,

  -- -------- what the model proposed, before a human touched it
  /** The model's own words, before the catalogue snapped them to anything. */
  raw_name text not null,
  detected_name text not null,
  detected_category text not null,
  detected_count integer not null,
  detected_expiration date,
  confidence real,
  /** 'barcode' or 'catalogue' when something better than the model named it. */
  resolved_by text,
  barcode text,
  /** Which photo it was found in, and the box drawn on it — enough to replay the crop. */
  image_index integer,
  box jsonb,

  -- -------- what the human did about it
  --
  -- 'pending' until the review is finished. Anything still pending when the
  -- volunteer saves was deleted by them, and finish_scan turns it into
  -- 'rejected' — silence during a review IS the verdict.
  verdict text not null default 'pending'
    check (verdict in ('pending', 'accepted', 'edited', 'rejected')),
  final_name text,
  final_category text,
  final_count integer,
  final_expiration date,

  /** The inventory row it became. Null if rejected, or if that row has since left. */
  item_id uuid references public.inventory(id) on delete set null
);

create index if not exists scan_items_scan_idx on public.scan_items (scan_id);
create index if not exists scan_items_pantry_idx on public.scan_items (pantry_id, verdict);

-- ------------------------------------------------------------- provenance

-- The foreign key that makes the whole thing worth having: from a tin on the
-- shelf back to the photograph it was found in.
--
-- SET NULL rather than CASCADE, emphatically. Pruning scan history must never
-- delete inventory — the food is real whether or not we still remember
-- photographing it.
alter table public.inventory
  add column if not exists scan_id uuid references public.scans(id) on delete set null;

create index if not exists inventory_scan_idx on public.inventory (scan_id);

comment on column public.inventory.scan_id is
  'The scan this row came from. Null for rows typed in by hand or created before scan history existed.';

-- ------------------------------------------------------------- access

alter table public.scans enable row level security;
alter table public.scan_items enable row level security;

drop policy if exists "Members can read their pantry's scans" on public.scans;
create policy "Members can read their pantry's scans"
on public.scans for select
using (public.is_pantry_member(pantry_id));

drop policy if exists "Members can read their pantry's scan items" on public.scan_items;
create policy "Members can read their pantry's scan items"
on public.scan_items for select
using (public.is_pantry_member(pantry_id));

-- Written only by the two functions below. A hand-written scan row would be a
-- claim about a measurement that never happened, and these rows exist to be
-- evidence.
revoke insert, update, delete on public.scans from anon, authenticated;
revoke insert, update, delete on public.scan_items from anon, authenticated;
grant select on public.scans, public.scan_items to authenticated;

-- Deliberately NOT locking inventory down to a column list to protect scan_id.
-- The app edits inventory through a Partial<InventoryItem>, so any column left
-- off such a list turns into a runtime "permission denied" the next time
-- somebody touches a field nobody thought about. A member rewriting their own
-- pantry's provenance is a tidiness problem, not a security one, and it is not
-- worth trading a working save path for.

-- ------------------------------------------------------------- photos

-- PRIVATE, unlike item-photos.
--
-- Item photos are 44px crops of a tin, rendered forty at a time, so a public
-- bucket saves minting forty signed URLs per screen. These are whole-room
-- photographs that may well have people in them, they are diagnostic data
-- rather than interface, and they are looked at rarely and one at a time. The
-- trade that made item-photos public does not apply here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-photos', 'scan-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png'];

-- Objects live at {pantry_id}/{scan_id}/{n}.jpg, so the first path segment is
-- the authorisation check — the same shape item-photos uses.
drop policy if exists "Members can read scan photos from their pantry" on storage.objects;
create policy "Members can read scan photos from their pantry"
on storage.objects for select
to authenticated
using (
  bucket_id = 'scan-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);

drop policy if exists "Members can upload scan photos to their pantry" on storage.objects;
create policy "Members can upload scan photos to their pantry"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'scan-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);

drop policy if exists "Members can delete scan photos in their pantry" on storage.objects;
create policy "Members can delete scan photos in their pantry"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'scan-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);

-- ------------------------------------------------------------- recording

/**
 * Opens a scan, with everything the model proposed.
 *
 * Called as soon as the vision pass returns and BEFORE the volunteer reviews
 * anything, which is the only way an abandoned scan gets recorded. Returns the
 * scan id and the candidate ids in the order they were sent, so the review
 * screen can carry each row's id and report back what happened to it.
 */
create or replace function public.start_scan(
  target_pantry uuid,
  scan_mode text,
  photos_sent integer,
  photos_read integer,
  duration_ms integer,
  model text,
  candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_scan uuid;
  candidate jsonb;
  item_ids uuid[] := '{}';
  new_item uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  insert into public.scans
    (pantry_id, scanned_by, mode, photos_sent, photos_read, duration_ms, model,
     items_detected)
  values
    (target_pantry, caller, coalesce(scan_mode, 'donation'),
     coalesce(photos_sent, 0), coalesce(photos_read, 0), duration_ms, model,
     coalesce(jsonb_array_length(candidates), 0))
  returning id into new_scan;

  for candidate in select * from jsonb_array_elements(coalesce(candidates, '[]'::jsonb))
  loop
    insert into public.scan_items
      (scan_id, pantry_id, raw_name, detected_name, detected_category,
       detected_count, detected_expiration, confidence, resolved_by, barcode,
       image_index, box)
    values
      (new_scan, target_pantry,
       coalesce(nullif(candidate->>'raw_name', ''), candidate->>'name', ''),
       coalesce(candidate->>'name', ''),
       coalesce(nullif(candidate->>'category', ''), 'unknown'),
       coalesce((candidate->>'count')::integer, 0),
       nullif(candidate->>'expiration', '')::date,
       nullif(candidate->>'confidence', '')::real,
       nullif(candidate->>'resolved_by', ''),
       nullif(candidate->>'barcode', ''),
       nullif(candidate->>'image_index', '')::integer,
       candidate->'box')
    returning id into new_item;

    item_ids := item_ids || new_item;
  end loop;

  return jsonb_build_object('scan_id', new_scan, 'item_ids', to_jsonb(item_ids));
end;
$$;

/**
 * Closes a scan with what the volunteer actually did.
 *
 * `results` is one entry per candidate the review screen still had:
 *
 *   { "id": uuid, "verdict": "accepted"|"edited", "item_id": uuid|null,
 *     "name": text, "category": text, "count": int, "expiration": date|null }
 *
 * Anything NOT named is left as it was, and every candidate still pending
 * becomes 'rejected'. That is deliberate: a row the volunteer deleted during
 * review reports nothing, and "the model proposed this and a human threw it
 * away" is exactly the fact worth keeping.
 */
create or replace function public.finish_scan(
  target_scan uuid,
  results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  owner_pantry uuid;
  result jsonb;
  n_accepted integer := 0;
  n_edited integer := 0;
  n_rejected integer := 0;
  saved_units integer := 0;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select pantry_id into owner_pantry from public.scans where id = target_scan;
  if owner_pantry is null then
    raise exception 'No such scan' using errcode = 'P0002';
  end if;
  if not public.is_pantry_member(owner_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  for result in select * from jsonb_array_elements(coalesce(results, '[]'::jsonb))
  loop
    update public.scan_items
    set verdict = case when result->>'verdict' = 'edited' then 'edited' else 'accepted' end,
        final_name = result->>'name',
        final_category = result->>'category',
        final_count = nullif(result->>'count', '')::integer,
        final_expiration = nullif(result->>'expiration', '')::date,
        item_id = nullif(result->>'item_id', '')::uuid
    where id = nullif(result->>'id', '')::uuid
      and scan_id = target_scan;
  end loop;

  -- Silence is the verdict.
  update public.scan_items
  set verdict = 'rejected'
  where scan_id = target_scan and verdict = 'pending';

  select
    count(*) filter (where verdict = 'accepted'),
    count(*) filter (where verdict = 'edited'),
    count(*) filter (where verdict = 'rejected'),
    coalesce(sum(final_count) filter (where verdict in ('accepted', 'edited')), 0)
  into n_accepted, n_edited, n_rejected, saved_units
  from public.scan_items
  where scan_id = target_scan;

  update public.scans
  set verified_at = now(),
      items_saved = n_accepted + n_edited,
      units_saved = saved_units
  where id = target_scan;

  return jsonb_build_object(
    'accepted', n_accepted, 'edited', n_edited, 'rejected', n_rejected,
    'units_saved', saved_units);
end;
$$;

/**
 * Records where the scan's photos ended up.
 *
 * Separate from start_scan because the upload runs in the background, long
 * after the volunteer has moved on to reviewing. A function rather than an
 * update, because members have no write access to the scans table at all —
 * every row in it has to be written by something that knows it is true.
 */
create or replace function public.attach_scan_photos(
  target_scan uuid,
  paths text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_pantry uuid;
begin
  select pantry_id into owner_pantry from public.scans where id = target_scan;
  if owner_pantry is null then
    raise exception 'No such scan' using errcode = 'P0002';
  end if;
  if not public.is_pantry_member(owner_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  -- Never on a scan whose photos have already been pruned: a late upload must
  -- not resurrect paths that retention has deliberately let go.
  update public.scans
  set photo_paths = coalesce(paths, '{}')
  where id = target_scan and photos_pruned_at is null;
end;
$$;

revoke execute on function public.start_scan(uuid, text, integer, integer, integer, text, jsonb) from public;
revoke execute on function public.finish_scan(uuid, jsonb) from public;
grant execute on function public.start_scan(uuid, text, integer, integer, integer, text, jsonb) to authenticated;
revoke execute on function public.attach_scan_photos(uuid, text[]) from public;
grant execute on function public.attach_scan_photos(uuid, text[]) to authenticated;
grant execute on function public.finish_scan(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------- the payoff

/**
 * The PRD's success metric, as a query rather than a claim.
 *
 * "Post-verification accuracy" is the share of proposed items a human kept
 * without changing. Counted per scan so a bad batch is visible rather than
 * averaged away, and only over finished reviews — an abandoned scan has no
 * verdicts to measure.
 */
create or replace view public.scan_accuracy as
select
  s.id as scan_id,
  s.pantry_id,
  s.mode,
  s.started_at,
  s.photos_sent,
  s.photos_read,
  s.duration_ms,
  s.items_detected,
  count(i.*) filter (where i.verdict = 'accepted') as accepted,
  count(i.*) filter (where i.verdict = 'edited') as edited,
  count(i.*) filter (where i.verdict = 'rejected') as rejected,
  -- Items kept exactly as proposed, over items proposed. Null rather than zero
  -- when a scan found nothing, so empty scans do not drag an average down.
  round(
    100.0 * count(i.*) filter (where i.verdict = 'accepted')
    / nullif(count(i.*), 0), 1
  ) as accuracy_pct,
  -- A softer measure: how often the item was real, whatever the details.
  round(
    100.0 * count(i.*) filter (where i.verdict in ('accepted', 'edited'))
    / nullif(count(i.*), 0), 1
  ) as kept_pct
from public.scans s
left join public.scan_items i on i.scan_id = s.id
where s.verified_at is not null
group by s.id;

-- A view runs as its caller, so the policies on scans and scan_items are what
-- decide which rows come back. No pantry can read another's figures.
alter view public.scan_accuracy set (security_invoker = on);
grant select on public.scan_accuracy to authenticated;

-- ------------------------------------------------------------- retention

/**
 * Photographs are the only part of this with a real storage cost, and the only
 * part with a privacy cost: they are pictures of a room that volunteers and
 * sometimes neighbours walk through.
 *
 * The measurements are small and worth keeping indefinitely. The photos are
 * not. This marks scans older than `keep` as pruned and hands back the object
 * paths, which the caller deletes from the bucket — storage objects cannot be
 * removed from inside a Postgres function.
 */
create or replace function public.prune_scan_photos(
  target_pantry uuid,
  keep interval default interval '90 days'
)
returns table (path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_pantry_admin(target_pantry) then
    raise exception 'Only a pantry manager can prune scan photos' using errcode = '42501';
  end if;

  -- The paths are read in a CTE BEFORE the update, not out of its RETURNING.
  -- UPDATE ... RETURNING hands back the new row, which here is the row whose
  -- paths have just been emptied — so the version that looked obvious returned
  -- an array of nothing and quietly left every photo in the bucket for ever.
  return query
  with doomed as (
    select id, photo_paths
    from public.scans
    where pantry_id = target_pantry
      and photos_pruned_at is null
      and started_at < now() - keep
      and array_length(photo_paths, 1) > 0
    for update
  ),
  pruned as (
    update public.scans s
    set photo_paths = '{}', photos_pruned_at = now()
    from doomed
    where s.id = doomed.id
    returning s.id
  )
  select unnest(d.photo_paths) from doomed d
  -- Forces the update to run: without referencing it, the CTE is never executed.
  where (select count(*) from pruned) >= 0;
end;
$$;

revoke execute on function public.prune_scan_photos(uuid, interval) from public;
grant execute on function public.prune_scan_photos(uuid, interval) to authenticated;

-- ------------------------------------------------------------- realtime

alter table public.scans replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scans'
     ) then
    execute 'alter publication supabase_realtime add table public.scans';
  end if;
end
$$;
