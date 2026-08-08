-- Two things the app was doing in memory only, plus the RLS hole the previous
-- migration flagged and deferred.
--
--  1. SETTINGS. The pantry name, expiration warning window and default family
--     size lived in Zustand alone. Settings said "Saved!" and nothing left the
--     device — every volunteer saw different numbers and a relaunch reset them.
--
--  2. JOINING. "Users can view pantries by invite code" was USING (true), so any
--     signed-in user could list every pantry in the database. It existed only so
--     the join flow could look a code up. A SECURITY DEFINER function does that
--     lookup server-side, which lets the blanket policy go.

-- ---------------------------------------------------------------- settings

-- One JSONB column rather than a column per preference: these are pantry-wide
-- display choices that will keep accruing, and the app already merges over
-- defaults so an older row missing a key still works.
alter table public.pantries
  add column if not exists settings jsonb not null default
  '{"expiration_warning_days": 30, "default_family_size": 4}'::jsonb;

comment on column public.pantries.settings is
  'Pantry-wide display preferences. Merged over app defaults on read, so a key added later needs no backfill.';

-- ---------------------------------------------------------------- joining

-- Looks the code up and enrols the caller in one server-side step. SECURITY
-- DEFINER so the lookup sees every pantry while the caller still sees none —
-- which is exactly why the USING (true) policy can now be dropped.
--
-- Returns the pantry id on success. Raises on a bad code so the client gets a
-- message rather than a silent null.
create or replace function public.join_pantry_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Codes are generated uppercase; compare case-insensitively so a volunteer
  -- typing lowercase still gets in.
  select id into target_id
  from public.pantries
  where upper(invite_code) = upper(trim(code));

  if target_id is null then
    raise exception 'No pantry found with that invite code' using errcode = 'P0002';
  end if;

  -- Already a member is success, not an error — they are trying to get in and
  -- they are in.
  insert into public.pantry_members (pantry_id, user_id, role)
  values (target_id, caller, 'volunteer')
  on conflict (pantry_id, user_id) do nothing;

  return target_id;
end;
$$;

revoke execute on function public.join_pantry_by_code(text) from public;
grant execute on function public.join_pantry_by_code(text) to authenticated;

-- Creating a pantry has the same problem in reverse: the insert is allowed, but
-- the caller cannot read back a row they are not yet a member of, and they must
-- become a member to read it. Doing both here closes that gap and hands back the
-- generated code in one round trip.
-- OUT columns are deliberately NOT named `id` / `invite_code`: plpgsql resolves
-- those against the pantries columns inside the function body and the insert
-- becomes ambiguous.
create or replace function public.create_pantry(pantry_name text)
returns table (pantry_id uuid, pantry_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  new_code text;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if coalesce(trim(pantry_name), '') = '' then
    raise exception 'Pantry name is required' using errcode = '22023';
  end if;

  -- Retry on the astronomically unlikely collision rather than failing the user.
  loop
    new_code := 'PANTRY-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.pantries p where p.invite_code = new_code);
  end loop;

  insert into public.pantries (name, invite_code)
  values (trim(pantry_name), new_code)
  returning pantries.id into new_id;

  insert into public.pantry_members (pantry_id, user_id, role)
  values (new_id, caller, 'admin');

  return query select new_id, new_code;
end;
$$;

revoke execute on function public.create_pantry(text) from public;
grant execute on function public.create_pantry(text) to authenticated;

-- Now that neither flow needs to read pantries it does not belong to, the
-- blanket read policy goes. "Users can view pantries they belong to" from
-- 20260729080000 remains and is the only SELECT path.
drop policy if exists "Users can view pantries by invite code" on public.pantries;

-- With the RPC handling enrolment, direct inserts are no longer needed for the
-- create flow either — but leaving the policy in place keeps the RPC's own
-- insert working under the caller's rights if it is ever changed to INVOKER.
