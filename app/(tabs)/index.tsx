import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../constants/theme";
import Animated from "react-native-reanimated";
import { AnimatedCounter, FadeInUp, ProgressBar, usePressScale } from "../../components/motion";
import { Button, Card, CategoryIcon, Screen, Text } from "../../components/ui";
import { buildStockUnits } from "../../lib/allocation";
import { isExpiringSoon } from "../../lib/expiry";
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
  const { inventory, bulkLots, settings, activities, thresholds, readyBoxes } =
    usePantryStore();
  const readyCount = readyBoxes.reduce((sum, r) => sum + (r.boxes - r.boxes_collected), 0);

  // Was comparing a Date parsed from "2026-09-20" — which is UTC midnight —
  // against a local Date, so the count was wrong by a day for part of every
  // day. Plain date strings compare exactly. See lib/expiry.ts.
  const expiringCount = inventory
    .filter((i: InventoryItem) => isExpiringSoon(i.expiration, settings.expirationWarningDays))
    .reduce((sum: number, item: InventoryItem) => sum + item.count, 0);

  const totalStockCount = inventory.reduce(
    (sum: number, i: InventoryItem) => sum + i.count,
    0,
  );

  /**
   * Low-stock is measured against what can actually be given out.
   *
   * It counted everything on the shelf, so twenty out-of-date tins of protein
   * held the alert off while the pantry had nothing to pack — and weighed bulk
   * lots counted for nothing, so a 60 lb protein drop left the category
   * reading as empty. The same pool box building draws from answers both.
   */
  const givable = buildStockUnits(inventory, bulkLots);
  const lowCategories = Object.keys(thresholds).filter((cat: string) => {
    const total = givable
      .filter((i: InventoryItem) => i.category === cat)
      .reduce((sum: number, i: InventoryItem) => sum + i.count, 0);
    return total < (thresholds as any)[cat];
  });

  // How far under its line each low category is, worst first. The bars below
  // are drawn from this, so "running low" says how low rather than only which.
  const shortages = lowCategories
    .map((cat: string) => {
      const have = givable
        .filter((i: InventoryItem) => i.category === cat)
        .reduce((sum: number, i: InventoryItem) => sum + i.count, 0);
      const need = (thresholds as any)[cat] as number;
      return { cat, have, need, ratio: need > 0 ? have / need : 0 };
    })
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 4);

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
          className="overflow-hidden rounded-lg bg-[#9C4226]"
        >
          {/* The donation box, in full colour, as a band across the top.

              It used to sit behind the words under a gradient dense enough to
              read white type through, which buried the one bright thing on the
              screen — you could tell there was a picture, not what it was. A
              band of its own shows the cans and boxes as they are, and fades
              into the brand colour where the type begins. */}
          <View style={{ height: 128, overflow: "hidden" }}>
            <Image
              source={require("../../assets/images/donation-scan.jpg")}
              style={{ width: "100%", height: 400, marginTop: -92 }}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(156,66,38,0)", "rgba(156,66,38,0.55)", "#9C4226"]}
              locations={[0, 0.6, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View className="absolute left-4 top-4 h-11 w-11 items-center justify-center rounded-full bg-white/95">
              <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.primaryLight} />
            </View>
          </View>

          <View className="px-card pb-5 pt-1">
            <Text variant="headline" className="text-ink-on">
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

      {/* Two tiles, side by side, each one a number with a name.

          The figures used to sit bare on the page with a hairline between them,
          which left the middle of the screen reading as loose text. Giving each
          its own surface makes them look like what they are — the two numbers
          you check first — and the second is tinted by what it means. */}
      <FadeInUp index={1}>
        <View className="flex-row gap-3">
          <View className="flex-1">
          <Card className="flex-1 gap-3 p-4">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <MaterialCommunityIcons name="warehouse" size={19} color={COLORS.primaryLight} />
            </View>
            <View>
              <AnimatedCounter
                value={totalStockCount}
                style={{ fontSize: 30, fontWeight: "700", color: COLORS.textPrimary }}
              />
              {/* Says what it counts. Packing takes stock out of inventory, so a
                  pantry that has just boxed half its food sees this number drop,
                  and "items" alone read as though that food had vanished. */}
              <Text variant="label" className="mt-0.5 font-semibold">
                items on the shelf
              </Text>
              <Text variant="micro" tone="soft" className="mt-0.5">
                {inventory.length} products
              </Text>
            </View>
          </Card>
          </View>

          <Pressable
            className="flex-1"
            onPress={() => router.push("/expiring-soon")}
            accessibilityRole="button"
            accessibilityLabel={`${expiringCount} units to use within ${settings.expirationWarningDays} days`}
          >
            <Card
              className="flex-1 gap-3 p-4"
              style={
                expiringCount > 0
                  ? {
                      backgroundColor: "#FFF7EA",
                      borderColor: "rgba(227,154,59,0.45)",
                    }
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between">
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    backgroundColor:
                      expiringCount > 0 ? "rgba(227,154,59,0.18)" : "rgba(91,140,81,0.14)",
                  }}
                >
                  <MaterialCommunityIcons
                    name={expiringCount > 0 ? "timer-sand" : "check-bold"}
                    size={19}
                    color={expiringCount > 0 ? COLORS.statusWarning : COLORS.statusGood}
                  />
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={COLORS.textSecondary}
                />
              </View>
              <View>
                <AnimatedCounter
                  value={expiringCount}
                  style={{
                    fontSize: 30,
                    fontWeight: "700",
                    color: expiringCount > 0 ? COLORS.statusWarning : COLORS.statusGood,
                  }}
                />
                <Text variant="label" className="mt-0.5 font-semibold">
                  {expiringCount > 0 ? "to use first" : "nothing expiring"}
                </Text>
                <Text variant="micro" tone="soft" className="mt-0.5">
                  within {settings.expirationWarningDays} days
                </Text>
              </View>
            </Card>
          </Pressable>
        </View>

        {/* The other half of "not counting packed boxes": where they went. */}
        {readyCount > 0 && (
          <Pressable
            onPress={() => router.push("/ready-boxes")}
            accessibilityRole="button"
            className="mt-3 flex-row items-center gap-3 rounded-md border-[1.5px] border-hairline bg-subtle px-4 py-3"
          >
            <MaterialCommunityIcons
              name="package-variant-closed"
              size={20}
              color={COLORS.primaryLight}
            />
            <Text variant="label" className="flex-1 font-semibold">
              {readyCount} {readyCount === 1 ? "box" : "boxes"} packed and ready to go
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.textSecondary} />
          </Pressable>
        )}
      </FadeInUp>

      {/* The other two intakes, as tiles with a word of explanation each —
          two small outlined pills said nothing about what either one does. */}
      <FadeInUp index={2}>
        <View className="flex-row gap-3">
          <ActionTile
            icon="scale"
            title="Weigh bulk"
            hint="Log a big drop by the pound"
            onPress={() => router.push("/bulk-intake")}
          />
          <ActionTile
            icon="clipboard-check-outline"
            title="Audit a shelf"
            hint="Recount one shelf"
            onPress={() => router.push("/shelf-audit")}
          />
        </View>
      </FadeInUp>

      {shortages.length > 0 && (
        <FadeInUp index={3}>
          <Card className="gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons
                  name="trending-down"
                  size={18}
                  color={COLORS.statusCritical}
                />
                <Text variant="heading">Running low</Text>
              </View>
              <Text variant="micro" tone="soft" className="font-semibold">
                have · need
              </Text>
            </View>

            <View className="gap-4">
              {shortages.map(({ cat, have, need, ratio }) => (
                <View key={cat} className="flex-row items-center gap-3">
                  <CategoryIcon category={cat} tone="critical" />
                  <View className="flex-1 gap-1.5">
                    <View className="flex-row items-baseline justify-between">
                      <Text variant="label" className="font-semibold capitalize">
                        {cat}
                      </Text>
                      <Text variant="micro" tone="soft" className="font-semibold">
                        {have} / {need}
                      </Text>
                    </View>
                    <ProgressBar
                      progress={ratio}
                      color={ratio < 0.34 ? COLORS.statusCritical : COLORS.statusWarning}
                      height={7}
                    />
                  </View>
                </View>
              ))}
            </View>

            <Button
              label="Write a donation request"
              variant="secondary"
              size="compact"
              block
              onPress={() => router.push("/(tabs)/needs")}
            />
          </Card>
        </FadeInUp>
      )}

      {/* Activity is a log. One card, rows divided inside it.

          With nothing in it, a heading plus a card would reserve a screen to say
          "nothing happened yet" — so an empty log is one friendly line instead. */}
      <FadeInUp index={4}>
        {activities.length === 0 ? (
          <View className="flex-row items-center gap-3 rounded-lg border-[1.5px] border-dashed border-outline px-4 py-4">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <MaterialCommunityIcons name="history" size={18} color={COLORS.textSecondary} />
            </View>
            <Text variant="label" tone="soft" className="flex-1">
              Nothing logged yet. Scanned donations and changes will show up here.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            <Text variant="label" tone="soft" className="px-1 font-bold uppercase tracking-wider">
              Recent activity
            </Text>
            <Card className="p-0">
              {activities.slice(0, 5).map((act: any, i: number, all: any[]) => (
                <View
                  key={act.id}
                  className={`flex-row items-center gap-3 px-4 py-3 ${
                    i < all.length - 1 ? "border-b-[1.5px] border-hairline" : ""
                  }`}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
                    <MaterialCommunityIcons
                      name={act.icon as any}
                      size={17}
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
            </Card>
          </View>
        )}
      </FadeInUp>
    </Screen>
  );
}

/**
 * A secondary intake: a surface with a glyph, a name, and what it does.
 * Dips under the thumb like the hero does, so every pressable block on this
 * screen answers a touch the same way.
 */
function ActionTile({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const press = usePressScale(0.97);
  return (
    <Pressable
      className="flex-1"
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        cuePress();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
    >
      <Animated.View style={press.style}>
        <Card className="gap-3 p-4">
          <View className="h-10 w-10 items-center justify-center rounded-md bg-subtle">
            <MaterialCommunityIcons name={icon} size={22} color={COLORS.primaryLight} />
          </View>
          <View>
            <Text variant="body" className="font-bold">
              {title}
            </Text>
            <Text variant="micro" tone="soft" className="mt-0.5">
              {hint}
            </Text>
          </View>
        </Card>
      </Animated.View>
    </Pressable>
  );
}
