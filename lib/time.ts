/**
 * "3h ago", for anything a volunteer reads as recent history.
 *
 * Nobody standing by a stack of boxes wants "2026-09-16T14:22:09.481Z". They
 * want to know whether these were packed this morning or last week.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
