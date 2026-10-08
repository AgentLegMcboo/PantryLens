export { COLORS } from './palette';
export { RADII } from './palette';
import { COLORS } from './palette';
import type { TextStyle } from 'react-native';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  touch: 48 // 48px minimum touch target for accessibility
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

export const TYPOGRAPHY = {
  pageTitle: { fontFamily: FONTS.serifSemi, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  heroTitle: { fontFamily: FONTS.serifSemi, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: FONTS.serifSemi, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  metric: { fontFamily: FONTS.serifSemi, fontSize: 36, lineHeight: 42, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const SURFACE_SHADOW = {
  boxShadow: '0 2px 6px rgba(107, 74, 47, 0.045)',
  borderCurve: 'continuous',
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
  borderWidth: 1,
  // A heavier near edge. Reads as a thin physical card rather than an outline.
  borderBottomWidth: 1,
  borderColor: COLORS.borderSoft,
  ...SURFACE_SHADOW,
} as const;
