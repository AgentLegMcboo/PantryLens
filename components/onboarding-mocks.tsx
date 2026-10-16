import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { ProgressBar } from "./motion";
import {
  Button,
  Card,
  cardRing,
  CategoryIcon,
  ItemThumb,
  Text,
} from "./ui";
import { COLORS } from "../constants/theme";

/**
 * Pieces of the real app, shown behind each onboarding headline.
 *
 * Every mock is assembled from the same components the screens use — Card,
 * Chip, Stepper, Button, CategoryIcon, ItemThumb — so a
 * volunteer meets the actual controls before they meet the actual screens, and
 * nothing here can drift from what the app really looks like. They are inert
 * (`pointerEvents="none"`): pictures of controls, not controls.
 *
 * Each phase is one main piece in the middle and two small ones floating at
 * opposite corners — top right and bottom left — so the composition balances.
 */

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A deeper shadow than a working card's, so the mock pieces lift clearly off
 * the page and read as a picture of the app rather than part of the screen
 * you're on.
 */
const MOCK_DEPTH = "0 10px 36px 0 rgba(107, 74, 47, 0.18)";
const MOCK_SHADOW = { boxShadow: MOCK_DEPTH };
/** The same lift on a card, keeping the card's edge ring. */
const MOCK_CARD = { boxShadow: `${cardRing()}, ${MOCK_DEPTH}` };
const noop = () => {};

/** Eases a piece up into place, tilted slightly so it reads as laid on the page. */
function Float({
  children,
  rotate = "0deg",
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  rotate?: string;
  delay?: number;
  style?: object;
}) {
  const enter = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    // Forced to run: with reduced motion only the fade is left (below), and
    // Reanimated's default would snap that too.
    enter.value = withDelay(
      delay,
      withTiming(1, { duration: 620, easing: EASE, reduceMotion: ReduceMotion.Never }),
      ReduceMotion.Never,
    );
  }, [delay, enter]);

  const animated = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: reduceMotion
      ? [{ rotate }]
      : [
          { translateY: (1 - enter.value) * 20 },
          { scale: 0.95 + enter.value * 0.05 },
          { rotate },
        ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/**
 * The stage every mock shares. The two floats are anchored to the main piece,
 * overlapping its top-right and bottom-left corners, so they read as part of the
 * same picture rather than drifting to the edges of the screen.
 */
/** Where one slide puts its pieces: the main piece's tilt and each tag's spot. */
type Layout = {
  tilt: string;
  tr: { top: number; right: number; rotate: string };
  bl: { bottom: number; left: number; rotate: string };
};

// Every angle is at least 3.5deg either way: a piece only slightly off
// straight reads as a mistake, not a choice.
const DEFAULT_LAYOUT: Layout = {
  tilt: "-3.5deg",
  tr: { top: -58, right: -6, rotate: "5deg" },
  bl: { bottom: -58, left: -6, rotate: "-4.5deg" },
};

function Stage({
  main,
  topRight,
  bottomLeft,
  layout = DEFAULT_LAYOUT,
}: {
  main: React.ReactNode;
  topRight: React.ReactNode;
  bottomLeft: React.ReactNode;
  /**
   * Each slide sets its own tilt and tag positions, so the five don't read as
   * one template stamped five times, and the tags sit clear of the card
   * rather than crowding its corners.
   */
  layout?: Layout;
}) {
  const { tilt, tr, bl } = layout;
  return (
    <View style={styles.stage} pointerEvents="none">
      <View>
        <Float rotate={tilt}>{main}</Float>
        <Float
          rotate={tr.rotate}
          delay={480}
          style={{ position: "absolute", top: tr.top, right: tr.right }}
        >
          {topRight}
        </Float>
        <Float
          rotate={bl.rotate}
          delay={700}
          style={{ position: "absolute", bottom: bl.bottom, left: bl.left }}
        >
          {bottomLeft}
        </Float>
      </View>
    </View>
  );
}

type TagTone = "brand" | "good" | "warn" | "critical";
const TAG_COLORS: Record<TagTone, string> = {
  brand: COLORS.primaryLight,
  good: COLORS.statusGood,
  warn: COLORS.statusWarning,
  critical: COLORS.statusCritical,
};

/**
 * The one floating piece every phase uses: a small white card with a glyph in
 * a tinted disc and a label. Same size, same shape, same type everywhere, so
 * the corners of each mock read as a set; the tone only colours the glyph.
 */
function Tag({
  icon,
  label,
  tone = "brand",
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  tone?: TagTone;
}) {
  const color = TAG_COLORS[tone];
  return (
    <Card style={MOCK_CARD} className="flex-row items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5">
      <View
        className="h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}22` }}
      >
        <MaterialCommunityIcons name={icon} size={16} color={color} />
      </View>
      <Text variant="label" className="font-semibold">
        {label}
      </Text>
    </Card>
  );
}

/**
 * Phase 0 — the camera itself, as the Log Donation screen draws it: a pantry
 * shelf in the viewfinder, the white corners, the round controls at the top,
 * the hint pill, the shots taken so far, and the bar with the orange shutter.
 * The first thing a volunteer does in the app, shown before they do it.
 */
export function CameraMock() {
  const glass = "rgba(20,16,14,0.6)";
  const corner = (extra: object) => (
    <View style={[{ position: "absolute", width: 26, height: 26, borderColor: "#FFFFFF" }, extra]} />
  );
  return (
    <Stage
      layout={{ tilt: "-4deg", tr: { top: -50, right: -40, rotate: "6deg" }, bl: { bottom: -46, left: -44, rotate: "-5deg" } }}
      main={
        <View
          style={[MOCK_SHADOW, { width: 224, height: 336, borderRadius: 28, backgroundColor: "#111" }]}
          className="overflow-hidden"
        >
          {/* The whole photo, uncropped: the frame is the photo's own 2:3 shape
              and the image is sized to it exactly, so nothing is cut or enlarged. */}
          <Image
            source={require("../assets/images/pantry-cabinet-full.jpg")}
            style={{ position: "absolute", top: 0, left: 0, width: 224, height: 336 }}
            resizeMode="contain"
          />

          {/* top controls */}
          <View className="flex-row justify-between px-3 pt-3">
            {(["close", "flashlight-off"] as const).map((icon) => (
              <View
                key={icon}
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: glass }}
              >
                <MaterialCommunityIcons name={icon} size={16} color="#FFFFFF" />
              </View>
            ))}
          </View>

          {/* viewfinder corners */}
          <View className="flex-1 items-center justify-center">
            <View style={{ width: "74%", height: "78%" }}>
              {corner({ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 })}
              {corner({ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 })}
              {corner({ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 })}
              {corner({ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 })}
            </View>
          </View>

          {/* hint */}
          <View className="items-center pb-2">
            <View className="rounded-full px-3 py-1" style={{ backgroundColor: glass }}>
              <Text variant="micro" className="font-semibold text-white">
                2 of 6 · shoot big piles in sections
              </Text>
            </View>
          </View>

          {/* bottom bar: library · shutter · detect */}
          <View className="px-2.5 pb-3">
            <View
              className="flex-row items-center justify-between rounded-full px-2 py-1.5"
              style={{ backgroundColor: glass }}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: glass }}>
                <MaterialCommunityIcons name="image-multiple-outline" size={17} color="#FFFFFF" />
              </View>
              <View className="h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white">
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: COLORS.primaryLight }}
                >
                  <MaterialCommunityIcons name="camera" size={19} color="#FFFFFF" />
                </View>
              </View>
              <View className="h-9 flex-row items-center gap-1 rounded-full bg-white px-2.5">
                <MaterialCommunityIcons name="auto-fix" size={15} color={COLORS.primary} />
                <Text variant="micro" className="font-bold" style={{ color: COLORS.primary }}>
                  Detect 2
                </Text>
              </View>
            </View>
          </View>
        </View>
      }
      topRight={<Tag icon="camera-outline" label="2 photos" />}
      bottomLeft={<Tag icon="hand-heart-outline" label="Grocery rescue" />}
    />
  );
}

/**
 * Phase 1 — what a scan hands back: the items it read off one photo.
 *
 * It used to show the donation illustration with detection boxes on it, whose
 * teal, brown and green cans fought the warm palette. The result list says the
 * same thing — point the camera, get a list — in the app's own colours.
 */
export function ScanMock() {
  const found = [
    { category: "vegetable", name: "Canned corn", count: 12 },
    { category: "protein", name: "Tomato soup", count: 4 },
    { category: "vegetable", name: "Green beans", count: 6 },
    { category: "grain", name: "Rotini pasta", count: 3 },
  ];
  return (
    <Stage
      layout={{ tilt: "3.5deg", tr: { top: -62, right: 10, rotate: "-5deg" }, bl: { bottom: -60, left: 2, rotate: "4.5deg" } }}
      main={
        <Card style={MOCK_CARD} className="w-[312px] gap-3 p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-md bg-brand">
              <MaterialCommunityIcons name="camera" size={15} color={COLORS.textOnAccent} />
            </View>
            <Text variant="label" className="flex-1 font-bold">
              Found in your photo
            </Text>
            <Text variant="micro" tone="soft" className="font-semibold">
              {found.length} items
            </Text>
          </View>
          {found.map((f) => (
            <View key={f.name} className="flex-row items-center gap-3">
              <ItemThumb category={f.category} size="sm" />
              <Text variant="body" className="flex-1 font-semibold">
                {f.name}
              </Text>
              <Text variant="label" className="font-bold" style={{ color: COLORS.primary }}>
                ×{f.count}
              </Text>
            </View>
          ))}
          <Button label="Check these 4 items" size="compact" block onPress={noop} />
        </Card>
      }
      topRight={<Tag icon="camera-outline" label="1 photo" />}
      bottomLeft={<Tag icon="hand-heart-outline" label="Grocery rescue" />}
    />
  );
}

/** Phase 4 — what the shelf can make, and which category is holding it back. */
export function BoxesMock({ limitLabel = 'Not enough beans', stockLabel = 'Add 12 cans for 12 boxes' }: { limitLabel?: string; stockLabel?: string } = {}) {
  const rows = [
    { category: "grain", label: "Grain", have: 33, need: 24 },
    { category: "vegetable", label: "Vegetable", have: 40, need: 24 },
    { category: "protein", label: "Beans", have: 12, need: 24 },
  ];

  return (
    <Stage
      layout={{ tilt: "-3.5deg", tr: { top: -60, right: -4, rotate: "5deg" }, bl: { bottom: -58, left: 6, rotate: "-4.5deg" } }}
      main={
        <Card style={MOCK_CARD} className="w-[312px] gap-3 p-4">
          <View className="flex-row items-baseline gap-2">
            <Text variant="display" tone="brand">
              6
            </Text>
            <Text variant="body" tone="soft">
              of 12 boxes you can pack
            </Text>
          </View>
          {rows.map((r) => {
            const short = r.have < r.need;
            return (
              <View key={r.category} className="flex-row items-center gap-3">
                <CategoryIcon
                  category={r.category}
                  tone={short ? "critical" : "secondary"}
                />
                <View className="flex-1 gap-1">
                  <View className="flex-row justify-between">
                    <Text variant="label" className="font-semibold">
                      {r.label}
                    </Text>
                    <Text
                      variant="micro"
                      tone={short ? "critical" : "soft"}
                      className="font-semibold"
                    >
                      {r.have} / {r.need}
                    </Text>
                  </View>
                  <ProgressBar
                    progress={Math.min(1, r.have / r.need)}
                    color={short ? COLORS.statusCritical : COLORS.primaryLight}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      }
      topRight={
        <Tag
          icon="alert-circle-outline"
          label={limitLabel}
          tone="critical"
        />
      }
      bottomLeft={
        <Tag icon="bullhorn-outline" label={stockLabel} />
      }
    />
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
});
