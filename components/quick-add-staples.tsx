import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RULE_ABOVE_FAINT } from "../constants/theme";
import { useAccessibilityStore } from "../lib/accessibility";
import { cueSuccess, cueTap, cueWarn } from "../lib/feedback";
import { Category, InventoryItem, usePantryStore } from "../lib/store";
import { Card, CategoryIcon, Segmented, Sheet, Text } from "./ui";
import { shelfLabels } from "../lib/shelves";

export interface StapleItem {
  id: string;
  name: string;
  category: Category;
  unitDesc: string;
  presetPacks: number[];
}

export const TOP_STAPLES: StapleItem[] = [
  {
    id: "staple-1",
    name: "Black Beans (15oz)",
    category: "protein",
    unitDesc: "15 oz can",
    presetPacks: [1, 6, 12, 24],
  },
  {
    id: "staple-2",
    name: "Peanut Butter (16oz)",
    category: "protein",
    unitDesc: "16 oz jar",
    presetPacks: [1, 4, 12],
  },
  {
    id: "staple-3",
    name: "Canned Sweet Corn (15oz)",
    category: "vegetable",
    unitDesc: "15 oz can",
    presetPacks: [1, 6, 12, 24],
  },
  {
    id: "staple-4",
    name: "White Rice (2 lb)",
    category: "grain",
    unitDesc: "2 lb bag",
    presetPacks: [1, 5, 10, 20],
  },
  {
    id: "staple-5",
    name: "Canned Tuna in Water",
    category: "protein",
    unitDesc: "5 oz can",
    presetPacks: [1, 8, 24, 48],
  },
  {
    id: "staple-6",
    name: "Whole Grain Pasta (16oz)",
    category: "grain",
    unitDesc: "1 lb box",
    presetPacks: [1, 6, 12, 20],
  },
  {
    id: "staple-7",
    name: "Cut Green Beans (14.5oz)",
    category: "vegetable",
    unitDesc: "14.5 oz can",
    presetPacks: [1, 6, 12, 24],
  },
  {
    id: "staple-8",
    name: "Diced Tomatoes (15oz)",
    category: "vegetable",
    unitDesc: "15 oz can",
    presetPacks: [1, 6, 12, 24],
  },
  {
    id: "staple-9",
    name: "Rolled Oats (42oz)",
    category: "breakfast",
    unitDesc: "tub",
    presetPacks: [1, 4, 8, 12],
  },
  {
    id: "staple-10",
    name: "Macaroni & Cheese",
    category: "grain",
    unitDesc: "7.25 oz box",
    presetPacks: [1, 12, 24],
  },
  {
    id: "staple-11",
    name: "Canned Chicken Breast",
    category: "protein",
    unitDesc: "12.5 oz can",
    presetPacks: [1, 6, 12, 24],
  },
  {
    id: "staple-12",
    name: "Dry Pinto Beans (1 lb)",
    category: "protein",
    unitDesc: "1 lb bag",
    presetPacks: [1, 10, 20],
  },
];

const WORD_NUMS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  dozen: 12,
  twenty: 20,
  "twenty-four": 24,
};

function inferCategory(name: string, inventory: InventoryItem[]): Category {
  const lower = name.toLowerCase();
  const match = inventory.find((i) => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
  if (match && match.category !== "unknown") return match.category;

  if (/(bean|tuna|salmon|chicken|beef|pork|spam|peanut|lentil|chili|protein|meat|jerky)/.test(lower)) {
    return "protein";
  }
  if (/(corn|tomato|pea|carrot|spinach|green bean|soup|broth|veg|potato|yam)/.test(lower)) {
    return "vegetable";
  }
  if (/(oat|cereal|pancake|syrup|grits|waffle|breakfast|granola)/.test(lower)) {
    return "breakfast";
  }
  if (/(diaper|formula|wipe|baby|gerber)/.test(lower)) {
    return "baby";
  }
  if (/(soap|shampoo|tooth|paste|deodorant|pad|tampon|paper|hygiene|tissue)/.test(lower)) {
    return "hygiene";
  }
  if (/(cracker|chip|cookie|fruit cup|applesauce|bar|snack|pretzel|raisin)/.test(lower)) {
    return "snack";
  }
  return "grain";
}

/**
 * Parses a natural spoken or typed phrase like "24 cans of black beans" or
 * "2 cases sweet corn" into a structured item, quantity, and category.
 */
function parseQuickPhrase(raw: string, inventory: InventoryItem[]): {
  count: number;
  name: string;
  category: Category;
} | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  let rest = cleaned;
  let count = 1;

  // Match e.g. "2 cases of ...", "a flat of ...", "12 cans of ..."
  const packMatch = rest.match(
    /^(\d+|a|an|one|two|three|four|five|six|ten|twelve|dozen)\s*(cases?|flats?|packs?|boxes|cans?|jars?|bags?|tins?|units?)?(?:\s+of)?\s+(.+)$/i,
  );

  if (packMatch) {
    const rawNum = packMatch[1].toLowerCase();
    const base = /^\d+$/.test(rawNum) ? parseInt(rawNum, 10) : (WORD_NUMS[rawNum] ?? 1);
    const unitWord = (packMatch[2] ?? "").toLowerCase();
    const mult = unitWord.startsWith("case") || unitWord.startsWith("flat")
      ? 12
      : unitWord.startsWith("pack")
        ? 6
        : 1;
    count = Math.max(1, base * mult);
    rest = packMatch[3].trim();
  }

  if (!rest) return null;

  // Check if it matches an existing inventory item or staple name closely
  const lowerRest = rest.toLowerCase();
  const existingMatch =
    inventory.find((i) => i.name.toLowerCase() === lowerRest) ??
    TOP_STAPLES.find((s) => s.name.toLowerCase().includes(lowerRest));

  const titleCased = existingMatch
    ? existingMatch.name
    : rest.replace(/\b\w/g, (c) => c.toUpperCase());

  const category = existingMatch ? existingMatch.category : inferCategory(titleCased, inventory);
  return { count, name: titleCased, category };
}

interface QuickAddStaplesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function QuickAddStaplesModal({
  visible,
  onClose,
}: QuickAddStaplesModalProps) {
  const inventory = usePantryStore((state) => state.inventory);
  const locations = usePantryStore((state) => state.locations);
  const defaultLocationFor = usePantryStore((state) => state.defaultLocationFor);
  const addItems = usePantryStore((state) => state.addItems);
  const updateItem = usePantryStore((state) => state.updateItem);
  const addActivity = usePantryStore((state) => state.addActivity);
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);

  const [tab, setTab] = useState<"staples" | "shelves">("staples");
  const [phrase, setPhrase] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const placeNames = useMemo(
    () => shelfLabels(locations),
    [locations],
  );

  /** Finds where an item or category belongs on the shelves. */
  const resolveShelfId = (name: string, category: Category): string | null => {
    const lower = name.toLowerCase().trim();
    const exactWithLoc = inventory.find(
      (i) => i.location_id && i.name.toLowerCase().trim() === lower,
    );
    if (exactWithLoc?.location_id) return exactWithLoc.location_id;

    const byRule = defaultLocationFor(category);
    if (byRule) return byRule;

    const catMatch = inventory.find((i) => i.location_id && i.category === category);
    return catMatch?.location_id ?? null;
  };

  /** Unique items currently on the pantry's shelves so volunteers can 1-tap restock them. */
  const shelfItems = useMemo<StapleItem[]>(() => {
    const seen = new Set<string>();
    const list: StapleItem[] = [];
    for (const item of inventory) {
      const key = item.name.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({
        id: `shelf-${item.id}`,
        name: item.name,
        category: item.category === "unknown" ? "grain" : item.category,
        unitDesc: item.location_id && placeNames[item.location_id]
          ? placeNames[item.location_id]
          : item.category,
        presetPacks: [1, 6, 12, 24],
      });
      if (list.length >= 15) break;
    }
    return list;
  }, [inventory, placeNames]);

  const parsedPhrase = useMemo(
    () => parseQuickPhrase(phrase, inventory),
    [phrase, inventory],
  );

  const handleQuickAdd = async (staple: StapleItem, amount: number) => {
    cueTap();
    setBusyId(`${staple.id}-${amount}`);
    try {
      const existing = inventory.find(
        (i) => i.name.toLowerCase().trim() === staple.name.toLowerCase().trim(),
      );
      const targetLocId = existing?.location_id ?? resolveShelfId(staple.name, staple.category);
      const shelfLabel = targetLocId && placeNames[targetLocId] ? ` (${placeNames[targetLocId]})` : "";

      if (existing) {
        const nextCount = existing.count + amount;
        await updateItem(existing.id, {
          count: nextCount,
          ...(targetLocId && !existing.location_id ? { location_id: targetLocId } : {}),
        });
        addActivity(
          `Added ${amount} units of ${staple.name} (now ${nextCount})`,
          "plus-box-outline",
        );
        setToastMessage(
          `✓ Added ${amount} of ${staple.name}${shelfLabel}. Shelf now has ${nextCount}.`,
        );
      } else {
        await addItems([
          {
            name: staple.name,
            category: staple.category,
            count: amount,
            source: "donation",
            expiration: null,
            location_id: targetLocId,
          },
        ]);
        addActivity(
          `Added ${amount} units of ${staple.name}`,
          "plus-box-outline",
        );
        setToastMessage(`✓ Added ${amount} of ${staple.name} to shelf${shelfLabel}.`);
      }

      cueSuccess();
      setTimeout(() => {
        setToastMessage((cur) => (cur?.includes(staple.name) ? null : cur));
      }, 3500);
    } catch {
      cueWarn();
      setToastMessage(`⚠️ Could not add ${staple.name}. Please try again.`);
    } finally {
      setBusyId(null);
    }
  };

  const handlePhraseSubmit = async () => {
    if (!parsedPhrase || busyId) return;
    const synthetic: StapleItem = {
      id: "phrase",
      name: parsedPhrase.name,
      category: parsedPhrase.category,
      unitDesc: parsedPhrase.category,
      presetPacks: [parsedPhrase.count],
    };
    await handleQuickAdd(synthetic, parsedPhrase.count);
    setPhrase("");
  };

  const activeList = tab === "shelves" ? shelfItems : TOP_STAPLES;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Quick Add & Restock"
      subtitle="Tap a case button, or use your keyboard microphone to say what came in."
    >
      {/* Voice / Natural Phrase Quick-Intake Bar */}
      <View className="gap-2 rounded-xl border border-hairline bg-subtle p-3">
        <View className="flex-row items-center gap-2">
          <View
            style={seniorMode ? { minHeight: 54 } : undefined}
            className="min-h-[48px] flex-1 flex-row items-center gap-2 rounded-lg border border-outline bg-card px-3"
          >
            <MaterialCommunityIcons
              name="microphone-outline"
              size={20}
              color={COLORS.primary}
            />
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              onSubmitEditing={handlePhraseSubmit}
              returnKeyType="done"
              maxFontSizeMultiplier={2.2}
              style={seniorMode ? { fontSize: 18 } : undefined}
              placeholder='Say or type e.g. "12 cans black beans"'
              placeholderTextColor={COLORS.textSecondary}
              accessibilityLabel="Say or type quantity and item name to add"
              className="flex-1 text-body text-ink"
            />
            {phrase.length > 0 && (
              <Pressable
                onPress={() => setPhrase("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear text"
                className="h-9 w-9 items-center justify-center"
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            )}
          </View>
          {parsedPhrase && (
            <Pressable
              onPress={handlePhraseSubmit}
              disabled={!!busyId}
              accessibilityRole="button"
              accessibilityLabel={`Add ${parsedPhrase.count} ${parsedPhrase.name}`}
              style={({ pressed }) => ({
                borderBottomWidth: pressed ? 1 : 3,
                borderBottomColor: COLORS.primaryDeep,
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
              className="min-h-[48px] items-center justify-center rounded-lg bg-brand px-4"
            >
              <Text variant="label" tone="on" className="font-bold">
                Add +{parsedPhrase.count}
              </Text>
            </Pressable>
          )}
        </View>

        {parsedPhrase ? (
          <View className="flex-row flex-wrap items-center gap-1.5 px-1">
            <MaterialCommunityIcons
              name="auto-fix"
              size={15}
              color={COLORS.secondaryDark}
            />
            <Text variant="micro" className="font-semibold" style={{ color: COLORS.secondaryDark }}>
              Ready: {parsedPhrase.count} × {parsedPhrase.name} ({parsedPhrase.category})
              {(() => {
                const locId = resolveShelfId(parsedPhrase.name, parsedPhrase.category);
                return locId && placeNames[locId] ? ` → ${placeNames[locId]}` : "";
              })()}
            </Text>
          </View>
        ) : (
          <Text variant="micro" tone="soft" className="px-1">
            Tip: Tap the mic on your keyboard and say &ldquo;2 cases sweet corn&rdquo; or &ldquo;24 tuna&rdquo;.
          </Text>
        )}
      </View>

      {/* Toast Banner */}
      {toastMessage && (
        <View
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: "#EEF4E9", borderColor: COLORS.statusGood }}
          className="flex-row items-center gap-2 rounded-lg border p-3"
        >
          <MaterialCommunityIcons
            name="check-circle"
            size={20}
            color={COLORS.statusGood}
          />
          <Text
            variant="label"
            className="flex-1 font-semibold"
            style={{ color: "#2B5A24" }}
          >
            {toastMessage}
          </Text>
        </View>
      )}

      {shelfItems.length > 0 && (
        <Segmented
          value={tab}
          options={[
            { value: "staples", label: "Common Staples" },
            { value: "shelves", label: `On Your Shelves (${shelfItems.length})` },
          ]}
          onChange={setTab}
        />
      )}

      {/* List of staples or recent shelf items */}
      <View className="gap-3 pb-4">
        {activeList.map((staple) => {
          const existing = inventory.find(
            (i) =>
              i.name.toLowerCase().trim() ===
              staple.name.toLowerCase().trim(),
          );
          const currentStock = existing?.count ?? 0;
          const targetLocId = existing?.location_id ?? resolveShelfId(staple.name, staple.category);
          const shelfName = targetLocId ? placeNames[targetLocId] : undefined;

          return (
            <Card key={staple.id} className="gap-3 p-3.5">
              <View className="flex-row items-center justify-between p-1">
                <View className="flex-1 flex-row items-center gap-3">
                  <CategoryIcon category={staple.category} size="md" />
                  <View className="flex-1">
                    <Text variant="body" className="font-bold">
                      {staple.name}
                    </Text>
                    <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
                      {shelfName && (
                        <View className="flex-row items-center gap-1 rounded bg-secondary-tint px-1.5 py-0.5">
                          <MaterialCommunityIcons
                            name="map-marker-outline"
                            size={12}
                            color={COLORS.secondaryDark}
                          />
                          <Text
                            variant="micro"
                            className="font-bold"
                            style={{ color: COLORS.secondaryDark }}
                          >
                            {shelfName}
                          </Text>
                        </View>
                      )}
                      <Text variant="label" tone="soft">
                        On shelf:{" "}
                        <Text variant="label" className="font-bold">
                          {currentStock} units
                        </Text>
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* One-tap preset buttons */}
              <View
                className="flex-row gap-2 pt-2"
                style={RULE_ABOVE_FAINT}
              >
                {staple.presetPacks.map((pack) => {
                  const isBusy = busyId === `${staple.id}-${pack}`;
                  const label =
                    pack === 1
                      ? "+1"
                      : pack >= 24
                        ? `+${pack} Flat`
                        : pack >= 12
                          ? `+${pack} Case`
                          : `+${pack}`;

                  return (
                    <Pressable
                      key={pack}
                      disabled={!!busyId}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${pack} units of ${staple.name}`}
                      onPress={() => handleQuickAdd(staple, pack)}
                      style={({ pressed }) => ({
                        borderBottomWidth: pressed ? 1 : 3,
                        borderBottomColor: COLORS.borderStrong,
                        transform: [{ translateY: pressed ? 2 : 0 }],
                        minHeight: 48,
                      })}
                      className="flex-1 items-center justify-center rounded-lg border border-hairline bg-card px-1.5 py-2.5"
                    >
                      {isBusy ? (
                        <ActivityIndicator
                          size="small"
                          color={COLORS.primary}
                        />
                      ) : (
                        <Text
                          variant="label"
                          tone="brand"
                          className="text-center font-bold"
                        >
                          {label}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        })}
      </View>
    </Sheet>
  );
}
