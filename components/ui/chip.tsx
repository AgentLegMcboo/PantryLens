import * as React from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cueTap } from '../../lib/feedback';

/**
 * Selectable pill — category filters, family sizes, condition, source.
 *
 * Six screens each defined their own `chip` / `catChip` / `sizeChip` /
 * `secChip` / `dayChip` at different paddings, so the same control looked
 * different depending where you met it.
 */
export function Chip({
  label,
  selected,
  className,
  onPress,
  ...props
}: Omit<PressableProps, 'children'> & { label: string; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={(e) => {
        cueTap();
        onPress?.(e);
      }}
      className={cn(
        'rounded-full border-[1.5px] px-4 py-2 min-h-[40px] justify-center',
        selected ? 'bg-brand-light border-brand-light' : 'bg-card border-outline',
        className,
      )}
      {...props}
    >
      <Text variant="label" tone={selected ? 'on' : 'soft'} className="font-semibold">
        {label}
      </Text>
    </Pressable>
  );
}

/** Non-interactive status marker. Small on purpose — it annotates, it doesn't shout. */
export function Badge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn' | 'critical' | 'brand';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-muted',
    good: 'bg-good',
    warn: 'bg-warn',
    critical: 'bg-critical',
    brand: 'bg-brand-light',
  } as const;

  return (
    <View className={cn('self-start rounded-sm px-2 py-0.5', tones[tone], className)}>
      <Text variant="micro" tone={tone === 'neutral' ? 'default' : 'on'} className="font-bold">
        {label}
      </Text>
    </View>
  );
}
