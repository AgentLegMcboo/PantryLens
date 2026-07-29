import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
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
import { PressableScale } from '../components/motion';
import { BoxesMock, ScanMock, VerifyMock, WeighMock } from '../components/onboarding-mocks';
import { COLORS, FONTS, RADII, SPACING } from '../constants/theme';
import { cueSuccess, cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Each phase shows a live miniature of the screen it describes, so a volunteer
 * arrives at the real thing already recognising it. Headlines lead with the
 * verb — what they will actually do — not with the technology.
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
  const [page, setPage] = useState(0);

  const isLast = page === PHASES.length - 1;

  const finish = async () => {
    cueSuccess();
    // Must land before the navigation, or the root gate still sees the intro
    // as incomplete and sends us straight back here.
    await completeOnboarding();
    router.replace('/login');
  };

  const next = () => {
    if (isLast) return finish();
    cueTap();
    scrollRef.current?.scrollTo({ x: (page + 1) * SCREEN_W, animated: true });
  };

  const skip = async () => {
    cueTap();
    await completeOnboarding();
    router.replace('/login');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (nextPage !== page) {
      setPage(nextPage);
      cueTap();
    }
  };

  return (
    <View style={styles.root}>
      {/* The pantry photo sits far back — enough to feel like a place, not
          enough to compete with the mocks in front of it. */}
      <Image source={require('../assets/images/pantry-bg.jpg')} style={styles.bg} blurRadius={3} />
      <LinearGradient
        colors={['rgba(251,246,238,0.58)', 'rgba(251,246,238,0.88)', COLORS.background]}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <PhaseTint page={page} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <MaterialCommunityIcons name="camera-iris" size={16} color={COLORS.textOnPrimary} />
            </View>
            <Text style={styles.brandName}>PantryLens</Text>
          </View>
          {!isLast && (
            <PressableScale style={styles.skipBtn} onPress={skip}>
              <Text style={styles.skipText}>Skip</Text>
            </PressableScale>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.pager}
        >
          {PHASES.map(phase => {
            const Mock = phase.Mock;
            return (
              <View key={phase.key} style={styles.page}>
                <View style={styles.mockArea}>
                  <View style={styles.mockHalo} />
                  <Mock />
                </View>

                <View style={styles.copy}>
                  <Text style={styles.title}>
                    <Text style={styles.titleLead}>{phase.lead} </Text>
                    {phase.title}
                  </Text>
                  <Text style={styles.body}>{phase.body}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PHASES.map((p, i) => (
              <Dot key={p.key} active={i === page} />
            ))}
          </View>

          <PressableScale style={styles.cta} cue="press" onPress={next}>
            <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
            <MaterialCommunityIcons
              name="arrow-right"
              size={19}
              color={COLORS.textOnPrimary}
            />
          </PressableScale>

          <Text style={styles.legal}>
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
    progress.value = withTiming(page, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [page, progress]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      PHASES.map((_, i) => i),
      PHASES.map(p => p.tint),
    ),
  }));

  return <Animated.View style={[StyleSheet.absoluteFill, style, { opacity: 0.3 }]} />;
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
    backgroundColor: COLORS.primaryLight,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  bg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.5 },
  safe: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 18, fontFamily: FONTS.serifSemi, color: COLORS.textPrimary, letterSpacing: -0.1 },
  skipBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  skipText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  pager: { flex: 1 },
  page: { width: SCREEN_W, flex: 1, paddingHorizontal: SPACING.lg },

  mockArea: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 280 },
  mockHalo: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.cardSurface,
    opacity: 0.55,
  },

  copy: { paddingBottom: SPACING.md },
  title: {
    fontSize: 33,
    fontFamily: FONTS.serif,
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 41,
  },
  titleLead: { color: COLORS.primaryLight, fontFamily: FONTS.serifSemi },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    paddingRight: SPACING.sm,
  },

  footer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 7, borderRadius: 4 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: SPACING.touch + 6,
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  ctaText: { fontSize: 16.5, fontWeight: '700', color: COLORS.textOnPrimary },
  legal: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
});
