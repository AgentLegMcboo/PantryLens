import React, { useEffect } from 'react';
import { Image, Pressable, PressableProps, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADII } from '../constants/theme';
import { cuePress, cueTap } from '../lib/feedback';

/**
 * Shared motion vocabulary.
 *
 * Two rules keep this feeling considered rather than busy:
 *  - Motion confirms an action or draws the eye to a status change. It never
 *    decorates.
 *  - Springs for anything the finger touches, timing curves for anything that
 *    arrives on its own. Mixing the two is what makes UI feel cheap.
 */

const SPRING = { damping: 15, stiffness: 220, mass: 0.6 };
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Press target that dips under the finger and fires a haptic. */
export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.97,
  cue = 'tap',
  disabled,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  scaleTo?: number;
  cue?: 'tap' | 'press' | 'none';
}) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(interpolate(pressed.value, [0, 1], [1, scaleTo]), SPRING) }],
    opacity: withTiming(interpolate(pressed.value, [0, 1], [1, 0.92]), { duration: 90 }),
  }));

  return (
    <Pressable
      onPressIn={() => {
        pressed.value = 1;
        if (!disabled && cue !== 'none') (cue === 'press' ? cuePress : cueTap)();
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      onPress={onPress}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Content that eases up into place. Stagger with `index` for list entrances. */
export function FadeInUp({
  children,
  index = 0,
  distance = 14,
  duration = 420,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  distance?: number;
  duration?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Cap the stagger so a long list never leaves the last row waiting.
    const delay = Math.min(index * 55, 400);
    progress.value = withDelay(delay, withTiming(1, { duration, easing: EASE_OUT }));
  }, [index, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [distance, 0]) }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

/**
 * Number that counts up when it changes, so a stat visibly *moves* when stock
 * changes instead of silently swapping.
 */
export function AnimatedCounter({
  value,
  style,
  duration = 700,
}: {
  value: number;
  style?: TextStyle | TextStyle[];
  duration?: number;
}) {
  const animated = useSharedValue(0);
  const [display, setDisplay] = React.useState(0);

  useEffect(() => {
    const from = animated.value;
    const start = Date.now();
    animated.value = value;

    // Driven on the JS thread because it writes text, not a style value.
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t >= 1) clearInterval(timer);
    }, 16);

    return () => clearInterval(timer);
  }, [value, duration, animated]);

  return <Text style={style}>{display}</Text>;
}

/** Slow breathing pulse — for a status that needs attention without nagging. */
export function Pulse({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [active, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [1, 0.55]),
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

/** Bar that eases to its fill width — used for category stock levels. */
export function ProgressBar({
  progress,
  color,
  height = 6,
}: {
  progress: number;
  color: string;
  height?: number;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      120,
      withTiming(Math.max(0, Math.min(1, progress)), { duration: 800, easing: EASE_OUT }),
    );
  }, [progress, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={[styles.progressTrack, { height, borderRadius: height }]}>
      <Animated.View
        style={[{ height, borderRadius: height, backgroundColor: color }, animatedStyle]}
      />
    </View>
  );
}

/**
 * Film-grain overlay. Sits above the flat cream fills and gives them a paper
 * tooth — the single cheapest thing that stops a warm palette reading as plastic.
 * Non-interactive, so it never eats a tap.
 */
export function GrainOverlay({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        source={require('../assets/textures/grain.png')}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill as any}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    width: '100%',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADII.full,
    overflow: 'hidden',
  },
});
