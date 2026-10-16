-- Shelves inside shelves, one level deep.
--
-- A back room has shelves; a freezer has drawers. Volunteers kept naming places
-- "Back room - top shelf" to get the second level, which sorts badly and can't
-- be collapsed. A sub-shelf points at its parent; a top-level shelf has none.
--
-- One level only, enforced below: "Back room › Top shelf" reads at a glance on
-- a pick list, a third level does not.

alter table public.locations
  add column if not exists parent_id uuid references public.locations(id) on delete cascade;

comment on column public.locations.parent_id is
  'The shelf this sub-shelf sits in. Null for a top-level shelf. One level deep.';

create index if not exists locations_parent_idx on public.locations (parent_id);

-- Names were unique per pantry. With sub-shelves, "Top shelf" can exist under
-- two different shelves, so names are unique within their parent instead.
drop index if exists public.locations_pantry_name_idx;
create unique index if not exists locations_pantry_parent_name_idx
  on public.locations (
    pantry_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- Same pantry, one level, no cycles.
create or replace function public.locations_check_parent()
returns trigger
language plpgsql
as $$
declare
  parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'A shelf cannot sit inside itself';
  end if;

  select pantry_id, parent_id into parent from public.locations where id = new.parent_id;
  if not found then
    raise exception 'That parent shelf no longer exists';
  end if;
  if parent.pantry_id <> new.pantry_id then
    raise exception 'A sub-shelf must be in the same pantry as its shelf';
  end if;
  if parent.parent_id is not null then
    raise exception 'Sub-shelves cannot have sub-shelves of their own';
  end if;
  if exists (select 1 from public.locations c where c.parent_id = new.id) then
    raise exception 'A shelf that has sub-shelves cannot become a sub-shelf';
  end if;
  return new;
end;
$$;

drop trigger if exists locations_check_parent on public.locations;
create trigger locations_check_parent
  before insert or update of parent_id on public.locations
  for each row execute function public.locations_check_parent();
