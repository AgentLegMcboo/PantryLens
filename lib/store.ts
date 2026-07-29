import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
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
  
  updateSettings: (updates: Partial<Settings>) => void;
  updateBoxRules: (updates: Partial<BoxRules>) => Promise<void>;
  updateThresholds: (updates: Partial<CategoryThresholds>) => Promise<void>;
  
  setDraft: (items: InventoryItem[]) => void;
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
        set({
          inventory: [],
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
        .select('pantry_id, role, pantries(name, box_rules, thresholds, lbs_per_unit)')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();

      if (members && members.pantries) {
        const pantryId = members.pantry_id;
        const pantries = members.pantries as any;
        const pantry = Array.isArray(pantries) ? pantries[0] : pantries;

        set(state => ({
          settings: { ...state.settings, pantryId, pantryName: pantry.name, userRole: members.role },
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

        set({
          inventory: (invData as InventoryItem[]) || [],
          bulkLots: (lotData as BulkLot[]) || [],
          activities: (actData as Activity[]) || [],
          isLoaded: true
        });

        // 4. Setup Realtime Subscriptions
        supabase.channel('public:inventory')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `pantry_id=eq.${pantryId}` }, payload => {
            get().fetchData(); // Simplest sync for now
          })
          .subscribe();

      } else {
        // User has no pantry yet
        set({ isLoaded: true });
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      set({ isLoaded: true });
    }
  },

  signOut: async () => {
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
    if (!settings.pantryId) return;

    const newItems = items.map(item => ({
      pantry_id: settings.pantryId,
      name: item.name?.trim() || 'Unlabeled Item',
      category: item.category || 'unknown',
      count: parseInt(String(item.count), 10) || 1,
      expiration: item.expiration || null,
      date_added: new Date().toISOString().split('T')[0],
      source: source,
      confidence: item.confidence || 1.0
    }));

    await supabase.from('inventory').insert(newItems);
    await get().addActivity(`Added ${newItems.length} verified item(s) via ${source}`, 'plus-circle-outline');
    // Realtime subscription will fetch latest
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

  deductItems: async (itemsToDeduct: { id: string; count: number }[]) => {
    // Note: A real implementation would use a Postgres function (RPC) to atomically decrement
    // For now, we calculate client side and update.
    const { inventory } = get();
    for (const deduct of itemsToDeduct) {
      const item = inventory.find(i => i.id === deduct.id);
      if (item) {
        const newCount = Math.max(0, item.count - deduct.count);
        if (newCount === 0) {
          await supabase.from('inventory').delete().eq('id', deduct.id);
        } else {
          await supabase.from('inventory').update({ count: newCount }).eq('id', deduct.id);
        }
      }
    }
    await get().addActivity(`Packed boxes: deducted items from stock`, 'archive-outline');
    get().fetchData();
  },

  updateSettings: (updates: Partial<Settings>) => {
    set(state => ({ settings: { ...state.settings, ...updates } }));
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

  setDraft: (items: InventoryItem[]) => {
    set({ currentDraft: items });
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
