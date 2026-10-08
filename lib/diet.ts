/**
 * What is true about a tin, beyond what category it belongs to.
 *
 * The app could always say a box was balanced across grain, protein and
 * vegetable. It could not say whether the person opening it could eat what was
 * inside. People who use food banks are consistent about this being the part
 * that goes wrong — bread handed to someone with coeliac disease, a pie pumpkin
 * handed to someone with no stove, a tin handed to someone with no can opener
 * and arthritic hands.
 *
 * THE SAFETY RULE THAT GOVERNS EVERY STRING IN THIS FILE:
 *
 * A `contains-*` tag is a positive claim — something told us this allergen IS
 * present. Its absence is NOT a claim of safety. Most tags come from Open Food
 * Facts, which is crowd-sourced and incomplete, and an uncatalogued tin arrives
 * with no tags at all. So the app says "contains wheat" and never "wheat-free".
 * Excluding a tag from a box removes what is KNOWN to carry it; it cannot
 * promise the rest is clean. Every label here is written to survive that
 * distinction, and the wording is not decoration.
 */

export type DietTag =
  | 'contains-wheat'
  | 'contains-milk'
  | 'contains-eggs'
  | 'contains-peanuts'
  | 'contains-tree-nuts'
  | 'contains-soy'
  | 'contains-fish'
  | 'contains-shellfish'
  | 'contains-sesame'
  | 'vegan'
  | 'vegetarian'
  | 'no-cook'
  | 'easy-open';

/** Must match diet_tag_vocabulary() in the migration exactly. */
export const DIET_TAGS: DietTag[] = [
  'contains-wheat',
  'contains-milk',
  'contains-eggs',
  'contains-peanuts',
  'contains-tree-nuts',
  'contains-soy',
  'contains-fish',
  'contains-shellfish',
  'contains-sesame',
  'vegan',
  'vegetarian',
  'no-cook',
  'easy-open',
];

export const ALLERGEN_TAGS: DietTag[] = DIET_TAGS.filter(t =>
  t.startsWith('contains-'),
) as DietTag[];

export const DIET_TAG_LABELS: Record<DietTag, string> = {
  'contains-wheat': 'Wheat / gluten',
  'contains-milk': 'Milk',
  'contains-eggs': 'Eggs',
  'contains-peanuts': 'Peanuts',
  'contains-tree-nuts': 'Tree nuts',
  'contains-soy': 'Soy',
  'contains-fish': 'Fish',
  'contains-shellfish': 'Shellfish',
  'contains-sesame': 'Sesame',
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'no-cook': 'No cooking needed',
  'easy-open': 'Opens without a tin opener',
};

/** Why a volunteer would care, in one line. */
export const DIET_TAG_BLURBS: Partial<Record<DietTag, string>> = {
  'no-cook':
    'Edible as it is — no stove, no pan, no boiling water. The difference between food and a parcel somebody cannot use.',
  'easy-open':
    'Pull tab or screw top. A tin opener is a thing people living in a car and people with weak hands both lack.',
  vegan: 'No animal products at all.',
  vegetarian: 'No meat or fish, but may contain milk or eggs.',
};

export const DIET_TAG_ICONS: Record<DietTag, string> = {
  'contains-wheat': 'barley',
  'contains-milk': 'cup-water',
  'contains-eggs': 'egg-outline',
  'contains-peanuts': 'peanut-outline',
  'contains-tree-nuts': 'tree-outline',
  'contains-soy': 'sprout-outline',
  'contains-fish': 'fish',
  'contains-shellfish': 'fishbowl-outline',
  'contains-sesame': 'seed-outline',
  vegan: 'leaf',
  vegetarian: 'carrot',
  'no-cook': 'silverware-variant',
  'easy-open': 'gesture-tap-button',
};

/** How the tag groups read on a screen, in the order a volunteer thinks about them. */
export const DIET_TAG_GROUPS: { title: string; hint: string; tags: DietTag[] }[] = [
  {
    title: 'Known to contain',
    hint: 'Only ticked when something actually told us so. Leaving one unticked does not mean the food is free of it.',
    tags: ALLERGEN_TAGS,
  },
  {
    title: 'Diet',
    hint: 'Useful for anyone who has asked, and for a box built to suit them.',
    tags: ['vegan', 'vegetarian'],
  },
  {
    title: 'Can they actually use it?',
    hint: 'The two nobody records. A box for someone with no kitchen depends on both.',
    tags: ['no-cook', 'easy-open'],
  },
];

export const isAllergenTag = (tag: string): boolean => tag.startsWith('contains-');

/** Anything not in the vocabulary is dropped rather than stored — the column refuses it anyway. */
export function normaliseDietTags(raw: unknown): DietTag[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(DIET_TAGS);
  const seen = new Set<DietTag>();
  for (const value of raw) {
    const tag = String(value ?? '').trim().toLowerCase();
    if (known.has(tag)) seen.add(tag as DietTag);
  }
  // Stored in vocabulary order so two equal sets compare equal as text.
  return DIET_TAGS.filter(tag => seen.has(tag));
}

export const label = (tag: DietTag): string => DIET_TAG_LABELS[tag] ?? tag;

/**
 * Whether this food may go in a box with these constraints.
 *
 * `excludes` is about harm: anything KNOWN to carry the tag is out.
 * `requires` is about usability: everything in the box must carry all of them,
 * and a tin nobody has tagged therefore does NOT qualify. That asymmetry is
 * deliberate and is the safe direction in both cases — an unknown tin is not
 * assumed clean, and it is not assumed usable either.
 */
export function allowedInBox(
  tags: readonly string[] | null | undefined,
  excludes: readonly string[] = [],
  requires: readonly string[] = [],
): boolean {
  const has = new Set(tags ?? []);
  for (const tag of excludes) if (has.has(tag)) return false;
  for (const tag of requires) if (!has.has(tag)) return false;
  return true;
}

/** "Contains wheat, milk · no cooking needed" — for a row that has no space for chips. */
export function describeTags(tags: readonly string[]): string {
  const known = normaliseDietTags(tags);
  if (known.length === 0) return '';

  const allergens = known.filter(isAllergenTag);
  const rest = known.filter(t => !isAllergenTag(t));

  const parts: string[] = [];
  if (allergens.length > 0) {
    parts.push(
      `Contains ${allergens
        .map(t => DIET_TAG_LABELS[t].toLowerCase())
        .join(', ')}`,
    );
  }
  for (const tag of rest) parts.push(DIET_TAG_LABELS[tag].toLowerCase());
  return parts.join(' · ');
}

/** Said wherever a box constraint is set or its results are shown. Never softened. */
export const EXCLUSION_CAVEAT =
  'This leaves out what is known to contain it. Plenty of food has never been catalogued, so it cannot promise the rest is free of it — check anything a household depends on.';
