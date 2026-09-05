import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../../constants/theme";
import { computeAllocation } from "../../lib/allocation";
import { AnimatedCounter, FadeInUp } from "../../components/motion";
import {
  Button,
  Card,
  CategoryIcon,
  Chip,
  Screen,
  Sheet,
  Stepper,
  Text,
} from "../../components/ui";
import { cuePress } from "../../lib/feedback";
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
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings } = usePantryStore();

  const [requestedBoxes, setRequestedBoxes] = useState(12);
  const [familySize, setFamilySize] = useState(settings.defaultFamilySize || 4);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const plan = computeAllocation(
    inventory,
    boxRules,
    requestedBoxes,
    familySize,
    bulkLots,
  );

  const categories = Object.keys(boxRules) as (keyof BoxRules)[];
  const isShort = plan.achievableBoxes < requestedBoxes;
  const canPack = plan.achievableBoxes > 0;

  return (
    <>
      <Screen>
        {/* The answer. */}
        <FadeInUp index={0}>
          <View
            className="overflow-hidden rounded-lg"
            style={{
              borderBottomWidth: 6,
              borderBottomColor: COLORS.primaryDeep,
              shadowColor: COLORS.shadow,
              shadowOpacity: 0.18,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 5 },
              elevation: 4,
            }}
          >
            <LinearGradient
              colors={["#B0512F", "#9C4226"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View className="p-card">
              <Text variant="label" className="text-ink-on/70">
                You can pack right now
              </Text>

              <View className="mt-1 flex-row items-baseline gap-2">
                <AnimatedCounter
                  value={plan.achievableBoxes}
                  style={{
                    fontSize: 60,
                    fontWeight: "800",
                    color: COLORS.textOnPrimary,
                    letterSpacing: -2,
                  }}
                />
                <Text variant="title" className="text-ink-on">
                  {plan.achievableBoxes === 1 ? "box" : "boxes"}
                </Text>
              </View>

              <View className="my-4 h-px bg-white/20" />

              <Pressable
                onPress={() => setBreakdownOpen(true)}
                className="flex-row items-center justify-between gap-3"
              >
                <Text variant="label" className="flex-1 text-ink-on/85">
                  {isShort ? (
                    <>
                      <Text
                        variant="label"
                        className="font-bold capitalize text-ink-on"
                      >
                        {plan.limitingCategory}
                      </Text>{" "}
                      runs out first — short {
                        plan.shortfallPerCategory[plan.limitingCategory]
                      } for {requestedBoxes}
                    </>
                  ) : (
                    `Enough of everything for ${requestedBoxes}`
                  )}
                </Text>
                <View className="flex-row items-center gap-1 rounded-full bg-white/15 px-3 py-2">
                  <Text variant="micro" className="font-bold text-ink-on">
                    Why
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={14}
                    color={COLORS.textOnPrimary}
                  />
                </View>
              </Pressable>
            </View>
          </View>
        </FadeInUp>

        {/* Two knobs, plainly labelled as questions. */}
        <FadeInUp index={1}>
          <Card className="gap-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="body" className="flex-1">
                How many boxes do you need?
              </Text>
              <Stepper
                value={requestedBoxes}
                min={1}
                max={200}
                onChange={setRequestedBoxes}
              />
            </View>

            <View className="gap-2">
              <Text variant="body">How big are the families?</Text>
              <View className="flex-row gap-2">
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
          </Card>
        </FadeInUp>

        {/* One action. */}
        <FadeInUp index={2}>
          <View className="gap-3">
            <Button
              label={
                canPack
                  ? `Pack ${plan.achievableBoxes} ${plan.achievableBoxes === 1 ? "box" : "boxes"}`
                  : "Nothing to pack yet"
              }
              block
              disabled={!canPack}
              icon={
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={19}
                  color={COLORS.textOnPrimary}
                />
              }
              onPress={() => {
                cuePress();
                router.push({
                  pathname: "/packing-checklist",
                  params: { targetBoxes: requestedBoxes, familySize },
                });
              }}
            />

            {isShort && (
              <Button
                label="Ask donors for what's short"
                variant="secondary"
                size="compact"
                onPress={() => router.push("/(tabs)/needs")}
              />
            )}
          </View>
        </FadeInUp>

        {!canPack && (
          <FadeInUp index={3}>
            <Text variant="label" tone="soft" className="px-1">
              A box needs every category the recipe calls for. Add stock, or
              lower the per-box amounts in pantry settings.
            </Text>
          </FadeInUp>
        )}
      </Screen>

      {/* The arithmetic, out of the way until asked for. */}
      <Sheet
        visible={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        title="What's in a box"
        subtitle={`Per box for a family of ${familySize}, against ${requestedBoxes} boxes`}
      >
        {categories.map((cat) => {
          const perBox = plan.perBoxNeeds[cat];
          if (perBox === 0) return null;

          const stock = plan.categoryTotals[cat];
          const short = plan.shortfallPerCategory[cat];
          const limiting = cat === plan.limitingCategory && short > 0;

          return (
            <View
              key={String(cat)}
              className="flex-row items-center gap-3 rounded-md bg-card px-4 py-3"
              style={{
                borderWidth: 1.5,
                borderColor: limiting ? COLORS.statusCritical : COLORS.borderSoft,
              }}
            >
              <CategoryIcon
                category={String(cat)}
                tone={limiting ? "critical" : "brand"}
              />
              <View className="flex-1">
                <Text variant="body" className="font-semibold capitalize">
                  {String(cat)}
                </Text>
                <Text variant="micro" tone="soft" className="mt-0.5">
                  {perBox} per box · {stock} in stock
                </Text>
              </View>
              {short > 0 ? (
                <Text variant="label" tone="critical" className="font-bold">
                  {short} short
                </Text>
              ) : (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color={COLORS.statusGood}
                />
              )}
            </View>
          );
        })}

        <Text variant="micro" tone="soft" className="px-1 pt-1">
          Damaged stock and anything past its date is left out of these totals.
        </Text>
      </Sheet>
    </>
  );
}
