-- Who may change what, and a way to say so.
--
-- Until now a pantry had two roles, 'admin' and 'volunteer', and exactly one
-- thing checked them: the policy that lets a member UPDATE their pantry row.
-- Nothing could grant or revoke a role after sign-up, so whoever created the
-- pantry was its only admin forever and everyone else was stuck as a volunteer.
--
-- Worse, the check was invisible. Refusing an UPDATE under row-level security
-- is not an error — it matches zero rows and returns success. A volunteer could
-- open Settings, rename the pantry, raise a threshold, watch it change on
-- screen, and lose all of it on the next refresh with nothing ever saying no.
--
-- Three roles now:
--
--   owner      the pantry's account. Exactly one, enforced by an index. Only
--              the owner hands out roles, and only they can pass the pantry on.
--   admin      may change how the pantry is set up: its name, drop-off details,
--              low-stock levels, box types. May not touch anyone's role.
--   volunteer  the day-to-day job — scan, pack, hand out. Every write a
--              volunteer makes in normal use is theirs to make.
--
-- Role changes are not a policy on pantry_members; that table takes no direct
-- UPDATE from anyone. They go through the functions at the bottom, which is the
-- only place the rules about who may promote whom exist.

-- ---------------------------------------------------------------- the role column

alter table public.pantry_members drop constraint if exists pantry_members_role_check;
alter table public.pantry_members
  add constraint pantry_members_role_check
  check (role in ('owner', 'admin', 'volunteer'));

-- Every existing pantry needs an owner, and the fairest candidate is whoever
-- has been an admin longest — in practice the person who created it, since
-- create_pantry enrolled them on the spot. A pantry with no admin at all (only
-- reachable by hand) hands it to its oldest member instead.
with chosen as (
  select distinct on (pantry_id) pantry_id, user_id
  from public.pantry_members
  order by pantry_id, (role = 'admin') desc, joined_at asc, user_id asc
)
update public.pantry_members pm
set role = 'owner'
from chosen
where pm.pantry_id = chosen.pantry_id
  and pm.user_id = chosen.user_id
  and not exists (
    select 1 from public.pantry_members o
    where o.pantry_id = pm.pantry_id and o.role = 'owner'
  );

-- One owner per pantry, enforced rather than assumed: the functions below read
-- "the owner" as a single row, and a second one would make "is the caller the
-- owner?" answerable two ways.
create unique index if not exists pantry_members_one_owner_idx
  on public.pantry_members (pantry_id) where role = 'owner';

-- ---------------------------------------------------------------- helpers

-- SECURITY DEFINER for the same reason is_pantry_member is: these are called
-- from policies on pantry_members, and a policy that reads its own table
-- recurses.
create or replace function public.pantry_role(target_pantry uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.pantry_members
  where pantry_id = target_pantry and user_id = auth.uid();
$$;

comment on function public.pantry_role(uuid) is
  'The calling user''s role in this pantry, or null if they are not a member.';

-- "Admin" in the sense the app means it: may change how the pantry is set up.
-- The owner is always also an admin, so no check ever has to name both.
create or replace function public.is_pantry_admin(target_pantry uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pantry_members
    where pantry_id = target_pantry
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke execute on function public.pantry_role(uuid) from public;
revoke execute on function public.is_pantry_admin(uuid) from public;
grant execute on function public.pantry_role(uuid) to authenticated;
grant execute on function public.is_pantry_admin(uuid) to authenticated;

-- ---------------------------------------------------------------- pantries

-- Same rule as before, said in one place, plus the WITH CHECK the original was
-- missing: USING alone decides which rows may be updated, not what they may be
-- updated to.
drop policy if exists "Admins can update pantries" on public.pantries;
create policy "Admins can update pantries"
on public.pantries for update
using (public.is_pantry_admin(id))
with check (public.is_pantry_admin(id));

-- A member may not rewrite their pantry's identity or move it to another org's
-- invite code. Everything an admin legitimately edits is listed here; the
-- others (id, invite_code, created_at) are set once, by create_pantry.
revoke update on public.pantries from anon, authenticated;
grant update (name, settings, thresholds, box_rules, lbs_per_unit)
  on public.pantries to authenticated;

-- ---------------------------------------------------------------- pantry_members

-- No UPDATE policy, and none coming: role changes are the functions' job.
-- Revoking the privilege as well means even adding a policy by mistake later
-- cannot open a direct path.
revoke update on public.pantry_members from anon, authenticated;

-- Leaving is still every member's own choice, with one exception: the owner
-- leaving would strand the pantry with nobody able to hand out roles. They
-- transfer it first.
drop policy if exists "Users can leave a pantry" on public.pantry_members;
create policy "Users can leave a pantry"
on public.pantry_members for delete
using (user_id = auth.uid() and role <> 'owner');

-- Joining still only ever adds yourself, and now only ever as a volunteer.
-- Without the role clause, anyone could insert themselves as an owner of any
-- pantry whose id they knew — the insert check never looked at the role.
drop policy if exists "Users can join a pantry as themselves" on public.pantry_members;
create policy "Users can join a pantry as themselves"
on public.pantry_members for insert
with check (user_id = auth.uid() and role = 'volunteer');

-- ---------------------------------------------------------------- the roster

-- Members are rows of user ids, and a user id is not something anyone can put a
-- face to. The email is the only human-readable handle the app has, and it
-- lives in auth.users, which is not readable from the client at all.
--
-- So: a function that reads it for you, and only for people you already share a
-- pantry with. The alternative, a public profiles table, would publish the same
-- addresses to everyone with an account.
create or replace function public.list_pantry_members(target_pantry uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  return query
  select pm.user_id,
         coalesce(u.email, '')::text,
         pm.role,
         pm.joined_at
  from public.pantry_members pm
  left join auth.users u on u.id = pm.user_id
  where pm.pantry_id = target_pantry
  -- Owner first, then admins, then volunteers by how long they have been here.
  order by case pm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
           pm.joined_at asc;
end;
$$;

revoke execute on function public.list_pantry_members(uuid) from public;
grant execute on function public.list_pantry_members(uuid) to authenticated;

-- ---------------------------------------------------------------- role changes

-- Only the owner. An admin who could promote another admin could be undone by
-- them a moment later, and two admins demoting each other is not a situation
-- worth designing a tiebreak for. One account is answerable for who has access.
create or replace function public.set_member_role(
  target_pantry uuid,
  target_user uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if new_role not in ('admin', 'volunteer') then
    -- Ownership moves through transfer_pantry_ownership, which demotes the
    -- current owner in the same breath. Allowing it here would either make two
    -- owners or silently unseat someone.
    raise exception 'Role must be admin or volunteer' using errcode = '22023';
  end if;

  if public.pantry_role(target_pantry) is distinct from 'owner' then
    raise exception 'Only the pantry owner can change roles' using errcode = '42501';
  end if;

  if target_user = caller then
    raise exception 'You cannot change your own role. Transfer the pantry instead.'
      using errcode = '42501';
  end if;

  update public.pantry_members
  set role = new_role
  where pantry_id = target_pantry and user_id = target_user;

  if not found then
    raise exception 'That person is not in this pantry' using errcode = 'P0002';
  end if;
end;
$$;

-- Hands the pantry to someone else and steps down to admin in one transaction.
-- The old owner keeps their settings access; losing it silently would be a
-- surprise, and they can be demoted afterwards by the new owner.
create or replace function public.transfer_pantry_ownership(
  target_pantry uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if public.pantry_role(target_pantry) is distinct from 'owner' then
    raise exception 'Only the pantry owner can transfer the pantry' using errcode = '42501';
  end if;

  if target_user = caller then
    raise exception 'You already own this pantry' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pantry_members
    where pantry_id = target_pantry and user_id = target_user
  ) then
    raise exception 'That person is not in this pantry' using errcode = 'P0002';
  end if;

  -- Demote first. One-owner-per-pantry is a unique index, and a unique index is
  -- checked row by row as a statement writes, not at the end of it — so a single
  -- UPDATE setting both rows could trip over itself depending on the order the
  -- rows happen to be visited. Two statements in one transaction cannot.
  update public.pantry_members
  set role = 'admin'
  where pantry_id = target_pantry and user_id = caller;

  update public.pantry_members
  set role = 'owner'
  where pantry_id = target_pantry and user_id = target_user;
end;
$$;

-- Removing someone else. Leaving of your own accord is the DELETE policy above
-- and needs no function.
create or replace function public.remove_pantry_member(
  target_pantry uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if public.pantry_role(target_pantry) is distinct from 'owner' then
    raise exception 'Only the pantry owner can remove members' using errcode = '42501';
  end if;

  if target_user = caller then
    raise exception 'Transfer the pantry to someone else before you leave it.'
      using errcode = '42501';
  end if;

  delete from public.pantry_members
  where pantry_id = target_pantry and user_id = target_user;

  if not found then
    raise exception 'That person is not in this pantry' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text) from public;
revoke execute on function public.transfer_pantry_ownership(uuid, uuid) from public;
revoke execute on function public.remove_pantry_member(uuid, uuid) from public;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_pantry_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_pantry_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- creating

-- Whoever starts a pantry owns it. Previously 'admin', which was the top of the
-- old two-role ladder and is now the middle of the new one.
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

  loop
    new_code := 'PANTRY-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.pantries p where p.invite_code = new_code);
  end loop;

  insert into public.pantries (name, invite_code)
  values (trim(pantry_name), new_code)
  returning pantries.id into new_id;

  insert into public.pantry_members (pantry_id, user_id, role)
  values (new_id, caller, 'owner');

  return query select new_id, new_code;
end;
$$;

revoke execute on function public.create_pantry(text) from public;
grant execute on function public.create_pantry(text) to authenticated;

-- ---------------------------------------------------------------- realtime

-- A demoted volunteer should not have to relaunch to stop seeing controls they
-- can no longer use, and the app already refetches on any change it hears about
-- in this pantry.
alter table public.pantry_members replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_members'
     ) then
    execute 'alter publication supabase_realtime add table public.pantry_members';
  end if;
end
$$;
