import { log } from './log';
import { supabase } from './supabase';
import type { ScanCandidate } from './scan-normalize';
import type { Category } from './store';

/**
 * What this pantry has already agreed a product is called.
 *
 * A pantry does not receive a long tail of novel groceries. It receives the same
 * few hundred products, over and over, from the same grocery rescue and the same
 * food drive — and every time a volunteer confirms or corrects a scanned row in
 * Review & Verify they are stating a fact about one of them. All of that used to
 * be discarded the moment the screen closed.
 *
 * Now it is written down and read back, so the app gets better at THIS pantry
 * with use, without a single change to the prompt. Category corrections are the
 * part that pays off most: a product the model reliably files wrong gets fixed
 * once and stays fixed.
 *
 * Everything here is best-effort by design. A scan must never fail because the
 * catalogue was unreachable — the volunteer still has the model's reading, which
 * is exactly what they had before any of this existed.
 */

/**
 * How many times a pantry must have agreed before a match rewrites a scan.
 *
 * Below this the entry still accumulates, it just does not act. That makes the
 * whole feature self-gating: on a fresh pantry it does nothing at all, and it
 * switches itself on as evidence arrives. It also means one fat-fingered
 * correction cannot start renaming every future scan on its own.
 */
const MIN_CONFIRMATIONS = 2;

/** Below this trigram score, two names are not the same product. */
const MIN_SCORE = 0.45;

interface AliasMatch {
  input: string;
  canonical_name: string;
  category: Category;
  score: number;
  times_seen: number;
  was_corrected: boolean;
}

/**
 * Snaps freshly scanned rows onto names this pantry has confirmed before.
 *
 * Rows already resolved by barcode are left alone: a manufacturer's GTIN outranks
 * a local habit, and overwriting it with a nickname would throw away the one
 * piece of certainty in the pipeline.
 */
export async function applyCatalogue(
  candidates: ScanCandidate[],
  pantryId: string | null,
): Promise<ScanCandidate[]> {
  if (!pantryId || candidates.length === 0) return candidates;

  const pending = candidates.filter(c => c.resolvedBy !== 'barcode');
  if (pending.length === 0) return candidates;

  try {
    const { data, error } = await supabase.rpc('match_products', {
      target_pantry: pantryId,
      names: pending.map(c => c.name),
      min_score: MIN_SCORE,
    });

    if (error) {
      log.warn('scan', 'catalogue lookup failed, using the model as-is', error.message);
      return candidates;
    }

    const matches = new Map<string, AliasMatch>();
    for (const row of (data ?? []) as AliasMatch[]) {
      if (row.times_seen >= MIN_CONFIRMATIONS) matches.set(row.input, row);
    }
    if (matches.size === 0) return candidates;

    let applied = 0;
    const snapped = candidates.map(candidate => {
      if (candidate.resolvedBy === 'barcode') return candidate;
      const match = matches.get(candidate.name);
      if (!match) return candidate;

      applied++;
      return {
        ...candidate,
        name: match.canonical_name,
        category: match.category,
        // Deliberately NOT 1. A catalogue hit is strong evidence, not proof —
        // it says this pantry has seen something like this before, and the
        // volunteer should still glance at it. Only a barcode earns certainty.
        confidence: Math.max(candidate.confidence, 0.95),
        resolvedBy: 'catalogue' as const,
      };
    });

    log.debug('scan', `catalogue matched ${applied} of ${pending.length} row(s)`);
    return snapped;
  } catch (err) {
    log.warn('scan', 'catalogue lookup threw, using the model as-is', err);
    return candidates;
  }
}

export interface ConfirmationEntry {
  /** Exactly what the model said, before anyone touched it. */
  raw_name: string;
  /** What the volunteer left it as. */
  canonical_name: string;
  category: Category;
  /** False when the volunteer changed nothing — which is still a vote. */
  was_corrected: boolean;
}

/**
 * Records what a volunteer agreed to.
 *
 * Called after a successful save, never before: the catalogue should only learn
 * from rows that actually reached the shelf.
 *
 * Confirmations are recorded as well as corrections, and that is the half that
 * is easy to leave out. A reading a human has ticked eleven times without
 * changing it is the strongest entry the catalogue can hold; learning only from
 * mistakes would record every product the model gets wrong and none of the ones
 * it gets right.
 */
export async function recordConfirmations(
  pantryId: string | null,
  entries: ConfirmationEntry[],
): Promise<void> {
  if (!pantryId || entries.length === 0) return;

  try {
    const { error } = await supabase.rpc('record_product_confirmations', {
      target_pantry: pantryId,
      entries,
    });
    if (error) {
      log.warn('store', 'could not record catalogue confirmations', error.message);
      return;
    }
    log.debug('store', `catalogue learned from ${entries.length} row(s)`);
  } catch (err) {
    // The items are already saved. Failing to learn from them is not worth
    // telling a volunteer about, and definitely not worth an error alert.
    log.warn('store', 'recording catalogue confirmations threw', err);
  }
}
