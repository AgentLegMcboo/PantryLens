import { create } from 'zustand';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

export interface InventoryItem {
  id: string;
  name: string;
  category: 'grain' | 'vegetable' | 'protein' | 'breakfast' | 'snack' | 'hygiene' | 'baby' | 'unknown';
  count: number;
  expiration: string | null;
  date_added: string;
  source: 'donation' | 'shelf_audit' | 'manual';
  confidence?: number;
}

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

interface AppState {
  session: Session | null;
  inventory: InventoryItem[];
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
  setActivePantry: (pantryId: string, pantryName: string, role: string) => void;
  
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
  inventory: [],
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
          isLoaded: true
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
        .select('pantry_id, role, pantries(name, box_rules, thresholds)')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();

      if (members && members.pantries) {
        const pantryId = members.pantry_id;
        const pantries = members.pantries as any;
        const pantryName = Array.isArray(pantries) ? pantries[0].name : pantries.name;
        const boxRules = Array.isArray(pantries) ? pantries[0].box_rules : pantries.box_rules;
        const thresholds = Array.isArray(pantries) ? pantries[0].thresholds : pantries.thresholds;
        
        set(state => ({
          settings: { ...state.settings, pantryId, pantryName, userRole: members.role },
          boxRules: boxRules as BoxRules || DEFAULT_BOX_RULES,
          thresholds: thresholds as CategoryThresholds || DEFAULT_THRESHOLDS
        }));

        // 2. Fetch Inventory
        const { data: invData } = await supabase
          .from('inventory')
          .select('*')
          .eq('pantry_id', pantryId)
          .order('created_at', { ascending: false });

        // 3. Fetch Activities
        const { data: actData } = await supabase
          .from('activities')
          .select('*')
          .eq('pantry_id', pantryId)
          .order('created_at', { ascending: false })
          .limit(20);

        set({
          inventory: (invData as InventoryItem[]) || [],
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
