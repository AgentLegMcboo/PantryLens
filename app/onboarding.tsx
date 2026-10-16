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
import { ConfirmDemo, PackDemo, SnapDemo } from "../components/onboarding-demos";
import { Button, Text } from "../components/ui";
import { COLORS, fw } from "../constants/theme";
import { cueSuccess, cueTap } from "../lib/feedback";
import { usePantryStore } from "../lib/store";

// One outcome per slide. Illustrations are explanatory, not working controls.
// One moment of the app per slide, and each one can be tried, not just read:
// snap a shelf, confirm what was found, see how many boxes that packs.
const PHASES = [
  {
    key: "snap",
    Demo: SnapDemo,
    title: "Take a picture",
    body: "PantryLens finds the food in it for you.",
    demoDescription: "Try it: tap the shutter to take a picture of a pantry shelf.",
  },
  {
    key: "confirm",
    Demo: ConfirmDemo,
    title: "Confirm each item",
    body: "Check it's right, then save it to your inventory.",
    demoDescription: "Try it: tap Confirm for each item, then Save.",
  },
  {
    key: "pack",
    Demo: PackDemo,
    title: "Pack boxes for families",
    body: "Pick a family size. See how many boxes you can make.",
    demoDescription: "Try it: pick a family size to see how many boxes you can pack.",
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

  const pageRef = useRef(0);
  pageRef.current = page;
  const goTo = (target: number) => {
    scrollRef.current?.scrollTo({ x: target * width, animated: true });
    setPage(target);
  };
  // A demo finished by hand: move on by itself, unless they already swiped.
  const advanceFrom = (from: number) => {
    if (from !== pageRef.current || from >= PHASES.length - 1) return;
    goTo(from + 1);
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

          <View className="flex-row items-center gap-1">
          <AppearanceControl compact />
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
          {PHASES.map((phase, index) => {
            const Demo = phase.Demo;
            // Use the space left by the actual text, not a fixed picture size.
            // On compact screens or with larger text, the page can still scroll.
            const copyHeight = copyHeights[phase.key] ?? 220;
            const demoHeight = Math.min(620, Math.max(340, viewportHeight - copyHeight - 40));
            const demoWidth = Math.min(width - 40, 460);
            return (
              <ScrollView
                key={phase.key}
                style={{ width }}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                  paddingHorizontal: 20,
                  paddingTop: 12,
                  paddingBottom: 16,
                }}
                showsVerticalScrollIndicator={false}
              >
                <View
                  accessibilityLabel={phase.demoDescription}
                  style={{
                    height: demoHeight,
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <Demo
                    active={index === page}
                    w={demoWidth}
                    h={demoHeight}
                    onDone={() => advanceFrom(index)}
                  />
                </View>

                <View style={{ gap: 12 }} onLayout={event => {
                  const measuredHeight = event.nativeEvent.layout.height;
                  setCopyHeights(previous => Math.abs((previous[phase.key] ?? 0) - measuredHeight) < 1
                    ? previous : { ...previous, [phase.key]: measuredHeight });
                }}>
                  <Text
                    variant="display"
                    style={{
                      fontSize: 34,
                      lineHeight: 40,
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
                    style={{ fontSize: 19, lineHeight: 27 }}
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
            className="flex-row items-center gap-1.5"
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
