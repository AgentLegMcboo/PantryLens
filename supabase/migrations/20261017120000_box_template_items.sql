-- Specific items in a box, on top of (or instead of) category amounts.
--
-- A category rule says "2 protein" and lets the pick list choose which. Some
-- boxes need a particular product: a baby box needs formula, not any baby
-- item; a holiday box needs the stuffing. `items` names them:
--   [{"name": "Peanut butter", "category": "protein", "count": 1}, ...]
-- Matched to stock by name (trimmed, any case), since the same product arrives
-- as many rows across deliveries.
alter table public.box_templates
  add column if not exists items jsonb not null default '[]'::jsonb
  check (jsonb_typeof(items) = 'array');
