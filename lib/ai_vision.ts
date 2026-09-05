import { supabase } from './supabase';
import { usePantryStore } from './store';
import { applyCatalogue } from './catalogue';
import { mergeDuplicates, normaliseItem, type ScanCandidate } from './scan-normalize';
import { describeImage, log } from './log';

/**
 * The bridge between a photo and a draft inventory row.
 *
 * Transport only. Everything the model returns is untrusted and is cleaned up in
 * ./scan-normalize, which is kept separate so that logic can be run and checked
 * without a network, a device, or a supabase client.
 */

export type { ScanCandidate };

/**
 * What came back from a scan.
 *
 * `photosRead` can now be lower than `photosSent`: the analyzer sends one
 * request per photo and tolerates one of them failing, which is right — five
 * photos' worth of rows beats making the volunteer redo all six. But a photo
 * that quietly vanished is worse than one that failed loudly, so the counts
 * travel with the result and the caller says so.
 */
export interface ScanResult {
  candidates: ScanCandidate[];
  photosRead: number;
  photosSent: number;
}

export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanError';
  }
}

/**
 * Sends one or more photos to the analyze-donation function and returns draft
 * rows. Throws ScanError carrying something a volunteer can act on — "nothing
 * recognisable" is a different problem from "no network" and must not read the
 * same on a phone in a back room.
 */
/**
 * supabase-js does not put a non-2xx body on the error it hands back — it parks
 * the whole Response on `error.context` and leaves reading it to the caller.
 * Without this every server-side failure collapsed into the same generic
 * "could not reach the scanner", hiding the one line that said what was wrong.
 */
async function readFunctionError(error: any): Promise<string | null> {
  const response: Response | undefined = error?.context;
  if (!response || typeof response.text !== 'function') return null;

  try {
    const body = await response.text();
    log.error('scan', `function returned HTTP ${response.status}`, body.slice(0, 500));
    try {
      const parsed = JSON.parse(body);
      return typeof parsed?.error === 'string' ? parsed.error : null;
    } catch {
      return null;
    }
  } catch (readErr) {
    log.error('scan', 'could not read the error body', readErr);
    return null;
  }
}

export async function processImageScan(images: string[] | string): Promise<ScanResult> {
  const imageList = (Array.isArray(images) ? images : [images]).filter(Boolean);
  if (imageList.length === 0) {
    throw new ScanError('No photos to analyse yet — take one first.');
  }

  log.debug(
    'scan',
    `sending ${imageList.length} photo(s)`,
    imageList.map(describeImage).join(', '),
  );

  // A missing session is the single likeliest cause of a silent failure now that
  // the function verifies JWTs, and it is worth naming rather than guessing at.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    log.error('scan', 'no supabase session — the function will reject this call');
    throw new ScanError('Your session expired. Sign out and back in, then try again.');
  }
  log.debug('scan', `session ok for ${sessionData.session.user.email ?? 'user'}`);

  const { data, error } = await log.step('scan', 'invoke analyze-donation', () =>
    supabase.functions.invoke('analyze-donation', { body: { images: imageList } }),
  );

  if (error) {
    const serverMessage = await readFunctionError(error);
    log.error('scan', 'invoke failed', { name: error.name, message: error.message });
    throw new ScanError(
      serverMessage ??
        'Could not reach the scanner. Check your connection and try again, or add the items by hand.',
    );
  }

  if (data?.error) {
    log.error('scan', 'function reported an error', data.error);
    throw new ScanError(String(data.error));
  }

  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const photosSent = imageList.length;
  const photosRead = Number.isFinite(data?.photosRead) ? Number(data.photosRead) : photosSent;
  log.debug('scan', `model returned ${rawItems.length} raw item(s) from ${photosRead}/${photosSent} photo(s)`, rawItems);

  // Now load-bearing rather than a safety net. Each photo is analysed on its own,
  // so a jar shot from two angles genuinely does come back twice — this is what
  // stops that from doubling the pantry's stock. Asking the model to de-duplicate
  // across frames, which is what used to happen, was both slower and worse.
  const candidates = mergeDuplicates(
    rawItems
      .map(normaliseItem)
      .filter((i: ScanCandidate | null): i is ScanCandidate => i !== null),
  );
  log.debug('scan', `${candidates.length} candidate(s) after normalising and merging`, candidates);

  if (candidates.length === 0) {
    throw new ScanError(
      'Nothing recognisable in those photos. Try getting closer to the labels, or add the items by hand.',
    );
  }

  // What this pantry has already agreed these products are called. Runs after
  // the merge so it sees one row per product, and never throws — an unreachable
  // catalogue costs nothing but the improvement it would have made.
  const snapped = await applyCatalogue(
    candidates,
    usePantryStore.getState().settings.pantryId,
  );

  return {
    // Least certain first, so the rows needing a human are the first ones seen.
    // Barcode and catalogue hits sort to the bottom by construction, which is
    // right: they are the rows least in need of a person.
    candidates: snapped.sort((a, b) => a.confidence - b.confidence),
    photosRead,
    photosSent,
  };
}

export interface BarcodeLookup {
  found: boolean;
  barcode?: string;
  name?: string;
  brand?: string | null;
  category?: string | null;
  /** 'usda' | 'openfoodfacts' | 'cache' when found. */
  source?: string;
  /** 'INVALID' when the digits failed their check digit, 'UNKNOWN' when no
   *  provider recognised them. */
  reason?: string;
  error?: string;
}

/**
 * Resolves a scanned barcode against the shared product cache and, on a miss,
 * USDA FoodData Central and Open Food Facts.
 *
 * This used to be a hardcoded object of three fake products that the review
 * screen called with a hardcoded barcode — so the "Scan barcode instead" button
 * returned the same imaginary tin of garbanzo beans every time it was pressed,
 * for any item, forever.
 *
 * Not found is a normal answer, not an error. A pantry receives plenty of things
 * no public database has heard of, and the honest response is to leave the row
 * alone and let a human name it.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookup> {
  try {
    const { data, error } = await supabase.functions.invoke('lookup-barcode', {
      body: { barcode },
    });

    if (error) {
      const serverMessage = await readFunctionError(error);
      log.error('scan', 'barcode lookup failed', error.message);
      return {
        found: false,
        reason: 'ERROR',
        error: serverMessage ?? 'Could not reach the product database. Try again, or type the name in.',
      };
    }

    log.debug('scan', `barcode ${barcode}: ${data?.found ? data.name : 'no match'}`);
    return data as BarcodeLookup;
  } catch (err) {
    log.error('scan', 'barcode lookup threw', err);
    return { found: false, reason: 'ERROR', error: 'Could not reach the product database.' };
  }
}
