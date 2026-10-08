import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { AuditWrite, CountedRow } from './audit';
import { normaliseDietTags, type DietTag } from './diet';
import { finishScan, SCAN_PHOTO_BUCKET, type ScanOutcome, type StartedScan } from './scan-history';
import { itemsPerBox, normaliseRules } from './box-presets';
import { log } from './log';
import { ADMIN_ONLY_MESSAGE, asRole, canEditPantry, type PantryRole } from './permissions';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { createOutbox, isNetworkError, type IntakeJob } from './outbox';

const intakeOutbox = createOutbox(AsyncStorage, 'pantrylens.intake-outbox.v1');
let flushPromise: Promise<void> | null = null;
function requireAdmin(settings: Settings): asserts settings is Settings & { pantryId: string } {
  if (!settings.pantryId) throw new Error('Choose a pantry before saving.');
  if (!canEditPantry(settings.userRole)) throw new Error('Only a pantry admin can change these settings.');
}
async function sendIntake(job: IntakeJob) {
  const { error } = await supabase.rpc('commit_intake', {
    batch_id: job.id, target_pantry: job.pantryId, intake_source: job.source,
    target_location: job.locationId, intake_items: job.items,
    intake_photos: job.photos, captured_at: job.createdAt,
  });
  if (error) throw error;
  if (job.scan) await finishScan(job.scan.id, job.scan.outcomes);
}

export type Category = 'grain' | 'vegetable' | 'protein' | 'breakfast' | 'snack' | 'hygiene' | 'baby' | 'unknown';

/**
 * Result of the manual inspection every item gets before shelving. Anything
 * other than 'ok' is held out of box building until a human clears it.
 */
export type Condition = 'ok' | 'dented' | 'rusted' | 'seal_broken' | 'expired';

/** Who the food came from. Grocery rescue is the most common at MESA. */
export type SourceOrg = 'grocery' | 'food_bank' | 'drive' | 'individual' | 'other';

export const CONDITION_LABELS: Record<Condition, string> = {
  ok: 'Good',
  dented: 'Dented',
  rusted: 'Rusted',
  seal_broken: 'Seal broken',
  expired: 'Expired',
};

export const SOURCE_ORG_LABELS: Record<SourceOrg, string> = {
  grocery: 'Grocery rescue',
  food_bank: 'Food bank',
  drive: 'Food drive',
  individual: 'Individual',
  other: 'Other',
};

export const isUsableCondition = (c: Condition | undefined) => (c ?? 'ok') === 'ok';

/**
 * What the barcode scanner found, addressed to the row that opened it.
 *
 * `uid` is the review screen's own row id rather than an inventory id, because
 * none of these rows exist in the database yet.
 */
export interface PendingBarcode {
  uid: string;
  barcode: string;
  name: string;
  category: Category | null;
  /** The manufacturer's pack shot, if the provider had one. */
  imageUrl: string | null;
  /** Allergens and diet from the product database. See lib/diet.ts. */
  dietTags: DietTag[];
}

/** A review photo; durable intake jobs and verified scan history retain it. */
export interface ScanPhoto {
  uri: string;
  width: number;
  height: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  count: number;
  expiration: string | null;
  /** When the pantry received it. This is the FIFO basis. */
  date_added: string;
  source: 'donation' | 'shelf_audit' | 'manual';
  confidence?: number;
  condition?: Condition;
  source_org?: SourceOrg | null;
  source_name?: string | null;
  bulk_lot_id?: string | null;
  /** Which shelf or bin this sits on. Null is a normal state, not an error. */
  location_id?: string | null;
  /**
   * A pack shot from a barcode lookup, or a crop of the scan photo living in the
   * item-photos bucket. Null means the row shows its category icon instead.
   */
  image_url?: string | null;
  /**
   * Allergens, diet and whether somebody without a kitchen can use it.
   *
   * `contains-*` entries are positive claims. An EMPTY ARRAY MEANS NOTHING IS
   * KNOWN, not that the food is free of anything — see lib/diet.ts, where the
   * whole app's wording about this lives.
   */
  diet_tags?: DietTag[];
}

/**
 * A weighed bulk donation. Pantries weigh big grocery/food-bank drops and record
 * the weight — they do not count cans. Weight is the recorded truth; est_units
 * is a derived estimate so the load still counts toward box building.
 */
export interface BulkLot {
  id: string;
  category: Category;
  weight_lbs: number;
  est_units: number;
  expiration: string | null;
  date_added: string;
  source_org?: SourceOrg | null;
  source_name?: string | null;
  notes?: string | null;
}

/**
 * A place in the room: "Shelf A", "Freezer", "Back room", "Bin 3".
 *
 * MESA's process sorts donations onto tables and into bins, then shelves them.
 * Category says what a thing IS; this says where to walk to find it, and the two
 * are genuinely different questions.
 */
export interface PantryLocation {
  id: string;
  pantry_id: string;
  name: string;
  sort_order: number;
  /**
   * What belongs here. A pantry's bins are labelled by what goes in them, so
   * this is a rule rather than a note: a scan uses it to file itself. Empty
   * means the place takes anything.
   */
  categories: Category[];
}

/**
 * Why stock left.
 *
 * "Given to a family", "thrown out mouldy" and "I typed this in twice" used to
 * be the same event — a row disappearing. They are three different facts, and
 * two of them are numbers a pantry has to report.
 */
export type ExitReason = 'given_out' | 'discarded' | 'correction';

/**
 * Every reason a stock_exits row can carry. 'packed' is written by pack_boxes,
 * never chosen by a volunteer, which is why it isn't part of ExitReason.
 */
export type StockExitReason = ExitReason | 'packed';

/**
 * What the server did with a counted shelf.
 *
 * `skipped` and `conflicts` are the lines it refused to apply because the row
 * had changed since the count was reconciled — somebody shelving a donation
 * onto that shelf while the volunteer walked back. `untouched` is rows on the
 * shelf the count never mentioned, which are deliberately left alone.
 */
export interface AuditResult {
  audit_id: string;
  location_name: string;
  units_before: number;
  units_after: number;
  corrected: number;
  added: number;
  removed: number;
  unchanged: number;
  skipped: number;
  untouched: number;
  conflicts: { name: string; reason: 'changed' | 'gone'; expected?: number; actual?: number }[];
}

/** One line of a packed checklist: a real item, or units from a weighed lot. */
export interface PackLine {
  kind: 'item' | 'lot';
  id: string;
  count: number;
}

/** What the server did with a pack. See supabase/migrations/..._pack_boxes.sql. */
export interface PackResult {
  units_taken: number;
  /**
   * Lines the shelf could not fully cover because the stock was already gone
   * (usually because someone else packed it first). `taken` is what was
   * actually deducted.
   */
  shortfalls: { id: string; wanted: number; taken: number }[];
  /** True when this run id had already been packed and nothing new happened. */
  replayed: boolean;
}

/** A packed batch still waiting, in whole or in part, for families to collect. */
export interface PackRun {
  id: string;
  box_name: string | null;
  boxes: number;
  boxes_collected: number;
  units_taken: number;
  /** What one box holds, by category. Null for packs made by an older build. */
  per_box: BoxRules | null;
  created_at: string;
  /** The batch's own name ("Garcia family"). Null means show the box type. */
  label: string | null;
  /** A batch folder, or null for unfiled. */
  folder_id: string | null;
}

export interface CollectResult {
  /** False when the batch had already moved on; nothing was recorded. */
  applied: boolean;
  boxes: number;
  boxes_collected: number;
}

export const EXIT_LABELS: Record<ExitReason, string> = {
  given_out: 'Given out',
  discarded: 'Thrown away',
  correction: 'Removed',
};

/**
 * A named, reusable box: what goes in it, and whether that scales with the
 * household. See supabase/migrations/..._box_templates.sql.
 */
export interface BoxTemplate {
  id: string;
  pantry_id: string;
  name: string;
  rules: BoxRules;
  /** Amounts are for a family of 4 and scale with household size. Off for per-person kits. */
  scales_with_family: boolean;
  /** Nothing known to carry these goes in. "Wheat-free box". */
  excludes_tags: DietTag[];
  /** Everything in it must carry all of these. "No-cook box". */
  requires_tags: DietTag[];
  /** The pantry's default: what Needs, the dashboard and Build start from. */
  is_default: boolean;
  /** A box-type folder, or null for unfiled. */
  folder_id: string | null;
}

/**
 * Box types and packed batches each have their own folders. They are separate
 * jobs (organising recipes vs organising what's waiting at the door) and the
 * database refuses to mix them.
 */
export type BoxFolderKind = 'template' | 'packed';

export interface BoxFolder {
  id: string;
  pantry_id: string;
  kind: BoxFolderKind;
  name: string;
  sort_order: number;
}

export type LbsPerUnit = Record<Category, number>;

export const DEFAULT_LBS_PER_UNIT: LbsPerUnit = {
  grain: 1.2,
  vegetable: 1.0,
  protein: 1.0,
  breakfast: 1.5,
  snack: 0.5,
  hygiene: 1.0,
  baby: 0.8,
  unknown: 1.0,
};

export interface BoxRules {
  grain: number;
  vegetable: number;
  protein: number;
  breakfast: number;
  snack: number;
  hygiene: number;
  baby: number;
}

export interface CategoryThresholds {
  grain: number;
  vegetable: number;
  protein: number;
  breakfast: number;
  snack: number;
  hygiene: number;
  baby: number;
}

/**
 * Boxes per distribution, before a pantry says otherwise.
 *
 * 12 because that is the number the code has always assumed. It is a starting
 * point now rather than a fact.
 */
export const DEFAULT_BOX_TARGET = 12;

export interface Settings {
  pantryId: string | null;
  pantryName: string;
  expirationWarningDays: number;
  defaultFamilySize: number;
  /**
   * How many boxes this pantry expects to send out in a distribution.
   *
   * Needs measures every "stopping boxes going out" shortfall against it, and
   * Build opens on it. It was the literal number 12 in three separate files —
   * so every flyer a pantry printed asked donors for enough food for twelve
   * families, whether they served six or sixty, and nobody had chosen that.
   */
  dropOffDetails: string;
  boxTarget: number;
  /** What this signed-in person may do here. Enforced by the database, not by this. */
  userRole: PantryRole;
  /** The code new volunteers type to join. Read-only; only create_pantry sets it. */
  inviteCode: string;
  /** Where donors bring food ("Rear entrance, 12 Main St"). Empty until set. */
  dropoffLocation: string;
  /** When they can bring it ("Mon–Fri, 9am–4pm"). Empty until set. */
  dropoffHours: string;
}

/**
 * One person on the pantry's roster.
 *
 * Comes from list_pantry_members, not from a table read: pantry_members holds
 * user ids, and the email that makes an id a person lives in auth.users, which
 * no client can read. The function joins the two for members of that pantry
 * only, so a roster never becomes a directory.
 */
export interface PantryMember {
  user_id: string;
  email: string;
  role: PantryRole;
  joined_at: string;
}

export interface Activity {
  id: string;
  text: string;
  time: string;
  icon: string;
}

/** Where crops of the pantry's own scan photos live. */
export const ITEM_PHOTO_BUCKET = 'item-photos';

/**
 * The object path inside our bucket, or null if this URL is not ours.
 *
 * Public bucket URLs look like
 * .../storage/v1/object/public/item-photos/<pantry>/<item>.jpg
 */
export function ownedPhotoPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${ITEM_PHOTO_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  return path || null;
}

const DEFAULT_BOX_RULES: BoxRules = { grain: 2, vegetable: 2, protein: 2, breakfast: 1, snack: 1, hygiene: 1, baby: 0 };
const DEFAULT_THRESHOLDS: CategoryThresholds = { grain: 15, vegetable: 15, protein: 15, breakfast: 10, snack: 10, hygiene: 8, baby: 5 };

/**
 * Live subscription to the pantry's tables.
 *
 * Held at module scope because `fetchData` both creates the subscription and is
 * what the subscription calls. Re-subscribing from inside the callback stacked a
 * new channel on every single row change — each one then firing its own refetch,
 * which subscribed again. Tearing the old one down first makes re-entry safe,
 * and gives sign-out something to close.
 */
let pantryChannel: ReturnType<typeof supabase.channel> | null = null;

/**
 * Hand-outs go to the server one at a time, in the order they were tapped.
 * Each one says how many boxes it expects are already collected, and that only
 * holds if the tap before it has landed.
 */
let collectQueue: Promise<unknown> = Promise.resolve();
let subscribedPantryId: string | null = null;

function subscribeToPantry(pantryId: string, onChange: () => void) {
  // Already listening to this pantry — the callback would only duplicate work.
  if (subscribedPantryId === pantryId && pantryChannel) return;

  unsubscribeFromPantry();
  subscribedPantryId = pantryId;

  const filter = `pantry_id=eq.${pantryId}`;
  pantryChannel = supabase
    .channel(`pantry:${pantryId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter }, onChange)
    // Bulk lots and activities move stock and the dashboard too, and were never
    // watched — a lot logged on one phone stayed invisible on another.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bulk_lots', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'locations', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'box_templates', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pack_runs', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'box_folders', filter }, onChange)
    .subscribe();
}

/**
 * Removes a pantry's photographs from both buckets.
 *
 * SQL cannot reach storage, so the server functions hand back the path prefix
 * and this does the rest. Deliberately best-effort and never thrown from:
 * orphaned thumbnails are untidy, and failing a reset over them would be worse.
 */
async function clearPantryPhotos(pantryId: string): Promise<void> {
  for (const bucket of [ITEM_PHOTO_BUCKET, SCAN_PHOTO_BUCKET]) {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(pantryId, { limit: 1000 });
      if (error || !data?.length) continue;

      // Scan photos sit one folder deeper, under {pantry}/{scan}/n.jpg, so a
      // listing returns folders rather than files and each needs opening.
      const paths: string[] = [];
      for (const entry of data) {
        if (entry.id) {
          paths.push(`${pantryId}/${entry.name}`);
          continue;
        }
        const { data: inner } = await supabase.storage
          .from(bucket)
          .list(`${pantryId}/${entry.name}`, { limit: 1000 });
        for (const file of inner ?? []) paths.push(`${pantryId}/${entry.name}/${file.name}`);
      }

      if (paths.length > 0) {
        await supabase.storage.from(bucket).remove(paths);
        log.debug('store', `removed ${paths.length} file(s) from ${bucket}`);
      }
    } catch (err) {
      log.warn('store', `could not clear ${bucket} for ${pantryId}`, err);
    }
  }
}

function unsubscribeFromPantry() {
  if (pantryChannel) supabase.removeChannel(pantryChannel);
  pantryChannel = null;
  subscribedPantryId = null;
}

/**
 * Coalesces a burst of row changes into one refetch. Saving a donation inserts
 * a dozen rows at once, and without this each one pulled the whole pantry down
 * again — twelve round trips to land the same state.
 */
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefetch(run: () => void) {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    run();
  }, 300);
}

/** Whether the intro has been completed. Persisted so it only ever shows once. */
export const ONBOARDING_KEY = 'pantrylens.onboarded';

interface AppState {
  session: Session | null;
  /** null while still being read from storage — routing must wait on it. */
  onboarded: boolean | null;
  inventory: InventoryItem[];
  bulkLots: BulkLot[];
  lbsPerUnit: LbsPerUnit;
  boxRules: BoxRules;
  thresholds: CategoryThresholds;
  settings: Settings;
  activities: Activity[];
  locations: PantryLocation[];
  boxTemplates: BoxTemplate[];
  /** Packed boxes that families haven't collected yet. */
  readyBoxes: PackRun[];
  boxFolders: BoxFolder[];
  isLoaded: boolean;
  currentDraft: InventoryItem[];
  /** The pantry's roster. Empty until Team is opened or a refresh fills it. */
  members: PantryMember[];
  /** The photos the current draft was read from, so review can point at them. */
  currentScanPhotos: ScanPhoto[];
  /**
   * A resolved barcode waiting to be collected by Review & Verify.
   *
   * The scanner is a pushed screen, and a pushed screen has no way to hand a
   * value back to the one that opened it. Parking the result here — keyed by the
   * row that asked for it — is how the answer finds its way home. Cleared the
   * moment it is consumed, so a stale hit can never land on a later row.
   */
  pendingBarcode: PendingBarcode | null;
  /** Who the draft being reviewed came from, carried from the intake screen. */
  draftSource: SourceOrg | null;
  draftLocationId: string | null;
  draftCapturedAt: string | null;
  pendingIntakes: number;
  syncError: string | null;
  syncing: boolean;
  flushIntakes: () => Promise<void>;
  setDraftLocation: (id: string | null) => void;
  /**
   * The open scan record the current draft belongs to, if one was opened.
   *
   * Null is a normal state, not an error: scan history is best-effort, and a
   * review whose record failed to open still saves exactly as it always did.
   */
  currentScan: StartedScan | null;
  /**
   * A shelf that has been counted but not yet reconciled.
   *
   * Parked here for the same reason a scanned barcode is: the count happens on
   * one pushed screen and is read on the next, and a pushed screen has no way
   * to hand a value forward. Cleared once it has been applied or abandoned.
   */
  auditDraft: { locationId: string; photos: number; counted: CountedRow[] } | null;

  // Actions
  initialize: () => Promise<void>;
  fetchData: () => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setActivePantry: (pantryId: string, pantryName: string, role: string) => void;

  fetchMembers: () => Promise<void>;
  setMemberRole: (userId: string, role: 'admin' | 'volunteer') => Promise<void>;
  transferOwnership: (userId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;

  addBulkLot: (lot: Omit<BulkLot, 'id'>) => Promise<void>;
  deleteBulkLot: (id: string) => Promise<void>;
  updateLbsPerUnit: (updates: Partial<LbsPerUnit>) => Promise<void>;

  addLocation: (name: string) => Promise<void>;
  renameLocation: (id: string, name: string) => Promise<void>;
  setLocationCategories: (id: string, categories: Category[]) => Promise<void>;
  /** Where a freshly scanned item of this category should be filed. */
  defaultLocationFor: (category: Category) => string | null;
  recordExit: (ids: string[], reason: ExitReason) => Promise<void>;
  applyShelfAudit: (locationId: string, photos: number, writes: AuditWrite[]) => Promise<AuditResult>;

  /** Empties the shelf and the history, keeping shelves, box types, team and settings. */
  resetPantryData: () => Promise<Record<string, number>>;
  /** Deletes the pantry outright. Everyone is unenrolled and this device lands on selection. */
  deletePantry: () => Promise<string>;
  /** Makes the intro play again on next launch. Local to this device. */
  replayOnboarding: () => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  addItems: (
    items: Partial<InventoryItem>[],
    source?: 'donation' | 'shelf_audit' | 'manual',
    /** The scan record these rows came from, when there is one. */
    scanId?: string | null,
    scanOutcomes?: ScanOutcome[],
  ) => Promise<'synced' | 'queued'>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  updateItems: (ids: string[], updates: Partial<InventoryItem>) => Promise<void>;
  getItem: (id: string) => InventoryItem | undefined;
  deductItems: (itemsToDeduct: { id: string; count: number }[], packingId: string) => Promise<void>;
  packBoxes: (pack: {
    runId: string;
    boxCount: number;
    lines: PackLine[];
    boxName?: string | null;
    perBox?: BoxRules | null;
  }) => Promise<PackResult>;
  collectBoxes: (runId: string, count: number) => Promise<CollectResult>;
  updatePackRun: (id: string, changes: { label: string | null; folderId: string | null }) => Promise<void>;
  addBoxFolder: (kind: BoxFolderKind, name: string) => Promise<BoxFolder>;
  renameBoxFolder: (id: string, name: string) => Promise<void>;
  deleteBoxFolder: (id: string) => Promise<void>;
  
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  saveBoxTemplate: (box: {
    id?: string;
    name: string;
    rules: BoxRules;
    scalesWithFamily: boolean;
    folderId?: string | null;
    /** Nothing known to carry these goes in. */
    excludesTags?: DietTag[];
    /** Everything in the box must carry all of these. */
    requiresTags?: DietTag[];
  }) => Promise<BoxTemplate>;
  deleteBoxTemplate: (id: string) => Promise<void>;
  setDefaultBoxTemplate: (id: string) => Promise<void>;
  updateBoxRules: (updates: Partial<BoxRules>) => Promise<void>;
  updateThresholds: (updates: Partial<CategoryThresholds>) => Promise<void>;
  
  setDraft: (items: InventoryItem[], photos?: ScanPhoto[], capturedAt?: string) => void;
  setPendingBarcode: (value: PendingBarcode | null) => void;
  setDraftSource: (value: SourceOrg | null) => void;
  setAuditDraft: (value: AppState['auditDraft']) => void;
  setCurrentScan: (value: StartedScan | null) => void;
  addActivity: (text: string, icon?: string) => Promise<void>;
}

/**
 * Writes to the pantry row and insists on knowing whether it landed.
 *
 * Only a manager may change a pantry, and PostgREST reports row-level security
 * refusing an UPDATE as success with zero rows rather than as an error. A plain
 * `.update()` is therefore indistinguishable from one that worked. Every caller
 * here sets local state first so the control feels immediate, which means
 * without this check a volunteer watches their change stick and then vanish at
 * the next refresh, with nothing ever having said no.
 *
 * `revert` puts the optimistic change back. The thrown error is the sentence
 * the screen shows.
 */
async function writePantryRow(
  patch: Record<string, unknown>,
  pantryId: string,
  role: PantryRole,
  revert: () => void,
): Promise<void> {
  // Saves a round trip whose only possible answer is no, and lets the screen
  // say why instead of "please try again".
  if (!canEditPantry(role)) {
    revert();
    throw new Error(ADMIN_ONLY_MESSAGE);
  }

  const { data, error } = await supabase
    .from('pantries')
    .update(patch)
    .eq('id', pantryId)
    .select('id');

  if (error || !data || data.length === 0) {
    revert();
    log.warn('store', `pantry update refused (${Object.keys(patch).join(', ')})`, error ?? 'no rows');
    throw error ?? new Error(ADMIN_ONLY_MESSAGE);
  }
}

export const usePantryStore = create<AppState>((set, get) => ({
  session: null,
  onboarded: null,
  inventory: [],
  bulkLots: [],
  lbsPerUnit: DEFAULT_LBS_PER_UNIT,
  boxRules: DEFAULT_BOX_RULES,
  thresholds: DEFAULT_THRESHOLDS,
  settings: {
    pantryId: null,
    pantryName: '',
    expirationWarningDays: 30,
    defaultFamilySize: 4,
    boxTarget: DEFAULT_BOX_TARGET,
    userRole: 'volunteer',
    inviteCode: '',
    dropoffLocation: '',
    dropoffHours: '',
    dropOffDetails: '',
  },
  activities: [],
  members: [],
  locations: [],
  boxTemplates: [],
  readyBoxes: [],
  boxFolders: [],
  isLoaded: false,
  currentDraft: [],
  currentScanPhotos: [],
  pendingBarcode: null,
  draftSource: null,
  draftLocationId: null,
  draftCapturedAt: null,
  pendingIntakes: 0,
  syncing: false,
  syncError: null,
  setDraftLocation: id => set({ draftLocationId: id }),
  flushIntakes: async () => {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      const userId = get().session?.user.id;
      if (!userId) return;
      set({ syncing: true });
      try {
        const jobs = (await intakeOutbox.list()).filter(j => j.userId === userId);
        set({ pendingIntakes: jobs.length });
        for (const job of jobs) {
          if (get().session?.user.id !== userId) break;
          await sendIntake(job);
          await intakeOutbox.remove(job.id);
          set({ pendingIntakes: (await intakeOutbox.list()).filter(j => j.userId === userId).length, syncError: null });
        }
        if (jobs.length) await get().fetchData();
      } catch (error: any) {
        set({ syncError: isNetworkError(error) ? 'Waiting for a connection. Your intake is saved on this device.' : (error?.message ?? 'Sync failed. Your intake is still saved on this device.') });
      } finally {
        set({ syncing: false });
      }
    })().finally(() => { flushPromise = null; });
    return flushPromise;
  },
  auditDraft: null,
  currentScan: null,

  initialize: async () => {
    if (__DEV__) {
      // In development the intro replays on every launch while signed out, so it
      // can be iterated on without wiping app data. It still completes normally
      // within a session — completeOnboarding() flips this in memory — so the
      // Get Started button routes onward exactly as it does in production.
      set({ onboarded: false });
    } else {
      // Read before any routing decision, so a returning volunteer is never
      // flashed the intro.
      AsyncStorage.getItem(ONBOARDING_KEY)
        .then(v => set({ onboarded: v === '1' }))
        .catch(() => set({ onboarded: true }));
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session });
      if (session) { get().fetchData(); get().flushIntakes(); }
      else set({ isLoaded: true });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      if (session) {
        get().fetchData();
        get().flushIntakes();
      } else {
        // Clear state on sign out
        unsubscribeFromPantry();
        set({
          inventory: [],
          bulkLots: [],
          activities: [],
          locations: [],
          currentDraft: [], currentScanPhotos: [], draftSource: null, draftLocationId: null, draftCapturedAt: null,
          pendingIntakes: 0, syncError: null,
          currentScan: null, auditDraft: null, pendingBarcode: null,
          boxTemplates: [],
          readyBoxes: [],
          boxFolders: [],
          members: [],
          settings: {
            ...get().settings,
            pantryId: null,
            pantryName: '',
            // Back to the least access. Signing in as somebody else must never
            // inherit the last person's controls, even for the moment before
            // their own pantry loads.
            userRole: 'volunteer',
            inviteCode: '',
            dropoffLocation: '',
            dropoffHours: '',
            dropOffDetails: '',
          },
          isLoaded: true,
          // Signing out in development drops you back at the intro too, so it is
          // reachable without relaunching.
          ...(__DEV__ ? { onboarded: false } : null)
        });
      }
    });
  },

  fetchData: async () => {
    const { session } = get();
    if (!session?.user) return;

    try {
      // 1. Get user's pantry
      let membership = supabase
        .from('pantry_members')
        .select('pantry_id, role, pantries(name, invite_code, box_rules, thresholds, lbs_per_unit, settings)')
        .eq('user_id', session.user.id);
      if (get().settings.pantryId) membership = membership.eq('pantry_id', get().settings.pantryId!);
      const { data: members, error: membershipError } = await membership
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (get().session?.user.id !== session.user.id) return;

      if (!members?.pantries) {
        log.warn('store', 'signed in but not a member of any pantry');
      }

      if (members && members.pantries) {
        const pantryId = members.pantry_id;
        const pantries = members.pantries as any;
        const pantry = Array.isArray(pantries) ? pantries[0] : pantries;

        // Stored per pantry so every volunteer sees the same windows, and so the
        // numbers survive a relaunch. Merged over defaults, which means a pantry
        // row written before this column existed still reads sensibly.
        const stored = (pantry.settings || {}) as Record<string, unknown>;
        const text = (v: unknown) => (typeof v === 'string' ? v : '');

        set(state => ({
          settings: {
            ...state.settings,
            pantryId,
            pantryName: pantry.name,
            userRole: asRole(members.role),
            inviteCode: pantry.invite_code ?? '',
            expirationWarningDays: (stored.expiration_warning_days as number) ?? 30,
            defaultFamilySize: (stored.default_family_size as number) ?? 4,
            boxTarget: (stored.box_target as number) ?? DEFAULT_BOX_TARGET,
            dropoffLocation: text(stored.dropoff_location) || text(stored.drop_off_details),
            dropoffHours: text(stored.dropoff_hours),
            dropOffDetails: text(stored.drop_off_details),
          },
          boxRules: (pantry.box_rules as BoxRules) || DEFAULT_BOX_RULES,
          thresholds: (pantry.thresholds as CategoryThresholds) || DEFAULT_THRESHOLDS,
          // Merged so a category missing from the stored JSON still has a value.
          lbsPerUnit: { ...DEFAULT_LBS_PER_UNIT, ...(pantry.lbs_per_unit || {}) }
        }));

        // Inventory, bulk lots and activities depend only on pantryId, not on
        // each other. Awaited one after another they cost three round trips of
        // latency back to back, and the launch splash was held open for every
        // millisecond of it. Issued together they cost one.
        const [
          { data: invData, error: invError },
          { data: lotData, error: lotError },
          { data: actData, error: actError },
          { data: locData, error: locError },
          { data: tplData, error: tplError },
          { data: runData, error: runError },
          { data: folderData, error: folderError },
        ] = await Promise.all([
          supabase
            .from('inventory')
            .select('*')
            .eq('pantry_id', pantryId)
            .order('created_at', { ascending: false }),
          supabase
            .from('bulk_lots')
            .select('*')
            .eq('pantry_id', pantryId)
            .order('date_added', { ascending: false }),
          supabase
            .from('activities')
            .select('*')
            .eq('pantry_id', pantryId)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('locations')
            .select('*')
            .eq('pantry_id', pantryId)
            // The order a volunteer walks the room in, which is rarely
            // alphabetical.
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase
            .from('box_templates')
            .select('id, pantry_id, name, rules, scales_with_family, is_default, folder_id, excludes_tags, requires_tags')
            .eq('pantry_id', pantryId)
            .order('is_default', { ascending: false })
            .order('name', { ascending: true }),
          supabase
            .from('pack_runs')
            .select('id, box_name, boxes, boxes_collected, units_taken, per_box, created_at, label, folder_id')
            .eq('pantry_id', pantryId)
            .eq('ready', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('box_folders')
            .select('id, pantry_id, kind, name, sort_order')
            .eq('pantry_id', pantryId)
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
        ]);
        if (invError || lotError || actError || locError || tplError || runError || folderError) throw invError || lotError || actError || locError || tplError || runError || folderError;
        if (get().session?.user.id !== session.user.id || get().settings.pantryId !== pantryId) return;

        log.debug(
          'store',
          `loaded "${pantry.name}": ${invData?.length ?? 0} items, ` +
            `${lotData?.length ?? 0} bulk lots, ${actData?.length ?? 0} activities`,
        );

        const boxTemplates = ((tplData as any[]) || []).map(t => ({
          ...t,
          rules: normaliseRules(t.rules),
          excludes_tags: normaliseDietTags(t.excludes_tags),
          requires_tags: normaliseDietTags(t.requires_tags),
        })) as BoxTemplate[];
        const defaultBox = boxTemplates.find(t => t.is_default);
        const readyBoxes = ((runData as any[]) || []).map(r => ({
          ...r,
          per_box: r.per_box ? normaliseRules(r.per_box) : null,
        })) as PackRun[];

        set({
          inventory: (invData as InventoryItem[]) || [],
          bulkLots: (lotData as BulkLot[]) || [],
          activities: (actData as Activity[]) || [],
          locations: (locData as PantryLocation[]) || [],
          boxTemplates,
          readyBoxes,
          boxFolders: (folderData as BoxFolder[]) || [],
          // The default box IS the pantry's box rules now. Everything that
          // already reads boxRules (Needs, the dashboard) follows it with no
          // changes. The pantry row's own box_rules stays as the fallback for a
          // pantry that somehow has no templates.
          ...(defaultBox ? { boxRules: defaultBox.rules } : null),
          ...(get().pendingIntakes === 0 ? { syncError: null } : {}),
          isLoaded: true
        });

        subscribeToPantry(pantryId, () => scheduleRefetch(() => get().fetchData()));
        const { settings, inventory, bulkLots, activities, locations, boxRules, thresholds, lbsPerUnit } = get();
        await AsyncStorage.setItem(`pantrylens.snapshot.${session.user.id}`, JSON.stringify({ settings, inventory, bulkLots, activities, locations, boxRules, thresholds, lbsPerUnit })).catch(error => log.warn('store', 'could not cache the pantry for offline use', error));

        // Not in the batch above: the roster is a function call, it is only
        // read on the Team screen, and it must not be able to fail the launch.
        get().fetchMembers().catch(() => {});

      } else {
        // User has no pantry yet
        set({ isLoaded: true });
      }
    } catch (err) {
      if (get().session?.user.id !== session.user.id) return;
      log.error('store', 'fetchData failed', err);
      if (isNetworkError(err) && !get().settings.pantryId) {
        try {
          const saved = await AsyncStorage.getItem(`pantrylens.snapshot.${session.user.id}`);
          if (saved && get().session?.user.id === session.user.id) set(JSON.parse(saved));
        } catch (error) { log.warn('store', 'could not restore offline pantry snapshot', error); }
      }
      set({ syncError: isNetworkError(err) ? 'Offline · showing the last saved pantry snapshot.' : 'Could not refresh pantry data. Try again.' });
      set({ isLoaded: true });
    }
  },

  signOut: async () => {
    // Closed before the session goes, or the socket keeps trying to reconnect
    // with credentials that no longer exist.
    unsubscribeFromPantry();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Storage alone is not enough — the router reads this from state, so both
  // have to move together or the gate bounces the user back to the intro.
  completeOnboarding: async () => {
    set({ onboarded: true });
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
  },

  addBulkLot: async (lot: Omit<BulkLot, 'id'>) => {
    const { settings } = get();
    if (!settings.pantryId) return;

    const { error } = await supabase.from('bulk_lots').insert({ ...lot, pantry_id: settings.pantryId });
    if (error) throw error;

    await get().addActivity(
      `Logged ${lot.weight_lbs} lb bulk ${lot.category} (~${lot.est_units} units est.)`,
      'scale-balance'
    );
    await get().fetchData();
  },

  deleteBulkLot: async (id: string) => {
    const previous = get().bulkLots;
    set({ bulkLots: previous.filter(l => l.id !== id) });

    const { error } = await supabase.from('bulk_lots').delete().eq('id', id).select('id').single();
    if (error) {
      log.error('store', `could not delete bulk lot ${id}`, error);
      set({ bulkLots: previous });
      throw error;
    }
  },

  updateLbsPerUnit: async (updates: Partial<LbsPerUnit>) => {
    const { settings, lbsPerUnit } = get();
    requireAdmin(settings);
    const next = { ...lbsPerUnit, ...updates };
    set({ lbsPerUnit: next });
    await writePantryRow({ lbs_per_unit: next }, settings.pantryId, settings.userRole, () =>
      set({ lbsPerUnit }),
    );
  },

  setActivePantry: (pantryId: string, pantryName: string, role: string) => {
    set(state => ({
      settings: { ...state.settings, pantryId, pantryName, userRole: asRole(role) }
    }));
    get().fetchData();
  },

  /**
   * The roster, with the emails that make user ids into people.
   *
   * Never a table read: pantry_members has no name or email in it, and the
   * emails live in auth.users where no client may look. list_pantry_members
   * joins them for one pantry, for its own members only.
   */
  fetchMembers: async () => {
    const { settings } = get();
    if (!settings.pantryId) return;

    const { data, error } = await supabase.rpc('list_pantry_members', {
      target_pantry: settings.pantryId,
    });
    if (error) {
      log.error('store', 'could not load the pantry roster', error);
      throw error;
    }

    const members = ((data as any[]) || []).map(m => ({
      ...m,
      role: asRole(m.role),
    })) as PantryMember[];

    set(state => ({
      members,
      // The roster is also the authority on the signed-in user's own role. A
      // volunteer promoted while the app was open would otherwise keep the
      // controls they had until the next relaunch — and, worse, someone
      // demoted would keep seeing controls that now silently fail.
      settings: {
        ...state.settings,
        userRole:
          members.find(m => m.user_id === state.session?.user?.id)?.role ?? state.settings.userRole,
      },
    }));
  },

  /**
   * Promote or demote somebody. Owner-only, and the database says so too — the
   * function raises rather than refusing quietly, so a failure here is an
   * error with a sentence in it.
   */
  setMemberRole: async (userId: string, role: 'admin' | 'volunteer') => {
    const { settings } = get();
    if (!settings.pantryId) return;

    const { error } = await supabase.rpc('set_member_role', {
      target_pantry: settings.pantryId,
      target_user: userId,
      new_role: role,
    });
    if (error) {
      log.error('store', 'could not change a role', error);
      throw error;
    }
    await get().fetchMembers();
  },

  /** Hands the pantry over and steps down to manager, in one transaction. */
  transferOwnership: async (userId: string) => {
    const { settings } = get();
    if (!settings.pantryId) return;

    const { error } = await supabase.rpc('transfer_pantry_ownership', {
      target_pantry: settings.pantryId,
      target_user: userId,
    });
    if (error) {
      log.error('store', 'could not transfer the pantry', error);
      throw error;
    }
    await get().fetchMembers();
  },

  removeMember: async (userId: string) => {
    const { settings } = get();
    if (!settings.pantryId) return;

    const { error } = await supabase.rpc('remove_pantry_member', {
      target_pantry: settings.pantryId,
      target_user: userId,
    });
    if (error) {
      log.error('store', 'could not remove that member', error);
      throw error;
    }
    await get().fetchMembers();
  },

  addLocation: async (name: string) => {
    const { settings, locations } = get();
    const trimmed = name.trim();
    if (!settings.pantryId || !trimmed) return;

    const { data, error } = await supabase
      .from('locations')
      .insert({
        pantry_id: settings.pantryId,
        name: trimmed,
        // New places go at the end of the walk, not the front of it.
        sort_order: locations.length,
        categories: [],
      })
      .select()
      .single();

    if (error) {
      log.error('store', 'could not add location', error);
      throw error;
    }
    set({ locations: [...locations, data as PantryLocation] });
  },

  setLocationCategories: async (id: string, categories: Category[]) => {
    const previous = get().locations;
    set({ locations: previous.map(l => (l.id === id ? { ...l, categories } : l)) });

    const { error } = await supabase.from('locations').update({ categories }).eq('id', id).select('id').single();
    if (error) {
      log.error('store', 'could not set location categories', error);
      set({ locations: previous });
      throw error;
    }
  },

  /**
   * The first place that says it holds this category, in the order a volunteer
   * walks the room. Null when nothing claims it, which leaves the item
   * unassigned rather than guessing.
   */
  defaultLocationFor: (category: Category) => {
    const match = get().locations.find(l => l.categories?.includes(category));
    return match?.id ?? null;
  },

  /**
   * Stock leaving, with a reason attached.
   *
   * Writes the exit BEFORE removing the rows, so a failure leaves the shelf
   * intact rather than leaving food deleted and unaccounted for. Of the two
   * possible half-states that is much the better one: an exit row with the stock
   * still present is a visible discrepancy, whereas missing stock with no record
   * is simply lost.
   */
  recordExit: async (ids: string[], reason: ExitReason) => {
    const { settings, inventory } = get();
    if (!settings.pantryId || ids.length === 0) return;

    const leaving = inventory.filter(i => ids.includes(i.id));
    if (leaving.length === 0) return;

    const { error } = await supabase.from('stock_exits').insert(
      leaving.map(i => ({
        pantry_id: settings.pantryId,
        item_name: i.name,
        category: i.category,
        count: i.count,
        reason,
        recorded_by: get().session?.user?.id ?? null,
      })),
    );
    if (error) {
      log.error('store', 'could not record the stock exit', error);
      throw error;
    }

    await get().deleteItems(ids);

    const units = leaving.reduce((sum, i) => sum + i.count, 0);
    await get().addActivity(
      reason === 'given_out'
        ? `Gave out ${units} item${units === 1 ? '' : 's'}`
        : reason === 'discarded'
          ? `Threw away ${units} item${units === 1 ? '' : 's'}`
          : `Corrected ${leaving.length} row${leaving.length === 1 ? '' : 's'}`,
      reason === 'given_out'
        ? 'hand-heart-outline'
        : reason === 'discarded'
          ? 'delete-alert-outline'
          : 'pencil-outline',
    );
  },

  /**
   * Writes a counted shelf back.
   *
   * One server call, not a loop of updates and deletes: an audit is a
   * replacement over a scope, and a replacement that half-applied would leave
   * the shelf in a state that is neither the old count nor the new one, with no
   * way to tell which lines landed. See the apply_shelf_audit migration.
   */
  applyShelfAudit: async (locationId: string, photos: number, writes: AuditWrite[]) => {
    const { settings } = get();
    if (!settings.pantryId) throw new Error('No pantry is loaded yet. Reopen the app and try again.');

    const { data, error } = await supabase.rpc('apply_shelf_audit', {
      target_pantry: settings.pantryId,
      target_location: locationId,
      photo_count: photos,
      lines: writes,
    });
    if (error) {
      log.error('store', 'could not apply the shelf audit', error);
      throw error;
    }

    const result = data as AuditResult;
    const net = result.units_after - result.units_before;
    await get().addActivity(
      net === 0
        ? `Counted ${result.location_name} — the books were right`
        : `Counted ${result.location_name} — ${net > 0 ? '+' : ''}${net} unit${
            Math.abs(net) === 1 ? '' : 's'
          }`,
      'clipboard-check-outline',
    );
    await get().fetchData();
    return result;
  },

  /**
   * Clears a pantry's data without clearing how it is set up.
   *
   * The deletes are a server function because three of those tables take no
   * writes from a client at all — scans, scan_items and shelf_audits are
   * evidence, and evidence a client can rewrite is not evidence. Owner-only
   * there too, so this is not merely a hidden button.
   *
   * Photographs are cleared here rather than in SQL, which cannot reach a
   * storage bucket. Best-effort: leftover thumbnails are untidy, not broken.
   */
  resetPantryData: async () => {
    const { settings } = get();
    if (!settings.pantryId) throw new Error('No pantry is loaded.');

    const { data, error } = await supabase.rpc('reset_pantry_data', {
      target_pantry: settings.pantryId,
    });
    if (error) {
      log.error('store', 'could not clear the pantry', error);
      throw error;
    }

    await clearPantryPhotos(settings.pantryId);
    await get().fetchData();

    const counts = data as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(counts).filter(([, v]) => typeof v === 'number'),
    ) as Record<string, number>;
  },

  deletePantry: async () => {
    const { settings } = get();
    if (!settings.pantryId) throw new Error('No pantry is loaded.');

    const { data, error } = await supabase.rpc('delete_pantry', {
      target_pantry: settings.pantryId,
    });
    if (error) {
      log.error('store', 'could not delete the pantry', error);
      throw error;
    }

    await clearPantryPhotos(settings.pantryId);

    // The membership went with the pantry, so this device now belongs to no
    // pantry. Dropping the local copy is what sends the router to selection
    // instead of leaving every screen reading from a pantry that is gone.
    unsubscribeFromPantry();
    set({
      inventory: [],
      bulkLots: [],
      activities: [],
      locations: [],
      boxTemplates: [],
      readyBoxes: [],
      boxFolders: [],
      members: [],
      settings: { ...get().settings, pantryId: null, pantryName: '', inviteCode: '', userRole: 'volunteer' },
    });

    return String((data as any)?.deleted ?? 'that pantry');
  },

  replayOnboarding: async () => {
    await AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => {});
    set({ onboarded: false });
  },

  renameLocation: async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = get().locations;
    set({ locations: previous.map(l => (l.id === id ? { ...l, name: trimmed } : l)) });

    const { error } = await supabase.from('locations').update({ name: trimmed }).eq('id', id).select('id').single();
    if (error) {
      log.error('store', 'could not rename location', error);
      set({ locations: previous });
      throw error;
    }
  },

  /**
   * Removes a place, never the food that was in it.
   *
   * The column is ON DELETE SET NULL, so the stock survives and simply becomes
   * unassigned — which is the honest outcome. Renaming a room does not make its
   * contents disappear.
   */
  deleteLocation: async (id: string) => {
    const previous = get().locations;
    const previousInventory = get().inventory;
    set({
      locations: previous.filter(l => l.id !== id),
      inventory: previousInventory.map(i =>
        i.location_id === id ? { ...i, location_id: null } : i,
      ),
    });

    const { error } = await supabase.from('locations').delete().eq('id', id).select('id').single();
    if (error) {
      log.error('store', 'could not delete location', error);
      set({ locations: previous, inventory: previousInventory });
      throw error;
    }
  },

  addItems: async (items: Partial<InventoryItem>[], source = 'donation', scanId = null, scanOutcomes = []) => {
    const { settings } = get();
    if (!settings.pantryId) {
      // Silently dropping the write here is how a volunteer ends up believing
      // stock was recorded when no pantry was ever loaded.
      log.error('store', 'addItems called with no active pantry — nothing was saved');
      throw new Error('No pantry is loaded yet. Reopen the app and try again.');
    }

    const newItems = items.map(item => ({
      // Supplied by the caller when it intends to attach a photo afterwards.
      // Knowing the id BEFORE the insert is what lets the upload run in the
      // background: without it the only way to find the row again would be to
      // trust that Postgres returned the inserted rows in the order they were
      // sent, which it does not promise.
      id: item.id ?? Crypto.randomUUID(),
      pantry_id: settings.pantryId,
      name: item.name?.trim() || 'Unlabeled Item',
      category: item.category || 'unknown',
      count: item.count ?? 1,
      expiration: item.expiration || null,
      date_added: new Date().toISOString().split('T')[0],
      source: source,
      confidence: item.confidence ?? 1.0,
      // The inspection result and donor have to travel with the row. Leaving
      // them out silently defaulted every item to 'ok', so a can a volunteer had
      // just flagged as dented went straight back into box building.
      condition: item.condition || 'ok',
      source_org: item.source_org ?? null,
      source_name: item.source_name ?? null,
      image_url: item.image_url ?? null,
      location_id: item.location_id ?? null,
      diet_tags: normaliseDietTags(item.diet_tags),
      // Where this row came from. Null for anything typed in by hand, and for
      // every row saved before scan history existed.
      scan_id: scanId,
    }));

    if (!newItems.length) throw new Error('There are no items to save.');
    if (newItems.some(i => !Number.isInteger(i.count) || i.count < 1)) throw new Error('Every quantity must be a positive whole number.');
    const userId = get().session?.user.id;
    if (!userId) throw new Error('Sign in before saving an intake.');
    const locationId = source === 'shelf_audit' ? get().draftLocationId : null;
    if (source === 'shelf_audit' && !locationId) throw new Error('Choose the shelf being audited before replacing its counts.');
    const job: IntakeJob = {
      id: Crypto.randomUUID(), userId, pantryId: settings.pantryId, source, locationId,
      createdAt: source === 'manual' ? new Date().toISOString() : (get().draftCapturedAt ?? new Date().toISOString()), items: newItems,
      photos: source === 'manual' ? [] : get().currentScanPhotos,
      ...(scanId ? { scan: { id: scanId, outcomes: scanOutcomes } } : {}),
    };
    // Persist before attempting the network, including stable ids for safe retry.
    await intakeOutbox.add(job);
    try {
      await sendIntake(job);
    } catch (error) {
      if (!isNetworkError(error)) {
        await intakeOutbox.remove(job.id);
        throw error;
      }
      set({ pendingIntakes: (await intakeOutbox.list()).filter(j => j.userId === userId).length, syncError: 'Saved on this device. Sync will retry when a connection is available.' });
      return 'queued';
    }
    // Replay is safe if local cleanup fails after an acknowledged server save.
    await intakeOutbox.remove(job.id).catch(error => log.error('store', 'could not remove acknowledged intake from queue', error));
    await get().fetchData();
    return 'synced';
  },

  /**
   * Edits an item, on screen first.
   *
   * These two used to write to Supabase and then simply stop — no local state
   * change, no refetch, no look at the error. The list was left waiting on the
   * realtime channel to tell it what had happened, which for a DELETE it never
   * did (see the publication migration), so deleting an item removed the row
   * from the database and changed absolutely nothing a volunteer could see. It
   * looked exactly like a broken button.
   *
   * A volunteer's own action must never depend on a round trip through
   * replication to become visible. State moves now; if the write is rejected the
   * store re-reads the truth and the caller is told.
   */
  updateItem: async (id: string, updates: Partial<InventoryItem>) => {
    const previous = get().inventory;
    set({ inventory: previous.map(i => (i.id === id ? { ...i, ...updates } : i)) });

    const { error } = await supabase.from('inventory').update(updates).eq('id', id).select('id').single();
    if (error) {
      log.error('store', `could not update item ${id}`, error);
      set({ inventory: previous });
      throw error;
    }
  },

  deleteItem: async (id: string) => {
    const previous = get().inventory;
    const item = previous.find(i => i.id === id);
    if (!item) return;

    set({ inventory: previous.filter(i => i.id !== id) });

    const { error } = await supabase.from('inventory').delete().eq('id', id).select('id').single();
    if (error) {
      log.error('store', `could not delete item ${id}`, error);
      set({ inventory: previous });
      throw error;
    }

    // Take the photograph with it. Only ours — a pack shot lives on Open Food
    // Facts' servers and is shared by every pantry that ever scanned that
    // barcode. Without this the bucket fills for ever with pictures of tins that
    // left the building months ago.
    const path = ownedPhotoPath(item.image_url);
    if (path) {
      await supabase.storage.from(ITEM_PHOTO_BUCKET).remove([path]).catch(() => {});
    }

    await get().addActivity(`Removed "${item.name}" from inventory`, 'trash-can-outline');
  },

  /**
   * Removes several items at once.
   *
   * One statement rather than a loop of them: clearing forty expired tins should
   * be one round trip and one undoable moment, not forty chances to half-fail
   * and leave the shelf in a state nobody chose.
   */
  deleteItems: async (ids: string[]) => {
    if (ids.length === 0) return;
    const previous = get().inventory;
    const doomed = previous.filter(i => ids.includes(i.id));
    if (doomed.length === 0) return;

    set({ inventory: previous.filter(i => !ids.includes(i.id)) });

    const { data, error } = await supabase.from('inventory').delete().in('id', ids).select('id');
    if (error) {
      log.error('store', `could not delete ${ids.length} item(s)`, error);
      set({ inventory: previous });
      throw error;
    }
    if (data?.length !== doomed.length) { await get().fetchData(); throw new Error('Some items were not removed. Stock or your pantry permissions may have changed.'); }

    const paths = doomed
      .map(i => ownedPhotoPath(i.image_url))
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await supabase.storage.from(ITEM_PHOTO_BUCKET).remove(paths).catch(() => {});
    }

    await get().addActivity(
      doomed.length === 1
        ? `Removed "${doomed[0].name}" from inventory`
        : `Removed ${doomed.length} items from inventory`,
      'trash-can-outline',
    );
  },

  /** The same edit applied to several items — recategorising a whole shelf. */
  updateItems: async (ids: string[], updates: Partial<InventoryItem>) => {
    if (ids.length === 0) return;
    const previous = get().inventory;
    set({
      inventory: previous.map(i => (ids.includes(i.id) ? { ...i, ...updates } : i)),
    });

    const { data, error } = await supabase.from('inventory').update(updates).in('id', ids).select('id');
    if (error) {
      log.error('store', `could not update ${ids.length} item(s)`, error);
      set({ inventory: previous });
      throw error;
    }
    if (data?.length !== new Set(ids).size) { await get().fetchData(); throw new Error('Some changes were not saved. Stock or your pantry permissions may have changed.'); }
  },

  getItem: (id: string) => {
    return get().inventory.find(i => i.id === id);
  },

  /**
   * Takes a packed checklist off the shelf, on the server, in one transaction.
   *
   * This used to be a loop on the phone that read each count, subtracted, and
   * wrote the result back: a lost update whenever two volunteers packed at once
   * (both read 10, one wrote 6, the other 7, and the shelf claimed 7 with 3
   * left). It also ignored every write error, and the checklist didn't await
   * it, so "Boxes packed" appeared whether or not anything was saved.
   *
   * pack_boxes deducts with `count = count - n` against locked rows, records
   * each line as given out, and is idempotent on `runId`, so a retry after a
   * dropped connection cannot take the stock twice.
   *
   * Throws on failure. Returns shortfalls rather than throwing when stock ran
   * out, because by then the boxes are already packed.
   */
  deductItems: async (itemsToDeduct, packingId) => {
    const { settings } = get();
    if (!settings.pantryId) throw new Error('Choose a pantry first.');
    const { error } = await supabase.rpc('pack_stock', { target_pantry: settings.pantryId, deductions: itemsToDeduct, packing_id: packingId });
    if (error) throw error;
    await get().fetchData();
  },

  packBoxes: async ({ runId, boxCount, lines, boxName, perBox }) => {
    const { settings } = get();
    if (!settings.pantryId) {
      throw new Error('No pantry is loaded yet. Reopen the app and try again.');
    }

    const { data, error } = await supabase.rpc('pack_boxes', {
      target_pantry: settings.pantryId,
      run_id: runId,
      box_count: boxCount,
      lines,
      // What the "Ready to go" list shows for this batch.
      box_name: boxName ?? null,
      per_box: perBox ?? null,
    });

    if (error) {
      log.error('store', 'pack_boxes was rejected', error);
      throw error;
    }

    const result = data as PackResult;
    log.debug(
      'store',
      `packed ${boxCount} box(es): ${result.units_taken} unit(s) taken, ` +
        `${result.shortfalls.length} shortfall(s)${result.replayed ? ' [replayed]' : ''}`,
    );

    await get().fetchData();
    return result;
  },

  /**
   * Records families collecting boxes from a packed batch.
   *
   * The count moves on screen immediately, because the person at the door is
   * tapping once per family and can't wait on the network each time. The server
   * calls are queued in tap order, each carrying the count it expects to find.
   * If one fails, or finds the batch already moved on (another volunteer, or a
   * retry after a dropped connection), the store re-reads the truth. Taps queued
   * behind it then fail the same check instead of counting against a stale
   * number.
   */
  collectBoxes: (runId: string, count: number) => {
    const run = get().readyBoxes.find(r => r.id === runId);
    if (!run || count < 1) {
      return Promise.resolve({ applied: false, boxes: run?.boxes ?? 0, boxes_collected: run?.boxes_collected ?? 0 });
    }

    const expected = run.boxes_collected;
    const target = Math.min(run.boxes, expected + count);
    if (target === expected) {
      return Promise.resolve({ applied: false, boxes: run.boxes, boxes_collected: expected });
    }

    // A finished batch leaves the list straight away.
    set({
      readyBoxes: get().readyBoxes.flatMap(r =>
        r.id !== runId ? [r] : target >= r.boxes ? [] : [{ ...r, boxes_collected: target }],
      ),
    });

    const task = collectQueue.then(async (): Promise<CollectResult> => {
      const { data, error } = await supabase.rpc('collect_boxes', {
        run_id: runId,
        box_count: target - expected,
        expected_collected: expected,
      });

      const result = data as CollectResult | null;
      if (error || !result?.applied) {
        log.warn('store', `collect_boxes did not apply for ${runId}`, error ?? result);
        await get().fetchData();
        if (error) throw error;
      }
      return result as CollectResult;
    });

    collectQueue = task.catch(() => undefined);
    return task;
  },

  /**
   * Names a packed batch and files it.
   *
   * Only these two things are editable on a batch, and the database enforces
   * it. The returned row is checked, not just the error: a row-level-security
   * refusal on an update looks exactly like success, just with no rows.
   */
  updatePackRun: async (id, { label, folderId }) => {
    const previous = get().readyBoxes;
    const cleanLabel = label?.trim() ? label.trim() : null;

    set({
      readyBoxes: previous.map(r =>
        r.id === id ? { ...r, label: cleanLabel, folder_id: folderId } : r,
      ),
    });

    const { data, error } = await supabase
      .from('pack_runs')
      .update({ label: cleanLabel, folder_id: folderId })
      .eq('id', id)
      .select('id');

    if (error || !data || data.length === 0) {
      log.error('store', 'could not update pack run', error);
      set({ readyBoxes: previous });
      throw error ?? new Error('That batch could not be updated.');
    }
  },

  addBoxFolder: async (kind, name) => {
    const { settings, boxFolders } = get();
    if (!settings.pantryId) throw new Error('No pantry is loaded yet.');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the folder a name.');

    const { data, error } = await supabase
      .from('box_folders')
      .insert({
        pantry_id: settings.pantryId,
        kind,
        name: trimmed,
        // New folders go at the end, not the top.
        sort_order: boxFolders.filter(f => f.kind === kind).length,
      })
      .select('id, pantry_id, kind, name, sort_order')
      .single();

    if (error) {
      log.error('store', 'could not add box folder', error);
      if (error.code === '23505') throw new Error(`You already have a folder called "${trimmed}".`);
      throw error;
    }
    set({ boxFolders: [...get().boxFolders, data as BoxFolder] });
    return data as BoxFolder;
  },

  renameBoxFolder: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the folder a name.');
    const previous = get().boxFolders;
    set({ boxFolders: previous.map(f => (f.id === id ? { ...f, name: trimmed } : f)) });

    const { error } = await supabase.from('box_folders').update({ name: trimmed }).eq('id', id);
    if (error) {
      log.error('store', 'could not rename box folder', error);
      set({ boxFolders: previous });
      if (error.code === '23505') throw new Error(`You already have a folder called "${trimmed}".`);
      throw error;
    }
  },

  /**
   * Deletes a folder, never what's in it. The database unfiles its box types
   * and batches (ON DELETE SET NULL), and local state does the same straight
   * away so nothing is left pointing at a folder that's gone.
   */
  deleteBoxFolder: async (id) => {
    const { boxFolders, boxTemplates, readyBoxes } = get();
    set({
      boxFolders: boxFolders.filter(f => f.id !== id),
      boxTemplates: boxTemplates.map(t => (t.folder_id === id ? { ...t, folder_id: null } : t)),
      readyBoxes: readyBoxes.map(r => (r.folder_id === id ? { ...r, folder_id: null } : r)),
    });

    const { error } = await supabase.from('box_folders').delete().eq('id', id);
    if (error) {
      log.error('store', 'could not delete box folder', error);
      set({ boxFolders, boxTemplates, readyBoxes });
      throw error;
    }
  },

  /**
   * Writes through to the pantry row. This used to set local state only, so the
   * Settings screen reported "Saved!" over a change that never left the phone
   * and vanished on the next launch.
   *
   * State moves first so the control responds immediately; a failed write throws
   * for the caller to surface rather than leaving the UI quietly lying.
   */
  updateSettings: async (updates: Partial<Settings>) => {
    const previous = get().settings;
    requireAdmin(previous);
    const next = { ...previous, ...updates };
    set({ settings: next });

    if (!next.pantryId) return;

    const patch: Record<string, unknown> = {};
    if (updates.pantryName !== undefined) patch.name = updates.pantryName.trim();

    // The settings column is written as a WHOLE object, so every key goes in
    // every time. Writing only the keys that changed would replace the object
    // and wipe the rest: changing the expiry window would silently erase the
    // drop-off address.
    const settingsKeys: (keyof Settings)[] = [
      'expirationWarningDays',
      'defaultFamilySize',
      'boxTarget',
      'dropoffLocation',
      'dropoffHours',
      'dropOffDetails',
    ];
    if (settingsKeys.some(key => updates[key] !== undefined)) {
      patch.settings = {
        expiration_warning_days: next.expirationWarningDays,
        default_family_size: next.defaultFamilySize,
        drop_off_details: next.dropOffDetails,
        box_target: next.boxTarget,
        dropoff_location: next.dropoffLocation.trim(),
        dropoff_hours: next.dropoffHours.trim(),
      };
    }
    if (Object.keys(patch).length === 0) return;

    // Don't leave the screen showing a value the server never took.
    await writePantryRow(patch, next.pantryId, previous.userRole, () =>
      set({ settings: previous }),
    );
  },

  /**
   * Creates or updates a box template.
   *
   * Replaces updateBoxRules, which wrote one shared set of numbers to the
   * pantry row, a row only admins may update. A volunteer's change showed on
   * screen, was refused by the database without complaint, and reverted on the
   * next refresh. Templates have member policies, and every write here checks
   * its error.
   */
  updateBoxRules: async (updates: Partial<BoxRules>) => {
    const { settings, boxRules } = get();
    requireAdmin(settings);
    const newRules = { ...boxRules, ...updates };
    set({ boxRules: newRules });
    const { error } = await supabase.from('pantries').update({ box_rules: newRules }).eq('id', settings.pantryId).select('id').single();
    if (error) { set({ boxRules }); throw error; }
  },

  saveBoxTemplate: async ({ id, name, rules, scalesWithFamily, folderId, excludesTags, requiresTags }) => {
    const { settings, boxTemplates } = get();
    if (!settings.pantryId) throw new Error('No pantry is loaded yet. Reopen the app and try again.');

    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the box a name.');
    const clean = normaliseRules(rules);
    if (itemsPerBox(clean) === 0) throw new Error('A box needs at least one item in it.');

    const excludes = normaliseDietTags(excludesTags);
    const requires = normaliseDietTags(requiresTags);
    // The database refuses this too, but a volunteer deserves the reason rather
    // than a constraint name: a box that both demands and forbids a tag can
    // never be filled, and the failure would read as "you have no stock".
    const contradiction = excludes.find(tag => requires.includes(tag));
    if (contradiction) {
      throw new Error('A box cannot both require and exclude the same thing.');
    }

    const fields = {
      name: trimmed,
      rules: clean,
      scales_with_family: scalesWithFamily,
      folder_id: folderId ?? null,
      excludes_tags: excludes,
      requires_tags: requires,
    };
    const columns = 'id, pantry_id, name, rules, scales_with_family, is_default, folder_id, excludes_tags, requires_tags';

    let result;
    if (id) {
      result = await supabase
        .from('box_templates')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(columns)
        .single();
    } else {
      result = await supabase
        .from('box_templates')
        .insert({ ...fields, pantry_id: settings.pantryId })
        .select(columns)
        .single();
    }

    if (result.error) {
      log.error('store', 'could not save box template', result.error);
      if (result.error.code === '23505') {
        throw new Error(`You already have a box called "${trimmed}".`);
      }
      throw result.error;
    }

    const saved = {
      ...(result.data as any),
      rules: normaliseRules((result.data as any).rules),
      excludes_tags: normaliseDietTags((result.data as any).excludes_tags),
      requires_tags: normaliseDietTags((result.data as any).requires_tags),
    } as BoxTemplate;
    set({
      boxTemplates: id
        ? boxTemplates.map(t => (t.id === id ? saved : t))
        : [...boxTemplates, saved],
      ...(saved.is_default ? { boxRules: saved.rules } : null),
    });
    return saved;
  },

  /**
   * Deletes a box template. Never the default: Needs and the dashboard measure
   * against it, so a pantry must always have one. The database refuses too,
   * and does it silently (a delete that matches no rows), which is why the
   * returned rows are checked rather than trusting a missing error.
   */
  deleteBoxTemplate: async (id: string) => {
    const previous = get().boxTemplates;
    const target = previous.find(t => t.id === id);
    if (!target) return;
    if (target.is_default) {
      throw new Error('This is your default box. Make another box the default first.');
    }

    set({ boxTemplates: previous.filter(t => t.id !== id) });

    const { data, error } = await supabase.from('box_templates').delete().eq('id', id).select('id');
    if (error || !data || data.length === 0) {
      log.error('store', 'could not delete box template', error);
      set({ boxTemplates: previous });
      throw error ?? new Error('That box could not be deleted.');
    }
  },

  /** Swaps the pantry default in one server-side transaction. */
  setDefaultBoxTemplate: async (id: string) => {
    const previous = get().boxTemplates;
    const previousRules = get().boxRules;
    const target = previous.find(t => t.id === id);
    if (!target || target.is_default) return;

    set({
      boxTemplates: previous.map(t => ({ ...t, is_default: t.id === id })),
      boxRules: target.rules,
    });

    const { error } = await supabase.rpc('set_default_box_template', { template_id: id });
    if (error) {
      log.error('store', 'could not change the default box', error);
      set({ boxTemplates: previous, boxRules: previousRules });
      throw error;
    }
  },

  updateThresholds: async (updates: Partial<CategoryThresholds>) => {
    const { settings, thresholds } = get();
    requireAdmin(settings);
    const newThresholds = { ...thresholds, ...updates };
    set({ thresholds: newThresholds });
    await writePantryRow({ thresholds: newThresholds }, settings.pantryId, settings.userRole, () =>
      set({ thresholds }),
    );
  },

  setDraft: (items: InventoryItem[], photos: ScanPhoto[] = [], capturedAt = new Date().toISOString()) => {
    set({ currentDraft: items, currentScanPhotos: photos, draftCapturedAt: items.length ? capturedAt : null });
  },

  setPendingBarcode: (value: PendingBarcode | null) => {
    set({ pendingBarcode: value });
  },

  setAuditDraft: (value: AppState['auditDraft']) => {
    set({ auditDraft: value });
  },

  setCurrentScan: (value: StartedScan | null) => {
    set({ currentScan: value });
  },

  setDraftSource: (value: SourceOrg | null) => {
    set({ draftSource: value });
  },

  addActivity: async (text: string, icon = 'information-outline') => {
    const { settings } = get();
    if (!settings.pantryId) return;
    
    const { error } = await supabase.from('activities').insert({
      pantry_id: settings.pantryId,
      text,
      time: new Date().toISOString(),
      icon
    });
    // A secondary log failure must not make a completed inventory write look failed.
    if (error) { log.error('store', 'activity was not recorded', error); set({ syncError: 'Stock was saved, but its activity log could not be recorded.' }); }
  }
}));
