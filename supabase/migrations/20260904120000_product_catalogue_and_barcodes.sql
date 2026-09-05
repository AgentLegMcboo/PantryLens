-- Two ways of turning a guess into a fact.
--
--  1. THE CATALOGUE. A pantry sees the same few hundred products over and over —
--     the same donated peanut butter, week after week. Every time a volunteer
--     confirms or corrects a scanned row they are teaching the app something,
--     and until now all of it was thrown away. product_aliases remembers it, per
--     pantry, and later scans are snapped to what the pantry has already agreed
--     a thing is called. It also fixes categories permanently: if Nutella keeps
--     landing as a snack and this pantry files it as protein, after two
--     corrections it is protein.
--
--  2. BARCODES. A UPC is not a guess. barcode_cache is deliberately NOT
--     pantry-scoped: a product identified once is identified for everyone on the
--     instance, and a repeat is a primary-key lookup rather than an HTTP call.

-- Trigram similarity. "Skippy Creamy Peanut Butter 16 oz" and "skippy creamy
-- peanut butter, 16oz" are the same product, and this is what knows that
-- without needing an embedding model in the hot path of a scan.
--
-- Supabase keeps extensions in their own schema, and `if not exists` will not
-- move one that is already installed there. So the schema is named explicitly
-- and every function below that touches similarity() carries `extensions` on its
-- search_path — a SECURITY DEFINER function pinned to `public` alone would raise
-- "function similarity(text, text) does not exist" at the worst possible moment.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Applies to this migration only, so the gin_trgm_ops operator class below
-- resolves however the extension actually ended up installed.
set local search_path = public, extensions;

-- ------------------------------------------------------------- the catalogue

create table if not exists public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  pantry_id uuid not null references public.pantries(id) on delete cascade,

  -- What the vision model said.
  raw_name text not null,
  -- What a volunteer confirmed it actually is.
  canonical_name text not null,
  category text not null check (category in
    ('grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown')),

  -- How many scans have agreed. This is the trust score: one correction is an
  -- opinion, five is a fact, and a single fat-fingered edit must not immediately
  -- start rewriting every future scan.
  times_seen integer not null default 1,
  -- Whether a human ever changed this reading, as opposed to merely confirming
  -- it. Useful for telling "the model is reliably right about this" apart from
  -- "the model is reliably wrong about this in a known way".
  was_corrected boolean not null default false,

  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- One row per (pantry, thing the model said). The raw name is the key because
-- that is what a future scan arrives holding.
create unique index if not exists product_aliases_pantry_raw_idx
  on public.product_aliases (pantry_id, lower(raw_name));

-- Fuzzy lookup. Without this, matching a scan against a few thousand aliases is
-- a sequential scan per item.
create index if not exists product_aliases_raw_trgm_idx
  on public.product_aliases using gin (raw_name gin_trgm_ops);

alter table public.product_aliases enable row level security;

drop policy if exists "Members can read their pantry catalogue" on public.product_aliases;
create policy "Members can read their pantry catalogue"
on public.product_aliases for select
using (public.is_pantry_member(pantry_id));

-- Writes go through record_product_confirmations, which is where the
-- times_seen arithmetic lives. No direct insert policy on purpose.

comment on table public.product_aliases is
  'What this pantry has confirmed a scanned product actually is. Written on every review, read back to snap later scans.';

-- ------------------------------------------------------------- recording

/**
 * Records what a volunteer agreed to in Review & Verify.
 *
 * `entries` is [{raw_name, canonical_name, category, was_corrected}, ...].
 *
 * Confirmations count as much as corrections, which is the part that is easy to
 * miss: a row the model got right and a human ticked twenty times is a
 * high-confidence catalogue entry, and learning only from mistakes would throw
 * that away.
 */
create or replace function public.record_product_confirmations(
  target_pantry uuid,
  entries jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  written integer := 0;
begin
  if not public.is_pantry_member(target_pantry) then
    raise exception 'Not a member of that pantry' using errcode = '42501';
  end if;

  -- DISTINCT ON is load-bearing, not tidiness: one review can hold two rows the
  -- model gave the same name under different categories, and ON CONFLICT raises
  -- "cannot affect row a second time" if both reach the insert.
  insert into public.product_aliases
    (pantry_id, raw_name, canonical_name, category, was_corrected)
  select distinct on (lower(trim(e->>'raw_name')))
    target_pantry,
    trim(e->>'raw_name'),
    trim(e->>'canonical_name'),
    e->>'category',
    coalesce((e->>'was_corrected')::boolean, false)
  from jsonb_array_elements(entries) as e
  where coalesce(trim(e->>'raw_name'), '') <> ''
    and coalesce(trim(e->>'canonical_name'), '') <> ''
    and (e->>'category') in
      ('grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown')
  on conflict (pantry_id, lower(raw_name)) do update
    set times_seen = product_aliases.times_seen + 1,
        -- The newest confirmation wins the name. A pantry that renames a product
        -- means it, and the alternative is the first spelling ever entered
        -- being permanent.
        canonical_name = excluded.canonical_name,
        category = excluded.category,
        was_corrected = product_aliases.was_corrected or excluded.was_corrected,
        last_seen = now();

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke execute on function public.record_product_confirmations(uuid, jsonb) from public;
grant execute on function public.record_product_confirmations(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------- matching

/**
 * Snaps freshly scanned names to what this pantry already knows.
 *
 * Returns at most one match per input, the best one. `score` is trigram
 * similarity weighted by how often the pantry has agreed — a name seen twenty
 * times outranks a marginally closer one seen once, which is what stops a single
 * stray edit from hijacking a common product.
 *
 * The caller decides what to do with a weak match; this only reports.
 */
create or replace function public.match_products(
  target_pantry uuid,
  names text[],
  min_score real default 0.45
)
returns table (
  input text,
  canonical_name text,
  category text,
  score real,
  times_seen integer,
  was_corrected boolean
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select distinct on (n.name)
    n.name as input,
    a.canonical_name,
    a.category,
    similarity(a.raw_name, n.name) as score,
    a.times_seen,
    a.was_corrected
  from unnest(names) as n(name)
  join public.product_aliases a
    on a.pantry_id = target_pantry
   and similarity(a.raw_name, n.name) >= min_score
  where public.is_pantry_member(target_pantry)
  order by n.name, (similarity(a.raw_name, n.name) * (1 + ln(a.times_seen))) desc;
$$;

revoke execute on function public.match_products(uuid, text[], real) from public;
grant execute on function public.match_products(uuid, text[], real) to authenticated;

-- ------------------------------------------------------------- barcodes

create table if not exists public.barcode_cache (
  -- Normalised: digits only, check digit already verified before anything got
  -- this far.
  barcode text primary key,
  name text,
  brand text,
  category text check (category is null or category in
    ('grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown')),
  -- 'usda', 'openfoodfacts', or 'miss' — a barcode no provider knows. Misses are
  -- cached too, or every scan of an unknown tin re-asks the same two APIs.
  source text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists barcode_cache_fetched_idx on public.barcode_cache (fetched_at);

alter table public.barcode_cache enable row level security;

-- Product facts, not pantry data: every signed-in volunteer may read them.
-- Writes are the edge function's, using the service role, which bypasses RLS.
drop policy if exists "Signed-in users can read the barcode cache" on public.barcode_cache;
create policy "Signed-in users can read the barcode cache"
on public.barcode_cache for select
to authenticated
using (true);

comment on table public.barcode_cache is
  'UPC/EAN lookups, shared across every pantry on this instance. Misses are cached as source=miss.';
