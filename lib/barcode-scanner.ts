import { expandUpce, normaliseBarcode, sameBarcode } from '../supabase/functions/_shared/gtin';
export { normaliseBarcode, sameBarcode };

export function decodeCameraBarcode(data: string, type: string): string | null {
  if (type === 'upc_e') return expandUpce(data);
  const lengths: Record<string, number> = { upc_a: 12, ean13: 13, ean8: 8, itf14: 14 };
  if (!lengths[type] || data.length !== lengths[type]) return null;
  return normaliseBarcode(data);
}

/** Require agreement across frames, without letting unrelated packages add up. */
export function createBarcodeGate() {
  let previous: { code: string; last: number } | null = null;
  return {
    reset() {
      previous = null;
    },
    read(data: string, type: string, now: number): string | null {
      const code = decodeCameraBarcode(data, type);
      if (!code) {
        previous = null;
        return null;
      }
      if (
        !previous ||
        !sameBarcode(previous.code, code) ||
        now - previous.last > 1200 ||
        now < previous.last
      ) {
        previous = { code, last: now };
        return null;
      }
      if (now - previous.last < 80) return null;
      previous = null;
      return code;
    },
  };
}
