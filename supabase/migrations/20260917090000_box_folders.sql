-- Names and folders for boxes, of both kinds.
--
--  BOX TYPES (box_templates). A pantry with a Standard box, a Senior box, three
--  holiday boxes and a couple of kids' packs wants them grouped rather than in
--  one long list.
--
--  PACKED BATCHES (pack_runs). A batch used to be labelled only by its box type,
--  so twelve "Standard family box" batches by the door were indistinguishable.
--  Now a batch can have its own name ("Garcia family") and sit in a folder
--  ("Saturday distribution").
--
-- One folders table with a `kind`, since the two jobs are different and must
-- never mix. The database enforces that: a box type can only be filed in a
-- 'template' folder, a batch only in a 'packed' folder, and either only in a
-- folder from its own pantry. That's done with composite foreign keys over
-- (folder id, pantry, kind), so it holds however a row is written.

create table if not exists public.box_folders (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,
  kind text not null check (kind in ('template', 'packed')),
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- "Holiday" once per pantry per kind, however it's capitalised. A box-type
-- folder and a batch folder may share a name, since they never appear together.
create unique index if not exists box_folders_name_idx
  on public.box_folders (pantry_id, kind, lower(name));

-- The target the composite foreign keys below point at.
create unique index if not exists box_folders_identity_idx
  on public.box_folders (id, pantry_id, kind);

-- ------------------------------------------------------------- box types

alter table public.box_templates
  add column if not exists folder_id uuid;

-- Always 'template'. It exists only so the foreign key can say which kind of
-- folder a box type may point at.
--
-- An ordinary column pinned by a check, NOT a generated column. Postgres
-- refuses any ON DELETE action on a foreign key that includes a generated
-- column ("invalid ON DELETE action for foreign key constraint containing
-- generated column"), even one that only nulls a different column. The check
-- makes it just as fixed, and members can't update it anyway: it isn't in
-- their column grants.
alter table public.box_templates
  add column if not exists folder_kind text not null default 'template'
  constraint box_templates_folder_kind_pinned check (folder_kind = 'template');

alter table public.box_templates drop constraint if exists box_templates_folder_fk;
alter table public.box_templates
  add constraint box_templates_folder_fk
  foreign key (folder_id, pantry_id, folder_kind)
  references public.box_folders (id, pantry_id, kind)
  -- Only folder_id is cleared. The box type survives its folder being deleted,
  -- just unfiled, and folder_kind keeps its pinned value.
  on delete set null (folder_id);

-- ------------------------------------------------------------- packed batches

alter table public.pack_runs
  add column if not exists label text,
  add column if not exists folder_id uuid;

alter table public.pack_runs
  add column if not exists folder_kind text not null default 'packed'
  constraint pack_runs_folder_kind_pinned check (folder_kind = 'packed');

-- A batch's own name. Null means "use the box type's name".
alter table public.pack_runs drop constraint if exists pack_runs_label_length;
alter table public.pack_runs
  add constraint pack_runs_label_length
  check (label is null or length(trim(label)) between 1 and 80);

alter table public.pack_runs drop constraint if exists pack_runs_folder_fk;
alter table public.pack_runs
  add constraint pack_runs_folder_fk
  foreign key (folder_id, pantry_id, folder_kind)
  references public.box_folders (id, pantry_id, kind)
  on delete set null (folder_id);

-- ------------------------------------------------------------- access

alter table public.box_folders enable row level security;

drop policy if exists "Members can manage box folders" on public.box_folders;
create policy "Members can manage box folders"
on public.box_folders for all
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));

-- A folder's pantry and kind are fixed once created. Changing kind would
-- quietly strand whatever is filed in it, so only name and order are editable.
revoke update on public.box_folders from anon, authenticated;
grant select, insert, delete on public.box_folders to authenticated;
grant update (name, sort_order) on public.box_folders to authenticated;

-- Box types: folder_id joins the columns a member may edit.
grant update (name, rules, scales_with_family, updated_at, folder_id)
  on public.box_templates to authenticated;

-- Batches were read-only to members; every write went through pack_boxes and
-- collect_boxes. Naming and filing a batch is the one direct edit allowed, and
-- only for those two columns. A member still can't touch boxes_collected,
-- units_taken or anything else the pickup counts depend on.
drop policy if exists "Members can name and file pack runs" on public.pack_runs;
create policy "Members can name and file pack runs"
on public.pack_runs for update
using (public.is_pantry_member(pantry_id))
with check (public.is_pantry_member(pantry_id));

revoke update on public.pack_runs from anon, authenticated;
grant update (label, folder_id) on public.pack_runs to authenticated;

-- ------------------------------------------------------------- realtime

alter table public.box_folders replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'box_folders'
     ) then
    execute 'alter publication supabase_realtime add table public.box_folders';
  end if;
end
$$;
