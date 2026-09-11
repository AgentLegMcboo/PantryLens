import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { log } from './log';
import { supabase } from './supabase';
import { ITEM_PHOTO_BUCKET } from './store';
import type { DetectionBox } from './scan-normalize';

/**
 * Cutting each item out of the photo it was found in.
 *
 * The vision model already drew a box around every product so the review screen
 * could point at it. That box is also, for free, a crop — which means an
 * inventory list can show the actual tin on the actual shelf rather than a
 * generic glyph, using a photograph the pantry already took.
 *
 * Three rules shape everything here:
 *
 *  - IT RUNS AFTER THE SAVE, NOT DURING. Cropping and uploading twenty items is
 *    twenty image operations and twenty round trips. Made part of the save that
 *    is fifteen seconds of a spinner on a screen whose whole job is to feel
 *    finished. The rows land first; the pictures catch up.
 *  - IT NEVER REPORTS FAILURE. A missing thumbnail costs a category icon. The
 *    stock count, which is what actually matters, was already written.
 *  - IT ONLY EVER ADDS. Nothing here can modify a count, a name or a category.
 */

/** Long edge of the stored crop. It is rendered at 44px; this is generous already. */
const THUMB_EDGE = 220;
const THUMB_QUALITY = 0.7;

/** How many crops are in flight at once. */
const MAX_CONCURRENT = 3;

/**
 * A little breathing room around the model's box.
 *
 * Detection boxes hug the product, and a crop cut exactly on that line looks
 * cramped and often shaves the edge of a label. 8% of the box on each side reads
 * as a photograph of the item rather than a fragment of one.
 */
const PADDING = 0.08;

export interface PhotoJob {
  /** The inventory row this belongs to — known before the insert. */
  id: string;
  pantryId: string;
  /** Where in the photo, as fractions of width and height. */
  box: DetectionBox;
  /** The source photo. */
  uri: string;
  width: number;
  height: number;
}

/**
 * base64 to bytes, by hand.
 *
 * React Native's Hermes runtime does not reliably provide `atob`, and Supabase
 * storage wants bytes rather than a string — a base64 string uploaded directly
 * arrives as a text file that no image decoder will touch. Fifteen lines beats
 * another dependency.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Returns an ArrayBuffer of EXACTLY the decoded length, and the exactness is the
 * whole point.
 *
 * This first returned `bytes.subarray(0, n)` — a Uint8Array view over a buffer
 * that had been over-allocated to round up the base64 length. A view looks right
 * everywhere you inspect it, but a request body is not read through the view: the
 * underlying ArrayBuffer travels, padding and all. The upload arrives longer than
 * the image, and a JPEG with trailing nulls is a JPEG no decoder will open.
 *
 * `slice` is what forces a new, correctly sized buffer.
 */
function base64ToArrayBuffer(input: string): ArrayBuffer {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let buffer = 0;
  let bits = 0;
  let out = 0;

  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.buffer.slice(0, out);
}

/** Crops one item out of its photo and returns a small JPEG as bytes. */
async function renderThumb(job: PhotoJob): Promise<ArrayBuffer | null> {
  const { box, width, height } = job;

  // The box arrives as fractions; the manipulator works in pixels.
  const padX = box.width * PADDING;
  const padY = box.height * PADDING;

  const originX = Math.max(0, (box.left - padX) * width);
  const originY = Math.max(0, (box.top - padY) * height);
  const cropW = Math.min(width - originX, (box.width + padX * 2) * width);
  const cropH = Math.min(height - originY, (box.height + padY * 2) * height);

  // A box that came back degenerate would make the manipulator throw.
  if (cropW < 8 || cropH < 8) return null;

  const context = ImageManipulator.manipulate(job.uri);
  context.crop({
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(cropW),
    height: Math.round(cropH),
  });
  context.resize(cropW >= cropH ? { width: THUMB_EDGE } : { height: THUMB_EDGE });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: THUMB_QUALITY,
    format: SaveFormat.JPEG,
  });

  return result.base64 ? base64ToArrayBuffer(result.base64) : null;
}

/**
 * Stores one JPEG against one item and points the row at it.
 *
 * Shared by the automatic crop and by a volunteer picking a photo by hand, so
 * there is exactly one place that knows the path convention, the cache-busting
 * rule and the order of the two writes.
 */
export async function storeItemPhoto(
  itemId: string,
  pantryId: string,
  jpeg: ArrayBuffer,
): Promise<string | null> {
  // The pantry folder is what the storage policy checks, so it is not cosmetic.
  const path = `${pantryId}/${itemId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(ITEM_PHOTO_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) {
    log.warn('store', `could not upload a photo for ${itemId}`, uploadError.message);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(ITEM_PHOTO_BUCKET).getPublicUrl(path);

  // Replacing a photo reuses the path, so without a changing query string the
  // app would keep showing the cached old one.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('inventory')
    .update({ image_url: url })
    .eq('id', itemId);

  if (updateError) {
    log.warn('store', `uploaded a photo but could not link it to ${itemId}`, updateError.message);
    return null;
  }
  return url;
}

/**
 * Shrinks any photo to the stored thumbnail size. Used by the manual picker,
 * where the source is a full-resolution camera shot rather than a crop.
 */
export async function renderItemPhoto(uri: string): Promise<ArrayBuffer | null> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: THUMB_EDGE });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: THUMB_QUALITY,
    format: SaveFormat.JPEG,
  });
  return result.base64 ? base64ToArrayBuffer(result.base64) : null;
}

/** Crops one detection out of its photo and stores it. */
async function attachOne(job: PhotoJob): Promise<boolean> {
  const jpeg = await renderThumb(job);
  if (!jpeg) return false;
  return (await storeItemPhoto(job.id, job.pantryId, jpeg)) !== null;
}

/**
 * Attaches photos to rows that are already saved.
 *
 * Not awaited by the caller — the volunteer is done and twenty uploads have no
 * business standing between them and their confirmation.
 *
 * BUT IT REPORTS. The first version of this was fire-and-forget in the strict
 * sense: it wrote a debug line and vanished. When it silently did nothing there
 * was no way to tell "it never ran" from "it ran and failed" from "there was
 * nothing to do" — not from the app, not from the database, not from anywhere.
 * Three rounds of guessing came out of that.
 *
 * So the outcome now lands in the activity log, which is a place both a
 * volunteer and a maintainer can actually see. A failure says so, in words, on
 * the dashboard.
 */
export async function attachItemPhotos(jobs: PhotoJob[]): Promise<number> {
  const { usePantryStore } = await import('./store');
  const note = (text: string, icon: string) =>
    usePantryStore.getState().addActivity(text, icon).catch(() => {});

  if (jobs.length === 0) {
    log.warn('store', 'no crops to attach: no row had both a detection box and its photo');
    await note('No item photos to attach — the scan returned no usable boxes', 'image-off-outline');
    return 0;
  }

  log.debug('store', `attaching ${jobs.length} item photo(s) in the background`);

  let done = 0;
  let next = 0;
  /** Kept so a total failure can say WHY rather than just that it happened. */
  let firstFailure: string | null = null;

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= jobs.length) return;
      try {
        if (await attachOne(jobs[index])) done++;
        else firstFailure ??= 'the upload was rejected';
      } catch (err: any) {
        // One bad crop must not stop the rest.
        log.warn('store', `crop failed for ${jobs[index].id}`, err);
        firstFailure ??= err?.message ?? String(err);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT, jobs.length) }, worker),
  );

  if (done === 0) {
    log.error('store', `NO item photos attached out of ${jobs.length}: ${firstFailure}`);
    await note(`Could not attach item photos — ${firstFailure ?? 'unknown error'}`, 'image-off-outline');
    return 0;
  }

  log.debug('store', `attached ${done} of ${jobs.length} item photo(s)`);
  await note(
    done === jobs.length
      ? `Attached ${done} item photo${done === 1 ? '' : 's'}`
      : `Attached ${done} of ${jobs.length} item photos — ${firstFailure ?? 'some failed'}`,
    'image-outline',
  );

  // Pull the new URLs into the list the volunteer is already looking at.
  await usePantryStore.getState().fetchData();
  return done;
}
