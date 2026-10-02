-- Starting over.
--
-- Built for development — testing intake, counting, packing and onboarding needs
-- a way back to a clean shelf, and doing it by hand across eight tables is both
-- tedious and easy to get half-right. But it is written as a real feature rather
-- than a debug hack, because a pantry that has spent a fortnight entering test
-- data before going live wants exactly this, and because a function that exists
-- in the database is reachable from the API whether or not a button points at it.
-- The UI is hidden behind __DEV__; the SECURITY BOUNDARY IS HERE, and it is
-- owner-only.
--
-- Two separate things, because they are different intentions:
--
--   reset_pantry_data   empties the shelf and the history, keeps the pantry,
--                       its team, its settings, its shelves and its box types.
--                       "We finished testing, now start recording for real."
--   delete_pantry       removes the pantry entirely. Everybody is unenrolled by
--                       cascade and whoever ran it lands back on pantry
--                       selection. "Throw this one away."
--
-- Neither can touch storage. Photographs live in buckets, which SQL cannot
-- reach, so both return the path prefix for the caller to clear.

-- ------------------------------------------------------------- a PG18 landmine
--
-- Found by writing the delete below, which could not run at all: Postgres
-- refused with
--
--   cannot delete from table "pack_runs"
--   DETAIL: Replica identity must not contain unpublished generated columns.
--
-- pack_runs is the one table in this schema that has BOTH `replica identity
-- full` and a stored generated column (`ready`, from the pickup migration).
-- Postgres 18 forbids UPDATE and DELETE on that combination unless the
-- publication publishes generated columns.
--
-- Supabase is on 17, where it is allowed — a no-op UPDATE against the live
-- database confirms it — so nothing is broken today. But this is not only about
-- the delete below: collect_boxes UPDATES pack_runs on every box pickup, and
-- members may update `label` and `folder_id`. The day this project is upgraded
-- to 18, box pickup stops working, and the error would arrive with no recent
-- change to blame it on.
--
-- FULL was only ever set so realtime DELETE events carried the old row. Nothing
-- reads those: the subscription refetches the pantry on any change, whatever the
-- payload. So the primary key is enough, and that is what `default` means.
alter table public.pack_runs replica identity default;

-- ------------------------------------------------------------- clear the data

/**
 * Empties a pantry's operational data, leaving its setup alone.
 *
 * DELIBERATELY NOT DELETED: locations, box types, box folders, thresholds,
 * drop-off details, members, roles. Those are how the pantry is configured, and
 * somebody clearing test stock almost never means "and forget which shelves I
 * have". A reset that made you rebuild your shelf list would not get used.
 *
 * Order matters. scans goes first so scan_items cascades with it rather than
 * leaving rows pointing at inventory that is about to vanish, and inventory last
 * because several tables reference it with ON DELETE SET NULL.
 */
create or replace function public.reset_pantry_data(target_pantry uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  counts jsonb := '{}'::jsonb;
  n integer;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Owner only. Emptying a pantry's entire history is not a volunteer's call,
  -- and not a manager's either.
  if public.pantry_role(target_pantry) is distinct from 'owner' then
    raise exception 'Only the pantry owner can clear a pantry' using errcode = '42501';
  end if;

  delete from public.scans where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('scans', n);

  delete from public.shelf_audits where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('audits', n);

  delete from public.stock_exits where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('exits', n);

  delete from public.pack_runs where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('packs', n);

  delete from public.bulk_lots where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('lots', n);

  delete from public.inventory where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('items', n);

  delete from public.activities where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('activities', n);

  -- What this pantry taught the catalogue about product names. Goes too: it was
  -- learned from the test data being thrown away, and keeping it would have the
  -- app confidently renaming real scans based on rows that no longer exist.
  delete from public.product_aliases where pantry_id = target_pantry;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('learned_names', n);

  insert into public.activities (pantry_id, text, time, icon)
  values (target_pantry, 'Pantry data cleared', now()::text, 'broom');

  return counts || jsonb_build_object(
    'photo_prefix', target_pantry::text,
    'kept', 'shelves, box types, folders, team, settings'
  );
end;
$$;

-- ------------------------------------------------------------- remove it entirely

/**
 * Deletes the pantry. Everything else goes with it by cascade.
 *
 * Owner-only, and the owner is by definition the last person who can do this:
 * every other member is unenrolled as a side effect, which is why it is not a
 * manager's button.
 *
 * Returns the path prefix of the pantry's photographs so the caller can clear
 * the buckets. The database cannot, and once the pantry row is gone nothing
 * remembers that those objects belonged to it — so they would sit there for ever.
 */
create or replace function public.delete_pantry(target_pantry uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  name_was text;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Existence before ownership, deliberately. Checking the role first means a
  -- second tap during the round trip — the pantry already gone, the membership
  -- gone with it — reports "only the owner can delete a pantry" about a pantry
  -- that no longer exists, which sends whoever reads the log looking for a
  -- permissions problem that was never there.
  --
  -- The cost is telling an authenticated caller whether a given uuid exists.
  -- That is worth it for an honest message: they had to know the uuid to ask,
  -- and join_pantry_by_code already answers a stronger version of the same
  -- question.
  select name into name_was from public.pantries where id = target_pantry;
  if name_was is null then
    raise exception 'No such pantry' using errcode = 'P0002';
  end if;

  if public.pantry_role(target_pantry) is distinct from 'owner' then
    raise exception 'Only the pantry owner can delete a pantry' using errcode = '42501';
  end if;

  delete from public.pantries where id = target_pantry;

  return jsonb_build_object('deleted', name_was, 'photo_prefix', target_pantry::text);
end;
$$;

revoke execute on function public.reset_pantry_data(uuid) from public;
revoke execute on function public.delete_pantry(uuid) from public;
grant execute on function public.reset_pantry_data(uuid) to authenticated;
grant execute on function public.delete_pantry(uuid) to authenticated;
