import { useAppAppearance } from "../../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Alert, Pressable, Share, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { FadeInUp, ProgressBar, Tappable } from "../../components/motion";
import { Button, Card, CategoryIcon, Panel, Screen, Sheet, Text } from "../../components/ui";
import { cueSuccess, cueTap } from "../../lib/feedback";
import { usePantryStore } from "../../lib/store";
import { SpotlightTour, useSpotlightTarget, type TourStep } from "../../components/spotlight";

const NEEDS_TOUR: TourStep[] = [
  { target: "needs.summary", title: "What you're short", body: "How far you are from your box goal, worked out for you." },
  { target: "needs.firstRow", title: "Tap for ideas", body: "See what foods to ask donors for." },
  { target: "needs.ask", title: "Share the list", body: "Send it by text, email or a flyer." },
];

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
  const firstRowTarget = useSpotlightTarget("needs.firstRow");
  const askTarget = useSpotlightTarget("needs.ask");
  const summaryTarget = useSpotlightTarget("needs.summary");
  const [copied, setCopied] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const pendingSettings = useRef<"boxes" | "pantry" | null>(null);
  const openSettings = (section: "boxes" | "pantry") => {
    pendingSettings.current = section;
    setFlyerOpen(false);
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

  const boxesShort = Math.max(0, settings.boxTarget - plan.achievableBoxes);

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
        {/* The headline: what the shortfall costs, in boxes, and the one
            action that fixes it. */}
        <FadeInUp index={0}>
          <View ref={summaryTarget} collapsable={false}>
          <Card className="gap-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text variant="title" className="font-bold" style={{ lineHeight: 28 }}>
                  {boxesShort > 0
                    ? `${boxesShort} ${boxesShort === 1 ? "box" : "boxes"} short of your goal`
                    : "Your box goal is covered"}
                </Text>
                <Text variant="label" tone="soft" className="mt-2">
                  You can pack {plan.achievableBoxes} of {settings.boxTarget}
                </Text>
              </View>
              <Tappable
                onPress={() => {
                  cueTap();
                  router.push({ pathname: "/(tabs)/settings", params: { section: "boxes" } });
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Edit box default. Goal: ${settings.boxTarget} boxes for families of ${settings.defaultFamilySize}.`}
                className="mt-0.5 min-h-[36px] flex-row items-center gap-1 self-start rounded-md border border-hairline px-2.5"
              >
                <MaterialCommunityIcons name="pencil-outline" size={15} color={COLORS.textSecondary} />
                <Text variant="micro" tone="soft" className="font-semibold">
                  Edit box default
                </Text>
              </Tappable>
            </View>
            <ProgressBar
              progress={settings.boxTarget > 0 ? Math.min(1, plan.achievableBoxes / settings.boxTarget) : 1}
              color={boxesShort > 0 ? COLORS.statusWarning : COLORS.statusGood}
              height={6}
            />
            <Text variant="label">
              <Text variant="label" className="font-bold">
                {deficits.reduce((sum, d) => sum + d.deficit, 0)} units
              </Text>{" "}
              short across {deficits.length}{" "}
              {deficits.length === 1 ? "category" : "categories"} below
            </Text>
            <View ref={askTarget} collapsable={false}>
            <Button
              label="Ask donors for help"
              block
              className="rounded-md"
              onPress={() => setFlyerOpen(true)}
              icon={
                <MaterialCommunityIcons
                  name="share-variant-outline"
                  size={18}
                  color={COLORS.textOnAccent}
                />
              }
            />
            </View>
          </Card>
          </View>
        </FadeInUp>

        <View className="gap-2">
          <Text variant="heading" className="px-1">
            Most needed
          </Text>
          <Card className="px-4 py-0">
            {deficits.map((item, index) => {
              const expanded = expandedCategory === item.category;
              const limiting = item.reason === "Stopping boxes going out";
              const label = categoryLabels[item.category] ?? item.category;
              return (
                <View
                  ref={index === 0 ? firstRowTarget : undefined}
                  collapsable={false}
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
                    className="min-h-[68px] flex-row items-center gap-3 py-3"
                  >
                    <CategoryIcon
                      category={item.category}
                      tone="secondary"
                    />
                    <View className="flex-1 gap-1.5">
                      <Text variant="body" className="font-bold">
                        {label}
                      </Text>
                      <ProgressBar
                        progress={item.goal > 0 ? Math.min(1, item.current / item.goal) : 0}
                        color={limiting ? COLORS.primary : COLORS.statusWarning}
                        height={4}
                      />
                      {limiting ? (
                        <View
                          className="self-start rounded-sm px-1.5 py-0.5"
                          style={{ backgroundColor: COLORS.primaryLight }}
                        >
                          <Text variant="micro" className="font-bold" style={{ color: COLORS.textOnAccent }}>
                            Runs out first
                          </Text>
                        </View>
                      ) : (
                        <Text variant="micro" tone="soft">
                          {`${item.current} of ${item.goal} on hand`}
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
                    <View className="mb-3 gap-1.5 rounded-md bg-subtle px-3 py-3">
                      <Text variant="micro" tone="soft" className="font-bold uppercase" style={{ letterSpacing: 0.6 }}>
                        Ask for
                      </Text>
                      <Text variant="body">
                        {EXAMPLES[item.category] ?? "Any shelf-stable items"}
                      </Text>
                      <Text variant="label" tone="soft">
                        {limiting
                          ? "Runs out first, so it sets how many boxes you can pack."
                          : "Below your low-stock level."}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        </View>

      </Screen>
      <SpotlightTour tourKey="needs" steps={NEEDS_TOUR} />

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
