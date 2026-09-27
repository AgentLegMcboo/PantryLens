import type { ScanCandidate } from './scan-normalize';
import { log } from './log';
import { supabase } from './supabase';

/**
 * Recording what the model said, and what the volunteer did about it.
 *
 * ONE RULE GOVERNS THIS WHOLE FILE: none of it may ever break a save.
 *
 * Scan history is a measurement of the app, not part of its job. A volunteer
 * standing at a shelf with a trolley of food does not care whether we managed
 * to write down our own accuracy figures, and losing their donation because a
 * bookkeeping insert failed would be an absurd trade. So every function here
 * swallows its own errors, logs, and returns something the caller can ignore.
 *
 * The flow is two calls with the review in between:
 *
 *   startScan()   as soon as the model answers, BEFORE the volunteer sees
 *                 anything. This is the only way a scan that was so wrong the
 *                 volunteer walked away ever gets recorded — and that is a
 *                 measurement too.
 *   finishScan()  after the rows are saved, reporting what happened to each
 *                 candidate. Anything not reported counts as rejected.
 */

export const SCAN_PHOTO_BUCKET = 'scan-photos';

export interface StartedScan {
  scanId: string;
  /** One per candidate, in the order they were sent. */
  itemIds: string[];
}

/** What a candidate looked like before anyone edited it. */
export interface DetectedSnapshot {
  name: string;
  category: string;
  count: number;
  expiration: string | null;
}

export interface ScanOutcome {
  /** The scan_items row this is about. */
  id: string;
  verdict: 'accepted' | 'edited';
  /** The inventory row it became. */
  item_id: string | null;
  name: string;
  category: string;
  count: number;
  expiration: string | null;
}

export type ScanMode = 'donation' | 'shelf_audit' | 'manual';

/**
 * Opens a scan record. Returns null if anything goes wrong, which the caller
 * treats as "no history for this one" and carries on.
 */
export async function startScan(opts: {
  pantryId: string | null;
  mode: ScanMode;
  photosSent: number;
  photosRead: number;
  durationMs: number | null;
  model?: string | null;
  candidates: ScanCandidate[];
}): Promise<StartedScan | null> {
  if (!opts.pantryId) return null;

  try {
    const { data, error } = await supabase.rpc('start_scan', {
      target_pantry: opts.pantryId,
      scan_mode: opts.mode,
      photos_sent: opts.photosSent,
      photos_read: opts.photosRead,
      duration_ms: opts.durationMs,
      model: opts.model ?? null,
      candidates: opts.candidates.map(c => ({
        // rawName is what the model actually said; `name` may already have been
        // snapped to something the pantry has agreed on before. Both are kept,
        // because "the model was wrong but the catalogue saved us" and "the
        // model was right" are different facts.
        raw_name: (c as any).rawName ?? c.name,
        name: c.name,
        category: c.category,
        count: c.count,
        expiration: c.expiration,
        confidence: c.confidence,
        resolved_by: c.resolvedBy ?? null,
        barcode: c.barcode ?? null,
        image_index: c.imageIndex,
        box: c.box,
      })),
    });
    if (error) throw error;

    const result = data as { scan_id: string; item_ids: string[] };
    log.debug('scan', `scan ${result.scan_id} opened with ${result.item_ids.length} candidate(s)`);
    return { scanId: result.scan_id, itemIds: result.item_ids ?? [] };
  } catch (err) {
    log.warn('scan', 'could not open a scan record — carrying on without history', err);
    return null;
  }
}

/**
 * Closes a scan with the verdicts.
 *
 * Called after the inventory rows are safely in. If it fails the scan simply
 * stays open, which reads as abandoned — a slightly wrong measurement, and far
 * better than a save that failed over bookkeeping.
 */
export async function finishScan(
  scanId: string | null,
  results: ScanOutcome[],
): Promise<void> {
  if (!scanId) return;

  try {
    const { error } = await supabase.rpc('finish_scan', {
      target_scan: scanId,
      results,
    });
    if (error) throw error;
    log.debug('scan', `scan ${scanId} closed with ${results.length} kept`);
  } catch (err) {
    log.warn('scan', `could not close scan ${scanId}`, err);
  }
}

/** Accepted means untouched. Anything a human changed is a correction worth keeping apart. */
export function verdictFor(
  detected: DetectedSnapshot,
  final: { name?: string; category?: string; count?: number; expiration?: string | null },
): 'accepted' | 'edited' {
  const sameName = (final.name ?? '').trim() === detected.name.trim();
  const sameCategory = (final.category ?? '') === detected.category;
  const sameCount = (final.count ?? 0) === detected.count;
  const sameDate = (final.expiration ?? null) === (detected.expiration ?? null);
  return sameName && sameCategory && sameCount && sameDate ? 'accepted' : 'edited';
}

/**
 * Uploads the photos the scan was read from, in the background.
 *
 * Deliberately NOT awaited by anything. These are the evidence behind "it got
 * the shelf wrong yesterday", and they are worth having — but a volunteer
 * should never wait on a diagnostic upload, and a weak pantry wifi should never
 * turn one into a failed intake.
 *
 * The bucket is private, so nothing here produces a public URL: the paths go on
 * the scan row and are exchanged for a signed URL only when somebody actually
 * opens that scan.
 */
export function uploadScanPhotos(
  pantryId: string | null,
  scanId: string | null,
  photos: { base64: string }[],
): void {
  if (!pantryId || !scanId || photos.length === 0) return;

  void (async () => {
    const paths: string[] = [];

    for (const [index, photo] of photos.entries()) {
      const path = `${pantryId}/${scanId}/${index}.jpg`;
      try {
        const bytes = base64ToBytes(photo.base64);
        if (!bytes) continue;

        const { error } = await supabase.storage
          .from(SCAN_PHOTO_BUCKET)
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        paths.push(path);
      } catch (err) {
        log.warn('scan', `could not store scan photo ${index}`, err);
      }
    }

    if (paths.length === 0) return;

    // Recorded through the same function that opened the scan rather than a
    // direct update: members have no write access to the scans table at all.
    const { error } = await supabase.rpc('attach_scan_photos', {
      target_scan: scanId,
      paths,
    });
    if (error) log.warn('scan', `could not record scan photo paths`, error);
    else log.debug('scan', `stored ${paths.length} photo(s) for scan ${scanId}`);
  })();
}

/**
 * base64 to bytes, without atob.
 *
 * React Native's fetch cannot take a data: URL body and supabase-js storage
 * wants bytes rather than a string. Hermes has no Buffer, so this is done by
 * hand — the same approach item-photos uses for crops.
 */
function base64ToBytes(base64: string): Uint8Array | null {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  if (clean.length === 0) return null;

  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let byte = 0;
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = CHARS.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byte++] = (buffer >> bits) & 0xff;
    }
  }

  return bytes.subarray(0, byte);
}
