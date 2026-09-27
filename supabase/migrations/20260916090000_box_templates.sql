-- Named, reusable boxes.
--
-- What went in a box used to be ONE set of numbers on the pantry row. A pantry
-- that also hands out senior boxes, baby boxes or snack packs had to overwrite
-- that set every time it switched, and put it back afterwards. There was
-- nothing to choose between, and nothing to reuse.
--
-- The single set also sat behind an admin-only policy on `pantries`, so a
-- volunteer who adjusted it saw the change on screen while the database quietly
-- refused it. It reverted on the next refresh with no error. Templates live in
-- their own table with member policies, so what you see saved is saved.
--
-- One template per pantry is the default. It is what Needs and the dashboard
-- measure against, and what Build opens on.

create table if not exists public.box_templates (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- {grain: 2, vegetable: 2, ...}: items per box. The app fills any missing
  -- category with 0, so a template written before a category existed still reads.
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  -- On: the amounts are for a family of four and grow or shrink with the
  -- household. Off: every household gets exactly these, which is right for a
  -- per-child snack pack or a hygiene kit.
  scales_with_family boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One "Senior box" per pantry, however it was capitalised.
create unique index if not exists box_templates_pantry_name_idx
  on public.box_templates (pantry_id, lower(name));

-- Exactly one default is enforced by set_default_box_template, and this index
-- makes two defaults impossible even if something else tries.
create unique index if not exists box_templates_one_default_idx
  on public.box_templates (pantry_id) where is_default;

-- ------------------------------------------------------------- every pantry has a default

/**
 * Gives a new pantry a starting box, copied from its box_rules.
 *
 * A trigger rather than a change to create_pantry, so every way a pantry row
 * can come into existence is covered, and nothing about joining or creating a
 * pantry changes.
 */
create or replace function public.seed_default_box_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.box_templates (pantry_id, name, rules, scales_with_family, is_default)
  values (
    new.id,
    'Standard family box',
    coalesce(
      new.box_rules,
      '{"grain": 2, "vegetable": 2, "protein": 2, "breakfast": 1, "snack": 1, "hygiene": 1, "baby": 0}'::jsonb
    ),
    true,
    true
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists pantries_seed_box_template on public.pantries;
create trigger pantries_seed_box_template
after insert on public.pantries
for each row execute function public.seed_default_box_template();

-- Existing pantries: their current box_rules become their default template, so
-- nobody's numbers change on upgrade. Skipped for any pantry that already has
-- templates, so running this twice is harmless.
insert into public.box_templates (pantry_id, name, rules, scales_with_family, is_default)
select
  p.id,
  'Standard family box',
  coalesce(
    p.box_rules,
    '{"grain": 2, "vegetable": 2, "protein": 2, "breakfast": 1, "snack": 1, "hygiene": 1, "baby": 0}'::jsonb
  ),
  true,
  true
from public.pantries as p
where not exists (select 1 from public.box_templates as t where t.pantry_id = p.id);

-- ------------------------------------------------------------- changing the default

/**
 * Makes one template the pantry default, in a single transaction.
 *
 * Done on the server because it is two writes (clear the old default, set the
 * new one), and two separate client updates could leave a pantry with no
 * default at all, or bump into the one-default index halfway through.
 */
create or replace function public.set_default_box_template(template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pantry uuid;
begin
  select pantry_id into target_pantry from public.box_templates where id = template_id;

  if target_pantry is null then
    raise exception 'No such box' using errcode = 'P0002';
  end if;
  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  update public.box_templates
  set is_default = false
  where pantry_id = target_pantry and is_default and id <> template_id;

  update public.box_templates
  set is_default = true, updated_at = now()
  where id = template_id;
end;
$$;

revoke execute on function public.set_default_box_template(uuid) from public, anon;
grant execute on function public.set_default_box_template(uuid) to authenticated;

-- ------------------------------------------------------------- access

alter table public.box_templates enable row level security;

drop policy if exists "Members can read box templates" on public.box_templates;
create policy "Members can read box templates"
on public.box_templates for select
using (public.is_pantry_member(pantry_id));

-- A new template can never arrive already marked default. That only ever
-- happens through set_default_box_template, which clears the old one first.
drop policy if exists "Members can create box templates" on public.box_templates;
create policy "Members can create box templates"
on public.box_templates for insert
with check (public.is_pantry_member(pantry_id) and not is_default);

drop policy if exists "Members can edit box templates" on public.box_templates;
create policy "Members can edit box templates"
on public.box_templates for update
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));

-- The default can't be deleted, or the pantry would have nothing to measure
-- Needs against. Deleting a PANTRY still removes all its templates: the cascade
-- runs beneath row-level security.
drop policy if exists "Members can delete box templates except the default" on public.box_templates;
create policy "Members can delete box templates except the default"
on public.box_templates for delete
using (public.is_pantry_member(pantry_id) and not is_default);

-- Updates are limited to the editable columns. A row policy can't compare old
-- and new values, so without this a member could flip is_default directly
-- (skipping the function above), or move a template into another pantry.
revoke update on public.box_templates from anon, authenticated;
grant select, insert, delete on public.box_templates to authenticated;
grant update (name, rules, scales_with_family, updated_at) on public.box_templates to authenticated;

-- ------------------------------------------------------------- realtime

-- Same treatment as the other synced tables, so a box saved on one phone shows
-- up on another, deletes included. See 20260905090000_realtime_deletes.sql.
alter table public.box_templates replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'box_templates'
     ) then
    execute 'alter publication supabase_realtime add table public.box_templates';
  end if;
end
$$;
