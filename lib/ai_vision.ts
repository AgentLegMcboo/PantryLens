import { supabase } from './supabase';
import { InventoryItem } from './store';
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

export async function processImageScan(images: string[] | string): Promise<ScanCandidate[]> {
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
  log.debug('scan', `model returned ${rawItems.length} raw item(s)`, rawItems);

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

  // Least certain first, so the rows needing a human are the first ones seen.
  return candidates.sort((a, b) => a.confidence - b.confidence);
}

export function lookupBarcode(barcode: string): Partial<InventoryItem> {
  const barcodeDB: Record<string, Partial<InventoryItem>> = {
    '0111222333': { name: 'Canned Garbanzo Beans 15 oz', category: 'protein', count: 1, expiration: '2027-04-10', confidence: 1.0 },
    '0412200112': { name: 'Whole Wheat Bread Loaf', category: 'grain', count: 1, expiration: '2026-08-02', confidence: 1.0 },
    '0700000123': { name: 'Chicken Noodle Soup 10.5 oz', category: 'protein', count: 1, expiration: '2026-09-20', confidence: 1.0 }
  };

  return barcodeDB[barcode] || {
    name: `Scanned Item (${barcode})`,
    category: 'unknown',
    count: 1,
    expiration: null,
    confidence: 1.0
  };
}
