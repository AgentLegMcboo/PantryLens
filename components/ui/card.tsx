import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { SURFACE_SHADOW } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';

/** A quiet surface shared by every screen. */
export const cardShadow = SURFACE_SHADOW;

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
