import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The project's own spacing steps, from tailwind.config.js.
 *
 * tailwind-merge only knows Tailwind's stock scale, so it has to be told about
 * these by name or it cannot tell `p-card` from a class it has never seen.
 */
const SPACING = ['gutter', 'card', 'gap'];

/** The six type sizes, likewise. */
const FONT_SIZES = ['micro', 'label', 'body', 'heading', 'title', 'headline', 'display'];

/**
 * tailwind-merge, taught this project's theme.
 *
 * Without the `extend` block it guesses, and it guessed wrong in the one place
 * that mattered most: an unrecognised `text-*` is assumed to be a COLOUR, so
 * `text-label text-ink-soft` — which is exactly what `Text` emits for every
 * label in the app — looked to it like two colours in a row, and it dropped the
 * first. The entire six-step type scale was being deleted on its way to the
 * renderer, and every screen rendered at the default size. That is most of why
 * the app read as flat: the hierarchy was declared and then thrown away.
 *
 * Teaching it the scales also makes the classes overridable, which is the whole
 * point of `cn`: `<Card className="p-0">` now actually beats the card's `p-card`
 * instead of shipping both and leaving the winner to declaration order.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: FONT_SIZES }],
      p: [{ p: SPACING }],
      px: [{ px: SPACING }],
      py: [{ py: SPACING }],
      pt: [{ pt: SPACING }],
      pr: [{ pr: SPACING }],
      pb: [{ pb: SPACING }],
      pl: [{ pl: SPACING }],
      m: [{ m: SPACING }],
      mx: [{ mx: SPACING }],
      my: [{ my: SPACING }],
      mt: [{ mt: SPACING }],
      mr: [{ mr: SPACING }],
      mb: [{ mb: SPACING }],
      ml: [{ ml: SPACING }],
      gap: [{ gap: SPACING }],
      'gap-x': [{ 'gap-x': SPACING }],
      'gap-y': [{ 'gap-y': SPACING }],
    },
  },
});

/**
 * Merges class strings so a caller's className always wins over a component's
 * defaults. Without twMerge, `<Button className="bg-good">` would produce
 * "bg-brand bg-good" and which one applies is down to declaration order.
 *
 * Same helper shadcn/ui uses on the web; react-native-reusables keeps it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
