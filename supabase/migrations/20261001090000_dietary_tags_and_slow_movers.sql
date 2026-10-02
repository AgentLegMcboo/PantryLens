-- What is in the box, and whether the person opening it can eat it.
--
-- This app has been good at the half of the problem nobody complains about. It
-- makes sure a box is balanced and the count is right. Every complaint people
-- who actually use food banks make is about the other half:
--
--   "I have a pretty severe wheat allergy and was once homeless. People would
--    give out bread, vegetables that needed cooking to eat, and cans that were
--    pretty hard to get into."
--
--   "As a vegan ... they're not always set up for me to ask to swap ... we just
--    drive through and they put whatever in the trunks."
--
--   "I find it very difficult to open cans with a can opener."
--
-- A box balanced across grain / protein / vegetable can be wrong three separate
-- ways at once: unsafe, uncookable and unopenable. The allocator could not
-- express any of that, because a category says what a thing IS and nothing about
-- who can use it.
--
-- Three parts here:
--
--   inventory.diet_tags        what is true about this food
--   box_templates.excludes/requires_tags   what a given box will not or must carry
--   slow_movers                what nobody is taking, so a pantry can stop
--                              accepting it instead of binning it
--
-- A NOTE ON SAFETY, which the app's wording depends on:
--
-- A `contains-*` tag is a POSITIVE claim — something said this food contains
-- that allergen. Its ABSENCE IS NOT A CLAIM OF SAFETY. Most tags come from Open
-- Food Facts, which is crowd-sourced and patchy, and a tin nobody has ever
-- catalogued arrives with no tags at all. So the app may say "contains wheat"
-- and must never say "wheat-free" or "safe for coeliacs". Excluding a tag
-- removes what is KNOWN to contain it; it cannot promise the rest is clean.
-- Every screen that touches this says so.

-- ------------------------------------------------------------- the vocabulary

/**
 * The closed set of tags. A text[] rather than a table because these are a
 * fixed vocabulary the app ships, not data a pantry invents — and a typo'd
 * 'contains-whaet' that silently fails to match an exclusion is exactly the
 * kind of mistake that puts the wrong tin in a box.
 */
create or replace function public.diet_tag_vocabulary()
returns text[]
language sql
immutable
as $$
  select array[
    -- The nine allergens most food labelling regimes require, as positive claims.
    'contains-wheat', 'contains-milk', 'contains-eggs', 'contains-peanuts',
    'contains-tree-nuts', 'contains-soy', 'contains-fish', 'contains-shellfish',
    'contains-sesame',
    -- Diet.
    'vegan', 'vegetarian',
    -- Practical, and the two nobody thinks to record. A box for someone with no
    -- kitchen lives or dies on these.
    'no-cook',   -- edible as it is: no stove, no pan, no boiling water
    'easy-open'  -- pull tab or screw top: no can opener needed
  ]::text[];
$$;

comment on function public.diet_tag_vocabulary() is
  'The closed set of allowed diet_tags. contains-* are positive claims; their absence never means safe.';

-- ------------------------------------------------------------- on the food

alter table public.inventory
  add column if not exists diet_tags text[] not null default '{}';

alter table public.inventory drop constraint if exists inventory_diet_tags_known;
alter table public.inventory
  add constraint inventory_diet_tags_known
  check (diet_tags <@ public.diet_tag_vocabulary());

comment on column public.inventory.diet_tags is
  'Positive claims about this food. contains-* means a source said the allergen IS present; an empty array means nothing is known, NOT that the food is free of anything.';

-- GIN, because every query against this asks "does this array contain that tag".
create index if not exists inventory_diet_tags_idx
  on public.inventory using gin (diet_tags);

-- Cached per product, so the second tin of the same thing arrives already
-- tagged and no volunteer types it twice.
alter table public.barcode_cache
  add column if not exists diet_tags text[] not null default '{}';

alter table public.barcode_cache drop constraint if exists barcode_cache_diet_tags_known;
alter table public.barcode_cache
  add constraint barcode_cache_diet_tags_known
  check (diet_tags <@ public.diet_tag_vocabulary());

-- And on the learned catalogue, so a pantry's own correction ("this one is
-- actually vegan") outlives the single tin it was made on.
alter table public.product_aliases
  add column if not exists diet_tags text[] not null default '{}';

alter table public.product_aliases drop constraint if exists product_aliases_diet_tags_known;
alter table public.product_aliases
  add constraint product_aliases_diet_tags_known
  check (diet_tags <@ public.diet_tag_vocabulary());

-- ------------------------------------------------------------- on the box

/**
 * What a box will not carry, and what it must.
 *
 *   excludes_tags  nothing with any of these goes in. "Wheat-free box".
 *   requires_tags  everything in it must have all of these. "No-cook box",
 *                  which is the box you hand someone living in a car.
 *
 * Both, deliberately, rather than one. They are different questions: excluding
 * is about harm, requiring is about usability, and a pantry packing a no-cook
 * box for an unhoused neighbour usually wants easy-open too.
 */
alter table public.box_templates
  add column if not exists excludes_tags text[] not null default '{}',
  add column if not exists requires_tags text[] not null default '{}';

alter table public.box_templates drop constraint if exists box_templates_tags_known;
alter table public.box_templates
  add constraint box_templates_tags_known
  check (
    excludes_tags <@ public.diet_tag_vocabulary()
    and requires_tags <@ public.diet_tag_vocabulary()
  );

-- A box that both requires and excludes the same tag can never be filled, and
-- the failure would look like "you have no stock" rather than "this box is
-- impossible".
alter table public.box_templates drop constraint if exists box_templates_tags_not_contradictory;
alter table public.box_templates
  add constraint box_templates_tags_not_contradictory
  check (not (excludes_tags && requires_tags));

comment on column public.box_templates.excludes_tags is
  'Nothing carrying these tags is packed into this box. Removes what is KNOWN to contain them — it cannot promise the remainder is free of them.';

-- Members already edit their own box types; these join the same column grant.
grant update (name, rules, scales_with_family, updated_at, folder_id,
              excludes_tags, requires_tags)
  on public.box_templates to authenticated;

-- ------------------------------------------------------------- what nobody takes

/**
 * Stock that is not moving, and stock that gets thrown away.
 *
 * Straight from a thread of people who rely on food banks: the carrot juice
 * nobody would take, the V8, the same three things every week. A pantry cannot
 * tell a donor "please stop sending this" without a number, and the number was
 * already in the database — nothing reads it.
 *
 * Grouped by product rather than by row, because "we are sitting on 40 units of
 * carrot juice, oldest 94 days, and we binned 22 more" is the sentence worth
 * having. Per pantry, and row-level security on inventory and stock_exits is
 * what scopes it.
 */
create or replace view public.slow_movers as
with on_shelf as (
  select
    pantry_id,
    lower(trim(name)) as product,
    max(name) as display_name,
    max(category) as category,
    sum(count)::integer as units,
    min(date_added) as oldest_added,
    (current_date - min(date_added))::integer as days_on_shelf
  from public.inventory
  where count > 0
  group by pantry_id, lower(trim(name))
),
binned as (
  select
    pantry_id,
    lower(trim(item_name)) as product,
    sum(count)::integer as units_discarded
  from public.stock_exits
  where reason = 'discarded'
  group by pantry_id, lower(trim(item_name))
),
handed_out as (
  select
    pantry_id,
    lower(trim(item_name)) as product,
    sum(count)::integer as units_given_out
  from public.stock_exits
  where reason = 'given_out'
  group by pantry_id, lower(trim(item_name))
)
select
  coalesce(s.pantry_id, b.pantry_id, h.pantry_id) as pantry_id,
  coalesce(s.display_name, initcap(coalesce(b.product, h.product))) as name,
  s.category,
  coalesce(s.units, 0) as units_on_shelf,
  s.days_on_shelf,
  coalesce(h.units_given_out, 0) as units_given_out,
  coalesce(b.units_discarded, 0) as units_discarded,
  -- Of everything that ever left, how much was binned rather than given out.
  -- Null when nothing has left yet: no history is not a 0% waste rate.
  round(
    100.0 * coalesce(b.units_discarded, 0)
    / nullif(coalesce(b.units_discarded, 0) + coalesce(h.units_given_out, 0), 0),
    1
  ) as waste_pct
from on_shelf s
full outer join binned b on b.pantry_id = s.pantry_id and b.product = s.product
full outer join handed_out h on h.pantry_id = coalesce(s.pantry_id, b.pantry_id)
                            and h.product = coalesce(s.product, b.product);

alter view public.slow_movers set (security_invoker = on);
grant select on public.slow_movers to authenticated;

comment on view public.slow_movers is
  'Per product: what is sitting, how long, what was given out and what was binned. The evidence for telling a donor to send something else.';
