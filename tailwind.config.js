const { COLORS, RADII } = require('./constants/palette');
// NativeWind builds this CSS once per platform with NATIVEWIND_OS set.
const ANDROID = process.env.NATIVEWIND_OS === 'android';

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
      // Android one step heavier than iOS. SF Pro renders every weight visibly
      // heavier than Roboto, so the same `font-semibold` looked thin on Android
      // next to the iOS build the team prefers. iOS keeps the standard values.
      fontWeight: {
        medium: ANDROID ? '600' : '500',
        semibold: ANDROID ? '700' : '600',
        bold: ANDROID ? '800' : '700',
        extrabold: ANDROID ? '900' : '800',
      },
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          light: 'rgb(var(--color-primaryLight) / <alpha-value>)',
          dark: 'rgb(var(--color-primaryDark) / <alpha-value>)',
          deep: 'rgb(var(--color-primaryDeep) / <alpha-value>)',
        },
        secondary: { DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)', dark: 'rgb(var(--color-secondaryDark) / <alpha-value>)', tint: 'rgb(var(--color-secondaryTint) / <alpha-value>)' },

        canvas: 'rgb(var(--color-background) / <alpha-value>)',
        card: 'rgb(var(--color-cardSurface) / <alpha-value>)',
        subtle: 'rgb(var(--color-surfaceContainer) / <alpha-value>)',
        muted: 'rgb(var(--color-surfaceVariant) / <alpha-value>)',
        hairline: 'rgb(var(--color-borderSoft) / <alpha-value>)',
        outline: 'rgb(var(--color-borderStrong) / <alpha-value>)',

        ink: {
          DEFAULT: 'rgb(var(--color-textPrimary) / <alpha-value>)',
          soft: 'rgb(var(--color-textSecondary) / <alpha-value>)',
          on: 'rgb(var(--color-textOnPrimary) / <alpha-value>)',
        },

        good: 'rgb(var(--color-statusGood) / <alpha-value>)',
        warn: 'rgb(var(--color-statusWarning) / <alpha-value>)',
        critical: 'rgb(var(--color-statusCritical) / <alpha-value>)',

        cat: COLORS.categories,
      },

      // Six steps. Anything smaller than `micro` is unreadable at arm's length
      // in poor light, which is the actual working condition here.
      fontSize: {
        micro: ['12px', { lineHeight: '17px' }],
        label: ['15px', { lineHeight: '21px' }],
        body: ['15px', { lineHeight: '21px' }],
        heading: ['17px', { lineHeight: '22px' }],
        title: ['21px', { lineHeight: '26px' }],
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
