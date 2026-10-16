import { Platform, type TextStyle } from "react-native";
import { useAppAppearance } from "../lib/appearance";

export const LIGHT_COLORS = {
  // Core Brand Colors
  primary: "#DFA06B",
  primaryLight: "#F8D8BA",
  primaryDark: "#97501E",
  /** The lip under a pressed-in button. Must be clearly darker than primary. */
  primaryDeep: "#BD7D46",
  secondary: "#788573",
  /** Secondary for text and solid fills: 5.4:1 on cream, white on it 5.8:1.
   *  The plain sage is only 3.5:1 — fine for icons, too light for words. */
  secondaryDark: "#52664F",
  /** A wash of the secondary, behind icons. */
  secondaryTint: "#EDF0EA",

  // Surfaces
  //
  // The canvas is the original warm cream — a deeper sand was tried and read as
  // muddy. That leaves cards at only 1.08:1 against it, so fill alone can never
  // separate them: the shadow does the work instead, and cards are pure white to
  // take every bit of the little contrast available.
  //
  // `surfaceContainer` deliberately sits BELOW the page rather than above it.
  // Grouped-but-secondary content should recede; only cards float.
  background: "#F7F5F1",
  cardSurface: "#FFFFFF",
  surfaceContainer: "#F0EDE8",
  surfaceVariant: "#E8E1DA",
  borderSoft: "#DED6CD",
  /** Outline for controls. Deliberately stronger than borderSoft — a small
   *  chip has too little edge for the card tone to register. */
  borderStrong: "#B7A798",
  /** Warm brown, never grey — a grey shadow on a cream ground looks like dirt. */
  shadow: "#6B4A2F",

  // Typography
  textPrimary: "#2B2420",
  textSecondary: "#6B6259",
  textOnPrimary: "#FFFFFF",
  textOnAccent: "#452B19",

  // Status Colors (Sacred)
  statusGood: "#627A5C",
  statusWarning: "#A47D3F",
  statusCritical: "#A4483F",

  // Food Category Hues
  categories: {
    grain: "#9C8A54",
    vegetable: "#748A69",
    protein: "#926859",
    breakfast: "#A8895C",
    snack: "#8B7D9F",
    hygiene: "#678D8B",
    baby: "#A57E90",
    unknown: "#8A8880",
  },
};

export const DARK_COLORS: typeof LIGHT_COLORS = {
  ...LIGHT_COLORS,
  primary: "#DFA06B",
  primaryLight: "#F5C99F",
  primaryDark: "#F5C99F",
  primaryDeep: "#BD7D46",
  secondary: "#8E9D87",
  secondaryDark: "#B0BDA9",
  secondaryTint: "#293026",
  background: "#141311",
  cardSurface: "#2B2824",
  surfaceContainer: "#24211E",
  surfaceVariant: "#393530",
  borderSoft: "#484139",
  borderStrong: "#756B5F",
  shadow: "#000000",
  textPrimary: "#F7F4EF",
  textSecondary: "#C7C0B7",
  statusGood: "#A2B299",
  statusWarning: "#D0B27D",
  statusCritical: "#D99B93",
};

// Keep existing screen colour references intact while adapting them to appearance.
export const COLORS = new Proxy(LIGHT_COLORS, {
  get: (_target, key: keyof typeof LIGHT_COLORS) =>
    (useAppAppearance.getState().scheme === "dark"
      ? DARK_COLORS
      : LIGHT_COLORS)[key],
});

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
 * Use the platform system family, matching the UI mockup (San Francisco on iOS).
 * Legacy keys stay available so existing consumers keep working.
 */
export const FONTS = {
  serif: Platform.OS === "ios" ? "System" : "sans-serif",
  serifSemi: Platform.OS === "ios" ? "System" : "sans-serif",
  serifItalic: Platform.OS === "ios" ? "System" : "sans-serif",
} as const;

/**
 * One-sided rules, as style objects.
 *
 * The className pairs (`border-b border-hairline`, `border-t border-hairline`)
 * draw a box on all four sides on Android instead of a single line — a divider
 * turns into a square outline around the whole row. Plain style props do
 * exactly what they say.
 */
export const RULE_BELOW = {
  borderBottomWidth: 1,
  get borderBottomColor() {
    return COLORS.borderSoft;
  },
} as const;
export const RULE_ABOVE = {
  borderTopWidth: 1,
  get borderTopColor() {
    return COLORS.borderSoft;
  },
} as const;
/** The same rules at 60%, for the lighter dividers on pantry selection. */
export const RULE_BELOW_FAINT = {
  borderBottomWidth: 1,
  borderBottomColor: "rgba(224,205,187,0.6)",
} as const;
export const RULE_ABOVE_FAINT = {
  borderTopWidth: 1,
  borderTopColor: "rgba(224,205,187,0.6)",
} as const;

type Weight = "400" | "500" | "600" | "700" | "800" | "900";
const ANDROID_WEIGHT: Record<Weight, Weight> = {
  "400": "400",
  "500": "600",
  "600": "700",
  "700": "800",
  "800": "900",
  "900": "900",
};

/**
 * A font weight for an inline style, one step heavier on Android.
 *
 * SF Pro renders every weight visibly heavier than Roboto, so the same weight
 * looked thin on Android. tailwind.config.js does the same for the `font-*`
 * classes; this covers styles written by hand. iOS gets the weight as given.
 */
export function fw(weight: Weight): NonNullable<TextStyle["fontWeight"]> {
  return Platform.OS === "android" ? ANDROID_WEIGHT[weight] : weight;
}
