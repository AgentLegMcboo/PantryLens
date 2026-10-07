export const COLORS = {
  // Core Brand Colors
  primary: '#9C4226',
  primaryLight: '#BC5A3C',
  primaryDark: '#8F3E24',
  /** The lip under a pressed-in button. Must be clearly darker than primary. */
  primaryDeep: '#5E2411',
  secondary: '#6B8E4E',
  
  // Surfaces
  //
  // The canvas is the original warm cream — a deeper sand was tried and read as
  // muddy. That leaves cards at only 1.08:1 against it, so fill alone can never
  // separate them: the shadow does the work instead, and cards are pure white to
  // take every bit of the little contrast available.
  //
  // `surfaceContainer` deliberately sits BELOW the page rather than above it.
  // Grouped-but-secondary content should recede; only cards float.
  background: '#FFFFFF', // EXPERIMENT: was '#FBF6EE'
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
    unknown: '#8A8880'
  }
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  touch: 48 // 48px minimum touch target for accessibility
};

export const RADII = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999
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
 * The shared card treatment for screens still written in StyleSheet.
 *
 * Mirrors `cardShadow` + the border in components/ui/card.tsx so a screen that
 * has not been ported does not look like it came from a different app. A
 * visible warm edge does the defining; the shadow only lifts the card slightly
 * off the page — white on cream is 1.08:1, so an edge is the only thing that
 * can actually delineate one.
 */
export const CARD_ELEVATION = {
  borderWidth: 2,
  // A heavier near edge. Reads as a thin physical card rather than an outline.
  borderBottomWidth: 3,
  borderColor: COLORS.borderSoft,
  shadowColor: COLORS.shadow,
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;

/**
 * One-sided rules, as style objects.
 *
 * The className forms (`border-b border-hairline`) drew all four sides on
 * Android, boxing in what should have been an underline. Plain style props do
 * exactly what they say.
 */
export const RULE_BELOW = { borderBottomWidth: 1.5, borderBottomColor: COLORS.borderSoft } as const;
export const RULE_ABOVE = { borderTopWidth: 1.5, borderTopColor: COLORS.borderSoft } as const;
