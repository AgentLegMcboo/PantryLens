import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';

/**
 * What a category IS, drawn rather than coloured.
 *
 * Categories used to be carried by a hue apiece — mustard grain, purple snack,
 * pink baby, teal hygiene. Eight arbitrary colours, none of them related to the
 * warm brand or to each other, and none of them meaning anything you could work
 * out without being told. They also quietly broke the palette's own rule, which
 * is that colour in this app carries STATUS — good, warning, critical — and
 * never decoration.
 *
 * A carrot reads as vegetables to anyone, in any language, with no legend. So
 * identity is the glyph, and colour goes back to meaning only.
 *
 * The disc is the one already on the dashboard's activity rows: a subtle circle
 * with a brand-tinted glyph. Reusing it is why this lands as part of the app
 * rather than as a new idea.
 */
export const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  grain: 'barley',
  vegetable: 'carrot',
  protein: 'food-drumstick',
  breakfast: 'bowl-mix',
  snack: 'cookie',
  hygiene: 'hand-wash-outline',
  baby: 'baby-bottle-outline',
  unknown: 'package-variant',
};

export const categoryIcon = (category: string) =>
  CATEGORY_ICONS[category] ?? CATEGORY_ICONS.unknown;

const SIZES = {
  sm: { box: 'h-9 w-9', glyph: 18 },
  md: { box: 'h-11 w-11', glyph: 22 },
} as const;

export function CategoryIcon({
  category,
  size = 'sm',
  tone = 'brand',
  className,
}: {
  category: string;
  size?: keyof typeof SIZES;
  /** 'brand' for an ordinary row; 'critical' where the row is the problem. */
  tone?: 'brand' | 'critical';
  className?: string;
}) {
  const { box, glyph } = SIZES[size];
  const colour = tone === 'critical' ? COLORS.statusCritical : COLORS.primaryLight;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={cn('items-center justify-center rounded-full bg-subtle', box, className)}
    >
      <MaterialCommunityIcons name={categoryIcon(category)} size={glyph} color={colour} />
    </View>
  );
}
