-- Why a delete on one phone never reached another.
--
-- The app subscribes to postgres_changes with `filter: pantry_id=eq.<id>`, which
-- is right for INSERT and UPDATE. For DELETE it can never match.
--
-- Postgres only puts the columns named by a table's REPLICA IDENTITY into the
-- old-row image of a delete, and the default identity is the primary key alone.
-- So a delete arrived carrying nothing but `id`; `pantry_id` was absent, the
-- channel filter compared against nothing, and the event was dropped before it
-- reached the client. Inserts and updates carried the whole row and matched
-- fine, which is what made the failure so specific and so confusing: everything
-- synced across devices EXCEPT removals.
--
-- REPLICA IDENTITY FULL puts the entire old row in the payload, so the filter
-- has a pantry_id to compare and deletes propagate like everything else.
--
-- The cost is real and worth stating: full replica identity makes the WAL record
-- for every UPDATE and DELETE carry the complete previous row rather than a key.
-- On tables this size — a pantry's shelf, not an event stream — that is nothing.
alter table public.inventory replica identity full;
alter table public.bulk_lots replica identity full;
alter table public.activities replica identity full;

-- And the tables have to be published at all. This was never declared in a
-- migration, so whether realtime worked depended on someone having ticked the
-- boxes in the dashboard — and on a fresh clone of this project, nothing synced.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

-- `add table` errors if the table is already a member, so each is guarded.
do $$
declare
  t text;
begin
  foreach t in array array['inventory', 'bulk_lots', 'activities'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
