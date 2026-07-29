import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADII, SPACING } from '../constants/theme';

/**
 * Miniature previews of real PantryLens screens, shown behind each onboarding
 * headline. They are rebuilt from the app's own components rather than being
 * screenshots, so they never drift out of date when a screen changes, and they
 * can animate to show the flow rather than just describe it.
 */

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Shared floating card that gives every mock the same tilt and shadow. */
function FloatingCard({
  children,
  rotate = '0deg',
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  rotate?: string;
  delay?: number;
  style?: any;
}) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(delay, withTiming(1, { duration: 620, easing: EASE }));
  }, [delay, enter]);

  const animated = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * 24 },
      { scale: 0.94 + enter.value * 0.06 },
      { rotate },
    ],
  }));

  return <Animated.View style={[styles.card, style, animated]}>{children}</Animated.View>;
}

/**
 * The photo is preloaded in the root layout, so it is normally in cache before
 * this mounts. The fade is insurance: if it ever does arrive late, it eases in
 * rather than popping over the dark viewfinder backing.
 */
function ViewfinderPhoto() {
  const loaded = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: loaded.value }));

  return (
    <Animated.View style={[styles.vfPhoto, style]}>
      <Image
        source={require('../assets/images/donation-scan.jpg')}
        style={styles.vfPhotoInner}
        resizeMode="cover"
        onLoad={() => {
          loaded.value = withTiming(1, { duration: 260, easing: EASE });
        }}
      />
    </Animated.View>
  );
}

/** Phase 1 — guided capture. A viewfinder with items resolving out of the frame. */
export function ScanMock() {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [sweep]);

  const scanLine = useAnimatedStyle(() => ({
    transform: [{ translateY: 24 + sweep.value * 150 }],
    opacity: 0.35 + sweep.value * 0.4,
  }));

  return (
    <View style={styles.stage}>
      <FloatingCard rotate="-3deg" style={styles.viewfinder}>
        <View style={styles.vfInner}>
          {/* Photo first — brackets and the sweep draw on top of it, so the
              frame reads as a live camera rather than an illustration. */}
          <ViewfinderPhoto />

          {/* corner brackets */}
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />

          <Animated.View style={[styles.scanLine, scanLine]} />

        </View>
      </FloatingCard>

      <FloatingCard rotate="4deg" delay={520} style={styles.detectPill}>
        <View style={[styles.dot, { backgroundColor: COLORS.categories.vegetable }]} />
        <Text style={styles.detectText}>Canned corn</Text>
        <Text style={styles.detectCount}>×12</Text>
      </FloatingCard>

      <FloatingCard rotate="-5deg" delay={760} style={styles.detectPillLow}>
        <View style={[styles.dot, { backgroundColor: COLORS.categories.protein }]} />
        <Text style={styles.detectText}>Peanut butter</Text>
        <Text style={styles.detectCount}>×4</Text>
      </FloatingCard>
    </View>
  );
}

/** Phase 2 — the verification step, including the inspection control. */
export function VerifyMock() {
  return (
    <View style={styles.stage}>
      <FloatingCard rotate="-2deg" style={styles.verifyCard}>
        <View style={styles.lowConfBadge}>
          <MaterialCommunityIcons name="alert-circle" size={11} color={COLORS.statusWarning} />
          <Text style={styles.lowConfText}>NEEDS HUMAN CHECK · 64%</Text>
        </View>

        <Text style={styles.itemName}>Canned green beans</Text>

        <View style={styles.chipRow}>
          <View style={[styles.miniChip, { backgroundColor: COLORS.categories.vegetable }]}>
            <Text style={styles.miniChipTextOn}>vegetable</Text>
          </View>
          <View style={styles.miniChip}>
            <Text style={styles.miniChipText}>protein</Text>
          </View>
        </View>

        <View style={styles.verifyFooter}>
          <View style={styles.miniStepper}>
            <Text style={styles.miniStepGlyph}>−</Text>
            <Text style={styles.miniStepVal}>5</Text>
            <Text style={styles.miniStepGlyph}>+</Text>
          </View>
          <View style={[styles.miniChip, { backgroundColor: COLORS.statusGood, borderColor: COLORS.statusGood }]}>
            <Text style={styles.miniChipTextOn}>Good</Text>
          </View>
        </View>
      </FloatingCard>

      <FloatingCard rotate="5deg" delay={560} style={styles.conditionPill}>
        <MaterialCommunityIcons name="close-octagon-outline" size={13} color={COLORS.textOnPrimary} />
        <Text style={styles.conditionText}>DENTED · held back</Text>
      </FloatingCard>
    </View>
  );
}

/** Phase 3 — bulk drops that get weighed, not counted. */
export function WeighMock() {
  return (
    <View style={styles.stage}>
      <FloatingCard rotate="-2deg" style={styles.scaleCard}>
        <Text style={styles.scaleLabel}>WEIGHT AT THE SCALE</Text>
        <View style={styles.scaleRow}>
          <Text style={styles.scaleValue}>84</Text>
          <Text style={styles.scaleUnit}>lb</Text>
        </View>
        <View style={styles.scaleDivider} />
        <View style={styles.estRow}>
          <MaterialCommunityIcons name="scale-balance" size={15} color={COLORS.secondary} />
          <Text style={styles.estText}>≈ 84 units estimated</Text>
        </View>
        <Text style={styles.estHint}>Weight is what gets recorded.</Text>
      </FloatingCard>

      <FloatingCard rotate="6deg" delay={560} style={styles.binPill}>
        <View style={[styles.dot, { backgroundColor: COLORS.categories.protein }]} />
        <Text style={styles.detectText}>Protein bin</Text>
      </FloatingCard>
    </View>
  );
}

/** Phase 4 — the payoff: the allocation engine naming what blocks distribution. */
export function BoxesMock() {
  const bars = [
    { label: 'Grain', pct: 1, color: COLORS.categories.grain },
    { label: 'Vegetable', pct: 0.86, color: COLORS.categories.vegetable },
    { label: 'Protein', pct: 0.28, color: COLORS.statusCritical },
    { label: 'Breakfast', pct: 0.74, color: COLORS.categories.breakfast },
  ];

  return (
    <View style={styles.stage}>
      <FloatingCard rotate="-2deg" style={styles.planCard}>
        <Text style={styles.planLabel}>YOU CAN BUILD</Text>
        <View style={styles.planRow}>
          <Text style={styles.planValue}>20</Text>
          <Text style={styles.planUnit}>balanced boxes</Text>
        </View>

        {bars.map(b => (
          <View key={b.label} style={styles.barRow}>
            <Text style={styles.barLabel}>{b.label}</Text>
            <View style={styles.barTrack}>
              <BarFill pct={b.pct} color={b.color} />
            </View>
          </View>
        ))}
      </FloatingCard>

      <FloatingCard rotate="5deg" delay={620} style={styles.limitPill}>
        <MaterialCommunityIcons name="alert-circle" size={13} color={COLORS.textOnPrimary} />
        <Text style={styles.conditionText}>PROTEIN IS THE LIMIT</Text>
      </FloatingCard>
    </View>
  );
}

function BarFill({ pct, color }: { pct: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(500, withTiming(pct, { duration: 900, easing: EASE }));
  }, [pct, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return <Animated.View style={[styles.barFill, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    shadowColor: '#2B2420',
    shadowOpacity: 0.13,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },

  // scan
  viewfinder: { width: 208, height: 226, padding: SPACING.sm, backgroundColor: '#2B2420' },
  vfInner: { flex: 1, borderRadius: RADII.md, backgroundColor: '#3B322C', overflow: 'hidden' },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: COLORS.primaryLight },
  cTL: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cTR: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cBL: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  cBR: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  scanLine: { position: 'absolute', left: 10, right: 10, height: 2, backgroundColor: COLORS.primaryLight },
  vfPhoto: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  vfPhotoInner: { width: '100%', height: '100%' },

  detectPill: {
    position: 'absolute',
    top: 26,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.full,
  },
  detectPillLow: {
    position: 'absolute',
    bottom: 34,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.full,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  detectText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  detectCount: { fontSize: 12, fontWeight: '800', color: COLORS.primaryLight },

  // verify
  verifyCard: { width: 232, padding: SPACING.sm + 2, gap: 7 },
  lowConfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: '#FCF0DC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  lowConfText: { fontSize: 8.5, fontWeight: '800', color: COLORS.statusWarning },
  itemName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  chipRow: { flexDirection: 'row', gap: 5 },
  miniChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.background,
  },
  miniChipText: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary },
  miniChipTextOn: { fontSize: 10, fontWeight: '700', color: COLORS.textOnPrimary },
  verifyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  miniStepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniStepGlyph: { fontSize: 15, fontWeight: '800', color: COLORS.primaryDark },
  miniStepVal: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  conditionPill: {
    position: 'absolute',
    bottom: 30,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.full,
    backgroundColor: COLORS.statusCritical,
    borderColor: COLORS.statusCritical,
  },
  conditionText: { fontSize: 10, fontWeight: '800', color: COLORS.textOnPrimary },

  // weigh
  scaleCard: { width: 226, padding: SPACING.md, alignItems: 'center' },
  scaleLabel: { fontSize: 9, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.8 },
  scaleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 4 },
  scaleValue: { fontSize: 52, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 56 },
  scaleUnit: { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  scaleDivider: { height: 1, alignSelf: 'stretch', backgroundColor: COLORS.borderSoft, marginVertical: SPACING.sm },
  estRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  estText: { fontSize: 13, fontWeight: '700', color: COLORS.secondary },
  estHint: { fontSize: 10, color: COLORS.textSecondary, marginTop: 3 },
  binPill: {
    position: 'absolute',
    top: 40,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.full,
  },

  // boxes
  planCard: { width: 236, padding: SPACING.md, gap: 5 },
  planLabel: { fontSize: 9, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.8 },
  planRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: SPACING.sm },
  planValue: { fontSize: 44, fontWeight: '800', color: COLORS.statusGood, lineHeight: 48 },
  planUnit: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, width: 62 },
  barTrack: {
    flex: 1,
    height: 7,
    borderRadius: 7,
    backgroundColor: COLORS.surfaceVariant,
    overflow: 'hidden',
  },
  barFill: { height: 7, borderRadius: 7 },
  limitPill: {
    position: 'absolute',
    bottom: 26,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADII.full,
    backgroundColor: COLORS.statusCritical,
    borderColor: COLORS.statusCritical,
  },
});
