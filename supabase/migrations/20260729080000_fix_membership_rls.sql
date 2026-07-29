-- Unblocks the path a user lands on immediately after signing in (Google or
-- email): pantry-selection, where they create or join a pantry.
--
-- Two hard blockers in the initial schema:
--
--  1. The pantry_members SELECT policy queried pantry_members, which Postgres
--     rejects as "infinite recursion detected in policy for relation
--     pantry_members". That broke the very first query after sign-in.
--
--  2. RLS is enabled on pantries and pantry_members, but neither table had a
--     policy covering INSERT. With RLS on, no policy means no rows — so both
--     "Create a pantry" and "Join with invite code" were denied.

-- ---------------------------------------------------------------- helper

-- SECURITY DEFINER so the lookup runs outside RLS and cannot recurse back into
-- the policies that call it.
create or replace function public.is_pantry_member(target_pantry uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pantry_members
    where pantry_id = target_pantry and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_pantry_member(uuid) from public;
grant execute on function public.is_pantry_member(uuid) to authenticated;

-- ---------------------------------------------------------------- pantry_members

drop policy if exists "Users can view members of their pantries" on public.pantry_members;
create policy "Users can view members of their pantries"
on public.pantry_members for select
using (public.is_pantry_member(pantry_id));

-- A user may only ever add THEMSELVES to a pantry. Without this, creating or
-- joining a pantry fails; with a looser rule, anyone could add other people.
drop policy if exists "Users can join a pantry as themselves" on public.pantry_members;
create policy "Users can join a pantry as themselves"
on public.pantry_members for insert
with check (user_id = auth.uid());

drop policy if exists "Users can leave a pantry" on public.pantry_members;
create policy "Users can leave a pantry"
on public.pantry_members for delete
using (user_id = auth.uid());

-- ---------------------------------------------------------------- pantries

-- Any signed-in user may start a pantry. They become its admin via the
-- pantry_members insert that follows in the same flow.
drop policy if exists "Signed-in users can create a pantry" on public.pantries;
create policy "Signed-in users can create a pantry"
on public.pantries for insert
with check (auth.uid() is not null);

-- Rewritten to use the helper so it no longer joins through pantry_members
-- inside a policy.
drop policy if exists "Users can view pantries they belong to" on public.pantries;
create policy "Users can view pantries they belong to"
on public.pantries for select
using (public.is_pantry_member(id));

drop policy if exists "Admins can update pantries" on public.pantries;
create policy "Admins can update pantries"
on public.pantries for update
using (
  exists (
    select 1 from public.pantry_members pm
    where pm.pantry_id = pantries.id
      and pm.user_id = auth.uid()
      and pm.role = 'admin'
  )
);

-- NOTE: the "Users can view pantries by invite code" policy from the initial
-- migration is USING (true) — every signed-in user can list every pantry in the
-- database, not just the one whose code they hold. It is left in place here
-- because the join flow depends on it; removing it without a replacement breaks
-- joining. The proper fix is a SECURITY DEFINER join_pantry(code) function that
-- does the lookup and the insert server-side, after which this policy can be
-- dropped. Tracked, not done in this migration.
