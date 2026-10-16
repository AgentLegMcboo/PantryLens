import { useAppAppearance } from "../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthBackdrop } from "../components/auth-layout";
import { BrandMark } from "../components/brand-mark";
import { AppearanceControl } from "../components/appearance-control";
import {
  BoxesMock,
  CameraMock,
  ScanMock,
} from "../components/onboarding-mocks";
import { Button, Text } from "../components/ui";
import { COLORS, fw } from "../constants/theme";
import { cueSuccess, cueTap } from "../lib/feedback";
import { usePantryStore } from "../lib/store";

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
    key: "camera",
    Mock: CameraMock,
    lead: "Step 1 · Take photos",
    title: "A donation pile or a whole shelf.",
    body: "Photograph a donation pile or a shelf. We’ll guide you through each step to make inventory simple and stress-free.",
    tint: "#F6ECE2",
  },
  {
    key: "scan",
    Mock: ScanMock,
    lead: "Step 2 · Review your items",
    title: "Your photos → An item spreadsheet.",
    body: "PantryLens turns your photos into an item spreadsheet automatically. Check the names and quantities—no need to type every item by hand.",
    tint: "#F7EBDF",
  },
  {
    key: "boxes",
    Mock: BoxesMock,
    lead: "Pack with confidence",
    title: "Build balanced boxes.",
    body: "Set limits for food close to expiry. Plan boxes with a balanced mix from your current inventory, and see exactly what’s missing.",
    tint: "#F7E9E4",
  },
] as const;

export default function OnboardingScreen() {
  useAppAppearance((state) => state.scheme);
  const { width, height } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(height * 0.7);
  const [copyHeights, setCopyHeights] = useState<Record<string, number>>({});
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const completeOnboarding = usePantryStore(
    (state) => state.completeOnboarding,
  );
  // Signed in only when the intro is replayed in development.
  const signedIn = usePantryStore((state) => !!state.session);
  const [page, setPage] = useState(0);

  const isLast = page === PHASES.length - 1;

  const finish = async () => {
    cueSuccess();
    // Must land before the navigation, or the root gate still sees the intro
    // as incomplete and sends us straight back here.
    await completeOnboarding();
    router.replace(signedIn ? "/(tabs)" : "/login");
  };

  const next = () => {
    if (isLast) return finish();
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  const skip = async () => {
    cueTap();
    await completeOnboarding();
    router.replace(signedIn ? "/(tabs)" : "/login");
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(e.nativeEvent.contentOffset.x / width);
    if (nextPage !== page) {
      setPage(nextPage);
      cueTap();
    }
  };

  return (
    <View className="flex-1 bg-transparent">
      {/* The pantry photo sits far back — enough to feel like a place, not
          enough to compete with the mocks in front of it. */}
      <AuthBackdrop blurRadius={3} />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between px-gutter pt-2">
          <BrandMark />
          <AppearanceControl />

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

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
          className="flex-1"
        >
          {PHASES.map((phase) => {
            const Mock = phase.Mock;
            // Use the space left by the actual text, not a fixed picture size.
            // On compact screens or with larger text, the page can still scroll.
            const copyHeight = copyHeights[phase.key] ?? 220;
            const imageHeight = Math.min(360, Math.max(200, viewportHeight - copyHeight - 64));
            const imageScale = Math.min(0.8, (width - 56) / 430, imageHeight / 450);
            return (
              <ScrollView
                key={phase.key}
                style={{ width }}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  paddingHorizontal: 24,
                  paddingTop: 20,
                  paddingBottom: 20,
                }}
                showsVerticalScrollIndicator={false}
              >
                <View
                  accessible
                  accessibilityLabel={
                    phase.key === "boxes"
                      ? "Example: not enough beans. Add 12 cans to pack all 12 boxes."
                      : undefined
                  }
                  style={{
                    height: imageHeight,
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                  }}
                >
                  <View
                    style={{
                      width: 430,
                      height: 430,
                      flexShrink: 0,
                      transform: [{ scale: imageScale }],
                    }}
                  >
                    {phase.key === "boxes" ? (
                      <BoxesMock
                        limitLabel="Not enough beans"
                        stockLabel="Add 12 cans for 12 boxes"
                      />
                    ) : (
                      <Mock />
                    )}
                  </View>
                </View>

                <View style={{ gap: 12 }} onLayout={event => {
                  const measuredHeight = event.nativeEvent.layout.height;
                  setCopyHeights(previous => Math.abs((previous[phase.key] ?? 0) - measuredHeight) < 1
                    ? previous : { ...previous, [phase.key]: measuredHeight });
                }}>
                  <Text
                    variant="label"
                    tone="brand"
                    style={{ fontWeight: "600" }}
                  >
                    {phase.lead}
                  </Text>
                  <Text
                    variant="display"
                    style={{
                      fontSize: 28,
                      lineHeight: 34,
                      fontWeight: fw("700"),
                      letterSpacing: -0.5,
                      color: COLORS.textPrimary,
                    }}
                  >
                    {phase.title}
                  </Text>
                  <Text
                    variant="body"
                    tone="soft"
                    style={{ fontSize: 16, lineHeight: 24 }}
                  >
                    {phase.body}
                  </Text>
                </View>
              </ScrollView>
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
            <Text variant="micro" tone="soft">
              {page + 1} of {PHASES.length}
            </Text>
          </View>

          <Button
            label={isLast ? "Get started" : "Next"}
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
        </View>
      </SafeAreaView>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);
  const reduceMotion = useReducedMotion();

  // Written in an effect, not during render — Reanimated warns about the latter.
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 280,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      reduceMotion: ReduceMotion.Never,
    });
  }, [active, progress]);

  // With reduced motion the dot doesn't stretch; it takes its size at once and
  // only the brightness fades.
  const style = useAnimatedStyle(() => ({
    width: reduceMotion ? (active ? 26 : 7) : 7 + progress.value * 19,
    opacity: 0.3 + progress.value * 0.7,
  }));

  return (
    <Animated.View
      style={[
        { height: 7, borderRadius: 4, backgroundColor: COLORS.primaryLight },
        style,
      ]}
    />
  );
}
