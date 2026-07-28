import { supabase } from './supabase';
import { InventoryItem } from './store';

export async function processImageScan(base64Image: string): Promise<Partial<InventoryItem>[]> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-donation', {
      body: { imageBase64: base64Image }
    });

    if (error) {
      console.error("Error invoking analyze-donation function:", error);
      throw error;
    }

    if (data && data.items) {
      return data.items;
    }

    return [];
  } catch (err) {
    console.error("Failed to process image scan:", err);
    throw err;
  }
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
