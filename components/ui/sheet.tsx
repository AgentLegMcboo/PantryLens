import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { cueTap } from '../../lib/feedback';
import { DRAG_SLOP, projectDecay, rubberband, SPRING_SHEET } from '../../lib/motion-physics';
import { Text } from './text';
import { GlassBackdrop } from './glass-surface';
import { Tappable } from '../motion';

/**
 * A bottom sheet you can actually grab.
 *
 * It used to draw the grabber pill and then do nothing with it: the motion was
 * `Modal animationType="slide"`, a fixed platform animation that cannot be
 * caught, dragged or reversed. The pill is the most widely understood gesture
 * affordance on a phone, and this one was decoration — an interface promising
 * physics it did not have, which is worse than having no pill at all.
 *
 * Now the sheet tracks the finger, carries its velocity into the animation, and
 * can be grabbed back mid-flight. The specifics, each for a reason:
 *
 *  - 1:1 TRACKING, FROM WHERE YOU GRABBED. The drag starts from wherever the
 *    sheet currently is, including halfway through a dismissal, so catching a
 *    closing sheet picks it up where it is rather than snapping it back first.
 *  - THE BACKDROP FADES WITH THE DRAG. Feedback has to be continuous during a
 *    gesture, not a reward for finishing it. Half-dragged is half-dimmed, so a
 *    hesitant pull shows you exactly what letting go would do.
 *  - RELEASE IS DECIDED BY VELOCITY, NOT POSITION. A flick is projected forward
 *    with the same exponential decay the system's own scrolling uses, and the
 *    projection decides dismiss or settle. Position alone gets this backwards:
 *    a fast decisive flick travels barely any distance, and a slow accidental
 *    drag travels a lot.
 *  - UP IS RUBBER-BANDED. Pulling a sheet above its resting height resists
 *    progressively instead of stopping dead, because a hard stop reads as the
 *    app having stopped listening.
 *  - IT KNOWS WHETHER THE LIST IS AT THE TOP. Dragging down inside a scrolled
 *    list scrolls the list; the same drag at the top of the list moves the
 *    sheet. Without this the two gestures fight and the loser is whichever the
 *    user wanted.
 *
 * Three older fixes, kept because each was a real bug:
 *
 *  - THE BACKDROP IS A SIBLING, NOT A PARENT, so it only ever receives touches
 *    that land outside the sheet.
 *  - THE BOTTOM INSET SCROLLS WITH THE CONTENT, so the last control can always
 *    be scrolled clear of the system bar.
 *  - IT KNOWS ABOUT THE KEYBOARD AND THE SYSTEM BARS: the sheet rises above the
 *    keyboard on iOS, and on Android — edge-to-edge since SDK 55 — the modal
 *    spans the full screen so insets and window are measured from the same edges.
 */

/** Fraction of the sheet's own height a projected flick must cross to dismiss. */
const DISMISS_FRACTION = 0.4;

/** Below this, a release is treated as a drag rather than a flick, px/s. */
const FLICK_VELOCITY = 320;

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  onDismiss,
  children,
  className,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  /**
   * The modal outlives `visible` by one animation.
   *
   * Unmounting on the same frame the parent flips `visible` would cut the exit
   * off — the sheet would vanish rather than leave. So the modal stays mounted
   * until the closing spring reports back.
   */
  const [mounted, setMounted] = React.useState(visible);
  React.useEffect(() => {
    if (!mounted) onDismiss?.();
  }, [mounted, onDismiss]);

  /** Distance below resting position, in px. 0 is open, `height` is gone. */
  const translateY = useSharedValue(screenHeight);
  /** Measured, not assumed: a sheet of options and a sheet with a form differ. */
  const height = useSharedValue(screenHeight * 0.5);
  const dragStart = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  // `any` because gesture-handler types a gesture ref as a RefObject of a
  // COMPONENT TYPE rather than of an instance, so no correctly-typed ref to a
  // mounted ScrollView satisfies it. The ref is only ever handed to
  // simultaneousWithExternalGesture, which wants the instance.
  const scrollRef = React.useRef<any>(null);

  const settle = () => {
    'worklet';
    translateY.value = withSpring(0, SPRING_SHEET);
  };

  const dismiss = (velocity = 0) => {
    'worklet';
    // Carries the finger's speed into the animation, so there is no seam
    // between the drag and the flight that follows it.
    translateY.value = withSpring(
      height.value,
      { ...SPRING_SHEET, velocity },
      finished => {
        if (finished) runOnJS(onClose)();
      },
    );
  };

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    // Closed from outside (a Save handler, the hardware back button): play the
    // exit, then unmount. Spatial consistency — it leaves the way it arrived.
    if (mounted) {
      if (reduceMotion) {
        // A quick fade out rather than vanishing: the sheet's reduced-motion
        // style turns this travel into opacity.
        translateY.value = withTiming(
          height.value,
          { duration: 150, reduceMotion: ReduceMotion.Never },
          finished => {
            if (finished) runOnJS(setMounted)(false);
          },
        );
        return;
      }
      translateY.value = withSpring(height.value, SPRING_SHEET, finished => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Entry, once the real height is known. */
  const onSheetLayout = (measured: number) => {
    if (measured <= 0) return;
    const first = height.value !== measured;
    height.value = measured;
    if (!visible) return;
    if (first || translateY.value >= measured) {
      translateY.value = measured;
      // Under reduced motion this travel only drives opacity (see sheetStyle),
      // so it is a 200ms fade in — forced to run, since Reanimated's default
      // would snap it and the sheet would pop up instead.
      translateY.value = reduceMotion
        ? withTiming(0, { duration: 200, reduceMotion: ReduceMotion.Never })
        : withSpring(0, SPRING_SHEET);
    }
  };

  const scrollHandler = useAnimatedScrollHandler(event => {
    scrollOffset.value = event.contentOffset.y;
  });

  /**
   * One pan for the whole sheet.
   *
   * `simultaneousWithExternalGesture` lets it run alongside the list's own
   * scrolling rather than winning or losing outright, and the offset check
   * inside decides which of them should actually move on this frame.
   */
  const pan = Gesture.Pan()
    .activeOffsetY([-DRAG_SLOP, DRAG_SLOP])
    .simultaneousWithExternalGesture(scrollRef)
    .onBegin(() => {
      // From wherever it is NOW, mid-animation included. Reading the target
      // instead of the presentation value is what makes an interrupted
      // animation jump.
      dragStart.value = translateY.value;
    })
    .onUpdate(event => {
      const atTop = scrollOffset.value <= 0;
      const pullingDown = event.translationY > 0;
      // Already lifted off the bottom, or pulling down from the top of the list:
      // the sheet moves. Otherwise the list is scrolling and the sheet holds.
      if (dragStart.value <= 0 && pullingDown && !atTop) return;

      const next = dragStart.value + event.translationY;
      translateY.value =
        next < 0
          ? // Above its resting height. Resist rather than refuse.
            -rubberband(-next, height.value)
          : next;
    })
    .onEnd(event => {
      const velocity = event.velocityY;
      // Where the flick is GOING, not where the finger left off.
      const projected = translateY.value + projectDecay(velocity);

      if (velocity > FLICK_VELOCITY) {
        dismiss(velocity);
      } else if (velocity < -FLICK_VELOCITY) {
        settle();
      } else if (projected > height.value * DISMISS_FRACTION) {
        dismiss(velocity);
      } else {
        settle();
      }
    });

  const sheetStyle = useAnimatedStyle(() =>
    reduceMotion
      ? // Reduced motion replaces the travel, not the feedback: the surface
        // still arrives and still answers the finger, it just does not fly.
        { opacity: interpolate(translateY.value, [0, height.value], [1, 0]) }
      : { transform: [{ translateY: translateY.value }] },
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, height.value], [1, 0], 'clamp'),
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      // We animate this ourselves now, and two animations on one surface fight.
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* A root of its own, because on Android a React Native Modal is a
          separate window: the app's outer GestureHandlerRootView does not reach
          inside it, and the drag would silently do nothing on exactly half the
          devices this pantry will use. */}
      <GestureHandlerRootView style={styles.fill}>
        {/* Behind the sheet. Taps outside it close; taps inside never reach it. */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={StyleSheet.absoluteFill}
            className="bg-black/40"
          />
        </Animated.View>

        {/* box-none so the empty space above the sheet still passes taps through
            to the backdrop instead of silently absorbing them. */}
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}
        >
          <GestureDetector gesture={pan}>
            {/* `shrink` lets the sheet give up height when the keyboard takes it,
                so its header never gets pushed off the top of the screen. */}
            <Animated.View
              onLayout={e => onSheetLayout(e.nativeEvent.layout.height)}
              style={[{ width: '100%', maxWidth: 640, alignSelf: 'center', maxHeight: screenHeight * 0.85, flexShrink: 1, backgroundColor: 'transparent', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }, sheetStyle]}
              className={cn('max-h-[85%] shrink rounded-t-lg', className)}
            >
              <GlassBackdrop radius={28} material="sheet" />
              {/* The grabber. It means what it looks like now. Generously
                  padded, because the thing you grab should be bigger than the
                  thing you see. */}
              <Pressable
                onPress={() => {
                  cueTap();
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel="Close"
                accessibilityHint="Or drag the sheet down"
                hitSlop={12}
                className="items-center pb-1 pt-3"
              >
                <View className="h-1.5 w-12 rounded-md bg-outline" />
              </Pressable>

              <View className="flex-row items-start gap-3 px-gutter pb-3 pt-2">
                <View className="flex-1">
                  <Text variant="title">{title}</Text>
                  {subtitle ? (
                    <Text variant="label" tone="soft" className="mt-1">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Tappable
                  onPress={onClose}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-subtle"
                >
                  <MaterialCommunityIcons name="close" size={22} color={COLORS.textPrimary} />
                </Tappable>
              </View>

              <Animated.ScrollView
                style={{ flexShrink: 1, minHeight: 0 }}
                ref={scrollRef}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                contentContainerClassName="px-gutter gap-3"
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: Math.max(insets.bottom, 12) + 4 }}
              >
                {children}
              </Animated.ScrollView>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
});
