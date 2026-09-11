import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../constants/theme";
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

export default function DashboardScreen() {
  const router = useRouter();
  const { inventory, settings, activities, thresholds } = usePantryStore();

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
      {/* THE HERO IS THE CAMERA.
          It used to be a repeat of Build's headline figure — the same "balanced
          boxes ready now" number, on the screen right next to the tab that
          exists to compute it. Two screens saying the same thing means one of
          them is wasting the best space it has, and the dashboard was the one
          with something better to put there.

          Photographing a donation is what this app is FOR, and it was a card
          you had to scroll past the answer to reach. It is the answer now. */}
      <FadeInUp index={0}>
        <Pressable
          onPress={() => {
            cuePress();
            router.push("/log-donation");
          }}
          style={({ pressed }) => ({
            // The same lip the buttons carry, so the hero reads as part of the
            // same physical family — and as something you press, which the old
            // one was not.
            borderBottomWidth: pressed ? 3 : 7,
            borderBottomColor: COLORS.primaryDeep,
            transform: [{ translateY: pressed ? 4 : 0 }],
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.2,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 5 },
            elevation: 5,
          })}
          className="overflow-hidden rounded-lg"
        >
          {/* A real donation box behind the words. A photograph of the actual
              thing says what this app is for before a word is read. */}
          <Image
            source={require("../../assets/images/donation-scan.jpg")}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {/* Dense where the type sits, thinning toward the top-right so the box
              stays visible. White text over a photograph needs this everywhere,
              not just behind the words. */}
          <LinearGradient
            colors={[
              "rgba(156,66,38,0.97)",
              "rgba(156,66,38,0.88)",
              "rgba(156,66,38,0.45)",
            ]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          <View className="p-card pb-5 pt-6">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
              <MaterialCommunityIcons
                name="camera-outline"
                size={26}
                color={COLORS.textOnPrimary}
              />
            </View>

            <Text variant="headline" className="mt-4 text-ink-on">
              Photograph a donation
            </Text>
            <Text variant="body" className="mt-1.5 max-w-[85%] text-ink-on/75">
              Point, shoot, and every label is read for you.
            </Text>

            <View className="my-4 h-px bg-white/20" />

            <View className="flex-row items-center justify-between gap-3">
              <Text variant="label" className="flex-1 text-ink-on/85">
                Nothing is saved until you check it
              </Text>
              <View className="flex-row items-center gap-1 rounded-full bg-white/15 px-4 py-2">
                <Text variant="label" className="font-bold text-ink-on">
                  Start
                </Text>
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={15}
                  color={COLORS.textOnPrimary}
                />
              </View>
            </View>
          </View>
        </Pressable>
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

      {/* The other two intakes stay quiet beneath it. */}
      <FadeInUp index={2}>
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

      {/* Activity is a log, not a card. Rows on the page, no container.

          With nothing in it, a heading plus a sentence plus the section's own
          rhythm reserved most of a screen to say "nothing happened yet" — so an
          empty log collapses to the one line, no heading above it. */}
      <FadeInUp index={4}>
        {activities.length === 0 ? (
          <Text variant="micro" tone="soft" className="px-1">
            Nothing logged yet. Scanning a donation will show up here.
          </Text>
        ) : (
          <View className="gap-4">
            <Text variant="label" tone="soft" className="font-semibold">
              Recent activity
            </Text>

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
          </View>
        )}
      </FadeInUp>
    </Screen>
  );
}
