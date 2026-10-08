import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { DIET_TAG_LABELS, isAllergenTag, type DietTag } from './diet';
import { log } from './log';
import { supabase } from './supabase';
import type { BulkLot, InventoryItem, PantryLocation, StockExitReason } from './store';

/**
 * The numbers a pantry has to report, and a way to get them out.
 *
 * MESA keeps this in spreadsheets today, and no amount of nicer inventory
 * screens will change that while the app cannot answer the two questions their
 * funders and food bank actually ask: how much food reached households, and how
 * much was wasted. Until this existed the app was something you had to keep a
 * spreadsheet ALONGSIDE, which is worse than either on its own.
 */

export interface StockExit {
  id: string;
  item_name: string;
  category: string;
  count: number;
  reason: StockExitReason;
  occurred_at: string;
}

/** Reads the exit log for a pantry since a given day. */
export async function fetchExits(
  pantryId: string,
  sinceISO: string | null,
): Promise<StockExit[]> {
  let query = supabase
    .from('stock_exits')
    .select('id, item_name, category, count, reason, occurred_at')
    .eq('pantry_id', pantryId)
    .order('occurred_at', { ascending: false });

  if (sinceISO) query = query.gte('occurred_at', sinceISO);

  const { data, error } = await query;
  if (error) {
    log.error('store', 'could not read the exit log', error);
    throw error;
  }
  return (data ?? []) as StockExit[];
}

/**
 * What nobody is taking.
 *
 * Straight out of a thread of people who rely on food banks: the carrot juice
 * nobody would touch, the V8, the same three things every week. A pantry cannot
 * tell a donor "please send something else" without a number, and the number
 * was already in the database — nothing read it.
 *
 * `days_on_shelf` is the age of the OLDEST unit of that product still on the
 * shelf, which is the honest measure of "this is not moving": a product
 * restocked weekly and given out weekly never accumulates an old unit.
 */
export interface SlowMover {
  name: string;
  category: string | null;
  units_on_shelf: number;
  days_on_shelf: number | null;
  units_given_out: number;
  units_discarded: number;
  /** Share of everything that LEFT which was binned. Null when nothing has left. */
  waste_pct: number | null;
}

/**
 * The slowest-moving products in a pantry.
 *
 * Ordered by how long the oldest unit has sat, because that is the question a
 * volunteer looking at a full shelf is actually asking. Products with nothing
 * left on the shelf are excluded — something already gone is not a problem to
 * solve, however badly it did.
 */
export async function fetchSlowMovers(
  pantryId: string,
  limit = 12,
): Promise<SlowMover[]> {
  const { data, error } = await supabase
    .from('slow_movers')
    .select('name, category, units_on_shelf, days_on_shelf, units_given_out, units_discarded, waste_pct')
    .eq('pantry_id', pantryId)
    .gt('units_on_shelf', 0)
    .order('days_on_shelf', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    log.error('store', 'could not read slow movers', error);
    throw error;
  }
  return (data ?? []) as SlowMover[];
}

/**
 * One CSV cell.
 *
 * Quoting is not optional here: product names routinely contain commas
 * ("Beans, black, 15 oz") and apostrophes ("Chef's Cupboard"), and a single
 * unquoted comma silently shifts every later column of that row — which is
 * exactly the kind of error nobody notices until the numbers have already been
 * reported to somebody.
 */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // Excel needs the BOM to read UTF-8, and pantry names contain accents.
  return '﻿' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
}

export function inventoryCsv(
  inventory: InventoryItem[],
  locations: PantryLocation[],
): string {
  const place = (id?: string | null) => locations.find(l => l.id === id)?.name ?? '';
  return toCsv(
    ['Item', 'Category', 'Count', 'Expires', 'Received', 'Condition', 'Place', 'Source', 'Known to contain', 'Notes'],
    inventory.map(i => [
      i.name,
      i.category,
      i.count,
      i.expiration ?? '',
      i.date_added,
      i.condition ?? 'ok',
      place(i.location_id),
      i.source,
      // Positive claims only. A blank cell means nobody has checked, and the
      // header says "known to contain" rather than "allergens" so a spreadsheet
      // read months later cannot be mistaken for a safety guarantee.
      (i.diet_tags ?? [])
        .filter(isAllergenTag)
        .map(t => DIET_TAG_LABELS[t as DietTag] ?? t)
        .join('; '),
      (i.diet_tags ?? [])
        .filter(t => !isAllergenTag(t))
        .map(t => DIET_TAG_LABELS[t as DietTag] ?? t)
        .join('; '),
    ]),
  );
}

/**
 * The slow movers, as something a pantry can hand a donor.
 *
 * Diet tags are in the inventory export rather than here: this sheet is an
 * argument about what to send, and the argument is the dates and the waste.
 */
export function slowMoversCsv(rows: SlowMover[]): string {
  return toCsv(
    ['Item', 'Category', 'On shelf', 'Oldest unit (days)', 'Given out', 'Thrown away', 'Waste %'],
    rows.map(r => [
      r.name,
      r.category ?? '',
      r.units_on_shelf,
      r.days_on_shelf ?? '',
      r.units_given_out,
      r.units_discarded,
      r.waste_pct ?? '',
    ]),
  );
}

export function exitsCsv(exits: StockExit[]): string {
  return toCsv(
    ['Date', 'Item', 'Category', 'Units', 'Reason'],
    exits.map(e => [
      e.occurred_at.slice(0, 10),
      e.item_name,
      e.category,
      e.count,
      e.reason,
    ]),
  );
}

export function bulkLotsCsv(lots: BulkLot[]): string {
  return toCsv(
    ['Received', 'Category', 'Weight (lb)', 'Estimated units', 'Expires', 'Source', 'Donor'],
    lots.map(l => [
      l.date_added,
      l.category,
      l.weight_lbs,
      l.est_units,
      l.expiration ?? '',
      l.source_org ?? '',
      l.source_name ?? '',
    ]),
  );
}

/**
 * Writes a CSV to a real file and opens the share sheet.
 *
 * A file rather than a wall of text on the clipboard, because the destination is
 * a spreadsheet — and because "email this to the food bank" is the actual use,
 * which needs an attachment.
 */
export async function shareCsv(filename: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  // Cache rather than documents: this is a throwaway artefact of an export, and
  // the system is welcome to reclaim it.
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: filename,
    UTI: 'public.comma-separated-values-text',
  });
}
