import * as React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cueTap } from '../../lib/feedback';
import { Tappable } from '../motion';

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
  tone = 'brand',
  className,
  onPress,
  ...props
}: Omit<PressableProps, 'children' | 'style'> & {
  style?: StyleProp<ViewStyle>;
  label: string;
  selected?: boolean;
  /** Fill when selected: terracotta by default, or the green secondary. */
  tone?: 'brand' | 'secondary';
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={(e) => {
        cueTap();
        onPress?.(e);
      }}
      className={cn(
        'rounded-lg border px-4 py-2.5 min-h-[48px] justify-center',
        selected
          ? tone === 'secondary'
            ? 'bg-secondary-dark border-secondary-dark'
            : 'bg-brand border-brand'
          : 'bg-card border-hairline',
        className,
      )}
      {...props}
    >
      <Text variant="label" tone={selected ? 'on' : 'soft'} className="font-semibold text-sm">
        {label}
      </Text>
    </Tappable>
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
    neutral: { background: COLORS.surfaceContainer, foreground: COLORS.textSecondary },
    good: { background: '#EEF4E9', foreground: '#3C6534' },
    warn: { background: '#FFF2DB', foreground: '#80500E' },
    critical: { background: '#FCEBE8', foreground: '#982E26' },
    brand: { background: '#F8E8DF', foreground: COLORS.primary },
  } as const;
  const icon =
    tone === 'good'
      ? 'check-circle-outline'
      : tone === 'warn'
        ? 'alert-outline'
        : tone === 'critical'
          ? 'alert-circle-outline'
          : null;
  const colors = tones[tone];

  return (
    <View
      className={cn('self-start flex-row items-center gap-1.5 rounded-md px-2.5 py-1', className)}
      style={{ backgroundColor: colors.background }}
    >
      {icon && <MaterialCommunityIcons name={icon} size={15} color={colors.foreground} />}
      <Text variant="label" style={{ color: colors.foreground }} className="shrink font-semibold text-xs">
        {label}
      </Text>
    </View>
  );
}
