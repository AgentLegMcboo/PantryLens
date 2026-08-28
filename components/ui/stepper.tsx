import * as React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cueTap } from '../../lib/feedback';

/**
 * Numeric stepper. Was redefined in five screens at four different button sizes.
 *
 * The buttons are 44px, not the 32px they were: this is the control a volunteer
 * uses most, often while holding something in the other hand.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    cueTap();
    onChange(next);
  };

  return (
    <View className={cn('flex-row items-center rounded-md bg-subtle', className)}>
      <Pressable
        onPress={() => step(-1)}
        disabled={value <= min}
        accessibilityLabel="Decrease"
        className={cn('h-11 w-11 items-center justify-center', value <= min && 'opacity-35')}
      >
        <MaterialCommunityIcons name="minus" size={18} color={COLORS.textPrimary} />
      </Pressable>

      <Text variant="heading" className="min-w-[36px] text-center font-bold">
        {value}
      </Text>

      <Pressable
        onPress={() => step(1)}
        disabled={value >= max}
        accessibilityLabel="Increase"
        className={cn('h-11 w-11 items-center justify-center', value >= max && 'opacity-35')}
      >
        <MaterialCommunityIcons name="plus" size={18} color={COLORS.textPrimary} />
      </Pressable>
    </View>
  );
}
