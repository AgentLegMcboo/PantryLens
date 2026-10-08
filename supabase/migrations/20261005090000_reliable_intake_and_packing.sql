-- Durable history, replay-safe intake, location-scoped audits and atomic packing.
create table public.intake_batches (
  id uuid primary key,
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  recorded_by uuid not null references auth.users(id),
  mode text not null check (mode in ('donation', 'shelf_audit', 'manual')),
  location_id uuid references public.locations(id) on delete set null,
  photos jsonb not null default '[]',
  detected_items jsonb not null default '[]',
  verified_at timestamptz not null default now(),
  captured_at timestamptz not null default now()
);
alter table public.intake_batches enable row level security;
create policy "Members can read pantry intake receipts" on public.intake_batches for select to authenticated
using (exists (select 1 from public.pantry_members m where m.pantry_id = intake_batches.pantry_id and m.user_id = auth.uid()));
create index intake_batches_pantry_date on public.intake_batches(pantry_id, verified_at desc);

create or replace function public.commit_intake(
  batch_id uuid, target_pantry uuid, intake_source text, target_location uuid,
  intake_items jsonb, intake_photos jsonb, captured_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.pantry_members where pantry_id = target_pantry and user_id = auth.uid()
  ) then raise exception 'You are not a member of this pantry' using errcode = '42501'; end if;
  -- Serialise changes to the same pantry, including concurrent shelf audits.
  perform pg_advisory_xact_lock(hashtextextended(target_pantry::text, 0));
  if exists (select 1 from public.intake_batches where id = batch_id and pantry_id = target_pantry and recorded_by = auth.uid()) then return; end if;
  if intake_source not in ('donation', 'shelf_audit', 'manual') then raise exception 'Invalid intake mode'; end if;
  if jsonb_typeof(intake_items) is distinct from 'array' or jsonb_array_length(intake_items) = 0 then raise exception 'No verified items'; end if;
  if intake_source = 'shelf_audit' then
    if not exists (select 1 from public.locations where id = target_location and pantry_id = target_pantry) then
      raise exception 'Choose a shelf in this pantry before auditing';
    end if;
    -- Reject an old offline audit rather than overwriting a newer completed one.
    if exists (select 1 from public.intake_batches s where s.pantry_id = target_pantry and s.location_id = target_location
      and s.mode = 'shelf_audit' and s.captured_at > commit_intake.captured_at) then
      raise exception 'A newer audit already replaced this shelf. Review the saved counts before retrying.';
    end if;
    if exists (select 1 from public.inventory i where i.pantry_id = target_pantry and i.location_id = target_location and i.created_at > commit_intake.captured_at) then
      raise exception 'This shelf received stock after the photo was captured. Recount it before replacing inventory.';
    end if;
    delete from public.inventory where pantry_id = target_pantry and location_id = target_location;
  end if;
  for r in select value from jsonb_array_elements(intake_items) loop
    if coalesce(length(trim(r->>'name')), 0) = 0 or coalesce((r->>'count')::integer, 0) < 1 then raise exception 'Invalid item name or count'; end if;
    if nullif(r->>'location_id','') is not null and not exists (select 1 from public.locations where id = (r->>'location_id')::uuid and pantry_id = target_pantry) then raise exception 'Location belongs to another pantry'; end if;
    if nullif(r->>'scan_id','') is not null and not exists (select 1 from public.scans where id = (r->>'scan_id')::uuid and pantry_id = target_pantry) then raise exception 'Scan belongs to another pantry'; end if;
    insert into public.inventory(id, pantry_id, name, category, count, expiration, date_added, source, confidence, condition, source_org, source_name, image_url, location_id, diet_tags, scan_id)
    values ((r->>'id')::uuid, target_pantry, trim(r->>'name'), r->>'category', (r->>'count')::integer,
      nullif(r->>'expiration','')::date, coalesce(nullif(r->>'date_added','')::date, current_date), intake_source,
      coalesce((r->>'confidence')::float, 1), coalesce(r->>'condition','ok'), r->>'source_org', r->>'source_name', r->>'image_url',
      case when intake_source = 'shelf_audit' then target_location else nullif(r->>'location_id','')::uuid end,
      array(select jsonb_array_elements_text(coalesce(r->'diet_tags', '[]'::jsonb))), nullif(r->>'scan_id','')::uuid);
  end loop;
  insert into public.intake_batches(id, pantry_id, recorded_by, mode, location_id, photos, detected_items, captured_at)
  values (batch_id, target_pantry, auth.uid(), intake_source, target_location, intake_photos, intake_items, captured_at);
  insert into public.activities(pantry_id, text, time, icon) values (target_pantry,
    case when intake_source = 'shelf_audit' then 'Replaced shelf counts: ' else 'Added verified donation: ' end || jsonb_array_length(intake_items) || ' products', now()::text, 'check-circle-outline');
end; $$;
revoke all on function public.commit_intake(uuid,uuid,text,uuid,jsonb,jsonb,timestamptz) from public;
grant execute on function public.commit_intake(uuid,uuid,text,uuid,jsonb,jsonb,timestamptz) to authenticated;

create table public.packing_events (
  id uuid primary key,
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  recorded_by uuid not null references auth.users(id),
  deductions jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.packing_events enable row level security;
create policy "Members can read packing events" on public.packing_events for select to authenticated
using (exists (select 1 from public.pantry_members m where m.pantry_id = packing_events.pantry_id and m.user_id = auth.uid()));
create or replace function public.pack_stock(target_pantry uuid, deductions jsonb, packing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; available integer; weight numeric; item_name text; item_category text;
begin
  if auth.uid() is null or not exists (select 1 from public.pantry_members where pantry_id = target_pantry and user_id = auth.uid()) then
    raise exception 'You are not a member of this pantry' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_pantry::text, 0));
  if exists(select 1 from public.packing_events where id = packing_id and pantry_id = target_pantry and recorded_by = auth.uid()) then return; end if;
  if jsonb_typeof(deductions) is distinct from 'array' or jsonb_array_length(deductions) = 0 then raise exception 'Nothing to pack'; end if;
  if exists(select 1 from jsonb_array_elements(deductions) d where coalesce((d->>'count')::integer, 0) <= 0 or d->>'id' is null) then raise exception 'Invalid packing quantity'; end if;
  -- Aggregate repeated ids and lock in stable order to avoid overdraw/deadlocks.
  for r in select (d->>'id')::uuid as id, sum((d->>'count')::integer)::integer as count
    from jsonb_array_elements(deductions) d group by (d->>'id')::uuid order by (d->>'id')::uuid loop
    select i.count, i.name, i.category into available, item_name, item_category from public.inventory i where i.id = r.id and i.pantry_id = target_pantry and i.condition = 'ok' and (i.expiration is null or i.expiration >= current_date) for update;
    if found then
      if available < r.count then raise exception 'Stock changed. Rebuild the packing checklist.'; end if;
      if available = r.count then delete from public.inventory where id = r.id;
      else update public.inventory set count = count - r.count where id = r.id; end if;
    else
      select est_units, weight_lbs, category into available, weight, item_category from public.bulk_lots where id = r.id and pantry_id = target_pantry and (expiration is null or expiration >= current_date) for update;
      item_name := 'Bulk ' || item_category || ' (estimated units)';
      if not found or available < r.count then raise exception 'Stock changed. Rebuild the packing checklist.'; end if;
      if available = r.count then delete from public.bulk_lots where id = r.id;
      else update public.bulk_lots set est_units = available - r.count, weight_lbs = round(weight * (available - r.count) / available, 2) where id = r.id; end if;
    end if;
    insert into public.stock_exits(pantry_id, item_name, category, count, reason, recorded_by)
    values(target_pantry, item_name, item_category, r.count, 'given_out', auth.uid());
  end loop;
  insert into public.packing_events(id, pantry_id, recorded_by, deductions) values(packing_id, target_pantry, auth.uid(), deductions);
  insert into public.activities(pantry_id, text, time, icon) values(target_pantry, 'Packed boxes: shelf counts updated', now()::text, 'package-variant-closed');
end; $$;
revoke all on function public.pack_stock(uuid,jsonb,uuid) from public;
grant execute on function public.pack_stock(uuid,jsonb,uuid) to authenticated;

-- Reset also clears durable receipts, so a fresh pantry has no stale history.
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

  -- Offline intake and legacy packing receipts are created by the next migration.
  if to_regclass('public.intake_batches') is not null then
    delete from public.intake_batches where pantry_id = target_pantry;
  end if;
  if to_regclass('public.packing_events') is not null then
    delete from public.packing_events where pantry_id = target_pantry;
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
