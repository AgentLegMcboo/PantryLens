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
  PackedBoxMock,
  PhotoInventoryMock,
  InventoryMock,
} from "../components/onboarding-mocks";
import { Button, Text } from "../components/ui";
import { COLORS, fw } from "../constants/theme";
import { cueSuccess, cueTap } from "../lib/feedback";
import { usePantryStore } from "../lib/store";

// One outcome per slide. Illustrations are explanatory, not working controls.
const PHASES = [
  {
    key: "camera",
    Mock: PhotoInventoryMock,
    title: "Turn photos into inventory.",
    body: "Photograph a donation pile or a whole shelf. PantryLens identifies the items—just check the names and counts before saving.",
    imageDescription: "A pantry photo with detected food items. Review the names and counts before saving to inventory.",
  },
  {
    key: "inventory",
    Mock: InventoryMock,
    title: "Know what’s on your shelves.",
    body: "See what you have and how much is left. Set your use-first window to spot food close to its date and use it in time.",
    imageDescription: "Inventory example: 12 cans of beans, 24 bags of rice, and 18 cans of vegetables. Use beans first: 5 days left.",
  },
  {
    key: "boxes",
    Mock: PackedBoxMock,
    title: "Build balanced boxes.",
    body: "Plan a balanced mix of food from your current stock. See how many boxes you can pack and which foods you need more of.",
    imageDescription: "An open pantry box with beans, rice, vegetables, and breakfast food. Example: 6 boxes ready to pack. Short on beans.",
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
          <View className="flex-row items-center gap-3">
            <BrandMark />
            <AppearanceControl compact />
          </View>

          <View style={{ width: 60 }}>
          {!isLast && (
            <Pressable
              onPress={skip}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Skip introduction"
              className="h-12 items-center justify-center px-3"
            >
              <Text variant="micro" tone="soft" className="font-semibold">
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
          onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
          className="flex-1"
        >
          {PHASES.map((phase) => {
            const Mock = phase.Mock;
            // Use the space left by the actual text, not a fixed picture size.
            // On compact screens or with larger text, the page can still scroll.
            const copyHeight = copyHeights[phase.key] ?? 220;
            const imageHeight = Math.min(470, Math.max(240, viewportHeight - copyHeight - 36));
            const imageScale = Math.min(1.05, (width - 24) / 430, imageHeight / 410);
            return (
              <ScrollView
                key={phase.key}
                style={{ width }}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  paddingHorizontal: 24,
                  paddingTop: 12,
                  paddingBottom: 16,
                }}
                showsVerticalScrollIndicator={false}
              >
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={phase.imageDescription}
                  style={{
                    height: imageHeight,
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
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
                    <Mock />
                  </View>
                </View>

                <View style={{ gap: 12 }} onLayout={event => {
                  const measuredHeight = event.nativeEvent.layout.height;
                  setCopyHeights(previous => Math.abs((previous[phase.key] ?? 0) - measuredHeight) < 1
                    ? previous : { ...previous, [phase.key]: measuredHeight });
                }}>
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

        <View className="gap-6 px-gutter pb-2">
          <View
            className="flex-row items-center justify-center gap-1.5"
            accessible
            accessibilityLabel={`Page ${page + 1} of ${PHASES.length}`}
          >
            {PHASES.map((p, i) => (
              <Dot key={p.key} active={i === page} />
            ))}
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
    opacity: 0.4 + progress.value * 0.6,
  }));

  return (
    <Animated.View
      style={[
        { height: 7, borderRadius: 4, backgroundColor: COLORS.primaryDark },
        style,
      ]}
    />
  );
}
