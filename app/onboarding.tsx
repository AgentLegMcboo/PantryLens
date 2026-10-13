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
import { BrandMark } from '../components/brand-mark';
import { BoxesMock, CameraMock, ScanMock } from '../components/onboarding-mocks';
import { Button, Text } from '../components/ui';
import { COLORS } from '../constants/theme';
import { useAccessibilityStore } from '../lib/accessibility';
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
    key: 'camera',
    Mock: CameraMock,
    lead: 'Point',
    title: 'the camera at the pantry.',
    body: 'A donation pile or a whole shelf. Take as many photos as it needs without leaving the camera.',
    tint: '#F6ECE2',
  },
  {
    key: 'scan',
    Mock: ScanMock,
    lead: 'Every label',
    title: 'read for you.',
    body: 'PantryLens turns the photos into an item list, so nobody writes counts on paper.',
    tint: '#F7EBDF',
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
  const { seniorMode, toggleSeniorMode } = useAccessibilityStore();
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
          <BrandMark />

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                cueTap();
                toggleSeniorMode();
              }}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: seniorMode }}
              accessibilityLabel="Large text mode for older volunteers"
              className="h-12 flex-row items-center gap-1.5 rounded-lg border px-3"
              style={{
                backgroundColor: seniorMode ? COLORS.primary : COLORS.cardSurface,
                borderColor: seniorMode ? COLORS.primaryDeep : COLORS.borderStrong,
              }}
            >
              <MaterialCommunityIcons
                name="format-size"
                size={19}
                color={seniorMode ? COLORS.textOnPrimary : COLORS.textPrimary}
              />
              <Text
                variant="micro"
                className="font-bold"
                style={{ color: seniorMode ? COLORS.textOnPrimary : COLORS.textPrimary }}
              >
                {seniorMode ? 'Large text ON' : 'Large text'}
              </Text>
            </Pressable>

            {!isLast && (
              <Pressable
                onPress={skip}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Skip introduction"
                className="h-12 items-center justify-center px-3"
              >
                <Text variant="label" tone="soft" className="font-semibold">
                  Skip
                </Text>
              </Pressable>
            )}
          </View>
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
                <View className="min-h-[260px] flex-1 items-center justify-center">
                  <View className="absolute h-[268px] w-[268px] rounded-2xl border border-hairline/40 bg-card opacity-70" />
                  <Mock />
                </View>

                <View className="pb-3">
                  <Text
                    variant="display"
                    style={{
                      fontSize: seniorMode ? 33 : 30,
                      lineHeight: seniorMode ? 40 : 37,
                      fontWeight: '700',
                      letterSpacing: -0.5,
                      color: COLORS.textPrimary,
                    }}
                  >
                    <Text
                      variant="display"
                      style={{
                        fontSize: seniorMode ? 33 : 30,
                        lineHeight: seniorMode ? 40 : 37,
                        fontWeight: '700',
                        color: COLORS.primaryLight,
                      }}
                    >
                      {phase.lead}{' '}
                    </Text>
                    {phase.title}
                  </Text>
                  <Text variant="body" tone="soft" className="mt-2.5 pr-2">
                    {phase.body}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View className="gap-3.5 px-gutter pb-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              {PHASES.map((p, i) => (
                <Dot key={p.key} active={i === page} />
              ))}
            </View>
            <Text variant="micro" tone="soft" className="font-semibold">
              Step {page + 1} of {PHASES.length}
            </Text>
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
            Built for community food pantries &amp; volunteer teams.
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
