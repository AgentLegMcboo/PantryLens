import { InventoryItem } from './store';

export interface ScanPreset {
  id: string;
  name: string;
  description: string;
  items: Partial<InventoryItem>[];
}

export const SAMPLE_PRESETS: ScanPreset[] = [
  {
    id: 'preset-1',
    name: 'School Food Drive (Bag 1)',
    description: 'Mixed bag with peanut butter, pasta, canned beans, and cereal',
    items: [
      { name: 'Creamy Peanut Butter (16 oz)', category: 'protein', count: 2, expiration: '2026-08-20', confidence: 0.96 },
      { name: 'Black Beans 15 oz', category: 'protein', count: 4, expiration: '2027-02-15', confidence: 0.92 },
      { name: 'Rotini Pasta 16 oz', category: 'grain', count: 3, expiration: '2026-09-01', confidence: 0.98 },
      { name: 'Canned Green Beans 14.5 oz', category: 'vegetable', count: 5, expiration: '2026-08-10', confidence: 0.64 } // Low confidence!
    ]
  },
  {
    id: 'preset-2',
    name: 'Grocery Store Overflow Box',
    description: 'Box of canned fruit, corn, oats, and applesauce',
    items: [
      { name: 'Canned Sweet Corn (15 oz)', category: 'vegetable', count: 6, expiration: '2026-11-20', confidence: 0.95 },
      { name: 'Quick Oats (18 oz)', category: 'breakfast', count: 2, expiration: '2026-08-04', confidence: 0.89 },
      { name: 'Apple Sauce Cups (6 pk)', category: 'snack', count: 3, expiration: '2026-10-12', confidence: 0.97 },
      { name: 'Mystery Canned Item', category: 'unknown', count: 1, expiration: null, confidence: 0.45 } // Low confidence & unknown
    ]
  },
  {
    id: 'preset-3',
    name: 'Community Care Box',
    description: 'Infant formula, bar soaps, tuna cans, granola bars',
    items: [
      { name: 'Canned Chunk Light Tuna (5 oz)', category: 'protein', count: 8, expiration: '2026-08-14', confidence: 0.94 },
      { name: 'Granola Bars Variety Pack (10 ct)', category: 'snack', count: 2, expiration: '2026-08-30', confidence: 0.91 },
      { name: 'Bar Soap (3 pk)', category: 'hygiene', count: 4, expiration: null, confidence: 0.99 },
      { name: 'Infant Formula Powder (12 oz)', category: 'baby', count: 2, expiration: '2026-08-08', confidence: 0.68 } // Low confidence!
    ]
  }
];

export function processImageScan(presetId?: string): Partial<InventoryItem>[] {
  const preset = SAMPLE_PRESETS.find(p => p.id === presetId) || SAMPLE_PRESETS[0];
  return preset.items;
}

export function lookupBarcode(barcode: string): Partial<InventoryItem> {
  const barcodeDB: Record<string, Partial<InventoryItem>> = {
    '0111222333': { name: 'Canned Garbanzo Beans 15 oz', category: 'protein', count: 1, expiration: '2027-04-10', confidence: 1.0 },
    '0412200112': { name: 'Whole Wheat Bread Loaf', category: 'grain', count: 1, expiration: '2026-08-02', confidence: 1.0 },
    '0700000123': { name: 'Chicken Noodle Soup 10.5 oz', category: 'protein', count: 1, expiration: '2026-09-20', confidence: 1.0 }
  };

  return barcodeDB[barcode] || {
    name: `Scanned Item (${barcode})`,
    category: 'unknown',
    count: 1,
    expiration: null,
    confidence: 1.0
  };
}
