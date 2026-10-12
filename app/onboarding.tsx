import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthBackdrop } from '../components/auth-layout';
import { BoxesMock, ScanMock, VerifyMock, WeighMock } from '../components/onboarding-mocks';
import { Button, Text } from '../components/ui';
import { COLORS } from '../constants/theme';
import { cueSuccess, cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Each phase shows a live miniature of the screen it describes, so a volunteer
 * arrives at the real thing already recognising it. Headlines lead with the
 * verb — what they will actually do — not with the technology.
 *
 * The chrome is the app's: the same photograph and scrim as Log In, and the same
 * physical button with a lip that every other screen commits with. Before this
 * the intro had its own pill-shaped CTA and its own copy of the background, so
 * the very first tap a volunteer made felt nothing like the second.
 */
const PHASES = [
  {
    key: 'scan',
    Mock: ScanMock,
    lead: 'Photograph',
    title: 'what just came in.',
    body: 'Point the camera at a donation bag or a shelf. PantryLens drafts the item list so nobody writes counts on paper.',
    tint: '#F6ECE2',
  },
  {
    key: 'verify',
    Mock: VerifyMock,
    lead: 'You',
    title: 'have the final say.',
    body: 'The AI only guesses. Fix a count, change a category, flag a dented can — nothing reaches inventory until you confirm it.',
    tint: '#F3EDE0',
  },
  {
    key: 'weigh',
    Mock: WeighMock,
    lead: 'Weigh',
    title: 'the bulk drops.',
    body: 'Big grocery and food-bank loads get weighed, not counted. Record the pounds and PantryLens still works out what it adds to your boxes.',
    tint: '#EDF0E4',
  },
  {
    key: 'boxes',
    Mock: BoxesMock,
    lead: 'Know',
    title: "what's holding you back.",
    body: 'See how many balanced boxes you can really pack, which category is blocking the rest, and exactly what to ask donors for.',
    tint: '#F7E9E4',
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const completeOnboarding = usePantryStore(state => state.completeOnboarding);
  // Signed in only when the intro is replayed in development.
  const signedIn = usePantryStore(state => !!state.session);
  const [page, setPage] = useState(0);

  const isLast = page === PHASES.length - 1;

  const finish = async () => {
    cueSuccess();
    // Must land before the navigation, or the root gate still sees the intro
    // as incomplete and sends us straight back here.
    await completeOnboarding();
    router.replace(signedIn ? '/(tabs)' : '/login');
  };

  const next = () => {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
  };

  const skip = async () => {
    cueTap();
    await completeOnboarding();
    router.replace(signedIn ? '/(tabs)' : '/login');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (nextPage !== page) {
      setPage(nextPage);
      cueTap();
    }
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* The pantry photo sits far back — enough to feel like a place, not
          enough to compete with the mocks in front of it. */}
      <AuthBackdrop blurRadius={3} />
      <PhaseTint page={page} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-gutter pt-2">
          <View className="flex-row items-center gap-2.5">
            <View className="h-8 w-8 items-center justify-center rounded-md bg-brand">
              <MaterialCommunityIcons
                name="camera-iris"
                size={17}
                color={COLORS.textOnPrimary}
              />
            </View>
            <Text
              // The splash's wordmark (components/brand-splash.tsx), scaled down.
              style={{
                fontSize: 19,
                lineHeight: 24,
                fontWeight: '800',
                letterSpacing: -0.4,
                color: COLORS.textPrimary,
              }}
            >
              PantryLens
            </Text>
          </View>

          {!isLast && (
            <Pressable onPress={skip} hitSlop={10} className="px-2 py-2">
              <Text variant="label" tone="soft" className="font-semibold">
                Skip
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          className="flex-1"
        >
          {PHASES.map(phase => {
            const Mock = phase.Mock;
            return (
              <View key={phase.key} style={{ width: SCREEN_W }} className="flex-1 px-gutter">
                <View className="min-h-[280px] flex-1 items-center justify-center">
                  <View className="absolute h-[300px] w-[300px] rounded-full bg-card opacity-60" />
                  <Mock />
                </View>

                <View className="pb-4">
                  {/* Every nested span carries its own lineHeight. `Text`
                      defaults to the `body` variant and its 22px line box, and a
                      large headline dropped into that gets clipped — which is
                      exactly what happened to "Photograph what just came in."
                      Sizing up here means sizing the line box up with it.
                      Set in the app's sans like every other screen; the serif is
                      kept for the wordmark only. */}
                  <Text
                    style={{
                      fontSize: 30,
                      lineHeight: 37,
                      fontWeight: '700',
                      letterSpacing: -0.5,
                      color: COLORS.textPrimary,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 30,
                        lineHeight: 37,
                        fontWeight: '700',
                        color: COLORS.primaryLight,
                      }}
                    >
                      {phase.lead}{' '}
                    </Text>
                    {phase.title}
                  </Text>
                  <Text variant="body" tone="soft" className="mt-3 pr-2">
                    {phase.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View className="gap-4 px-gutter pb-2">
          <View className="flex-row items-center gap-1.5">
            {PHASES.map((p, i) => (
              <Dot key={p.key} active={i === page} />
            ))}
          </View>

          <Button
            label={isLast ? 'Get started' : 'Next'}
            block
            icon={
              <MaterialCommunityIcons
                name="arrow-right"
                size={19}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={next}
          />

          <Text variant="micro" tone="soft" className="text-center">
            Built for small food pantries. Your inventory stays with your pantry.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Wash of colour that cross-fades per phase, so swiping visibly changes mood. */
function PhaseTint({ page }: { page: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(page, {
      duration: 420,
      easing: Easing.out(Easing.quad),
    });
  }, [page, progress]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      PHASES.map((_, i) => i),
      PHASES.map(p => p.tint),
    ),
  }));

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style, { opacity: 0.3 }]} />;
}

function Dot({ active }: { active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);

  // Written in an effect, not during render — Reanimated warns about the latter.
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 280,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [active, progress]);

  const style = useAnimatedStyle(() => ({
    width: 7 + progress.value * 19,
    opacity: 0.3 + progress.value * 0.7,
  }));

  return (
    <Animated.View
      style={[{ height: 7, borderRadius: 4, backgroundColor: COLORS.primaryLight }, style]}
    />
  );
}
