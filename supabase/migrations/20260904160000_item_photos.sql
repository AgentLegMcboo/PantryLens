-- Pictures of the actual thing.
--
-- An inventory list of forty text rows is hard to scan with your eyes, and a
-- volunteer standing at a shelf is matching what the app says against what is in
-- their hand. A thumbnail does that job instantly in a way a name never can.
--
-- Two sources, in order of quality:
--
--  1. The manufacturer's pack shot, when a barcode identified the product. Sharp,
--     square, correctly lit, and free — it comes back in the same Open Food Facts
--     response that already gives us the name.
--  2. A crop of the pantry's own photo, cut out of the detection box the model
--     drew. Always available for anything scanned, and it has the advantage of
--     showing the actual tin on the actual shelf.
--
-- Anything with neither keeps the category icon.

-- ------------------------------------------------------------- columns

alter table public.inventory
  add column if not exists image_url text;

comment on column public.inventory.image_url is
  'Pack shot from a barcode lookup, or a crop of the scan photo uploaded to the item-photos bucket. Null falls back to the category icon.';

alter table public.barcode_cache
  add column if not exists image_url text;

-- ------------------------------------------------------------- storage

-- Public read. These are photographs of tins on a shelf, and the alternative —
-- a private bucket — means minting a signed URL for every row of every inventory
-- render and re-minting them as they expire, which is a great deal of machinery
-- for produce. Paths are keyed by a UUID nobody can guess.
--
-- Writes are NOT public: the policies below scope them to the pantry that owns
-- the folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png'];

-- Objects live at {pantry_id}/{item_id}.jpg, so the first path segment is the
-- authorisation check. Compared as text rather than cast to uuid — a malformed
-- path should fail the policy, not raise.
drop policy if exists "Item photos are publicly readable" on storage.objects;
create policy "Item photos are publicly readable"
on storage.objects for select
using (bucket_id = 'item-photos');

drop policy if exists "Members can upload item photos to their pantry" on storage.objects;
create policy "Members can upload item photos to their pantry"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'item-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);

drop policy if exists "Members can replace item photos in their pantry" on storage.objects;
create policy "Members can replace item photos in their pantry"
on storage.objects for update
to authenticated
using (
  bucket_id = 'item-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);

-- Deleting an item deletes its photo, so the app needs this or the bucket grows
-- for ever with pictures of tins that left the building months ago.
drop policy if exists "Members can delete item photos in their pantry" on storage.objects;
create policy "Members can delete item photos in their pantry"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'item-photos'
  and (storage.foldername(name))[1] in (
    select pantry_id::text from public.pantry_members where user_id = auth.uid()
  )
);
