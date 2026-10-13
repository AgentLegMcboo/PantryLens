/**
 * The single source of truth for PantryLens colour.
 *
 * Plain JS, not TypeScript, for one reason: `tailwind.config.js` is loaded by
 * Node at build time and cannot import a .ts module, while the app needs these
 * same values at runtime. Keeping them here means the Tailwind theme and
 * `constants/theme.ts` can never drift into two slightly different palettes —
 * which is exactly how an app ends up with four nearly-identical creams.
 *
 * The palette is warm on purpose. It is a food pantry, not a dashboard.
 */
const COLORS = {
  // Core brand
  primary: '#9C4226',
  primaryLight: '#BC5A3C',
  primaryDark: '#8F3E24',
  /** The lip under a pressed-in button. Must be clearly darker than primary. */
  primaryDeep: '#5E2411',
  secondary: '#6B8E4E',
  /** Secondary for text and solid fills: 5.4:1 on cream, white on it 5.8:1.
   *  The plain sage is only 3.5:1 — fine for icons, too light for words. */
  secondaryDark: '#4F6E3A',
  /** A wash of the secondary, behind icons. */
  secondaryTint: '#EEF3E8',

  // Surfaces
  //
  // The canvas is the original warm cream — a deeper sand was tried and read as
  // muddy. That leaves cards at only 1.08:1 against it, so fill alone can never
  // separate them: the shadow does the work instead, and cards are pure white to
  // take every bit of the little contrast available.
  //
  // `surfaceContainer` deliberately sits BELOW the page rather than above it.
  // Grouped-but-secondary content should recede; only cards float.
  background: '#FBF6EE',
  cardSurface: '#FFFFFF',
  surfaceContainer: '#F5EADF',
  surfaceVariant: '#EDE0D9',
  borderSoft: '#E0CDBB',
  /** Outline for controls. Deliberately stronger than borderSoft — a small
   *  chip has too little edge for the card tone to register. */
  borderStrong: '#CDB498',
  /** Warm brown, never grey — a grey shadow on a cream ground looks like dirt. */
  shadow: '#6B4A2F',

  // Typography
  textPrimary: '#2B2420',
  textSecondary: '#6B6259',
  textOnPrimary: '#FFFFFF',

  // Status (sacred — these three carry meaning, never decoration)
  statusGood: '#5B8C51',
  statusWarning: '#E39A3B',
  statusCritical: '#C0392B',

  // Food category hues
  categories: {
    grain: '#C9A227',
    vegetable: '#5B9C4E',
    protein: '#A6432B',
    breakfast: '#D98A2B',
    snack: '#8E6FC4',
    hygiene: '#3AA0A0',
    baby: '#D46A9F',
    unknown: '#8A8880',
  },
};

const RADII = { sm: 4, md: 8, lg: 16, xl: 24, full: 9999 };

module.exports = { COLORS, RADII };
