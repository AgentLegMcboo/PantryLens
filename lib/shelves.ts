import type { PantryLocation } from './store';

export type OrderedShelf = {
  loc: PantryLocation;
  /** 0 for a shelf, 1 for a sub-shelf. */
  depth: 0 | 1;
  /** "Back room" or "Back room › Top shelf". */
  label: string;
};

const bySortOrder = (a: PantryLocation, b: PantryLocation) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/**
 * Shelves in walking order: each shelf, then its sub-shelves under it.
 * A sub-shelf whose parent is missing (deleted elsewhere, not yet synced)
 * is shown as a shelf rather than hidden.
 */
export function orderShelves(locations: PantryLocation[]): OrderedShelf[] {
  const ids = new Set(locations.map(l => l.id));
  const top = locations.filter(l => !l.parent_id || !ids.has(l.parent_id)).sort(bySortOrder);
  const out: OrderedShelf[] = [];
  for (const shelf of top) {
    out.push({ loc: shelf, depth: 0, label: shelf.name });
    for (const sub of locations.filter(l => l.parent_id === shelf.id).sort(bySortOrder)) {
      out.push({ loc: sub, depth: 1, label: `${shelf.name} › ${sub.name}` });
    }
  }
  return out;
}

/** id → full label, for showing where an item lives. */
export function shelfLabels(locations: PantryLocation[]): Record<string, string> {
  return Object.fromEntries(orderShelves(locations).map(s => [s.loc.id, s.label]));
}
