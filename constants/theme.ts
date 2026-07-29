export const COLORS = {
  // Core Brand Colors
  primary: '#9C4226',
  primaryLight: '#BC5A3C',
  primaryDark: '#8F3E24',
  secondary: '#6B8E4E',
  
  // Surfaces
  background: '#FBF6EE',
  cardSurface: '#FEFBF6',
  surfaceContainer: '#F9EBE5',
  surfaceVariant: '#EDE0D9',
  borderSoft: '#E5DBCB',
  
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
