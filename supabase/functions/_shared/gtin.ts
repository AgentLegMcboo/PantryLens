/** Shared by the camera and both Edge Functions; never repair guessed digits. */
export function normaliseBarcode(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^[\d\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/[\s-]/g, '');
  if (![8, 12, 13, 14].includes(digits.length) || /^0+$/.test(digits)) return null;
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 2; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : null;
}

/** GS1 zero padding identifies the same item; a nonzero case indicator does not. */
export function sameBarcode(a: unknown, b: unknown): boolean {
  const left = normaliseBarcode(a);
  const right = normaliseBarcode(b);
  return !!left && !!right && left.padStart(14, '0') === right.padStart(14, '0');
}

export function barcodeVariants(raw: string): string[] {
  const barcode = normaliseBarcode(raw);
  if (!barcode) return [];
  const full = barcode.padStart(14, '0');
  return [
    ...new Set([
      barcode,
      ...[8, 12, 13, 14].flatMap((length) => {
        const shorter = full.slice(-length);
        return sameBarcode(full, shorter) ? [shorter] : [];
      }),
    ]),
  ];
}

/** UPC-E uses the check digit of its expanded UPC-A, not an EAN-8 checksum. */
export function expandUpce(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^[01]\d{7}$/.test(raw)) return null;
  const body = raw.slice(1, 7);
  const last = body[5];
  const payload =
    last <= '2'
      ? body.slice(0, 2) + last + '0000' + body.slice(2, 5)
      : last === '3'
        ? body.slice(0, 3) + '00000' + body.slice(3, 5)
        : last === '4'
          ? body.slice(0, 4) + '00000' + body[4]
          : body.slice(0, 5) + '0000' + last;
  return normaliseBarcode(raw[0] + payload + raw[7]);
}
