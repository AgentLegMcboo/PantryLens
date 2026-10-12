import * as React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';
import { usePressScale } from '../motion';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cueTap } from '../../lib/feedback';

/**
 * Numeric stepper. Was redefined in five screens at four different button sizes.
 *
 * The buttons are 48px: this is the control a volunteer
 * uses most, often while holding something in the other hand. Each one carries
 * 6px of invisible slack as well, so a thumb that lands just off the glyph still
 * counts — the target should always be bigger than the thing you can see.
 *
 * Each press dips. On a control that is pressed over and over to reach a number,
 * the dip is the only thing confirming that this tap landed and not just the
 * last one.
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
    <View
      className={cn(
        'flex-row items-center rounded-lg border border-hairline bg-canvas',
        className,
      )}
    >
      <StepButton icon="minus" label="Decrease" disabled={value <= min} onPress={() => step(-1)} />

      <Text variant="heading" className="min-w-[36px] text-center font-bold">
        {value}
      </Text>

      <StepButton icon="plus" label="Increase" disabled={value >= max} onPress={() => step(1)} />
    </View>
  );
}

/** Its own component so it can hold the press hook — two per stepper. */
function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = usePressScale(0.9);

  return (
    <Pressable
      onPressIn={() => {
        if (!disabled) press.onPressIn();
      }}
      onPressOut={press.onPressOut}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={press.style}
        className={cn('h-12 w-12 items-center justify-center', disabled && 'opacity-35')}
      >
        <MaterialCommunityIcons name={icon} size={18} color={COLORS.textPrimary} />
      </Animated.View>
    </Pressable>
  );
}
