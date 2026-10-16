import { useAppAppearance } from "../../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Alert, Pressable, Share, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { FadeInUp, ProgressBar, Tappable } from "../../components/motion";
import { Button, Card, Panel, Screen, Sheet, Text } from "../../components/ui";
import { cueSuccess, cueTap } from "../../lib/feedback";
import { usePantryStore } from "../../lib/store";

/**
 * What to ask donors for.
 *
 * Previously a full-page mock flyer with a coloured masthead, per-category
 * subcards and a wall of body copy — a rendering of the output rather than an
 * answer to a question. The question is "what do we ask for", so that is the
 * list, in plain words, biggest need first. The flyer text still exists and is
 * still what gets copied; it just lives in a sheet now instead of being the
 * screen.
 */

/** What a donor should actually put in the bag, per category. */
const EXAMPLES: Record<string, string> = {
  protein: "Canned tuna, beans, peanut butter, canned chicken",
  grain: "Rice, pasta, oats, cereal",
  vegetable: "Canned corn, green beans, diced tomatoes",
  breakfast: "Pancake mix, oatmeal, syrup, cereal",
  snack: "Granola bars, fruit cups, crackers",
  baby: "Infant formula, baby food jars",
  hygiene: "Soap, shampoo, toothpaste, diapers",
};

export default function NeedsScreen() {
  useAppAppearance((state) => state.scheme);
  const router = useRouter();
  const { inventory, bulkLots, boxRules, thresholds, settings } =
    usePantryStore();

  // The pantry's own drop-off details. This line used to be hardcoded, so every
  // pantry's message sent donors to the same invented rear entrance. With
  // nothing set it is left out: no address beats a wrong one.
  const dropoff = [
    settings.dropoffLocation.trim(),
    settings.dropoffHours.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  // The pantry's own target, not the number 12 that used to sit here. Every
  // "stopping boxes going out" figure below is measured against it, so a pantry
  // serving sixty families no longer asks donors for enough food for twelve.
  const plan = computeAllocation(
    inventory,
    boxRules,
    settings.boxTarget,
    settings.defaultFamilySize,
    bulkLots,
    { warningDays: settings.expirationWarningDays },
  );

  const [flyerOpen, setFlyerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const pendingSettings = useRef<"boxes" | "pantry" | null>(null);
  const openSettings = (section: "boxes" | "pantry") => {
    pendingSettings.current = section;
    setFlyerOpen(false);
    setPlanOpen(false);
  };
  const navigateAfterDismiss = () => {
    const section = pendingSettings.current;
    pendingSettings.current = null;
    if (section)
      router.push({ pathname: "/(tabs)/settings", params: { section } });
  };
  const categoryLabels: Record<string, string> = {
    grain: "Grains & pasta",
    vegetable: "Vegetables",
    protein: "Protein",
    breakfast: "Breakfast",
    snack: "Snacks",
    hygiene: "Hygiene",
    baby: "Baby supplies",
  };

  const deficits: {
    category: string;
    deficit: number;
    current: number;
    goal: number;
    reason: string;
  }[] = [];

  // The limiting category first: it is the one actually stopping boxes going out.
  if (plan.shortfallPerCategory[plan.limitingCategory] > 0) {
    const current = plan.categoryTotals[plan.limitingCategory] ?? 0;
    const deficit = plan.shortfallPerCategory[plan.limitingCategory];
    deficits.push({
      category: plan.limitingCategory,
      deficit,
      current,
      goal: current + deficit,
      reason: "Stopping boxes going out",
    });
  }

  Object.keys(thresholds).forEach((cat) => {
    if (cat === plan.limitingCategory) return;
    // The allocator's own totals, not a fresh count of the shelf. Counting the
    // shelf raw asked donors for food the pantry already had in a weighed bulk
    // lot, and stayed quiet about categories whose only stock was out of date
    // or waiting on an inspection.
    const current =
      plan.categoryTotals[cat as keyof typeof plan.categoryTotals] ?? 0;
    const min = (thresholds as any)[cat];
    if (current < min) {
      deficits.push({
        category: cat,
        deficit: min - current,
        current,
        goal: min,
        reason: "Below the level you set",
      });
    }
  });

  const flyerText = `🛒 MOST NEEDED ITEMS — ${settings.pantryName.toUpperCase()}
${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

Our pantry is short on the food for ${settings.boxTarget} family box${
    settings.boxTarget === 1 ? "" : "es"
  }:

${deficits
  .map(
    (d) =>
      `• ${d.category.toUpperCase()} — about ${d.deficit} more needed\n  ${EXAMPLES[d.category] ?? ""}`,
  )
  .join("\n\n")}

${dropoff ? `Drop-off: ${dropoff}\n` : ""}Thank you for helping feed our neighbours ❤️`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(flyerText);
    cueSuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    Alert.alert(
      "Copied",
      "Paste it into an email, a post, or a printed flyer.",
    );
  };

  const handleShare = async () => {
    cueTap();
    try {
      await Share.share({
        title: `${settings.pantryName} — Most Needed Items`,
        message: flyerText,
      });
    } catch {
      await handleCopy();
    }
  };

  if (deficits.length === 0) {
    return (
      <Screen>
        <FadeInUp index={0}>
          <View className="items-center px-6 py-16">
            <MaterialCommunityIcons
              name="check-decagram"
              size={52}
              color={COLORS.statusGood}
            />
            <Text variant="title" className="mt-5 text-center">
              Nothing to ask for
            </Text>
            <Text variant="body" tone="soft" className="mt-2 text-center">
              Every category is above the level you set. This page will fill in
              on its own when something runs low.
            </Text>
          </View>
        </FadeInUp>
      </Screen>
    );
  }

  return (
    <>
      <Screen contentContainerClassName="gap-5">
        <View className="gap-1 px-1">
          <Text variant="headline">Most needed</Text>
          <Tappable
            onPress={() => setPlanOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View saved plan and change defaults"
            className="min-h-[48px] flex-row items-center gap-2"
          >
            <Text variant="label" tone="soft" className="flex-1">
              {settings.boxTarget} boxes · families of{" "}
              {settings.defaultFamilySize}
            </Text>
            <MaterialCommunityIcons
              name="information-outline"
              size={20}
              color={COLORS.textSecondary}
            />
          </Tappable>
        </View>

        <View className="gap-2">
          <Text variant="micro" tone="soft" className="px-1">
            Tap a category for details.
          </Text>
          <Card className="px-4 py-0">
            {deficits.map((item, index) => {
              const expanded = expandedCategory === item.category;
              const limiting = item.reason === "Stopping boxes going out";
              const label = categoryLabels[item.category] ?? item.category;
              return (
                <View
                  key={item.category}
                  style={
                    index < deficits.length - 1
                      ? {
                          borderBottomWidth: 1,
                          borderBottomColor: COLORS.borderSoft,
                        }
                      : undefined
                  }
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${label}, ${item.deficit} more units needed${limiting ? ", limits your box goal" : ""}. ${expanded ? "Hide" : "Show"} details.`}
                    onPress={() => {
                      cueTap();
                      setExpandedCategory(expanded ? null : item.category);
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    className="min-h-[72px] flex-row items-center gap-3 py-4"
                  >
                    <View className="flex-1 gap-1">
                      <Text variant="heading">{label}</Text>
                      {limiting && (
                        <Text variant="micro" tone="critical">
                          Limits your box goal
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text
                        variant="heading"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {item.deficit}
                      </Text>
                      <Text variant="micro" tone="soft">
                        needed
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={19}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                  {expanded && (
                    <View className="gap-3 pb-4">
                      <Text variant="body" tone="soft">
                        {EXAMPLES[item.category] ?? "Any shelf-stable items"}
                      </Text>
                      <View className="gap-2">
                        <Text variant="label" tone="soft">
                          {item.current} of {item.goal} units on the shelf
                        </Text>
                        <ProgressBar
                          progress={
                            item.goal > 0
                              ? Math.min(1, item.current / item.goal)
                              : 0
                          }
                          color={
                            limiting
                              ? COLORS.statusCritical
                              : COLORS.primaryDark
                          }
                          height={5}
                        />
                      </View>
                      <Text variant="micro" tone="soft">
                        {limiting
                          ? "This category is the first to run out for your saved box goal."
                          : "Below your pantry’s low-stock alert level."}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>

        <Button
          label="Review & share needs"
          block
          onPress={() => setFlyerOpen(true)}
          icon={
            <MaterialCommunityIcons
              name="share-variant-outline"
              size={18}
              color={COLORS.textOnAccent}
            />
          }
        />
      </Screen>

      <Sheet
        visible={planOpen}
        onClose={() => setPlanOpen(false)}
        onDismiss={navigateAfterDismiss}
        title="Saved pantry plan"
      >
        <Text variant="heading">
          {settings.boxTarget} boxes · families of {settings.defaultFamilySize}
        </Text>
        <Text tone="soft">
          Needs uses this saved plan and your low-stock alert levels. Temporary
          changes on the Boxes tab do not change this list.
        </Text>
        <Button
          label="Change box defaults"
          block
          onPress={() => openSettings("boxes")}
        />
      </Sheet>

      <Sheet
        visible={flyerOpen}
        onClose={() => setFlyerOpen(false)}
        onDismiss={navigateAfterDismiss}
        title="Donor message"
        subtitle="Paste into an email, a post, or a printed flyer"
      >
        <Panel>
          <Text variant="label" selectable style={{ lineHeight: 21 }}>
            {flyerText}
          </Text>
        </Panel>
        {!dropoff && (
          <Tappable
            onPress={() => openSettings("pantry")}
            accessibilityRole="button"
            className="flex-row items-center gap-2 px-1 py-1"
          >
            <MaterialCommunityIcons
              name="map-marker-plus-outline"
              size={16}
              color={COLORS.primaryDark}
            />
            <Text variant="micro" tone="brand" className="flex-1 font-semibold">
              Add your drop-off location and hours in Settings so donors know
              where to go.
            </Text>
          </Tappable>
        )}
        <Button
          label="Share needs list"
          block
          onPress={handleShare}
          icon={
            <MaterialCommunityIcons
              name="share-variant-outline"
              size={18}
              color={COLORS.textOnAccent}
            />
          }
        />
        <Button
          label={copied ? "Copied" : "Copy text"}
          variant="secondary"
          block
          className="mt-1"
          onPress={handleCopy}
        />
      </Sheet>
    </>
  );
}
