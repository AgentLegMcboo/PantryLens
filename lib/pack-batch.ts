import type { PackRequest, PackResult } from './store';

/** Save one identifiable run per box, refreshing stock once for the batch.
 * Callers retain the same run IDs when retrying; pack_boxes deduplicates them.
 */
export async function persistPackBatch(
  packs: PackRequest[],
  submit: (pack: PackRequest) => Promise<PackResult>,
  refresh: () => Promise<void>,
): Promise<PackResult> {
  const combined: PackResult = { units_taken: 0, shortfalls: [], replayed: true };
  try {
    for (const pack of packs) {
      const result = await submit(pack);
      combined.units_taken += result.units_taken;
      combined.shortfalls.push(...result.shortfalls);
      combined.replayed = combined.replayed && result.replayed;
    }
  } catch (error) {
    // Earlier boxes may already be saved. Reflect them even if a later one
    // failed, and preserve the write error if the refresh also loses connection.
    await refresh().catch(() => {});
    throw error;
  }
  await refresh();
  return combined;
}
