/** A rounded lens's inward surface normals, encoded for SVG displacement.
 * Generated on layout changes only; never snapshots or copies application data.
 */
export function createLensMap(width: number, height: number, radius: number) {
  const ratio = Math.min(1, 900 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  const r = Math.min(radius * ratio, w / 2, h / 2);
  const band = Math.min(18 * ratio, r, h / 2);
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      const qx = Math.abs(dx) - (w / 2 - r);
      const qy = Math.abs(dy) - (h / 2 - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const distance = outside + Math.min(Math.max(qx, qy), 0) - r;
      let nx = 0, ny = 0;
      if (outside > 0) {
        nx = Math.sign(dx) * ox / outside;
        ny = Math.sign(dy) * oy / outside;
      } else if (qx > qy) nx = Math.sign(dx);
      else ny = Math.sign(dy);
      const strength = distance <= 0 && band > 0
        ? Math.pow(Math.max(0, 1 + distance / band), 1.5) : 0;
      const i = (y * w + x) * 4;
      pixels[i] = 128 - nx * strength * 127;
      pixels[i + 1] = 128 - ny * strength * 127;
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
  }
  return { width: w, height: h, pixels };
}
