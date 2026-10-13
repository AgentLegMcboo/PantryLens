const { COLORS, RADII } = require('./constants/palette');

/**
 * Tailwind theme for NativeWind.
 *
 * Every colour comes from constants/palette.js, so `bg-card` here and
 * `COLORS.cardSurface` in a StyleSheet are guaranteed to be the same cream.
 * Nothing is hardcoded in this file on purpose.
 *
 * The spacing and type scales are deliberately SHORT. The app had 21 distinct
 * font sizes with 145 declarations packed between 10 and 14px, which is why
 * every screen read as crowded — with that many steps nothing can be a
 * hierarchy. Six sizes and a 4px-based spacing rhythm is enough for an app
 * a volunteer uses one-handed in a back room.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: COLORS.primary,
          light: COLORS.primaryLight,
          dark: COLORS.primaryDark,
          deep: COLORS.primaryDeep,
        },
        secondary: { DEFAULT: COLORS.secondary, dark: COLORS.secondaryDark, tint: COLORS.secondaryTint },

        canvas: COLORS.background,
        card: COLORS.cardSurface,
        subtle: COLORS.surfaceContainer,
        muted: COLORS.surfaceVariant,
        hairline: COLORS.borderSoft,
        outline: COLORS.borderStrong,

        ink: {
          DEFAULT: COLORS.textPrimary,
          soft: COLORS.textSecondary,
          on: COLORS.textOnPrimary,
        },

        good: COLORS.statusGood,
        warn: COLORS.statusWarning,
        critical: COLORS.statusCritical,

        cat: COLORS.categories,
      },

      // Six steps. Anything smaller than `micro` is unreadable at arm's length
      // in poor light, which is the actual working condition here.
      fontSize: {
        micro: ['12px', { lineHeight: '17px' }],
        label: ['14px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '24px' }],
        heading: ['17px', { lineHeight: '23px' }],
        title: ['22px', { lineHeight: '28px' }],
        headline: ['26px', { lineHeight: '31px' }],
        display: ['30px', { lineHeight: '36px' }],
      },

      borderRadius: {
        sm: `${RADII.sm}px`,
        md: `${RADII.md}px`,
        lg: `${RADII.lg}px`,
        xl: `${RADII.xl}px`,
      },

      spacing: {
        gutter: '20px', // page edge — was 16, which crowded every screen edge
        card: '20px', // inside a card
        gap: '16px', // card to card — was 8
      },
    },
  },
  plugins: [],
};
