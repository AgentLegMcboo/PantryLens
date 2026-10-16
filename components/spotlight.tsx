import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { COLORS } from '../constants/theme';
import { cueTap } from '../lib/feedback';
import { useTabBarHidden } from '../lib/tab-overlay';
import { Text } from './ui';

/**
 * First-visit tips: the screen goes dark except for one control, with an
 * arrow and a short note about something you wouldn't find on your own
 * (hold to drag, swipe to take off, the bell's number).
 *
 * A screen marks the controls it wants to point at with `useSpotlightTarget`,
 * and renders one `SpotlightTour`. Each tour shows once per device, the first
 * time its tab is opened, and is stored like a dismissed banner
 * (lib/dismissals.ts).
 */

type Rect = { x: number; y: number; w: number; h: number };

/** The live view behind each target id. Not state: read only when a tip opens. */
const targets = new Map<string, View>();

/** Mark a view as something a tip can point at. Give the view `collapsable={false}`. */
export function useSpotlightTarget(id: string) {
  return useCallback(
    (node: View | null) => {
      if (node) targets.set(id, node);
      else if (targets.get(id) === node) targets.delete(id);
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

export type TourStep = { target: string; title: string; body: string };

const storageKey = (key: string) => `pantrylens.tour.${key}`;

/** Forget every tour, so each tab shows its tips again (developer setting). */
export async function resetTours() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter(k => k.startsWith('pantrylens.tour.')));
}
const SHADE = 'rgba(20, 14, 10, 0.74)';
const PAD = 6;

export function SpotlightTour({ tourKey, steps }: { tourKey: string; steps: TourStep[] }) {
  const { width: W, height: H } = useWindowDimensions();
  const dragging = useTabBarHidden(s => s.hidden);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(storageKey(tourKey))
      .then(v => setSeen(v === '1'))
      .catch(() => setSeen(false));
  }, [tourKey]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const finish = useCallback(() => {
    setSeen(true);
    setRect(null);
    AsyncStorage.setItem(storageKey(tourKey), '1').catch(() => {});
  }, [tourKey]);

  // Find the current step's target once the screen has settled. A target
  // that isn't on screen (an empty list, say) is skipped.
  useEffect(() => {
    if (seen !== false || !focused || dragging) {
      setRect(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      for (let i = index; i < steps.length; i++) {
        const r = await measure(steps[i].target);
        if (cancelled) return;
        if (r && r.y >= 0 && r.y + r.h <= H) {
          if (i !== index) setIndex(i);
          setRect(r);
          return;
        }
      }
      finish();
    }, index === 0 ? 900 : 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [seen, focused, dragging, index, steps, H, finish]);

  const next = () => {
    cueTap();
    setRect(null);
    if (index >= steps.length - 1) finish();
    else setIndex(index + 1);
  };

  if (!rect || seen !== false) return null;
  const step = steps[index];

  const hole = { x: rect.x - PAD, y: rect.y - PAD, w: rect.w + PAD * 2, h: rect.h + PAD * 2 };
  const below = hole.y + hole.h / 2 < H / 2;
  const arrowX = Math.min(W - 34, Math.max(26, hole.x + hole.w / 2 - 8));

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={next}>
      <Pressable style={{ flex: 1 }} onPress={next} accessibilityRole="button" accessibilityLabel={`${step.title}. ${step.body}. Tap to continue.`}>
        <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          {/* Everything but the hole goes dark */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, hole.y), backgroundColor: SHADE }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: hole.y + hole.h, bottom: 0, backgroundColor: SHADE }} />
          <View style={{ position: 'absolute', left: 0, width: Math.max(0, hole.x), top: hole.y, height: hole.h, backgroundColor: SHADE }} />
          <View style={{ position: 'absolute', left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h, backgroundColor: SHADE }} />
          <View
            style={{
              position: 'absolute',
              left: hole.x,
              top: hole.y,
              width: hole.w,
              height: hole.h,
              borderRadius: 12,
              borderWidth: 3,
              borderColor: COLORS.primary,
            }}
          />

          {/* The arrow, pointing at the hole */}
          <View
            style={{
              position: 'absolute',
              left: arrowX,
              top: below ? hole.y + hole.h + 10 : hole.y - 26,
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
              below ? { top: hole.y + hole.h + 17 } : { bottom: H - hole.y + 17 },
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
                {steps.length > 1 ? `${index + 1} of ${steps.length}` : ' '}
              </Text>
              <View className="rounded-md px-4 py-2" style={{ backgroundColor: COLORS.primary }}>
                <Text variant="label" className="font-bold" style={{ color: COLORS.textOnAccent }}>
                  {index >= steps.length - 1 ? 'Got it' : 'Next'}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
