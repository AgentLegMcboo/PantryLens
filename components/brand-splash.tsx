import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Ellipse, G, Line, Rect } from "react-native-svg";
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
 * Absolute ceiling on how long the splash may stay up, however unready the app
 * behind it claims to be.
 *
 * `hold` used to be able to pin this open indefinitely, and did: gated on the
 * pantry fetch it sat for about ten seconds on a cold launch. The gate is much
 * narrower now, but a hard stop means no dependency added later can ever
 * reintroduce that — worst case the app appears with its own loading states,
 * which is what those states are for.
 */
const MAX_HOLD_MS = 2500;

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

  /**
   * Leaves once the intro has played and the app behind is ready — or once the
   * ceiling is reached, whichever comes first.
   *
   * Mounted-at time rather than effect-run time is what the ceiling measures
   * from, so a `hold` that flips repeatedly cannot keep restarting the clock.
   */
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (SPLASH_DEBUG) return;

    const leave = () => {
      exit.value = withTiming(
        1,
        { duration: 460, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        },
      );
    };

    const elapsed = Date.now() - mountedAt.current;
    const delay = hold
      ? Math.max(0, MAX_HOLD_MS - elapsed)
      : Math.max(0, INTRO_MS - 250 - elapsed);

    const timer = setTimeout(leave, delay);
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
  { x: 0.08, w: 40, fall: 1500, delay: 0, rot: -18, op: 0.26 },
  { x: 0.78, w: 46, fall: 1750, delay: 120, rot: 14, op: 0.24 },
  { x: 0.44, w: 32, fall: 1320, delay: 240, rot: 22, op: 0.19 },
  { x: 0.24, w: 50, fall: 1950, delay: 360, rot: -11, op: 0.21 },
  { x: 0.9, w: 30, fall: 1240, delay: 480, rot: 18, op: 0.22 },
  { x: 0.6, w: 44, fall: 1640, delay: 620, rot: -20, op: 0.19 },
  { x: 0.02, w: 28, fall: 1180, delay: 760, rot: 12, op: 0.18 },
  { x: 0.68, w: 36, fall: 1440, delay: 900, rot: -15, op: 0.18 },
  { x: 0.34, w: 42, fall: 1820, delay: 1040, rot: 16, op: 0.18 },
];

/**
 * The can itself, drawn once as vector art.
 *
 * The previous version was a white rounded rectangle with two hairlines across
 * it, which read as a carton at best. What actually makes a shape say "tin can"
 * is the elliptical rim — a cylinder seen slightly from above — and the ring
 * ridges pressed into the metal near each end. Both are here, along with a
 * specular stripe down the left of the body to curve the surface.
 *
 * Coordinates live in a 100x134 viewBox matching CAN_RATIO, so one drawing
 * scales to every size in FALLING without redrawing anything.
 */
function CanShape() {
  const rimY = 13;
  const baseY = 121;

  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 134">
      {/* Body, then the highlight down one side. Both go first: drawn last, the
          highlight cut a white gap straight through the ridges and label and
          read as a manufacturing defect rather than as light. */}
      <Rect x={6} y={rimY} width={88} height={baseY - rimY} fill="#FFFFFF" opacity={0.45} />
      <Rect x={15} y={rimY} width={8} height={baseY - rimY} fill="#FFFFFF" opacity={0.45} />

      {/* Paper label across the middle, brighter than the metal around it. */}
      <Rect x={6} y={42} width={88} height={52} fill="#FFFFFF" opacity={0.95} />
      <Rect x={20} y={56} width={60} height={5} rx={2.5} fill="#8F3E24" opacity={0.5} />
      <Rect x={30} y={69} width={40} height={3.5} rx={1.75} fill="#8F3E24" opacity={0.38} />

      {/* Ring ridges above and below the label — the pressed bands every steel
          can has, and the strongest "can" cue after the rim. Placed clear of the
          label so nothing crosses anything. */}
      <G opacity={0.6}>
        <Line x1={6} y1={25} x2={94} y2={25} stroke="#8F3E24" strokeWidth={2.5} />
        <Line x1={6} y1={32} x2={94} y2={32} stroke="#8F3E24" strokeWidth={1.8} />
        <Line x1={6} y1={102} x2={94} y2={102} stroke="#8F3E24" strokeWidth={1.8} />
        <Line x1={6} y1={109} x2={94} y2={109} stroke="#8F3E24" strokeWidth={2.5} />
      </G>

      {/* Base, then the top rim with the lid seated inside it. The ellipses are
          what turn a rectangle into a cylinder seen slightly from above. */}
      <Ellipse cx={50} cy={baseY} rx={44} ry={7} fill="#FFFFFF" opacity={0.75} />
      <Ellipse cx={50} cy={rimY} rx={44} ry={9.5} fill="#FFFFFF" opacity={1} />
      <Ellipse cx={50} cy={rimY} rx={34} ry={6.5} fill="#8F3E24" opacity={0.42} />
      <Ellipse cx={50} cy={rimY - 1.5} rx={34} ry={6.5} fill="#FFFFFF" opacity={0.75} />
    </Svg>
  );
}

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
      <CanShape />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: COLORS.primary, zIndex: 999, elevation: 999 },
  fallLayer: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  can: { position: "absolute", top: 0 },
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
