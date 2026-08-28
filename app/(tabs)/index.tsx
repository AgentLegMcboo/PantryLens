import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { AnimatedCounter, FadeInUp } from "../../components/motion";
import { Badge, Button, Panel, Screen, Text } from "../../components/ui";
import { InventoryItem, usePantryStore } from "../../lib/store";
import { cuePress } from "../../lib/feedback";

/**
 * The dashboard.
 *
 * Rebuilt for calm. Previously an alert banner, three metric tiles, three action
 * buttons, a low-stock card and an activity list all fought above the fold, in
 * four competing accent colours and nine font sizes.
 *
 * The rule now: one headline answer, one primary action, everything else
 * subordinate. A volunteer walking in wants to know "how many boxes can we make
 * and what's stopping us" — that is the top card, and nothing else gets to be
 * red.
 */

/**
 * Activity rows store an ISO timestamp, which was being rendered raw —
 * "2026-08-05T14:22:09.481Z" under every line. What a volunteer wants from this
 * column is how long ago, not to the millisecond.
 */
function formatActivityTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** The dashboard's headline figure, and what Build Boxes opens on. */
const DASHBOARD_TARGET_BOXES = 12;

export default function DashboardScreen() {
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings, activities, thresholds } =
    usePantryStore();

  const plan = computeAllocation(
    inventory,
    boxRules,
    DASHBOARD_TARGET_BOXES,
    settings.defaultFamilySize,
    bulkLots,
  );
  const isShort = plan.shortfallPerCategory[plan.limitingCategory] > 0;

  const warningLimit = new Date();
  warningLimit.setDate(new Date().getDate() + settings.expirationWarningDays);

  const expiringCount = inventory
    .filter(
      (i: InventoryItem) =>
        !!i.expiration && new Date(i.expiration) <= warningLimit,
    )
    .reduce((sum: number, item: InventoryItem) => sum + item.count, 0);

  const totalStockCount = inventory.reduce(
    (sum: number, i: InventoryItem) => sum + i.count,
    0,
  );

  const lowCategories = Object.keys(thresholds).filter((cat: string) => {
    const total = inventory
      .filter((i: InventoryItem) => i.category === cat)
      .reduce((sum: number, i: InventoryItem) => sum + i.count, 0);
    return total < (thresholds as any)[cat];
  });

  return (
    <Screen>
      {/* The hero is the brand colour, not another white card.
          A screen made entirely of pale rectangles on a pale ground has no
          anchor and no shape — this is what your eye lands on first, and it
          carries the one number the whole app exists to produce. */}
      <FadeInUp index={0}>
        <View
          className="overflow-hidden rounded-lg"
          style={{
            // The same lip the buttons carry, so the hero reads as part of the
            // same physical family rather than as a flat coloured rectangle.
            borderBottomWidth: 6,
            borderBottomColor: COLORS.primaryDeep,
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 5 },
            elevation: 4,
          }}
        >
          {/* A real pantry behind the number. The flat brand block fixed
              "everything is a white rectangle" but was still a rectangle; a
              photograph of the actual thing says what this app is for before a
              word is read.

              Photo: Unsplash (unsplash.com/license — free to use, no
              attribution required). Cropped to 2.4:1 and recompressed so the
              bundle carries ~100KB rather than the ~260KB original. */}
          <Image
            source={require("../../assets/images/pantry-banner.jpg")}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Scrim: dense where the type sits, thinning toward the top-right so
              the shelves stay visible. White text over a busy illustration needs
              this everywhere, not just behind the words. */}
          <LinearGradient
            colors={[
              "rgba(156,66,38,0.98)",
              "rgba(156,66,38,0.90)",
              "rgba(156,66,38,0.60)",
            ]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          <View className="p-card">
            <Text variant="label" className="text-ink-on/70">
              Balanced boxes ready now
            </Text>

            <View className="mt-1 flex-row items-baseline gap-3">
              <AnimatedCounter
                value={plan.achievableBoxes}
                style={{
                  fontSize: 60,
                  fontWeight: "800",
                  color: COLORS.textOnPrimary,
                  letterSpacing: -2,
                }}
              />
              <Text variant="body" className="text-ink-on/70">
                family of {settings.defaultFamilySize}
              </Text>
            </View>

            {/* Hairline in the brand block, not on the page. */}
            <View className="my-4 h-px bg-white/20" />

            <View className="flex-row items-center justify-between gap-3">
              <Text variant="label" className="flex-1 text-ink-on/85">
                {isShort ? (
                  <>
                    <Text
                      variant="label"
                      className="font-bold capitalize text-ink-on"
                    >
                      {plan.limitingCategory}
                    </Text>{" "}
                    short by {plan.shortfallPerCategory[plan.limitingCategory]}
                  </>
                ) : (
                  "Every category has enough"
                )}
              </Text>

              <Pressable
                onPress={() => router.push("/(tabs)/build")}
                className="flex-row items-center gap-1 rounded-full bg-white/15 px-4 py-2"
              >
                <Text variant="label" className="font-semibold text-ink-on">
                  Build
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={14}
                  color={COLORS.textOnPrimary}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </FadeInUp>

      {/* Two figures sitting directly on the canvas. Wrapping every number in
          its own bordered card is what made the screen feel like a filing
          cabinet; a divider is enough to separate two of them. */}
      <FadeInUp index={1}>
        <View className="flex-row items-center px-1">
          <View className="flex-1">
            <AnimatedCounter
              value={totalStockCount}
              style={{
                fontSize: 28,
                fontWeight: "700",
                color: COLORS.textPrimary,
              }}
            />
            <Text variant="micro" tone="soft" className="mt-0.5">
              items · {inventory.length} products
            </Text>
          </View>

          <View className="h-9 w-px bg-hairline" />

          <Pressable
            className="flex-1 pl-5"
            onPress={() => router.push("/expiring-soon")}
          >
            <View className="flex-row items-center gap-1.5">
              <AnimatedCounter
                value={expiringCount}
                style={{
                  fontSize: 28,
                  fontWeight: "700",
                  color: COLORS.statusWarning,
                }}
              />
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={COLORS.textSecondary}
              />
            </View>
            <Text variant="micro" tone="soft" className="mt-0.5">
              use within {settings.expirationWarningDays} days
            </Text>
          </Pressable>
        </View>
      </FadeInUp>

      {/* The app's whole reason for existing, given the weight to match.
          As one of three identical buttons it read as a peer of "Weigh bulk";
          as a picture of a donation box with a camera on it, it reads as the
          thing you came here to do. */}
      <FadeInUp index={2}>
        <Pressable
          onPress={() => {
            cuePress();
            router.push("/log-donation");
          }}
          style={({ pressed }) => ({
            borderBottomWidth: pressed ? 2 : 7,
            borderBottomColor: COLORS.primaryDeep,
            transform: [{ translateY: pressed ? 5 : 0 }],
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 5 },
            elevation: 5,
            borderRadius: 16,
          })}
          className="flex-row items-center overflow-hidden rounded-lg bg-brand"
        >
          <View className="flex-1 py-5 pl-5 pr-3">
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <MaterialCommunityIcons
                  name="camera-outline"
                  size={18}
                  color={COLORS.textOnPrimary}
                />
              </View>
              <Text variant="heading" className="font-bold text-ink-on">
                Photograph a donation
              </Text>
            </View>
            <Text variant="label" className="mt-2 text-ink-on/75">
              Point, shoot, and every label is read for you.
            </Text>
          </View>

          {/* The donation box, fading in from the right rather than sitting in
              a hard-edged panel — the gradient is what keeps it part of the
              button instead of a picture glued to one. */}
          <View className="h-full w-28">
            <Image
              source={require("../../assets/images/donation-scan.jpg")}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(156,66,38,1)", "rgba(156,66,38,0.35)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </Pressable>
      </FadeInUp>

      {/* The other two intakes stay quiet beside it. */}
      <FadeInUp index={3}>
        <View className="flex-row gap-2">
          <Button
            label="Weigh bulk"
            variant="secondary"
            size="compact"
            onPress={() => router.push("/bulk-intake")}
          />
          <Button
            label="Audit a shelf"
            variant="secondary"
            size="compact"
            onPress={() => router.push("/shelf-audit")}
          />
        </View>
      </FadeInUp>

      {lowCategories.length > 0 && (
        <FadeInUp index={3}>
          <Panel>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons
                name="trending-down"
                size={16}
                color={COLORS.statusCritical}
              />
              <Text variant="label" className="font-semibold">
                Running low
              </Text>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {lowCategories.map((cat: string) => (
                <Badge key={cat} label={cat} tone="critical" />
              ))}
            </View>
            <Button
              label="Write a donation request"
              variant="ghost"
              size="compact"
              className="mt-3"
              onPress={() => router.push("/(tabs)/needs")}
            />
          </Panel>
        </FadeInUp>
      )}

      {/* Activity is a log, not a card. Rows on the page, no container. */}
      <FadeInUp index={4}>
        <View className="gap-4">
          <Text variant="label" tone="soft" className="font-semibold">
            Recent activity
          </Text>

          {activities.length === 0 ? (
            <Text variant="label" tone="soft">
              Nothing logged yet. Scanning a donation will show up here.
            </Text>
          ) : (
            <View className="gap-4">
              {activities.slice(0, 5).map((act: any) => (
                <View key={act.id} className="flex-row items-start gap-3">
                  <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-subtle">
                    <MaterialCommunityIcons
                      name={act.icon as any}
                      size={16}
                      color={COLORS.primaryLight}
                    />
                  </View>
                  <View className="flex-1">
                    <Text variant="label">{act.text}</Text>
                    <Text variant="micro" tone="soft" className="mt-0.5">
                      {formatActivityTime(act.time)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </FadeInUp>
    </Screen>
  );
}
