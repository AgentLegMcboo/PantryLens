/**
 * Which row Review & Verify shows after a confirm.
 *
 * Pure, and kept out of the screen, because this ordering is what makes rapid
 * confirming work: every tap confirms what is on screen and moves on, so a wrong
 * "next" means confirming a row that was never looked at, or bouncing between
 * photos until nobody can tell what they approved.
 *
 * The rules, in priority order:
 *
 *  1. Rows with a name come before rows without one. A box a volunteer drew
 *     by hand starts nameless and can't be confirmed until it is identified,
 *     so it waits at the end instead of interrupting a run of confirms.
 *  2. The photo on screen is finished before moving to the next, wrapping
 *     round. The overlay only changes when a photo is done.
 *  3. Within a photo, the rows after the current one come first, then it
 *     wraps back to any that were skipped.
 */

export interface ReviewRow {
  uid: string;
  imageIndex?: number | null;
  name?: string | null;
}

export function nextRowToCheck<T extends ReviewRow>(
  rows: T[],
  verified: Record<string, boolean>,
  fromUid: string | null,
  currentPhoto: number,
  photoCount: number,
): T | null {
  const n = rows.length;
  const photos = Math.max(1, photoCount);
  const fromIndex = fromUid ? rows.findIndex(r => r.uid === fromUid) : -1;
  const fromPhoto = fromIndex >= 0 ? (rows[fromIndex].imageIndex ?? 0) : currentPhoto;

  let best: T | null = null;
  let bestKey = Infinity;

  rows.forEach((row, index) => {
    if (verified[row.uid] || row.uid === fromUid) return;

    const nameless = row.name?.trim() ? 0 : 1;
    const photoGap = ((((row.imageIndex ?? 0) - fromPhoto) % photos) + photos) % photos;
    const rowGap = fromIndex < 0 ? index : (index - fromIndex + n) % n;

    const key = (nameless * photos + photoGap) * n + rowGap;
    if (key < bestKey) {
      bestKey = key;
      best = row;
    }
  });

  return best;
}
