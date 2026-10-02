import React, { useEffect } from 'react';
import { Image, Pressable, PressableProps, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADII } from '../constants/theme';
import { cuePress, cueTap } from '../lib/feedback';
import { SPRING_PRESS } from '../lib/motion-physics';

/**
 * Shared motion vocabulary.
 *
 * Three rules keep this feeling considered rather than busy:
 *  - Motion confirms an action or draws the eye to a status change. It never
 *    decorates.
 *  - Springs for anything the finger touches, timing curves for anything that
 *    arrives on its own. Mixing the two is what makes UI feel cheap.
 *  - EVERY ARRIVAL HAS A STILL VERSION. Someone who has asked their phone for
 *    less movement gets the same information with the travel removed — not a
 *    frozen app, and not the full flight either. Movement that the user's own
 *    finger is causing is left alone: reduced motion is about involuntary
 *    motion, and a sheet following a thumb is the opposite of that.
 */

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The press response every tappable surface shares.
 *
 * Feedback belongs on the press, not the release. A control that waits for
 * touch-up before acknowledging you is the fastest way to make an interface
 * feel dead — the moment lag appears, directness falls off a cliff.
 *
 * Returns the handlers and the style, so a component that already has its own
 * Pressable (a row, a tab, a chip) can adopt the behaviour without being
 * rewritten around a wrapper.
 *
 * The spring is driven by assigning the shared value, NOT by calling withSpring
 * inside useAnimatedStyle — the earlier version did the latter, which rebuilds
 * the animation on every evaluation instead of running one.
 */
export function usePressScale(scaleTo = 0.97) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const onPressIn = () => {
    scale.value = withSpring(scaleTo, { ...SPRING_PRESS, reduceMotion: ReduceMotion.System });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { ...SPRING_PRESS, reduceMotion: ReduceMotion.System });
  };

  const style = useAnimatedStyle(() =>
    // With motion reduced, the acknowledgement becomes a dip in opacity rather
    // than in size. Removing it altogether would take away the one signal that
    // the tap registered.
    reduceMotion
      ? { opacity: interpolate(scale.value, [scaleTo, 1], [0.6, 1]) }
      : { transform: [{ scale: scale.value }] },
  );

  return { onPressIn, onPressOut, style };
}

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
  const press = usePressScale(scaleTo);

  return (
    <Pressable
      onPressIn={() => {
        press.onPressIn();
        if (!disabled && cue !== 'none') (cue === 'press' ? cuePress : cueTap)();
      }}
      onPressOut={press.onPressOut}
      onPress={onPress}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[style, press.style]}>{children}</Animated.View>
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Cap the stagger so a long list never leaves the last row waiting. With
    // motion reduced the stagger goes too: a cascade is itself movement, and a
    // screen that assembles itself row by row is the thing being asked about.
    const delay = reduceMotion ? 0 : Math.min(index * 55, 400);
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: reduceMotion ? 160 : duration, easing: EASE_OUT }),
    );
  }, [index, duration, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // A cross-fade with no travel, which is exactly what reduced motion asks
    // for: keep the opacity change that aids comprehension, drop the slide.
    transform: reduceMotion
      ? []
      : [{ translateY: interpolate(progress.value, [0, 1], [distance, 0]) }],
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
  const latest = React.useRef(0);
  const [display, setDisplay] = React.useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // A number is text, so this is the one animation that cannot live on the UI
    // thread. It can at least be driven by the display's own clock:
    // requestAnimationFrame is synced to the refresh rate, where the old
    // setInterval(16) drifted against it and stuttered under load.
    if (reduceMotion) {
      latest.current = value;
      setDisplay(value);
      return;
    }

    const from = latest.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      latest.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduceMotion]);

  return <Text style={style}>{display}</Text>;
}

/** Slow breathing pulse — for a status that needs attention without nagging. */
export function Pulse({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const pulse = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // An endless oscillation is the single thing reduced motion most wants gone,
    // so it holds at its bright end rather than breathing.
    if (!active || reduceMotion) {
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
  }, [active, pulse, reduceMotion]);

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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));
    // The bar still fills — a progress bar that appears already full says
    // nothing — it just stops crawling in from a delay.
    width.value = reduceMotion
      ? withTiming(target, { duration: 160 })
      : withDelay(120, withTiming(target, { duration: 800, easing: EASE_OUT }));
  }, [progress, width, reduceMotion]);

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
