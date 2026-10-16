export interface ProfilePhotoIO {
  upload: (path: string, bytes: ArrayBuffer) => Promise<void>;
  save: (path: string | null) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

/** Commit the new reference before retiring the old object. */
export async function changeProfilePhoto(
  userId: string,
  previousPath: string | null,
  next: { path: string; bytes: ArrayBuffer } | null,
  io: ProfilePhotoIO,
): Promise<void> {
  const owns = (path: string) => path.startsWith(`${userId}/`) && /^[\w-]+\/[\w-]+\.jpg$/.test(path);
  if (!userId || (next && (!owns(next.path) || next.path === previousPath))) {
    throw new Error('Invalid profile photo path.');
  }
  if (next && (next.bytes.byteLength === 0 || next.bytes.byteLength > 2097152)) {
    throw new Error('Choose a photo smaller than 2 MB.');
  }
  if (next) await io.upload(next.path, next.bytes);
  try {
    await io.save(next?.path ?? null);
  } catch (error) {
    if (next) await io.remove(next.path).catch(() => {});
    throw error;
  }
  // A failed cleanup must not turn an already-saved change into an error.
  if (previousPath && owns(previousPath)) await io.remove(previousPath).catch(() => {});
}

/** Hermes-safe decoding with an exactly-sized request body. */
export function profilePhotoBytes(input: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let buffer = 0, bits = 0, length = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[length++] = (buffer >> bits) & 255;
    }
  }
  return bytes.buffer.slice(0, length);
}
