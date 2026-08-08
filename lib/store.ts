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
  isLoaded: boolean;
  currentDraft: InventoryItem[];
  /** The photos the current draft was read from, so review can point at them. */
  currentScanPhotos: ScanPhoto[];

  // Actions
  initialize: () => Promise<void>;
  fetchData: () => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setActivePantry: (pantryId: string, pantryName: string, role: string) => void;

  addBulkLot: (lot: Omit<BulkLot, 'id'>) => Promise<void>;
  deleteBulkLot: (id: string) => Promise<void>;
  updateLbsPerUnit: (updates: Partial<LbsPerUnit>) => Promise<void>;

  addItems: (items: Partial<InventoryItem>[], source?: 'donation' | 'shelf_audit' | 'manual') => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  getItem: (id: string) => InventoryItem | undefined;
  deductItems: (itemsToDeduct: { id: string; count: number }[]) => Promise<void>;
  
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  updateBoxRules: (updates: Partial<BoxRules>) => Promise<void>;
  updateThresholds: (updates: Partial<CategoryThresholds>) => Promise<void>;
  
  setDraft: (items: InventoryItem[], photos?: ScanPhoto[]) => void;
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
  isLoaded: false,
  currentDraft: [],
  currentScanPhotos: [],

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

        // 2. Fetch Inventory
        const { data: invData } = await supabase
          .from('inventory')
          .select('*')
          .eq('pantry_id', pantryId)
          .order('created_at', { ascending: false });

        // 3. Fetch weighed bulk lots
        const { data: lotData } = await supabase
          .from('bulk_lots')
          .select('*')
          .eq('pantry_id', pantryId)
          .order('date_added', { ascending: false });

        // 4. Fetch Activities
        const { data: actData } = await supabase
          .from('activities')
          .select('*')
          .eq('pantry_id', pantryId)
          .order('created_at', { ascending: false })
          .limit(20);

        log.debug(
          'store',
          `loaded "${pantry.name}": ${invData?.length ?? 0} items, ` +
            `${lotData?.length ?? 0} bulk lots, ${actData?.length ?? 0} activities`,
        );

        set({
          inventory: (invData as InventoryItem[]) || [],
          bulkLots: (lotData as BulkLot[]) || [],
          activities: (actData as Activity[]) || [],
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
    await supabase.from('bulk_lots').delete().eq('id', id);
    await get().fetchData();
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

  addItems: async (items: Partial<InventoryItem>[], source = 'donation') => {
    const { settings } = get();
    if (!settings.pantryId) {
      // Silently dropping the write here is how a volunteer ends up believing
      // stock was recorded when no pantry was ever loaded.
      log.error('store', 'addItems called with no active pantry — nothing was saved');
      throw new Error('No pantry is loaded yet. Reopen the app and try again.');
    }

    const newItems = items.map(item => ({
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

  updateItem: async (id: string, updates: Partial<InventoryItem>) => {
    await supabase.from('inventory').update(updates).eq('id', id);
  },

  deleteItem: async (id: string) => {
    const item = get().inventory.find(i => i.id === id);
    await supabase.from('inventory').delete().eq('id', id);
    if (item) {
      await get().addActivity(`Removed "${item.name}" from inventory`, 'trash-can-outline');
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
