import { ReadyBoxesContent } from "../../components/ready-boxes-content";
import { ResponsiveRow } from "../../components/ui/responsive-row";
import { useAppAppearance } from "../../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { COLORS, fw } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { useDismissible } from "../../lib/dismissals";
import {
  DIET_TAG_LABELS,
  EXCLUSION_CAVEAT,
  type DietTag,
} from "../../lib/diet";
import { BOX_PRESETS, describeRules } from "../../lib/box-presets";
import { BoxPicker, type BoxSelection } from "../../components/box-picker";
import {
  AnimatedCounter,
  FadeInUp,
  PRESS_SCALE_ROW,
  ProgressBar,
  Tappable,
} from "../../components/motion";
import {
  Button,
  Card,
  CategoryIcon,
  Chip,
  Panel,
  Screen,
  Segmented,
  Sheet,
  Stepper,
  Text,
} from "../../components/ui";
import { cuePress, cueTap } from "../../lib/feedback";
import { BoxRules, usePantryStore } from "../../lib/store";

/**
 * Building family boxes.
 *
 * The old version opened on a configuration card, then a result badge reading
 * "7 / 12", then a seven-row table of per-category stock versus requirement —
 * three things competing before you knew what any of them meant.
 *
 * It answers one question now: HOW MANY BOXES CAN WE PACK RIGHT NOW. That is
 * the number at the top and the thing the button acts on. The arithmetic behind
 * it — what each category needs, what is short — is one tap away in a sheet,
 * because it explains the answer rather than being the answer.
 */
export default function BuildBoxesScreen() {
  useAppAppearance((state) => state.scheme);
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<"plan" | "ready">("plan");
  useEffect(() => {
    if (params.section === "ready") {
      setSection("ready");
      router.setParams({ section: undefined });
    }
  }, [params.section, router]);
  const { inventory, bulkLots, boxRules, boxTemplates, readyBoxes, settings } =
    usePantryStore();
  const readyCount = readyBoxes.reduce(
    (sum, r) => sum + (r.boxes - r.boxes_collected),
    0,
  );

  const [requestedBoxes, setRequestedBoxes] = useState(settings.boxTarget);
  // Build is a tab, so it mounts before the pantry has loaded and seeds itself
  // from the default. `touched` is what keeps the arriving setting from
  // yanking the number out from under somebody already adjusting it.
  const touchedBoxes = useRef(false);
  useEffect(() => {
    if (!touchedBoxes.current) setRequestedBoxes(settings.boxTarget);
  }, [settings.boxTarget]);
  const [familySize, setFamilySize] = useState(settings.defaultFamilySize || 4);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * The box being built. `null` means "the pantry default". That's resolved
   * on every render rather than copied into state, so a default changed on
   * another phone shows up here, and a deleted box falls back to the default
   * instead of leaving Build pointing at nothing.
   */
  const [selection, setSelection] = useState<BoxSelection | null>(null);

  const box = (() => {
    if (selection?.kind === "template") {
      const t = boxTemplates.find((x) => x.id === selection.id);
      if (t) {
        return {
          key: `template:${t.id}`,
          name: t.name,
          rules: t.rules,
          scales: t.scales_with_family,
          excludes: t.excludes_tags,
          requires: t.requires_tags,
        };
      }
    }
    if (selection?.kind === "preset") {
      const p = BOX_PRESETS.find((x) => x.key === selection.key);
      if (p) {
        return {
          key: `preset:${p.key}`,
          name: p.name,
          rules: p.rules,
          scales: p.scalesWithFamily,
          excludes: p.excludesTags ?? [],
          requires: p.requiresTags ?? [],
        };
      }
    }
    const fallback = boxTemplates.find((t) => t.is_default);
    return fallback
      ? {
          key: `template:${fallback.id}`,
          name: fallback.name,
          rules: fallback.rules,
          scales: fallback.scales_with_family,
          excludes: fallback.excludes_tags,
          requires: fallback.requires_tags,
        }
      : {
          key: "pantry-default",
          name: "Standard family box",
          rules: boxRules,
          scales: true,
          excludes: [] as DietTag[],
          requires: [] as DietTag[],
        };
  })();

  // A box that doesn't scale is sized for the base family of 4, which the
  // allocator treats as "use the amounts exactly as written".
  const packingFamilySize = box.scales ? familySize : 4;

  const plan = computeAllocation(
    inventory,
    box.rules,
    requestedBoxes,
    packingFamilySize,
    bulkLots,
    {
      warningDays: settings.expirationWarningDays,
      // This box's dietary rules, so the headline figure counts only what can
      // actually go in it. A wheat-free box that claimed twelve were possible
      // using bread would be worse than no figure at all.
      excludes: box.excludes,
      requires: box.requires,
    },
  );
  // Closable; it returns when the held-back stock changes. The same items are
  // on the Notifications page (the bell).
  const [heldBackVisible, dismissHeldBack] = useDismissible(
    `build-held-back.${settings.pantryId ?? "none"}`,
    `${plan.excluded.pastDate.units}-${plan.excluded.flagged.units}`,
  );

  const categories = Object.keys(box.rules) as (keyof BoxRules)[];
  const isShort = plan.achievableBoxes < requestedBoxes;
  const canPack = plan.achievableBoxes > 0;

  const startPacking = () => {
    cuePress();
    router.push({
      pathname: "/packing-checklist",
      // The rules travel with the route: a preset used once was never saved
      // anywhere for the checklist to look up.
      params: {
        targetBoxes: requestedBoxes,
        familySize: packingFamilySize,
        rules: JSON.stringify(box.rules),
        boxName: box.name,
        scales: box.scales ? "1" : "0",
        // Carried through, or the pick list would recompute without them and
        // hand a volunteer bread to put in a wheat-free box.
        excludes: box.excludes.join(","),
        requires: box.requires.join(","),
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <View className="px-gutter pt-3 pb-1">
        <Segmented
          value={section}
          options={[
            { value: "plan", label: "Plan boxes" },
            {
              value: "ready",
              label:
                readyCount > 0 ? `Ready to go (${readyCount})` : "Ready to go",
            },
          ]}
          onChange={setSection}
        />
      </View>
      {section === "plan" ? (
        <Screen>
          {/* What's being packed, then how many and for whom. */}
          <FadeInUp index={1}>
            <Card className="gap-4">
              <Tappable
                onPress={() => {
                  cueTap();
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Box: ${box.name}. Tap to change.`}
                className="min-h-[52px] flex-row items-center gap-3"
              >
                <View className="h-11 w-11 items-center justify-center rounded-md bg-secondary-tint">
                  <MaterialCommunityIcons
                    name="package-variant-closed"
                    size={22}
                    color={COLORS.secondaryDark}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    variant="title"
                    accessibilityRole="header"
                    style={{
                      fontSize: 21,
                      lineHeight: 26,
                      fontWeight: fw("700"),
                      letterSpacing: -0.25,
                    }}
                  >
                    {box.name}
                  </Text>
                </View>
                <Text variant="label" tone="brand" className="font-bold">
                  Change
                </Text>
              </Tappable>

              {box.scales ? (
                <View className="gap-2">
                  <Text variant="body" className="font-semibold">
                    How big are the families?
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[2, 4, 6].map((size) => (
                      <Chip
                        key={size}
                        label={`${size} people`}
                        selected={familySize === size}
                        onPress={() => setFamilySize(size)}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <Text variant="micro" tone="soft">
                  This box doesn&apos;t scale: every household gets the same
                  amounts.
                </Text>
              )}
              <ResponsiveRow className="flex-row items-center justify-between gap-3">
                <Text variant="body" className="flex-1 font-semibold">
                  How many boxes do you need?
                </Text>
                <Stepper
                  value={requestedBoxes}
                  min={1}
                  max={200}
                  onChange={(next) => {
                    touchedBoxes.current = true;
                    setRequestedBoxes(next);
                  }}
                />
              </ResponsiveRow>
            </Card>
          </FadeInUp>

          {/* The answer. */}
          <FadeInUp index={0}>
            <View
              className="overflow-hidden rounded-lg bg-card"
              // A soft warm lift. The old 6px bottom lip rendered as a separate
              // dark band under the card on Android.
              style={{ borderWidth: 1, borderColor: COLORS.borderSoft }}
            >
              <View className="p-card">
                <Text
                  variant="label"
                  tone="default"
                  className="font-semibold"
                  style={{ opacity: 0.9 }}
                >
                  You can pack right now
                </Text>

                <View className="mt-1 flex-row items-baseline gap-2">
                  <AnimatedCounter
                    value={plan.achievableBoxes}
                    style={{
                      fontSize: 60,
                      fontWeight: fw("700"),
                      color: COLORS.textPrimary,
                      letterSpacing: -2,
                    }}
                  />
                  <Text variant="title" className="text-ink">
                    {plan.achievableBoxes === 1 ? "box" : "boxes"}
                  </Text>
                </View>

                <View className="my-4 h-px bg-hairline" />

                <Tappable
                  scaleTo={PRESS_SCALE_ROW}
                  onPress={() => {
                    cueTap();
                    setBreakdownOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View details: food needed and available for these boxes"
                  className="min-h-[48px] flex-row items-center justify-between gap-3"
                >
                  <Text
                    variant="label"
                    tone="default"
                    className="flex-1"
                    style={{ opacity: 0.92 }}
                  >
                    {isShort ? (
                      <>
                        <Text
                          variant="label"
                          className="font-bold capitalize text-ink"
                        >
                          {plan.limitingCategory}
                        </Text>{" "}
                        runs out first — short{" "}
                        {plan.shortfallPerCategory[plan.limitingCategory]} for{" "}
                        {requestedBoxes}
                      </>
                    ) : (
                      `Enough of everything for ${requestedBoxes}`
                    )}
                  </Text>
                  <View className="min-h-[40px] flex-row items-center gap-1 rounded-md bg-subtle px-3.5 py-2">
                    <Text variant="label" className="font-bold text-ink">
                      View details
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={16}
                      color={COLORS.textPrimary}
                    />
                  </View>
                </Tappable>

                {/* The action lives with the answer it acts on. White on the
                  orange so it's the one thing the eye lands on next. */}
                <Button
                  label={
                    canPack
                      ? `Pack ${plan.achievableBoxes} ${plan.achievableBoxes === 1 ? "box" : "boxes"}`
                      : "Nothing to pack yet"
                  }
                  disabled={!canPack}
                  block
                  onPress={startPacking}
                  className="mt-4"
                />
              </View>
            </View>
          </FadeInUp>

          {/* Stock a volunteer can see on the shelf but the plan will not use.
            Left unsaid, this reads as the engine being broken — the shelf has
            twelve tins of beans and Build insists it has none. */}
          {/* Food this BOX cannot take, as opposed to food nothing can. Separate
            panel and separate sentence: nothing is wrong with it, it just is not
            for this household, and conflating the two would read as waste. */}
          {plan.excluded.dietary.units > 0 && (
            <FadeInUp index={1}>
              <Panel className="flex-row gap-3">
                <MaterialCommunityIcons
                  name="shield-alert-outline"
                  size={18}
                  color={COLORS.statusWarning}
                />
                <View className="flex-1 gap-1">
                  <Text variant="micro" tone="soft">
                    <Text variant="micro" className="font-bold">
                      {plan.excluded.dietary.units} good unit
                      {plan.excluded.dietary.units === 1 ? "" : "s"} held back
                      by this box&apos;s rules.
                    </Text>{" "}
                    {box.requires.length > 0
                      ? `Only food recorded as ${box.requires
                          .map((t) => DIET_TAG_LABELS[t].toLowerCase())
                          .join(
                            " and ",
                          )} can go in, and anything untagged does not qualify.`
                      : `Anything known to contain ${box.excludes
                          .map((t) => DIET_TAG_LABELS[t].toLowerCase())
                          .join(" or ")} is left out.`}
                  </Text>
                  {box.excludes.length > 0 && (
                    <Text variant="micro" tone="soft">
                      {EXCLUSION_CAVEAT}
                    </Text>
                  )}
                </View>
              </Panel>
            </FadeInUp>
          )}

          {(plan.excluded.pastDate.units > 0 ||
            plan.excluded.flagged.units > 0) &&
            heldBackVisible && (
              <FadeInUp index={1}>
                <Panel className="flex-row gap-3">
                  <MaterialCommunityIcons
                    name="alert-outline"
                    size={18}
                    color={COLORS.statusWarning}
                  />
                  <View className="flex-1 gap-1">
                    <Text variant="micro" tone="soft">
                      {[
                        plan.excluded.pastDate.units > 0
                          ? `${plan.excluded.pastDate.units} unit${
                              plan.excluded.pastDate.units === 1 ? "" : "s"
                            } past their date`
                          : "",
                        plan.excluded.flagged.units > 0
                          ? `${plan.excluded.flagged.units} unit${
                              plan.excluded.flagged.units === 1 ? "" : "s"
                            } flagged for inspection`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" and ")}{" "}
                      {plan.excluded.pastDate.units +
                        plan.excluded.flagged.units ===
                      1
                        ? "is"
                        : "are"}{" "}
                      on the shelf but left out of this plan.
                    </Text>
                    <Tappable
                      onPress={() => router.push("/expiring-soon")}
                      accessibilityRole="button"
                      className="min-h-[44px] justify-center self-start py-1"
                    >
                      <Text variant="label" tone="brand" className="font-bold">
                        See them in Notifications →
                      </Text>
                    </Tappable>
                  </View>
                  <Tappable
                    onPress={() => {
                      cueTap();
                      dismissHeldBack();
                    }}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss. It stays on the Notifications page."
                    className="-mr-1 -mt-1 h-8 w-8 items-center justify-center"
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={18}
                      color={COLORS.textSecondary}
                    />
                  </Tappable>
                </Panel>
              </FadeInUp>
            )}

          {isShort && (
            <Button
              label="Ask donors for what's short"
              variant="secondary"
              size="compact"
              onPress={() => router.push("/(tabs)/needs")}
            />
          )}

          {!canPack && (
            <FadeInUp index={4}>
              <Text variant="label" tone="soft" className="px-1">
                A box needs every category it calls for. Add stock, or choose a
                smaller box.
              </Text>
            </FadeInUp>
          )}
          <Text variant="micro" tone="soft" className="px-1">
            Plan a balanced mix from your inventory. Changes here apply to this
            packing session; Needs uses your saved pantry defaults.
          </Text>
        </Screen>
      ) : (
        <ReadyBoxesContent onPlan={() => setSection("plan")} />
      )}

      {/* The arithmetic, out of the way until asked for. */}
      <Sheet
        visible={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        title="What's in a box"
        subtitle={`${box.name}: per box${box.scales ? ` for a family of ${familySize}` : ""}, against ${requestedBoxes} boxes`}
      >
        {categories.map((cat) => {
          const perBox = plan.perBoxNeeds[cat];
          if (perBox === 0) return null;

          const stock = plan.categoryTotals[cat];
          const neededTotal = perBox * requestedBoxes;
          const short = plan.shortfallPerCategory[cat];
          const limiting = cat === plan.limitingCategory && short > 0;

          return (
            <View
              key={String(cat)}
              className="gap-2 rounded-md bg-card px-4 py-3"
              style={{
                borderWidth: 1.5,
                borderColor: limiting
                  ? COLORS.statusCritical
                  : COLORS.borderSoft,
              }}
            >
              <View className="flex-row items-center gap-3">
                <CategoryIcon
                  category={String(cat)}
                  tone={limiting ? "critical" : "secondary"}
                />
                <View className="flex-1">
                  <Text variant="body" className="font-semibold capitalize">
                    {String(cat)}
                  </Text>
                  <Text variant="micro" tone="soft" className="mt-0.5">
                    {perBox} per box · {stock} of {neededTotal} needed in stock
                  </Text>
                </View>
                {short > 0 ? (
                  <Text variant="label" tone="critical" className="font-bold">
                    {short} short
                  </Text>
                ) : (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={22}
                    color={COLORS.statusGood}
                  />
                )}
              </View>
              <ProgressBar
                progress={
                  neededTotal > 0 ? Math.min(1, stock / neededTotal) : 1
                }
                color={
                  short > 0
                    ? limiting
                      ? COLORS.statusCritical
                      : COLORS.statusWarning
                    : COLORS.statusGood
                }
                height={6}
              />
            </View>
          );
        })}

        <Text variant="micro" tone="soft" className="px-1 pt-1">
          Damaged stock and anything past its date is left out of these totals.
        </Text>
      </Sheet>

      <BoxPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedKey={box.key}
        onSelect={setSelection}
      />
    </View>
  );
}
