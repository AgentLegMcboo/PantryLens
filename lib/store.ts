import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface InventoryItem {
  id: string;
  name: string;
  category: 'grain' | 'vegetable' | 'protein' | 'breakfast' | 'snack' | 'hygiene' | 'baby' | 'unknown';
  count: number;
  expiration: string | null; // YYYY-MM-DD
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
  pantryName: string;
  expirationWarningDays: number;
  defaultFamilySize: number;
  userRole: string;
  isSignedIn: boolean;
}

export interface Activity {
  id: string;
  text: string;
  time: string;
  icon: string;
}

const STORAGE_KEY = '@pantrylens_store_v2';

const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 'inv-1', name: 'Peanut Butter (16 oz)', category: 'protein', count: 6, expiration: '2026-08-05', date_added: '2026-07-10', source: 'donation', confidence: 0.98 },
  { id: 'inv-2', name: 'Canned Tuna (5 oz)', category: 'protein', count: 8, expiration: '2026-08-12', date_added: '2026-07-12', source: 'donation', confidence: 0.95 },
  { id: 'inv-3', name: 'Black Beans (15 oz)', category: 'protein', count: 14, expiration: '2027-01-20', date_added: '2026-07-01', source: 'shelf_audit', confidence: 1.0 },
  { id: 'inv-4', name: 'White Rice (2 lb)', category: 'grain', count: 22, expiration: '2027-06-30', date_added: '2026-06-15', source: 'donation', confidence: 0.92 },
  { id: 'inv-5', name: 'Whole Wheat Pasta (16 oz)', category: 'grain', count: 18, expiration: '2026-08-18', date_added: '2026-07-05', source: 'donation', confidence: 0.90 },
  { id: 'inv-6', name: 'Canned Sweet Corn (15 oz)', category: 'vegetable', count: 25, expiration: '2026-11-10', date_added: '2026-06-20', source: 'shelf_audit', confidence: 1.0 },
  { id: 'inv-7', name: 'Diced Tomatoes (14.5 oz)', category: 'vegetable', count: 16, expiration: '2026-08-08', date_added: '2026-07-02', source: 'donation', confidence: 0.88 },
  { id: 'inv-8', name: 'Rolled Oats (30 oz)', category: 'breakfast', count: 12, expiration: '2026-09-15', date_added: '2026-07-14', source: 'donation', confidence: 0.96 },
  { id: 'inv-9', name: 'Pancake Mix (32 oz)', category: 'breakfast', count: 7, expiration: '2026-08-02', date_added: '2026-07-11', source: 'donation', confidence: 0.94 },
  { id: 'inv-10', name: 'Granola Bars (6 ct)', category: 'snack', count: 15, expiration: '2026-08-25', date_added: '2026-07-18', source: 'donation', confidence: 0.91 },
  { id: 'inv-11', name: 'Unsweetened Applesauce (6 pk)', category: 'snack', count: 10, expiration: '2026-10-05', date_added: '2026-07-15', source: 'donation', confidence: 0.97 },
  { id: 'inv-12', name: 'Bar Soap (3 pk)', category: 'hygiene', count: 9, expiration: null, date_added: '2026-07-08', source: 'donation', confidence: 1.0 },
  { id: 'inv-13', name: 'Infant Formula Powder (12.5 oz)', category: 'baby', count: 3, expiration: '2026-08-10', date_added: '2026-07-16', source: 'donation', confidence: 0.85 }
];

const INITIAL_BOX_RULES: BoxRules = {
  grain: 2,
  vegetable: 2,
  protein: 2,
  breakfast: 1,
  snack: 1,
  hygiene: 1,
  baby: 0
};

const INITIAL_THRESHOLDS: CategoryThresholds = {
  grain: 15,
  vegetable: 15,
  protein: 15,
  breakfast: 10,
  snack: 10,
  hygiene: 8,
  baby: 5
};

const INITIAL_SETTINGS: Settings = {
  pantryName: 'Grace Community Food Pantry',
  expirationWarningDays: 30,
  defaultFamilySize: 4,
  userRole: 'Volunteer',
  isSignedIn: true
};

interface AppState {
  inventory: InventoryItem[];
  boxRules: BoxRules;
  thresholds: CategoryThresholds;
  settings: Settings;
  activities: Activity[];
  isLoaded: boolean;
  currentDraft: InventoryItem[];

  // Actions
  loadStore: () => Promise<void>;
  saveStore: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
  addItems: (items: Partial<InventoryItem>[], source?: 'donation' | 'shelf_audit' | 'manual') => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  deductItems: (itemsToDeduct: { id: string; count: number }[]) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  updateBoxRules: (updates: Partial<BoxRules>) => void;
  updateThresholds: (updates: Partial<CategoryThresholds>) => void;
  setDraft: (items: InventoryItem[]) => void;
  addActivity: (text: string, icon?: string) => void;
}

export const usePantryStore = create<AppState>((set, get) => ({
  inventory: INITIAL_INVENTORY,
  boxRules: INITIAL_BOX_RULES,
  thresholds: INITIAL_THRESHOLDS,
  settings: INITIAL_SETTINGS,
  activities: [
    { id: 'act-1', text: 'Logged 4 bags from High School Food Drive (+34 items)', time: '2 hours ago', icon: 'heart-outline' },
    { id: 'act-2', text: 'Packed 8 family food boxes for distribution', time: '5 hours ago', icon: 'package-variant-closed' },
    { id: 'act-3', text: 'Shelf audit completed for Canned Goods (Shelf A)', time: 'Yesterday', icon: 'checkbox-marked-circle-outline' }
  ],
  isLoaded: false,
  currentDraft: [],

  loadStore: async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) {
        const parsed = JSON.parse(json);
        set({
          inventory: parsed.inventory || INITIAL_INVENTORY,
          boxRules: parsed.boxRules || INITIAL_BOX_RULES,
          thresholds: parsed.thresholds || INITIAL_THRESHOLDS,
          settings: parsed.settings || INITIAL_SETTINGS,
          activities: parsed.activities || [],
          isLoaded: true
        });
      } else {
        set({ isLoaded: true });
        await get().saveStore();
      }
    } catch (err) {
      console.error('AsyncStorage load error:', err);
      set({ isLoaded: true });
    }
  },

  saveStore: async () => {
    try {
      const state = get();
      const data = {
        inventory: state.inventory,
        boxRules: state.boxRules,
        thresholds: state.thresholds,
        settings: state.settings,
        activities: state.activities
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('AsyncStorage save error:', err);
    }
  },

  resetToDefaults: async () => {
    set({
      inventory: JSON.parse(JSON.stringify(INITIAL_INVENTORY)),
      boxRules: JSON.parse(JSON.stringify(INITIAL_BOX_RULES)),
      thresholds: JSON.parse(JSON.stringify(INITIAL_THRESHOLDS)),
      settings: JSON.parse(JSON.stringify(INITIAL_SETTINGS)),
      currentDraft: []
    });
    await get().saveStore();
  },

  addItems: (items: Partial<InventoryItem>[], source = 'donation') => {
    const newItems: InventoryItem[] = items.map(item => ({
      id: 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      name: item.name?.trim() || 'Unlabeled Item',
      category: (item.category as any) || 'unknown',
      count: parseInt(String(item.count), 10) || 1,
      expiration: item.expiration || null,
      date_added: new Date().toISOString().split('T')[0],
      source: source,
      confidence: item.confidence || 1.0
    }));

    set(state => ({
      inventory: [...state.inventory, ...newItems]
    }));
    get().addActivity(`Added ${newItems.length} verified item(s) via ${source}`, 'plus-circle-outline');
    get().saveStore();
  },

  updateItem: (id: string, updates: Partial<InventoryItem>) => {
    set(state => ({
      inventory: state.inventory.map(item => (item.id === id ? { ...item, ...updates } : item))
    }));
    get().saveStore();
  },

  deleteItem: (id: string) => {
    const item = get().inventory.find(i => i.id === id);
    set(state => ({
      inventory: state.inventory.filter(i => i.id !== id)
    }));
    if (item) {
      get().addActivity(`Removed "${item.name}" from inventory`, 'trash-can-outline');
    }
    get().saveStore();
  },

  deductItems: (itemsToDeduct: { id: string; count: number }[]) => {
    set(state => {
      const updated = state.inventory
        .map(item => {
          const match = itemsToDeduct.find(d => d.id === item.id);
          if (match) {
            return { ...item, count: Math.max(0, item.count - match.count) };
          }
          return item;
        })
        .filter(item => item.count > 0);

      return { inventory: updated };
    });
    get().addActivity(`Packed boxes: deducted items from stock`, 'archive-outline');
    get().saveStore();
  },

  updateSettings: (updates: Partial<Settings>) => {
    set(state => ({ settings: { ...state.settings, ...updates } }));
    get().saveStore();
  },

  updateBoxRules: (updates: Partial<BoxRules>) => {
    set(state => ({ boxRules: { ...state.boxRules, ...updates } }));
    get().saveStore();
  },

  updateThresholds: (updates: Partial<CategoryThresholds>) => {
    set(state => ({ thresholds: { ...state.thresholds, ...updates } }));
    get().saveStore();
  },

  setDraft: (items: InventoryItem[]) => {
    set({ currentDraft: items });
  },

  addActivity: (text: string, icon = 'information-outline') => {
    const newAct: Activity = {
      id: 'act-' + Date.now(),
      text,
      time: 'Just now',
      icon
    };
    set(state => ({
      activities: [newAct, ...state.activities.slice(0, 19)]
    }));
  }
}));
