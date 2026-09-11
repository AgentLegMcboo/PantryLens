-- Barcodes cached before image_url existed have no pack shot and, because the
-- cache is consulted first, would never acquire one. Dropping those rows makes
-- them re-fetch once, with the image, the next time anyone scans them.
--
-- Misses are kept: a barcode no provider recognises has nothing to come back
-- for, and re-asking would defeat the point of caching them.
delete from public.barcode_cache
where source <> 'miss'
  and image_url is null;
