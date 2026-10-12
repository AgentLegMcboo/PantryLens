import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';

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
 * Barely there, and deliberately so.
 *
 * The edge defines the card; the shadow only settles it onto the page. The
 * border is a single warm outline, matching the Stitch export. A light shadow
 * separates the white surface from the cream canvas without heavy framing.
 */
export const cardShadow = {
  shadowColor: COLORS.shadow,
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export function Card({ className, style, ...props }: ViewProps) {
  return (
    <View
      className={cn('rounded-lg border border-hairline bg-card p-card', className)}
      style={[cardShadow, style]}
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
    <View className={cn('mb-4 flex-row items-start justify-between gap-3', className)}>
      <View className="flex-1">
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="label" tone="soft" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
