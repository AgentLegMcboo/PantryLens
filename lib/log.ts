/**
 * Tagged logging.
 *
 * The scan path crosses a picker, a store, an edge function and a model, and
 * when it fails on someone's phone in a pantry the only evidence is the Expo
 * console. Every line here carries a `[PantryLens:tag]` prefix so the whole
 * journey can be filtered out of React Native's very chatty output.
 *
 * Logging is on in development only — a volunteer's device should not be
 * spending cycles formatting strings nobody will read.
 */

const ENABLED = __DEV__;

type Tag = 'scan' | 'store' | 'auth' | 'nav';

function line(level: 'log' | 'warn' | 'error', tag: Tag, message: string, detail?: unknown) {
  if (!ENABLED && level === 'log') return;
  const prefix = `[PantryLens:${tag}]`;
  if (detail === undefined) console[level](prefix, message);
  else console[level](prefix, message, detail);
}

export const log = {
  debug: (tag: Tag, message: string, detail?: unknown) => line('log', tag, message, detail),
  warn: (tag: Tag, message: string, detail?: unknown) => line('warn', tag, message, detail),
  error: (tag: Tag, message: string, detail?: unknown) => line('error', tag, message, detail),

  /**
   * Times an async step and logs both ends, so a hang is visibly a hang rather
   * than an absence of output. Re-throws untouched — this observes, it does not
   * handle.
   */
  async step<T>(tag: Tag, name: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    line('log', tag, `▶ ${name}`);
    try {
      const result = await fn();
      line('log', tag, `✔ ${name} (${Date.now() - started}ms)`);
      return result;
    } catch (err) {
      line('error', tag, `✖ ${name} failed after ${Date.now() - started}ms`, err);
      throw err;
    }
  },
};

/** Trims a base64 payload down to something loggable. */
export const describeImage = (b64: string) =>
  `${(b64.length * 0.75 / 1024).toFixed(0)}KB (${b64.length} b64 chars)`;
