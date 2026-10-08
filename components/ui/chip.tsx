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
  style,
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
        'rounded-md border px-4 py-2 min-h-[44px] justify-center',
        selected ? 'bg-brand-tint border-brand-tint' : 'bg-transparent border-transparent',
        className,
      )}
      style={state => [{ opacity: state.pressed ? 0.7 : 1 }, typeof style === 'function' ? style(state) : style]}
      {...props}
    >
      <Text variant="label" tone={selected ? 'brand' : 'soft'} className="font-semibold">
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
    neutral: 'bg-subtle',
    good: 'bg-good-tint',
    warn: 'bg-warn-tint',
    critical: 'bg-critical-tint',
    brand: 'bg-brand-tint',
  } as const;

  return (
    <View className={cn('self-start rounded-sm px-2 py-0.5', tones[tone], className)}>
      <Text variant="micro" tone={tone === 'neutral' ? 'soft' : tone} className="font-medium">
        {label}
      </Text>
    </View>
  );
}
