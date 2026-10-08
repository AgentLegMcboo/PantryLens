/**
 * Dates, in one place.
 *
 * Five screens and the allocator each worked this out for themselves, and they
 * did not agree:
 *
 *  - The allocator hardcoded a 30-day warning window while Settings offered
 *    14, 21 or 30. Choosing 14 changed four screens and left box building on 30.
 *  - Three of them built "today" with `new Date().toISOString()`, which is UTC.
 *    For a pantry in California that is tomorrow from 4pm onwards, so an item
 *    expiring today read as expiring yesterday for the last third of every day.
 *  - Two compared a `Date` parsed from `"2026-09-20"` (UTC midnight) against a
 *    local `Date`, which is the same mistake in the other direction.
 *
 * Everything here works in the pantry's own local day, as a plain `YYYY-MM-DD`
 * string, because that is what the database column holds and comparing those
 * strings is exact. No timezone arithmetic, no `Date` maths at the boundary.
 */

/** What Settings offers, and what the allocator now actually follows. */
export const WARNING_WINDOW_CHOICES = [14, 21, 30] as const;
export const DEFAULT_WARNING_DAYS = 30;

/** Local calendar date as YYYY-MM-DD. Never UTC — see the note above. */
export function todayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The far edge of a window: the last date still counted as "soon". */
export function windowEndISO(days: number, now: Date = new Date()): string {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + Math.max(0, Math.round(days)));
  return todayISO(end);
}

/**
 * Whether this date has already gone by.
 *
 * Strictly before today. Something dated today is still good today — these are
 * mostly "best by" dates on tinned food, not a safety cutoff at midnight — so
 * it stays usable and simply sorts to the front of the queue.
 */
export function isPastDate(expiration: string | null | undefined, today = todayISO()): boolean {
  if (!expiration) return false;
  return expiration < today;
}

/** Inside the pantry's chosen window, past dates included. */
export function isExpiringSoon(
  expiration: string | null | undefined,
  windowDays: number,
  now: Date = new Date(),
): boolean {
  if (!expiration) return false;
  return expiration <= windowEndISO(windowDays, now);
}

/** Whole days from today until the date; negative once past, null with no date. */
export function daysUntil(
  expiration: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiration) return null;
  const then = new Date(`${expiration}T00:00:00`).getTime();
  if (Number.isNaN(then)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((then - today) / 86400000);
}
