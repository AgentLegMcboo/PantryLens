import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { FadeInUp } from "../../components/motion";
import {
  Button,
  Card,
  CategoryIcon,
  Panel,
  Screen,
  Sheet,
  Text,
} from "../../components/ui";
import { cueSuccess } from "../../lib/feedback";
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
  const router = useRouter();
  const { inventory, bulkLots, boxRules, thresholds, settings } = usePantryStore();

  // The pantry's own drop-off details. This line used to be hardcoded, so every
  // pantry's message sent donors to the same invented rear entrance. With
  // nothing set it is left out: no address beats a wrong one.
  const dropoff = [settings.dropoffLocation.trim(), settings.dropoffHours.trim()]
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

  const deficits: { category: string; deficit: number; reason: string }[] = [];

  // The limiting category first: it is the one actually stopping boxes going out.
  if (plan.shortfallPerCategory[plan.limitingCategory] > 0) {
    deficits.push({
      category: plan.limitingCategory,
      deficit: plan.shortfallPerCategory[plan.limitingCategory],
      reason: "Stopping boxes going out",
    });
  }

  Object.keys(thresholds).forEach((cat) => {
    if (cat === plan.limitingCategory) return;
    // The allocator's own totals, not a fresh count of the shelf. Counting the
    // shelf raw asked donors for food the pantry already had in a weighed bulk
    // lot, and stayed quiet about categories whose only stock was out of date
    // or waiting on an inspection.
    const current = plan.categoryTotals[cat as keyof typeof plan.categoryTotals] ?? 0;
    const min = (thresholds as any)[cat];
    if (current < min) {
      deficits.push({
        category: cat,
        deficit: min - current,
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
    Alert.alert("Copied", "Paste it into an email, a post, or a printed flyer.");
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
      <Screen>
        <FadeInUp index={0}>
          <View className="px-1">
            <Text variant="headline">
              Ask for {deficits.length}{" "}
              {deficits.length === 1 ? "thing" : "things"}
            </Text>
            <Text variant="body" tone="soft" className="mt-1">
              Built from what is actually on your shelves, so donors bring what
              you need instead of what they guess.
            </Text>
            {/* The assumption behind every "stopping boxes going out" figure,
                said out loud. It was the number 12, hardcoded, and a pantry
                reading these amounts had no way to know what they were for. */}
            <Pressable
              onPress={() => router.push("/(tabs)/settings")}
              accessibilityRole="button"
              className="mt-3 flex-row items-center gap-2"
            >
              <MaterialCommunityIcons
                name="package-variant-closed"
                size={14}
                color={COLORS.textSecondary}
              />
              <Text variant="micro" tone="soft" className="flex-1">
                Amounts are for {settings.boxTarget} box
                {settings.boxTarget === 1 ? "" : "es"} of {settings.defaultFamilySize}
                . Change that in Settings.
              </Text>
            </Pressable>
          </View>
        </FadeInUp>

        {/* Tighter than the page rhythm: these are one list, not separate blocks. */}
        <View className="gap-2.5">
          {deficits.map((item, i) => (
            <FadeInUp key={item.category} index={i + 1}>
              <Card className="flex-row items-center gap-3.5 p-4">
                <CategoryIcon
                  category={item.category}
                  size="md"
                  tone={
                    item.reason === "Stopping boxes going out" ? "critical" : "brand"
                  }
                />
                <View className="flex-1">
                  <View className="flex-row items-baseline gap-2">
                    <Text variant="heading" className="font-bold capitalize">
                      {item.category}
                    </Text>
                    <Text variant="label" className="font-semibold">
                      about {item.deficit} more
                    </Text>
                  </View>
                  <Text variant="label" tone="soft" className="mt-0.5">
                    {EXAMPLES[item.category] ?? "Any shelf-stable items"}
                  </Text>
                  {item.reason === "Stopping boxes going out" && (
                    <Text variant="micro" tone="critical" className="mt-2 font-bold">
                      This is what's stopping boxes going out
                    </Text>
                  )}
                </View>
              </Card>
            </FadeInUp>
          ))}
        </View>

        <FadeInUp index={deficits.length + 1}>
          <View className="gap-3">
            <Button
              label={copied ? "Copied" : "Copy the ask"}
              block
              icon={
                <MaterialCommunityIcons
                  name={copied ? "check" : "content-copy"}
                  size={18}
                  color={COLORS.textOnPrimary}
                />
              }
              onPress={handleCopy}
            />
            <Pressable onPress={() => setFlyerOpen(true)} className="self-start px-1 py-2">
              <Text variant="label" tone="brand" className="font-semibold">
                See exactly what gets copied
              </Text>
            </Pressable>
          </View>
        </FadeInUp>
      </Screen>

      <Sheet
        visible={flyerOpen}
        onClose={() => setFlyerOpen(false)}
        title="The message"
        subtitle="Paste into an email, a post, or a printed flyer"
      >
        <Panel>
          <Text variant="label" selectable style={{ lineHeight: 21 }}>
            {flyerText}
          </Text>
        </Panel>
        {!dropoff && (
          <Pressable
            onPress={() => {
              setFlyerOpen(false);
              router.push("/(tabs)/settings");
            }}
            accessibilityRole="button"
            className="flex-row items-center gap-2 px-1 py-1"
          >
            <MaterialCommunityIcons
              name="map-marker-plus-outline"
              size={16}
              color={COLORS.primaryDark}
            />
            <Text variant="micro" tone="brand" className="flex-1 font-semibold">
              Add your drop-off location and hours in Settings so donors know where to go.
            </Text>
          </Pressable>
        )}
        <Button
          label={copied ? "Copied" : "Copy it"}
          block
          className="mt-1"
          onPress={handleCopy}
        />
      </Sheet>
    </>
  );
}
