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
  tone = 'secondary',
  shape = 'circle',
  className,
}: {
  category: string;
  size?: keyof typeof SIZES;
  /** 'brand' for an ordinary row; 'critical' where the row is the problem;
   *  'secondary' for the green treatment. */
  tone?: 'brand' | 'critical' | 'secondary';
  /** Square where it shares a column with photographs, so the list stays even. */
  shape?: 'circle' | 'square';
  className?: string;
}) {
  const { box, glyph } = SIZES[size];
  const colour =
    tone === 'critical'
      ? COLORS.statusCritical
      : tone === 'secondary'
        ? COLORS.secondaryDark
        : COLORS.primaryLight;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={cn(
        'items-center justify-center rounded-lg',
        tone === 'secondary' ? 'bg-secondary-tint' : 'bg-subtle',
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
  tone = 'secondary',
  className,
}: {
  imageUrl?: string | null;
  category: string;
  size?: keyof typeof SIZES;
  tone?: 'brand' | 'critical' | 'secondary';
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
    <View className={cn('rounded-md', SIZES[size].box, className)}>
      <Image
        source={{ uri: imageUrl }}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        // The subtle fill shows through while a remote pack shot loads, so the
        // row does not jump from empty space to picture.
        className="h-full w-full rounded-md bg-subtle"
      />
      <ImageEdge radius={8} />
    </View>
  );
}

/**
 * A hairline drawn just inside a photo's edge.
 *
 * Pack shots are mostly white, and on a white card the picture had no edge at
 * all. Pure black at 10% rather than a palette colour, because a tinted line
 * shows as a coloured fringe on the image. An overlay, not a border, so the
 * photo keeps its full size. Put it last inside a box the same size as the
 * image, with the image's corner radius.
 */
export function ImageEdge({ radius }: { radius: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.1)',
      }}
    />
  );
}
