import * as React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';
import { usePressScale } from '../motion';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cueTap } from '../../lib/feedback';

/**
 * Numeric stepper. Was redefined in five screens at four different button sizes.
 *
 * The buttons are 44px, not the 32px they were: this is the control a volunteer
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
  size = 'default',
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /**
   * `compact` is for a list row, where the stepper shares a line with a product
   * name. At 44px a side it took about 124px of a ~360px row and pushed names
   * onto three lines; compact is 36px a side and loses a third of that. The
   * hit area stays generous (see StepButton's slop), only the visible control
   * shrinks.
   */
  size?: 'default' | 'compact';
  className?: string;
}) {
  const compact = size === 'compact';
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    cueTap();
    onChange(next);
  };

  return (
    <View
      className={cn(
        'flex-row items-center bg-subtle',
        compact ? 'rounded-full' : 'rounded-md',
        className,
      )}
    >
      <StepButton
        icon="minus"
        label="Decrease"
        compact={compact}
        disabled={value <= min}
        onPress={() => step(-1)}
      />

      <PoppingNumber value={value}>
        <Text
          variant={compact ? 'body' : 'heading'}
          className={cn('text-center font-bold', compact ? 'min-w-[26px]' : 'min-w-[36px]')}
        >
          {value}
        </Text>
      </PoppingNumber>

      <StepButton
        icon="plus"
        label="Increase"
        compact={compact}
        disabled={value >= max}
        onPress={() => step(1)}
      />
    </View>
  );
}

/**
 * Swells for an instant whenever the number changes.
 *
 * The dip on the button says the tap landed; this says what it did. On a row
 * where the count sits between the two buttons, the number growing and settling
 * is the confirmation your eye is already looking at. Only reacts to a change,
 * so a list scrolling its rows in does not make every number twitch.
 */
function PoppingNumber({ value, children }: { value: number; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(1);
  const previous = React.useRef(value);

  React.useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reduceMotion) return;
    pop.value = withSequence(withTiming(1.22, { duration: 70 }), withTiming(1, { duration: 150 }));
  }, [value, reduceMotion, pop]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Its own component so it can hold the press hook — two per stepper. */
function StepButton({
  icon,
  label,
  disabled,
  compact,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  disabled: boolean;
  compact: boolean;
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
      hitSlop={compact ? 8 : 6}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Animated.View
        style={press.style}
        className={cn(
          'items-center justify-center',
          compact ? 'h-9 w-9' : 'h-11 w-11',
          disabled && 'opacity-35',
        )}
      >
        <MaterialCommunityIcons name={icon} size={compact ? 16 : 18} color={COLORS.textPrimary} />
      </Animated.View>
    </Pressable>
  );
}
