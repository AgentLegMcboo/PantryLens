import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, View } from 'react-native';
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
  shape = 'circle',
  className,
}: {
  category: string;
  size?: keyof typeof SIZES;
  /** 'brand' for an ordinary row; 'critical' where the row is the problem. */
  tone?: 'brand' | 'critical';
  /** Square where it shares a column with photographs, so the list stays even. */
  shape?: 'circle' | 'square';
  className?: string;
}) {
  const { box, glyph } = SIZES[size];
  const colour = tone === 'critical' ? COLORS.statusCritical : COLORS.primaryLight;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={cn(
        'items-center justify-center bg-subtle',
        shape === 'square' ? 'rounded-md' : 'rounded-full',
        box,
        className,
      )}
    >
      <MaterialCommunityIcons name={categoryIcon(category)} size={glyph} color={colour} />
    </View>
  );
}

/**
 * The picture of an item, or the next best thing.
 *
 * Three sources in order, and the order is the point:
 *
 *  1. The manufacturer's pack shot, when a barcode identified the product.
 *  2. A crop of the pantry's own scan photo — the actual tin on the actual
 *     shelf.
 *  3. The category glyph, for anything typed in by hand or weighed in bulk.
 *
 * Both of the first two arrive as a URL on the row, so this only has to decide
 * between "there is a picture" and "there is not". Squares throughout: a
 * photograph in a circle loses its corners, and a list where some rows are round
 * and others are not looks broken rather than varied.
 */
export function ItemThumb({
  imageUrl,
  category,
  size = 'md',
  tone = 'brand',
  className,
}: {
  imageUrl?: string | null;
  category: string;
  size?: keyof typeof SIZES;
  tone?: 'brand' | 'critical';
  className?: string;
}) {
  if (!imageUrl) {
    return (
      <CategoryIcon
        category={category}
        size={size}
        tone={tone}
        shape="square"
        className={className}
      />
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      accessibilityIgnoresInvertColors
      resizeMode="cover"
      // The subtle fill shows through while a remote pack shot loads, so the row
      // does not jump from empty space to picture.
      className={cn('rounded-md bg-subtle', SIZES[size].box, className)}
    />
  );
}
