import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, RULE_ABOVE_FAINT } from "../constants/theme";
import { useAccessibilityStore } from "../lib/accessibility";
import { cueSuccess, cueTap, cueWarn } from "../lib/feedback";
import { Category, Condition, CONDITION_LABELS, InventoryItem, usePantryStore } from "../lib/store";
import { Button, Card, CategoryIcon, Chip, Input, Segmented, Sheet, Text } from "./ui";
import { INTAKE_CATEGORIES, parsePrintedDate, parseQuickAdd } from '../lib/intake';
import { shelfLabels } from '../lib/shelves';

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

function inferCategory(name: string, inventory: InventoryItem[]): Category {
  const lower = name.toLowerCase();
  const match = inventory.find((i) => i.name.toLowerCase().includes(lower) || lower.includes(i.name.toLowerCase()));
  if (match && match.category !== "unknown") return match.category;

  if (/(bean|chickpea|garbanzo|tuna|salmon|chicken|beef|pork|spam|peanut|lentil|chili|protein|meat|jerky)/.test(lower)) {
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
  return "unknown";
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
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);

  const [tab, setTab] = useState<"staples" | "shelves">("staples");
  const [phrase, setPhrase] = useState("");
  const [packSize, setPackSize] = useState('');
  const [expiration, setExpiration] = useState('');
  const [condition, setCondition] = useState<Condition>('ok');
  const [categoryOverride, setCategoryOverride] = useState<Category | null>(null);
  const dateInvalid = !!expiration.trim() && !parsePrintedDate(expiration);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        category: item.category,
        unitDesc: item.location_id && placeNames[item.location_id]
          ? placeNames[item.location_id]
          : item.category,
        presetPacks: [1, 6, 12, 24],
      });

    }
    return list;
  }, [inventory, placeNames]);

  const parsedPhrase = useMemo(
    () => {
      const parsed = parseQuickAdd(phrase, Number(packSize));
      if (!parsed) return null;
      const exact = inventory.find(i => i.name.toLowerCase() === parsed.name.toLowerCase());
      return { ...parsed, name: exact?.name ?? parsed.name, category: categoryOverride ?? exact?.category ?? inferCategory(parsed.name, inventory) };
    },
    [phrase, inventory, packSize, categoryOverride],
  );

  const handleQuickAdd = async (staple: StapleItem, amount: number) => {
    if (busyRef.current || dateInvalid) return false;
    busyRef.current = true;
    cueTap();
    setBusyId(`${staple.id}-${amount}`);
    try {
      const existing = inventory.find(
        (i) => i.name.toLowerCase().trim() === staple.name.toLowerCase().trim(),
      );
      const targetLocId = existing?.location_id ?? resolveShelfId(staple.name, staple.category);
      const shelfLabel = targetLocId && placeNames[targetLocId] ? ` (${placeNames[targetLocId]})` : "";

      // A delivery is its own date/condition batch, never a blind update of old stock.
      await addItems([{
        name: staple.name, category: staple.category, count: amount,
        source: "donation", expiration: parsePrintedDate(expiration), condition,
        location_id: targetLocId,
      }]);
      setToastMessage(`Added ${amount} × ${staple.name}${shelfLabel}${condition !== 'ok' ? ' · held for inspection' : ''}. Add another item below.`);
      setToastError(false);

      cueSuccess();
      setTimeout(() => {
        setToastMessage((cur) => (cur?.includes(staple.name) ? null : cur));
      }, 3500);
      return true;
    } catch {
      cueWarn();
      setToastMessage(`Could not add ${staple.name}. Please try again.`);
      setToastError(true);
      return false;
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const handlePhraseSubmit = async () => {
    if (!parsedPhrase || busyId || parsedPhrase.needsPackSize || dateInvalid) return;
    const synthetic: StapleItem = {
      id: "phrase",
      name: parsedPhrase.name,
      category: parsedPhrase.category,
      unitDesc: parsedPhrase.category,
      presetPacks: [parsedPhrase.count],
    };
    const saved = await handleQuickAdd(synthetic, parsedPhrase.count);
    if (saved) { setPhrase(""); setPackSize(""); setExpiration(""); setCondition('ok'); setCategoryOverride(null); }
  };

  const activeList = tab === "shelves" ? shelfItems : TOP_STAPLES;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Quick Add"
      subtitle="Type any item, or tap a common item below."
    >
      {/* Voice / Natural Phrase Quick-Intake Bar */}
      <View className="gap-2 rounded-xl border border-hairline bg-subtle p-3">
        <View className="flex-row items-center gap-2">
          <View
            style={seniorMode ? { minHeight: 54 } : undefined}
            className="min-h-[48px] flex-1 flex-row items-center gap-2 rounded-lg border border-outline bg-card px-3"
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={20}
              color={COLORS.primary}
            />
            <TextInput
              value={phrase}
              editable={!busyId}
              onChangeText={(value) => { setPhrase(value); setCategoryOverride(null); }}
              onSubmitEditing={handlePhraseSubmit}
              returnKeyType="done"
              maxFontSizeMultiplier={2.2}
              style={seniorMode ? { fontSize: 18 } : undefined}
              placeholder="e.g. 12 cans of black beans"
              placeholderTextColor={COLORS.textSecondary}
              accessibilityLabel="Item name and quantity"
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

        </View>

        {parsedPhrase ? (
          <View className="flex-row flex-wrap items-center gap-1.5 px-1">
            <MaterialCommunityIcons
              name="auto-fix"
              size={15}
              color={COLORS.secondaryDark}
            />
            <Text variant="micro" className="font-semibold" style={{ color: COLORS.secondaryDark }}>
              {parsedPhrase.needsPackSize ? `Enter units per pack for ${parsedPhrase.name}` : `Ready: ${parsedPhrase.count} × ${parsedPhrase.name} (${parsedPhrase.category})`}
              {(() => {
                const locId = resolveShelfId(parsedPhrase.name, parsedPhrase.category);
                return locId && placeNames[locId] ? ` → ${placeNames[locId]}` : "";
              })()}
            </Text>
          </View>
        ) : (
          <Text variant="micro" tone="soft" className="px-1">
            Type any product, such as “24 cans of tuna”. For cases, we will ask how many units are inside.
          </Text>
        )}
      </View>

      {parsedPhrase?.needsPackSize || /\b(cases?|flats?|packs?)\b/i.test(phrase) ? (
        <Input label="Units in each case or pack" value={packSize} onChangeText={setPackSize} keyboardType="number-pad" placeholder="Read the pack, e.g. 12" hint="Case sizes vary. We never assume a size." />
      ) : null}
      {parsedPhrase && (
        <View className="gap-2">
          <Text variant="label" className="font-bold">Category for this item</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">{INTAKE_CATEGORIES.map(category => <Chip key={category} label={category === 'unknown' ? 'Not sure' : category} selected={parsedPhrase.category === category} onPress={() => setCategoryOverride(category)} />)}</ScrollView>
        </View>
      )}
      <Pressable
        onPress={() => setDetailsOpen(value => !value)}
        accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }}
        accessibilityLabel={`Date and condition: ${expiration || 'Date unknown'}, ${CONDITION_LABELS[condition]}`}
        className="min-h-[56px] flex-row items-center gap-3 rounded-lg bg-subtle px-3 py-2"
      >
        <MaterialCommunityIcons name="calendar-check-outline" size={20} color={COLORS.primary} />
        <View className="flex-1 gap-1">
          <Text variant="label" className="font-bold">Date &amp; condition</Text>
          <Text variant="micro" tone={dateInvalid || condition !== 'ok' ? 'critical' : 'soft'}>{dateInvalid ? 'Check the date' : expiration || 'Date unknown'} · {CONDITION_LABELS[condition]}</Text>
        </View>
        <MaterialCommunityIcons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textSecondary} />
      </Pressable>
      {detailsOpen && <View className="gap-3">
      <Input label="Printed date for this delivery (optional)" value={expiration} onChangeText={setExpiration} placeholder="YYYY-MM-DD or MM/YYYY" error={dateInvalid ? 'Enter a real printed date, or leave it blank if unknown.' : null} hint="Unknown dates stay unknown. Month-only labels use the first of the month for review." />
      <View className="gap-2">
        <Text variant="label" className="font-bold">Condition for the units you add</Text>
        <View className="flex-row flex-wrap gap-2">{(Object.keys(CONDITION_LABELS) as Condition[]).map(value => <Chip key={value} label={CONDITION_LABELS[value]} selected={condition === value} onPress={() => setCondition(value)} />)}</View>
        {condition !== 'ok' && <Text variant="micro" tone="critical">These units will be held out of boxes for inspection.</Text>}
      </View>
      </View>}
      {parsedPhrase && <Button
        label={parsedPhrase.needsPackSize ? 'Enter units per case above' : `Add ${parsedPhrase.count} ${parsedPhrase.count === 1 ? 'unit' : 'units'}`}
        accessibilityLabel={`Add ${parsedPhrase.count} ${parsedPhrase.name}`}
        block loading={busyId === 'phrase-' + parsedPhrase.count}
        disabled={!!busyId || dateInvalid || parsedPhrase.needsPackSize}
        onPress={handlePhraseSubmit}
      />}
      {/* Toast Banner */}
      {toastMessage && (
        <View
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: toastError ? COLORS.surfaceContainer : COLORS.secondaryTint, borderColor: toastError ? COLORS.statusCritical : COLORS.secondaryDark }}
          className="flex-row items-center gap-2 rounded-lg border p-3"
        >
          <MaterialCommunityIcons
            name={toastError ? "alert-circle-outline" : "check-circle"}
            size={20}
            color={toastError ? COLORS.statusCritical : COLORS.secondaryDark}
          />
          <Text
            variant="label"
            className="flex-1 font-semibold"
            style={{ color: toastError ? COLORS.statusCritical : COLORS.secondaryDark }}
          >
            {toastMessage}
          </Text>
        </View>
      )}

      {shelfItems.length > 0 && (
        <Segmented
          value={tab}
          options={[
            { value: "staples", label: "Common items" },
            { value: "shelves", label: `On your shelves (${shelfItems.length})` },
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
          const currentStock = inventory.filter(i => i.name.toLowerCase().trim() === staple.name.toLowerCase().trim()).reduce((sum, item) => sum + item.count, 0);
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
                  const label = `+${pack}`;

                  return (
                    <View key={pack} className="flex-1">
                      <Button label={label} variant="secondary" size="compact" block
                        className="px-1" loading={isBusy}
                        disabled={!!busyId || dateInvalid}
                        accessibilityLabel={`Add ${pack} units of ${staple.name}`}
                        onPress={() => handleQuickAdd(staple, pack)} />
                    </View>
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
