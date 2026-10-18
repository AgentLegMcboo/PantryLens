import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { cueTap } from '../lib/feedback';
import { useTabBarHidden } from '../lib/tab-overlay';
import { Text } from './ui';

/**
 * First-visit tips: the screen goes dark except for one control, with an
 * arrow and a short note about something you wouldn't find on your own.
 *
 * A screen marks controls with `useSpotlightTarget` and renders one
 * `SpotlightTour`. The tour shows once per device, the first time its tab is
 * focused. The overlay itself is drawn by one `SpotlightHost` at the app root,
 * above the tab bar, and stays up for the whole tour: between steps the dark
 * stays put and only the lit hole glides to the next control, so nothing
 * flashes.
 */

type Rect = { x: number; y: number; w: number; h: number };
export type TourStep = {
  target: string;
  title: string;
  body: string;
  /** Reveal a scrolled-away control before measuring and showing its tip. */
  beforeShow?: () => void | Promise<void>;
};

/** The live view behind each target id. Not state: read only when a tip opens. */
const targets = new Map<string, View>();

/** Mark a view as something a tip can point at. Give the view `collapsable={false}`. */
export function useSpotlightTarget(id: string) {
  return useCallback(
    (node: View | null) => {
      if (node) targets.set(id, node);
    },
    [id],
  );
}

function measure(id: string): Promise<Rect | null> {
  const node = targets.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise(resolve =>
    node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null)),
  );
}

type ActiveTour = { key: string; steps: TourStep[]; onFinish: () => void };
const useTourStore = create<{
  active: ActiveTour | null;
  generation: number;
  start: (tour: ActiveTour) => void;
  stop: (key: string) => void;
  reset: () => void;
}>(set => ({
  active: null,
  generation: 0,
  start: tour => set(s => (s.active ? s : { active: tour })),
  stop: key => set(s => (s.active?.key === key ? { active: null } : s)),
  reset: () => set(s => ({ active: null, generation: s.generation + 1 })),
}));

const storageKey = (key: string) => `pantrylens.tour.${key}`;

/** Forget every tour, so each tab shows its tips again (developer setting). */
export async function resetTours() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith('pantrylens.tour.')));
  useTourStore.getState().reset();
}

/** Asks the host to run this screen's tips, once, when the screen is in view. */
export function SpotlightTour({ tourKey, steps }: { tourKey: string; steps: TourStep[] }) {
  const dragging = useTabBarHidden(s => s.hidden);
  const start = useTourStore(s => s.start);
  const stop = useTourStore(s => s.stop);
  const generation = useTourStore(s => s.generation);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSeen(null);
    AsyncStorage.getItem(storageKey(tourKey))
      .then(v => { if (!cancelled) setSeen(v === '1'); })
      .catch(() => { if (!cancelled) setSeen(false); });
    return () => { cancelled = true; };
  }, [tourKey, generation]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (seen !== false || !focused || dragging) return;
    // Let the screen finish laying out before measuring anything on it.
    const t = setTimeout(
      () =>
        start({
          key: tourKey,
          steps,
          onFinish: () => {
            setSeen(true);
            AsyncStorage.setItem(storageKey(tourKey), '1').catch(() => {});
          },
        }),
      900,
    );
    return () => {
      clearTimeout(t);
      stop(tourKey);
    };
  }, [seen, focused, dragging, tourKey, steps, start, stop]);

  return null;
}

const SHADE = 'rgba(20, 14, 10, 0.74)';
const PAD = 6;
const MOVE = { duration: 380, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.Never };

/** Round buttons get a round hole; everything else a rounded rectangle. */
const radiusFor = (r: Rect) => (Math.abs(r.w - r.h) < 8 && r.h < 72 ? r.h / 2 + PAD : 14);

/** Render once, at the app root, above everything else. */
export function SpotlightHost() {
  const active = useTourStore(s => s.active);
  const stop = useTourStore(s => s.stop);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hostRef = useRef<View>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [measuredIndex, setMeasuredIndex] = useState<number | null>(null);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const r = useSharedValue(0);

  useEffect(() => {
    setIndex(0);
    setRect(null);
    setMeasuredIndex(null);
  }, [active]);

  // Find this step's control (skipping any not on screen) and move the hole.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const origin = await new Promise<{ x: number; y: number }>(resolve =>
        hostRef.current ? hostRef.current.measureInWindow((ox, oy) => resolve({ x: ox, y: oy })) : resolve({ x: 0, y: 0 }),
      );
      for (let i = index; i < active.steps.length; i++) {
        await active.steps[i].beforeShow?.();
        if (cancelled) return;
        const m = await measure(active.steps[i].target);
        if (cancelled) return;
        if (!m) continue;
        const local = { x: m.x - origin.x, y: m.y - origin.y, w: m.w, h: m.h };
        if (local.y < 0 || local.y + local.h > H) continue;
        if (i !== index) {
          setIndex(i);
          return;
        }
        const hole = { x: local.x - PAD, y: local.y - PAD, w: local.w + PAD * 2, h: local.h + PAD * 2 };
        const first = !rect;
        const set = (sv: { value: number }, v: number) => {
          sv.value = first ? v : withTiming(v, MOVE);
        };
        set(x, hole.x);
        set(y, hole.y);
        set(w, hole.w);
        set(h, hole.h);
        set(r, radiusFor(local));
        setRect(hole);
        setMeasuredIndex(i);
        return;
      }
      active.onFinish();
      stop(active.key);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, H]);

  const holeStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    borderRadius: r.value,
  }));

  if (!active) return null;

  const exit = () => {
    cueTap();
    active.onFinish();
    stop(active.key);
  };

  const next = () => {
    cueTap();
    if (index >= active.steps.length - 1) {
      active.onFinish();
      stop(active.key);
    } else {
      setIndex(index + 1);
    }
  };

  const step = active.steps[index];
  const preparing = !!step.beforeShow && measuredIndex !== index;
  const below = rect ? rect.y + rect.h / 2 < H / 2 : true;
  const arrowX = rect ? Math.min(W - 34, Math.max(26, rect.x + rect.w / 2 - 8)) : 0;

  return (
    <View ref={hostRef} style={StyleSheet.absoluteFill} collapsable={false}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={next}
        accessibilityRole="button"
        accessibilityLabel={`${step.title}. ${step.body}. Tap to continue.`}
      >
        <Animated.View entering={FadeIn.duration(250)} style={StyleSheet.absoluteFill}>
          {preparing && <View style={[StyleSheet.absoluteFill, { backgroundColor: SHADE }]} />}
          {/* The lit hole. Its huge spread shadow is the dark over the rest of
              the screen, and it follows the hole's rounded corners. */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                borderWidth: 3,
                borderColor: COLORS.primary,
                boxShadow: `0 0 0 2400px ${SHADE}`,
                opacity: rect && !preparing ? 1 : 0,
              },
              holeStyle,
            ]}
          />

          {rect && measuredIndex === index && (
            <Animated.View key={index} entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
              <View
                style={{
                  position: 'absolute',
                  left: arrowX,
                  top: below ? rect.y + rect.h + 10 : rect.y - 26,
                  width: 16,
                  height: 16,
                  backgroundColor: COLORS.cardSurface,
                  transform: [{ rotate: '45deg' }],
                }}
              />
              <View
                className="rounded-lg border border-hairline bg-card p-4"
                style={[
                  { position: 'absolute', left: 16, right: 16 },
                  below ? { top: rect.y + rect.h + 17 } : { bottom: H - rect.y + 17 },
                ]}
              >
                <Text variant="heading" className="font-bold">
                  {step.title}
                </Text>
                <Text variant="body" className="mt-1">
                  {step.body}
                </Text>
                <View className="mt-3 flex-row items-center justify-between">
                  <Text variant="micro" tone="soft" className="font-semibold">
                    {active.steps.length > 1 ? `${index + 1} of ${active.steps.length}` : ' '}
                  </Text>
                  <View className="rounded-md px-4 py-2" style={{ backgroundColor: COLORS.primary }}>
                    <Text variant="label" className="font-bold" style={{ color: COLORS.textOnAccent }}>
                      {index >= active.steps.length - 1 ? 'Got it' : 'Next'}
                    </Text>
                  </View>
                </View>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>
      <Pressable
        onPress={exit}
        accessibilityRole="button"
        accessibilityLabel="Exit tour"
        accessibilityHint="Dismiss these tips and return to the current page."
        className="items-center justify-center rounded-full border border-hairline bg-card px-5"
        style={{ position: 'absolute', right: 16, bottom: insets.bottom + 12, minHeight: 48 }}
      >
        <Text variant="label" className="font-semibold">Exit tour</Text>
      </Pressable>
    </View>
  );
}
