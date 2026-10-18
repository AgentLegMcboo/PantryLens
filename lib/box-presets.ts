import type { DietTag } from './diet';
import type { BoxRules } from './store';

/**
 * Boxes a pantry can start from, and the small amount of logic every box shares.
 *
 * Pure, with a type-only import, so it runs anywhere without a device or a
 * network.
 *
 * The preset quantities are sensible starting points, NOT a standard. Every
 * pantry decides what its boxes hold, which is why a preset can be used once,
 * or copied and edited into the pantry's own template.
 */

/** Every category a box can ask for, in the order they are shown. */
export const BOX_CATEGORIES: (keyof BoxRules)[] = [
  'grain',
  'vegetable',
  'protein',
  'breakfast',
  'snack',
  'hygiene',
  'baby',
];

/** The most of any one category a single box can ask for. */
export const MAX_PER_CATEGORY = 99;

/**
 * Turns whatever is stored or received into a complete, sane set of rules.
 *
 * Every category present, every value a whole number from 0 to 99. It runs on
 * data from the database and from route params, and a single `NaN` there would
 * make the allocator report zero boxes without saying why.
 */
export function normaliseRules(raw: unknown): BoxRules {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rules = {} as BoxRules;
  for (const category of BOX_CATEGORIES) {
    const n = Math.floor(Number(source[category]));
    rules[category] = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_CATEGORY) : 0;
  }
  return rules;
}

/**
 * One particular product a box must hold, as opposed to "any 2 protein".
 * Matched to stock by name, ignoring case and surrounding spaces.
 */
export interface BoxItemRule {
  name: string;
  /** Where it's grouped on the pick list. */
  category: keyof BoxRules;
  /** Per box, for a family of 4 when the box scales. */
  count: number;
}

/** Same job as normaliseRules, for the specific-items list. */
export function normaliseItems(raw: unknown): BoxItemRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BoxItemRule[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    const n = Math.floor(Number(e.count));
    const category = BOX_CATEGORIES.includes(e.category as keyof BoxRules)
      ? (e.category as keyof BoxRules)
      : 'snack';
    seen.add(key);
    out.push({ name, category, count: Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PER_CATEGORY) : 1 });
  }
  return out;
}

/** How many items one box holds, before any family-size scaling. */
export function itemsPerBox(rules: BoxRules): number {
  return BOX_CATEGORIES.reduce((sum, category) => sum + (rules[category] || 0), 0);
}

/** "2 grain · 2 vegetable · 1 hygiene", the one-line summary shown under a box's name. */
export function describeRules(rules: BoxRules, items: BoxItemRule[] = []): string {
  const parts = [
    ...items.map(i => `${i.count} ${i.name}`),
    ...BOX_CATEGORIES.filter(c => rules[c] > 0).map(c => `${rules[c]} ${c}`),
  ];
  return parts.length > 0 ? parts.join(' · ') : 'Empty. Add at least one item.';
}

/**
 * A name nobody in this pantry has used yet: "Senior box", then "Senior box 2".
 *
 * Template names are unique per pantry, ignoring case, so saving a copy of a
 * preset the pantry already has would otherwise fail with a conflict.
 */
export function uniqueBoxName(base: string, taken: string[]): string {
  const used = new Set(taken.map(n => n.trim().toLowerCase()));
  const name = base.trim();
  if (!used.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export interface BoxPreset {
  key: string;
  name: string;
  description: string;
  /** See box_templates.scales_with_family. */
  scalesWithFamily: boolean;
  rules: BoxRules;
  /** Nothing known to carry these goes in. See lib/diet.ts. */
  excludesTags?: DietTag[];
  /** Everything in the box must carry all of these. */
  requiresTags?: DietTag[];
}

export const BOX_PRESETS: BoxPreset[] = [
  {
    key: 'standard',
    name: 'Standard family box',
    description: 'A balanced week of staples.',
    scalesWithFamily: true,
    rules: { grain: 2, vegetable: 2, protein: 2, breakfast: 1, snack: 1, hygiene: 1, baby: 0 },
  },
  {
    key: 'senior',
    name: 'Senior box',
    description: 'More produce and protein, no snacks.',
    scalesWithFamily: true,
    rules: { grain: 1, vegetable: 2, protein: 2, breakfast: 1, snack: 0, hygiene: 1, baby: 0 },
  },
  {
    key: 'baby',
    name: 'Baby & toddler box',
    description: 'Staples plus formula, baby food and diapers.',
    scalesWithFamily: true,
    rules: { grain: 1, vegetable: 1, protein: 1, breakfast: 1, snack: 1, hygiene: 1, baby: 3 },
  },
  {
    key: 'snack-pack',
    name: "Kids' snack pack",
    description: 'One per child, so it does not scale with family size.',
    scalesWithFamily: false,
    rules: { grain: 0, vegetable: 0, protein: 0, breakfast: 1, snack: 3, hygiene: 0, baby: 0 },
  },
  {
    key: 'hygiene-kit',
    name: 'Hygiene kit',
    description: 'One per household, whatever its size.',
    scalesWithFamily: false,
    rules: { grain: 0, vegetable: 0, protein: 0, breakfast: 0, snack: 0, hygiene: 4, baby: 0 },
  },

  /**
   * The three below exist because of what people who use food banks say goes
   * wrong — bread handed to someone who cannot eat it, a pie pumpkin handed to
   * someone with no stove, a tin handed to someone with no opener. A preset is
   * how a pantry finds out the app can do this at all; a setting nobody knows
   * about helps nobody.
   */
  {
    key: 'no-kitchen',
    name: 'No-kitchen box',
    description:
      'Only food that needs no cooking and opens without a tin opener — for someone in a car, a shelter, or a room with no stove.',
    scalesWithFamily: true,
    rules: { grain: 1, vegetable: 1, protein: 2, breakfast: 1, snack: 2, hygiene: 1, baby: 0 },
    requiresTags: ['no-cook', 'easy-open'],
  },
  {
    key: 'wheat-free',
    name: 'Wheat-free box',
    description:
      'Leaves out everything known to contain wheat or gluten. Check anything a coeliac household depends on — plenty of food has never been catalogued.',
    scalesWithFamily: true,
    rules: { grain: 1, vegetable: 2, protein: 2, breakfast: 1, snack: 1, hygiene: 1, baby: 0 },
    excludesTags: ['contains-wheat'],
  },
  {
    key: 'plant-based',
    name: 'Plant-based box',
    description: 'Only food recorded as vegan, for a household that has asked.',
    scalesWithFamily: true,
    rules: { grain: 2, vegetable: 3, protein: 2, breakfast: 1, snack: 1, hygiene: 1, baby: 0 },
    requiresTags: ['vegan'],
  },
];
