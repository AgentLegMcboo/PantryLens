import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { ResponsiveRow } from './responsive-row';

/**
 * The surface almost everything sits on.
 *
 * Two things make a card read as a card: it is lighter than the ground, and it
 * casts a shadow onto it. This had neither — #FFFBF6 on #FBF6EE is a contrast
 * ratio of 1.04:1, so the "cards" were invisible and every screen looked like
 * one flat slab with lines drawn on it.
 *
 * The shadow is warm brown rather than grey. A grey shadow over sand reads as
 * dirt, which is a surprisingly big part of why the old palette felt muddy.
 */
/**
 * The card's edge, drawn as a 1px shadow ring rather than a border.
 *
 * White on cream is 1.08:1, so the edge is what actually delineates a card. As
 * a ring it is the same warm line (0.18 of the shadow brown over cream lands on
 * the old `borderSoft`), but it sits outside the box and softens into the depth
 * layers below it instead of being a hard stroke on top of them.
 */
export const cardRing = (opacity = 0.18) => `0 0 0 1px rgba(107, 74, 47, ${opacity})`;

/**
 * The lift: a tight contact shadow plus a soft ambient one, both in the warm
 * shadow brown — grey over sand reads as dirt. Use this alone on a surface that
 * already has a real border (a bordered button tile); `Card` adds the ring.
 */
const DEPTH = '0 1px 2px -1px rgba(107, 74, 47, 0.10), 0 3px 16px 0 rgba(107, 74, 47, 0.07)';
export const cardShadow = { boxShadow: DEPTH };

/** Ring plus lift, for anything that should read as a card. */
export const cardSurface = (ringOpacity?: number) => ({
  boxShadow: `${cardRing(ringOpacity)}, ${DEPTH}`,
});

/**
 * A transparent border under the ring, so the box measures the same as it did
 * with a real border, and so a caller can still colour it (a selected row, a
 * verified item) without the card changing size.
 */
const cardEdge = { borderWidth: 1, borderColor: 'transparent' } as const;

export function Card({ className, style, ...props }: ViewProps) {
  return (
    <View
      className={cn('rounded-lg bg-card p-card', className)}
      style={[cardEdge, cardSurface(), style]}
      {...props}
    />
  );
}

/** Flat variant: grouped content that recedes rather than floats. No shadow —
 *  it is tinted slightly darker than the page instead, so the two surfaces read
 *  as above and below rather than as two of the same thing. */
export function Panel({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('rounded-lg border border-hairline bg-subtle p-card', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <ResponsiveRow className={cn('mb-4 gap-3', className)}>
      <View className="flex-1">
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="label" tone="soft" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </ResponsiveRow>
  );
}
