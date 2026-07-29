import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { COLORS, FONTS } from "../constants/theme";
import { cueTap } from "../lib/feedback";

const { width: W, height: H } = Dimensions.get("window");

/**
 * Launch animation. Plays over the app while the session and pantry data load,
 * then gets out of the way.
 *
 * The beat is deliberately borrowed from the app's own idea: a scan sweep
 * crosses the screen and the brand is what it leaves behind. It reads as
 * PantryLens rather than as a generic logo bounce.
 *
 * `hold` keeps it on screen past its own animation if data is still loading,
 * so the app never flashes a half-built dashboard.
 */
const INTRO_MS = 1050;

/**
 * Freezes the splash on screen so it can be watched and tuned.
 * Tap anywhere to replay the sequence from the start.
 *
 * Flip to false to restore normal launch behaviour. Guarded by __DEV__ as well,
 * so a release build can never ship stuck on the splash.
 */
const SPLASH_DEBUG = __DEV__ && false;

export function BrandSplash({
  hold,
  onDone,
}: {
  hold: boolean;
  onDone: () => void;
}) {
  // One clock drives the whole sequence; each element reads its own slice of it.
  const t = useSharedValue(0);
  const exit = useSharedValue(0);

  const play = useCallback(() => {
    t.value = 0;
    t.value = withTiming(1, {
      duration: INTRO_MS,
      easing: Easing.out(Easing.cubic),
    });
    // A single tick as the mark lands — the app announcing itself, once.
    setTimeout(() => cueTap(), 330);
  }, [t]);

  useEffect(() => {
    play();
  }, [play]);

  // Only leave once the intro has played AND the app behind is ready.
  useEffect(() => {
    if (SPLASH_DEBUG || hold) return;
    const timer = setTimeout(() => {
      exit.value = withTiming(
        1,
        { duration: 460, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        },
      );
    }, INTRO_MS - 250);
    return () => clearTimeout(timer);
  }, [hold, exit, onDone]);

  const root = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    // Pushes past the viewer on the way out rather than just fading.
    transform: [{ scale: 1 + exit.value * 0.14 }],
  }));

  const mark = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0, 0.42], [0, 1], "clamp");
    return {
      opacity: interpolate(p, [0, 0.35], [0, 1], "clamp"),
      transform: [
        // Slight overshoot then settle — a spring re-targeted every frame just
        // smears the motion, so the pop is baked into the curve instead.
        { scale: interpolate(p, [0, 0.75, 1], [0.6, 1.07, 1]) },
        { rotate: `${(1 - p) * -35}deg` },
      ],
    };
  });

  /** The sweep: a bright bar that crosses the mark and leaves the wordmark behind. */
  const sweep = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.22, 0.72], [0, 1], "clamp");
    return {
      transform: [{ translateX: -W + p * W * 2.2 }, { rotate: "18deg" }],
      opacity: interpolate(p, [0, 0.15, 0.85, 1], [0, 0.9, 0.9, 0]),
    };
  });

  const word = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.5, 0.86], [0, 1], "clamp");
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 14 }],
    };
  });

  const tag = useAnimatedStyle(() => {
    const p = interpolate(t.value, [0.68, 1], [0, 1], "clamp");
    return { opacity: p * 0.85, transform: [{ translateY: (1 - p) * 10 }] };
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, root]}
      pointerEvents={SPLASH_DEBUG ? "auto" : "none"}
    >
      <LinearGradient
        colors={[COLORS.primaryLight, COLORS.primary, COLORS.primaryDark]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Pantry goods drifting down behind the mark. Kept faint — they should
          register as depth and movement, not as objects competing with the logo. */}
      <View style={styles.fallLayer} pointerEvents="none">
        {FALLING.map((cfg, i) => (
          <FallingItem key={i} cfg={cfg} />
        ))}
      </View>

      <View style={styles.center}>
        <Animated.View style={[styles.mark, mark]}>
          <MaterialCommunityIcons
            name="camera-iris"
            size={54}
            color={COLORS.primaryDark}
          />
        </Animated.View>

        <Animated.Text style={[styles.word, word]}>PantryLens</Animated.Text>
        <Animated.Text style={[styles.tag, tag]}>
          Every can accounted for
        </Animated.Text>
      </View>

      <Animated.View style={[styles.sweep, sweep]} pointerEvents="none" />

      {SPLASH_DEBUG && (
        <Pressable style={StyleSheet.absoluteFill} onPress={play}>
          <View style={styles.debugHint}>
            <Text style={styles.debugText}>TAP TO REPLAY</Text>
            <Text style={styles.debugSub}>
              SPLASH_DEBUG in components/brand-splash.tsx · set false when done
            </Text>
          </View>
        </Pressable>
      )}
    </Animated.View>
  );
}

/**
 * One falling can.
 *
 * Each can runs its OWN looping clock rather than a slice of the intro timeline.
 * Tied to the intro clock, any can whose window ran past the end simply froze
 * where it was — the intro stops at 1.0 and the can never finished its fall.
 * Looping also means they keep falling for as long as the splash is up, which
 * matters while it is held open for loading or for tuning.
 *
 * `x` is a fraction of screen width so the layout holds on any device.
 */
type Falling = {
  x: number;
  w: number;
  /** Milliseconds for one full top-to-bottom pass. */
  fall: number;
  /** Milliseconds before this can first enters. */
  delay: number;
  rot: number;
  op: number;
};

const FALLING: Falling[] = [
  { x: 0.08, w: 34, fall: 1500, delay: 0, rot: -18, op: 0.16 },
  { x: 0.78, w: 40, fall: 1750, delay: 120, rot: 14, op: 0.14 },
  { x: 0.44, w: 28, fall: 1320, delay: 240, rot: 22, op: 0.11 },
  { x: 0.24, w: 44, fall: 1950, delay: 360, rot: -11, op: 0.12 },
  { x: 0.9, w: 26, fall: 1240, delay: 480, rot: 18, op: 0.13 },
  { x: 0.6, w: 38, fall: 1640, delay: 620, rot: -20, op: 0.11 },
  { x: 0.02, w: 24, fall: 1180, delay: 760, rot: 12, op: 0.1 },
  { x: 0.68, w: 32, fall: 1440, delay: 900, rot: -15, op: 0.1 },
  { x: 0.34, w: 36, fall: 1820, delay: 1040, rot: 16, op: 0.1 },
];

/** Cans are drawn at a fixed 3:4 ratio so they never look like cartons. */
const CAN_RATIO = 1.34;

function FallingItem({ cfg }: { cfg: Falling }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      cfg.delay,
      withRepeat(
        // Accelerating, like something actually dropping.
        withTiming(1, { duration: cfg.fall, easing: Easing.in(Easing.quad) }),
        -1,
        false,
      ),
    );
  }, [cfg, p]);

  const h = cfg.w * CAN_RATIO;
  // Starts fully off the top and ends fully past the bottom — never mid-screen.
  const travel = H + h * 2 + 120;

  const style = useAnimatedStyle(() => ({
    // Fades in on entry and out before it wraps, so the reset is never visible.
    opacity: interpolate(p.value, [0, 0.12, 0.85, 1], [0, cfg.op, cfg.op, 0]),
    transform: [
      { translateY: -h - 100 + p.value * travel },
      // Keeps turning the whole way down — it is falling, not landing.
      { rotate: `${cfg.rot * (0.4 + p.value)}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[styles.can, { left: W * cfg.x, width: cfg.w, height: h }, style]}
    >
      {/* Rim, seam and label band — the details that read as "can" at a glance. */}
      <View style={styles.canLid} />
      <View style={styles.canNeck} />
      <View style={styles.canLabel}>
        <View style={styles.canLabelLine} />
        <View style={[styles.canLabelLine, { width: "52%" }]} />
      </View>
      <View style={styles.canBase} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.primary, zIndex: 999, elevation: 999 },
  fallLayer: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  can: {
    position: "absolute",
    top: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    overflow: "hidden",
    alignItems: "center",
  },
  canLid: {
    width: "84%",
    height: 4,
    marginTop: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    opacity: 0.85,
  },
  canNeck: {
    width: "100%",
    height: 2,
    marginTop: 2,
    backgroundColor: "#FFFFFF",
    opacity: 0.5,
  },
  canLabel: {
    width: "100%",
    flex: 1,
    marginVertical: 4,
    backgroundColor: "#FFFFFF",
    opacity: 0.45,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  canLabelLine: {
    width: "68%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "#8F3E24",
    opacity: 0.5,
  },
  canBase: {
    width: "88%",
    height: 3,
    marginBottom: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
    opacity: 0.7,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2B1810",
    shadowOpacity: 0.35,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  word: {
    marginTop: 22,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: COLORS.textOnPrimary,
  },
  tag: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: COLORS.background,
  },
  sweep: {
    position: "absolute",
    top: -H * 0.2,
    width: 108,
    height: H * 1.4,
    backgroundColor: "#FFFFFF",
  },
  debugHint: {
    position: "absolute",
    bottom: 54,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 4,
  },
  debugText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: COLORS.background,
    opacity: 0.9,
  },
  debugSub: {
    fontSize: 10,
    color: COLORS.background,
    opacity: 0.6,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
