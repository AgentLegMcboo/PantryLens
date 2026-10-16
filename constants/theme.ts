import { Platform, type TextStyle } from 'react-native';

export const COLORS = {
  // Core Brand Colors
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

  // Status Colors (Sacred)
  statusGood: '#5B8C51',
  statusWarning: '#E39A3B',
  statusCritical: '#C0392B',

  // Food Category Hues
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

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  touch: 48, // 48px minimum touch target for accessibility
};

export const RADII = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
};
/**
 * Typography.
 *
 * Newsreader is a transitional serif — used sparingly for the wordmark and the
 * headings that carry weight, so those moments feel considered while the working
 * UI (counts, labels, buttons) stays in the system sans for legibility at a
 * glance. Loaded in app/_layout.tsx; the names below are the loaded keys.
 */
export const FONTS = {
  serif: 'Newsreader_500Medium',
  serifSemi: 'Newsreader_600SemiBold',
  serifItalic: 'Newsreader_500Medium_Italic',
} as const;

/**
 * One-sided rules, as style objects.
 *
 * The className pairs (`border-b border-hairline`, `border-t border-hairline`)
 * draw a box on all four sides on Android instead of a single line — a divider
 * turns into a square outline around the whole row. Plain style props do
 * exactly what they say.
 */
export const RULE_BELOW = { borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft } as const;
export const RULE_ABOVE = { borderTopWidth: 1, borderTopColor: COLORS.borderSoft } as const;
/** The same rules at 60%, for the lighter dividers on pantry selection. */
export const RULE_BELOW_FAINT = { borderBottomWidth: 1, borderBottomColor: 'rgba(224,205,187,0.6)' } as const;
export const RULE_ABOVE_FAINT = { borderTopWidth: 1, borderTopColor: 'rgba(224,205,187,0.6)' } as const;

type Weight = '400' | '500' | '600' | '700' | '800' | '900';
const ANDROID_WEIGHT: Record<Weight, Weight> = {
  '400': '400',
  '500': '600',
  '600': '700',
  '700': '800',
  '800': '900',
  '900': '900',
};

/**
 * A font weight for an inline style, one step heavier on Android.
 *
 * SF Pro renders every weight visibly heavier than Roboto, so the same weight
 * looked thin on Android. tailwind.config.js does the same for the `font-*`
 * classes; this covers styles written by hand. iOS gets the weight as given.
 */
export function fw(weight: Weight): NonNullable<TextStyle['fontWeight']> {
  return Platform.OS === 'android' ? ANDROID_WEIGHT[weight] : weight;
}
