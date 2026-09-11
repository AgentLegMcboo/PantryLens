import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { log } from './log';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

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
}

/** A photo held only for the length of a review, never persisted. */
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

export const EXIT_LABELS: Record<ExitReason, string> = {
  given_out: 'Given out',
  discarded: 'Thrown away',
  correction: 'Removed',
};

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

export interface Settings {
  pantryId: string | null;
  pantryName: string;
  expirationWarningDays: number;
  defaultFamilySize: number;
  userRole: string;
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
    .subscribe();
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
  isLoaded: boolean;
  currentDraft: InventoryItem[];
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

  // Actions
  initialize: () => Promise<void>;
  fetchData: () => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setActivePantry: (pantryId: string, pantryName: string, role: string) => void;

  addBulkLot: (lot: Omit<BulkLot, 'id'>) => Promise<void>;
  deleteBulkLot: (id: string) => Promise<void>;
  updateLbsPerUnit: (updates: Partial<LbsPerUnit>) => Promise<void>;

  addLocation: (name: string) => Promise<void>;
  renameLocation: (id: string, name: string) => Promise<void>;
  setLocationCategories: (id: string, categories: Category[]) => Promise<void>;
  /** Where a freshly scanned item of this category should be filed. */
  defaultLocationFor: (category: Category) => string | null;
  recordExit: (ids: string[], reason: ExitReason) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;

  addItems: (items: Partial<InventoryItem>[], source?: 'donation' | 'shelf_audit' | 'manual') => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteItems: (ids: string[]) => Promise<void>;
  updateItems: (ids: string[], updates: Partial<InventoryItem>) => Promise<void>;
  getItem: (id: string) => InventoryItem | undefined;
  deductItems: (itemsToDeduct: { id: string; count: number }[]) => Promise<void>;
  
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  updateBoxRules: (updates: Partial<BoxRules>) => Promise<void>;
  updateThresholds: (updates: Partial<CategoryThresholds>) => Promise<void>;
  
  setDraft: (items: InventoryItem[], photos?: ScanPhoto[]) => void;
  setPendingBarcode: (value: PendingBarcode | null) => void;
  setDraftSource: (value: SourceOrg | null) => void;
  addActivity: (text: string, icon?: string) => Promise<void>;
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
    userRole: 'volunteer'
  },
  activities: [],
  locations: [],
  isLoaded: false,
  currentDraft: [],
  currentScanPhotos: [],
  pendingBarcode: null,
  draftSource: null,

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
      if (session) get().fetchData();
      else set({ isLoaded: true });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      if (session) {
        get().fetchData();
      } else {
        // Clear state on sign out
        unsubscribeFromPantry();
        set({
          inventory: [],
          bulkLots: [],
          activities: [],
          locations: [],
          settings: { ...get().settings, pantryId: null, pantryName: '' },
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
      const { data: members } = await supabase
        .from('pantry_members')
        .select('pantry_id, role, pantries(name, box_rules, thresholds, lbs_per_unit, settings)')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();

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
        const stored = (pantry.settings || {}) as Record<string, number>;

        set(state => ({
          settings: {
            ...state.settings,
            pantryId,
            pantryName: pantry.name,
            userRole: members.role,
            expirationWarningDays: stored.expiration_warning_days ?? 30,
            defaultFamilySize: stored.default_family_size ?? 4,
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
          { data: invData },
          { data: lotData },
          { data: actData },
          { data: locData },
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
        ]);

        log.debug(
          'store',
          `loaded "${pantry.name}": ${invData?.length ?? 0} items, ` +
            `${lotData?.length ?? 0} bulk lots, ${actData?.length ?? 0} activities`,
        );

        set({
          inventory: (invData as InventoryItem[]) || [],
          bulkLots: (lotData as BulkLot[]) || [],
          activities: (actData as Activity[]) || [],
          locations: (locData as PantryLocation[]) || [],
          isLoaded: true
        });

        subscribeToPantry(pantryId, () => scheduleRefetch(() => get().fetchData()));

      } else {
        // User has no pantry yet
        set({ isLoaded: true });
      }
    } catch (err) {
      log.error('store', 'fetchData failed', err);
      set({ isLoaded: true });
    }
  },

  signOut: async () => {
    // Closed before the session goes, or the socket keeps trying to reconnect
    // with credentials that no longer exist.
    unsubscribeFromPantry();
    await supabase.auth.signOut();
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

    const { error } = await supabase.from('bulk_lots').delete().eq('id', id);
    if (error) {
      log.error('store', `could not delete bulk lot ${id}`, error);
      set({ bulkLots: previous });
      throw error;
    }
  },

  updateLbsPerUnit: async (updates: Partial<LbsPerUnit>) => {
    const { settings, lbsPerUnit } = get();
    if (!settings.pantryId) return;
    const next = { ...lbsPerUnit, ...updates };
    set({ lbsPerUnit: next });
    await supabase.from('pantries').update({ lbs_per_unit: next }).eq('id', settings.pantryId);
  },

  setActivePantry: (pantryId: string, pantryName: string, role: string) => {
    set(state => ({
      settings: { ...state.settings, pantryId, pantryName, userRole: role }
    }));
    get().fetchData();
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

    const { error } = await supabase.from('locations').update({ categories }).eq('id', id);
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

  renameLocation: async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = get().locations;
    set({ locations: previous.map(l => (l.id === id ? { ...l, name: trimmed } : l)) });

    const { error } = await supabase.from('locations').update({ name: trimmed }).eq('id', id);
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

    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) {
      log.error('store', 'could not delete location', error);
      set({ locations: previous, inventory: previousInventory });
      throw error;
    }
  },

  addItems: async (items: Partial<InventoryItem>[], source = 'donation') => {
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
      ...(item.id ? { id: item.id } : {}),
      pantry_id: settings.pantryId,
      name: item.name?.trim() || 'Unlabeled Item',
      category: item.category || 'unknown',
      count: parseInt(String(item.count), 10) || 1,
      expiration: item.expiration || null,
      date_added: new Date().toISOString().split('T')[0],
      source: source,
      confidence: item.confidence || 1.0,
      // The inspection result and donor have to travel with the row. Leaving
      // them out silently defaulted every item to 'ok', so a can a volunteer had
      // just flagged as dented went straight back into box building.
      condition: item.condition || 'ok',
      source_org: item.source_org ?? null,
      source_name: item.source_name ?? null,
      image_url: item.image_url ?? null,
      location_id: item.location_id ?? null,
    }));

    log.debug('store', `inserting ${newItems.length} item(s) into pantry ${settings.pantryId}`, newItems);
    const { error } = await supabase.from('inventory').insert(newItems);
    if (error) {
      log.error('store', 'inventory insert rejected', error);
      throw error;
    }
    log.debug('store', `inserted ${newItems.length} item(s)`);

    const flagged = newItems.filter(i => i.condition !== 'ok').length;
    await get().addActivity(
      flagged > 0
        ? `Added ${newItems.length} item(s) via ${source} — ${flagged} held back for inspection`
        : `Added ${newItems.length} verified item(s) via ${source}`,
      'plus-circle-outline'
    );
    await get().fetchData();
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

    const { error } = await supabase.from('inventory').update(updates).eq('id', id);
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

    const { error } = await supabase.from('inventory').delete().eq('id', id);
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

    const { error } = await supabase.from('inventory').delete().in('id', ids);
    if (error) {
      log.error('store', `could not delete ${ids.length} item(s)`, error);
      set({ inventory: previous });
      throw error;
    }

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

    const { error } = await supabase.from('inventory').update(updates).in('id', ids);
    if (error) {
      log.error('store', `could not update ${ids.length} item(s)`, error);
      set({ inventory: previous });
      throw error;
    }
  },

  getItem: (id: string) => {
    return get().inventory.find(i => i.id === id);
  },

  /**
   * Draws packed stock back out.
   *
   * An allocation row is either a real inventory item or a synthetic unit from a
   * weighed bulk lot, and the two live in different tables. Matching only against
   * `inventory` meant every id that belonged to a lot fell through silently — you
   * could pack twenty boxes out of a 60 lb protein drop and the lot never moved.
   *
   * Still client-side arithmetic rather than an atomic RPC: two volunteers
   * packing at the same moment can both read the same starting count. That is a
   * real limit, written down here rather than pretended away.
   */
  deductItems: async (itemsToDeduct: { id: string; count: number }[]) => {
    const { inventory, bulkLots } = get();

    for (const deduct of itemsToDeduct) {
      if (deduct.count <= 0) continue;

      const item = inventory.find(i => i.id === deduct.id);
      if (item) {
        const newCount = Math.max(0, item.count - deduct.count);
        if (newCount === 0) {
          await supabase.from('inventory').delete().eq('id', deduct.id);
        } else {
          await supabase.from('inventory').update({ count: newCount }).eq('id', deduct.id);
        }
        continue;
      }

      // A weighed lot. Units are the estimate; weight is the recorded truth, so
      // both come down together and stay consistent with each other.
      const lot = bulkLots.find(l => l.id === deduct.id);
      if (lot) {
        const newUnits = Math.max(0, lot.est_units - deduct.count);
        const perUnit = lot.est_units > 0 ? lot.weight_lbs / lot.est_units : 0;
        const newWeight = Math.max(0, Number((newUnits * perUnit).toFixed(2)));

        if (newUnits === 0) {
          await supabase.from('bulk_lots').delete().eq('id', deduct.id);
        } else {
          await supabase
            .from('bulk_lots')
            .update({ est_units: newUnits, weight_lbs: newWeight })
            .eq('id', deduct.id);
        }
      }
    }

    await get().addActivity(`Packed boxes: deducted items from stock`, 'archive-outline');
    await get().fetchData();
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
    const next = { ...previous, ...updates };
    set({ settings: next });

    if (!next.pantryId) return;

    const patch: Record<string, unknown> = {};
    if (updates.pantryName !== undefined) patch.name = updates.pantryName.trim();
    if (updates.expirationWarningDays !== undefined || updates.defaultFamilySize !== undefined) {
      patch.settings = {
        expiration_warning_days: next.expirationWarningDays,
        default_family_size: next.defaultFamilySize,
      };
    }
    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase.from('pantries').update(patch).eq('id', next.pantryId);
    if (error) {
      set({ settings: previous }); // don't leave the screen showing a value the server rejected
      throw error;
    }
  },

  updateBoxRules: async (updates: Partial<BoxRules>) => {
    const { settings, boxRules } = get();
    if (!settings.pantryId) return;
    const newRules = { ...boxRules, ...updates };
    set({ boxRules: newRules });
    await supabase.from('pantries').update({ box_rules: newRules }).eq('id', settings.pantryId);
  },

  updateThresholds: async (updates: Partial<CategoryThresholds>) => {
    const { settings, thresholds } = get();
    if (!settings.pantryId) return;
    const newThresholds = { ...thresholds, ...updates };
    set({ thresholds: newThresholds });
    await supabase.from('pantries').update({ thresholds: newThresholds }).eq('id', settings.pantryId);
  },

  setDraft: (items: InventoryItem[], photos: ScanPhoto[] = []) => {
    set({ currentDraft: items, currentScanPhotos: photos });
  },

  setPendingBarcode: (value: PendingBarcode | null) => {
    set({ pendingBarcode: value });
  },

  setDraftSource: (value: SourceOrg | null) => {
    set({ draftSource: value });
  },

  addActivity: async (text: string, icon = 'information-outline') => {
    const { settings } = get();
    if (!settings.pantryId) return;
    
    await supabase.from('activities').insert({
      pantry_id: settings.pantryId,
      text,
      time: new Date().toISOString(),
      icon
    });
  }
}));
