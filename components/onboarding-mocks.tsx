import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { ProgressBar } from "./motion";
import {
  Button,
  Card,
  CategoryIcon,
  Chip,
  ItemThumb,
  Stepper,
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
const MOCK_SHADOW = {
  shadowColor: COLORS.shadow,
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
};
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
  useEffect(() => {
    enter.value = withDelay(
      delay,
      withTiming(1, { duration: 620, easing: EASE }),
    );
  }, [delay, enter]);

  const animated = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
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
function Stage({
  main,
  topRight,
  bottomLeft,
}: {
  main: React.ReactNode;
  topRight: React.ReactNode;
  bottomLeft: React.ReactNode;
}) {
  return (
    <View style={styles.stage} pointerEvents="none">
      <View>
        <Float rotate="-2deg">{main}</Float>
        <Float rotate="3deg" delay={480} style={styles.topRight}>
          {topRight}
        </Float>
        <Float rotate="-3deg" delay={700} style={styles.bottomLeft}>
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
    <Card style={MOCK_SHADOW} className="flex-row items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5">
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
      main={
        <Card style={MOCK_SHADOW} className="w-[312px] gap-3 p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-md bg-brand">
              <MaterialCommunityIcons name="camera" size={15} color={COLORS.textOnPrimary} />
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

/** Phase 2 — one line of the review list, the way a volunteer checks it. */
export function VerifyMock() {
  return (
    <Stage
      main={
        <Card style={MOCK_SHADOW} className="w-[312px] gap-3 p-4">
          <View className="flex-row items-center gap-3">
            <ItemThumb category="vegetable" />
            <View className="flex-1">
              <Text variant="body" className="font-semibold">
                Green beans 14.5 oz
              </Text>
              <Text variant="micro" tone="soft">
                Expires Oct 28, 2026
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <Chip label="Vegetable" selected onPress={noop} />
            <Chip label="Protein" onPress={noop} />
          </View>
          <View className="flex-row items-center justify-between">
            <Text variant="label" tone="soft">
              Count
            </Text>
            <Stepper value={6} onChange={noop} />
          </View>
        </Card>
      }
      topRight={
        <Tag icon="clock-alert-outline" label="Use first" tone="warn" />
      }
      bottomLeft={
        <Tag
          icon="alert-circle-outline"
          label="Dented · held back"
          tone="critical"
        />
      }
    />
  );
}

/** Phase 3 — bulk intake: the weight is recorded, the units are estimated from it. */
export function WeighMock() {
  return (
    <Stage
      main={
        <Card style={MOCK_SHADOW} className="w-[312px] gap-3 p-4">
          <Text variant="label" tone="soft" className="font-semibold">
            Weight at the scale
          </Text>
          <View className="flex-row items-baseline gap-2">
            <Text variant="display">60</Text>
            <Text variant="title" tone="soft">
              lb
            </Text>
          </View>
          <View className="h-px bg-hairline" />
          <View className="flex-row items-center justify-between">
            <View>
              <Text variant="label" className="font-semibold">
                Estimated units
              </Text>
              <Text variant="micro" tone="soft">
                1 lb per protein unit
              </Text>
            </View>
            <Stepper value={60} onChange={noop} />
          </View>
        </Card>
      }
      topRight={<Tag icon="food-drumstick" label="Protein bin" />}
      bottomLeft={<Tag icon="truck-outline" label="Food bank drop" />}
    />
  );
}

/** Phase 4 — what the shelf can make, and which category is holding it back. */
export function BoxesMock() {
  const rows = [
    { category: "grain", label: "Grain", have: 33, need: 24 },
    { category: "vegetable", label: "Vegetable", have: 40, need: 24 },
    { category: "protein", label: "Protein", have: 13, need: 24 },
  ];

  return (
    <Stage
      main={
        <Card style={MOCK_SHADOW} className="w-[312px] gap-3 p-4">
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
          label="Protein is the limit"
          tone="critical"
        />
      }
      bottomLeft={
        <Tag icon="bullhorn-outline" label="Ask donors for protein" />
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
  topRight: { position: "absolute", top: -46, right: -8 },
  bottomLeft: { position: "absolute", bottom: -46, left: -8 },
});
