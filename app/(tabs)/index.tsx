import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COLORS, RULE_ABOVE_FAINT } from '../../constants/theme';
import { AnimatedCounter, FadeInUp, ProgressBar } from '../../components/motion';
import { Badge, Card, CategoryIcon, Screen, Text } from '../../components/ui';
import { buildStockUnits, computeAllocation } from '../../lib/allocation';
import { isPastDate, todayISO, windowEndISO } from '../../lib/expiry';
import { InventoryItem, isUsableCondition, usePantryStore } from '../../lib/store';
import { cuePress, cueTap } from '../../lib/feedback';
import { QuickAddStaplesModal } from '../../components/quick-add-staples';

const CATEGORY_LABELS: Record<string, string> = {
  protein: 'Protein',
  grain: 'Grains & Pasta',
  vegetable: 'Vegetables',
  breakfast: 'Breakfast',
  snack: 'Snacks',
  baby: 'Baby Needs',
  hygiene: 'Hygiene',
};

function formatActivityTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardScreen() {
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings, activities, thresholds, readyBoxes } =
    usePantryStore();
  const [staplesModalVisible, setStaplesModalVisible] = useState(false);

  const readyCount = readyBoxes.reduce((sum, r) => sum + (r.boxes - r.boxes_collected), 0);
  const targetBoxes = settings.boxTarget || 12;
  const familySize = settings.defaultFamilySize || 4;

  const givable = useMemo(() => buildStockUnits(inventory, bulkLots), [inventory, bulkLots]);
  const totalStockCount = useMemo(
    () => givable.reduce((sum: number, i: InventoryItem) => sum + i.count, 0),
    [givable],
  );

  const plan = useMemo(
    () =>
      computeAllocation(inventory, boxRules, targetBoxes, familySize, bulkLots, {
        warningDays: settings.expirationWarningDays,
      }),
    [inventory, boxRules, targetBoxes, familySize, bulkLots, settings.expirationWarningDays],
  );

  // Matches AppHeader and app/expiring-soon.tsx so the numbers never disagree.
  const today = todayISO();
  const warningStr = windowEndISO(settings.expirationWarningDays);
  const allExpiringOrPast = useMemo(
    () => inventory.filter((i: InventoryItem) => i.count > 0 && !!i.expiration && i.expiration <= warningStr),
    [inventory, warningStr],
  );
  const usableSoonItems = useMemo(
    () =>
      allExpiringOrPast.filter(
        (i: InventoryItem) => isUsableCondition(i.condition) && !isPastDate(i.expiration, today),
      ),
    [allExpiringOrPast, today],
  );
  const pastDateItems = useMemo(
    () => allExpiringOrPast.filter((i: InventoryItem) => isPastDate(i.expiration, today)),
    [allExpiringOrPast, today],
  );
  const expiringUnitCount = useMemo(
    () => allExpiringOrPast.reduce((sum: number, item: InventoryItem) => sum + item.count, 0),
    [allExpiringOrPast],
  );

  const lowCategories = useMemo(() => {
    return Object.keys(thresholds)
      .map((cat: string) => {
        const total = plan.categoryTotals[cat as keyof typeof plan.categoryTotals] ?? 0;
        const threshold = (thresholds as any)[cat] ?? 0;
        const neededForBoxes = (plan.shortfallPerCategory as Record<string, number>)[cat] ?? 0;
        const neededTotal = ((plan.perBoxNeeds as Record<string, number>)[cat] ?? 0) * targetBoxes;
        const deficit = Math.max(threshold - total, neededForBoxes);
        const isLimiting = plan.limitingCategory === cat && plan.achievableBoxes < targetBoxes;
        return {
          category: cat,
          label: CATEGORY_LABELS[cat] ?? cat,
          current: total,
          threshold: Math.max(threshold, neededTotal),
          deficit,
          isLimiting,
        };
      })
      .filter((item) => item.deficit > 0)
      .sort((a, b) => {
        if (a.isLimiting !== b.isLimiting) return a.isLimiting ? -1 : 1;
        return b.deficit - a.deficit;
      });
  }, [thresholds, plan, targetBoxes]);

  return (
    <Screen contentContainerClassName="gap-5">
      {/* ZONE 1: Unified Intake & Shelf Tools — everything a volunteer does when food arrives */}
      <FadeInUp index={0}>
        <View className="gap-3">
          {/* Primary Hero CTA: Scan Donations */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan donations. Take photos or scan barcodes to add food."
            onPress={() => {
              cuePress();
              router.push('/log-donation');
            }}
            style={({ pressed }) => ({
              borderBottomWidth: pressed ? 2 : 6,
              borderBottomColor: COLORS.primaryDeep,
              transform: [{ translateY: pressed ? 3 : 0 }],
              shadowColor: COLORS.shadow,
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            })}
            className="min-h-[82px] overflow-hidden rounded-xl"
          >
            <LinearGradient
              colors={['#B0512F', '#9C4226']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View className="flex-row items-center justify-between px-5 py-4">
              <View className="flex-1 flex-row items-center gap-4">
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-white/20">
                  <MaterialCommunityIcons name="camera-outline" size={28} color={COLORS.textOnPrimary} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="title" tone="on" className="font-bold">
                    Scan Donations
                  </Text>
                  <Text variant="label" tone="on" style={{ opacity: 0.92 }}>
                    Point camera at cans, boxes, or barcodes
                  </Text>
                </View>
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                <MaterialCommunityIcons name="arrow-right" size={24} color={COLORS.textOnPrimary} />
              </View>
            </View>
          </Pressable>

          {/* Secondary 1-Tap Accelerator: Quick Add Staples */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quick Add any item or choose a common item"
            onPress={() => {
              cueTap();
              setStaplesModalVisible(true);
            }}
            style={({ pressed }) => ({
              borderBottomWidth: pressed ? 1 : 3,
              borderBottomColor: COLORS.borderStrong,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
            className="min-h-[64px] flex-row items-center justify-between rounded-xl border border-hairline bg-card p-4"
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                <MaterialCommunityIcons name="lightning-bolt" size={24} color={COLORS.secondaryDark} />
              </View>
              <View className="flex-1">
                <Text variant="heading" className="font-bold">
                  Quick Add
                </Text>
                <Text variant="label" tone="soft">
                  Type any item or choose a common item
                </Text>
              </View>
            </View>
            <View className="rounded-md border border-hairline bg-subtle px-3 py-2">
              <Text variant="label" tone="brand" className="font-bold">
                Open →
              </Text>
            </View>
          </Pressable>

          {/* Unified Intake Pair: Weigh Deliveries & Count Shelves */}
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Weigh Bulk Deliveries. Large grocery and crate drops."
              onPress={() => {
                cueTap();
                router.push('/bulk-intake');
              }}
              style={({ pressed }) => ({
                borderBottomWidth: pressed ? 1 : 3,
                borderBottomColor: COLORS.borderStrong,
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
              className="flex-1 rounded-xl border border-hairline bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                  <MaterialCommunityIcons name="scale" size={24} color={COLORS.secondaryDark} />
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
              </View>
              <Text variant="heading" className="mt-2.5 font-bold">
                Weigh Drop
              </Text>
              <Text variant="label" tone="soft" className="mt-0.5">
                Crates &amp; pallets by lb
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check shelf inventory. Compare physical counts with the app."
              onPress={() => {
                cueTap();
                router.push('/shelf-audit');
              }}
              style={({ pressed }) => ({
                borderBottomWidth: pressed ? 1 : 3,
                borderBottomColor: COLORS.borderStrong,
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
              className="flex-1 rounded-xl border border-hairline bg-card p-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                  <MaterialCommunityIcons
                    name="clipboard-check-outline"
                    size={24}
                    color={COLORS.secondaryDark}
                  />
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
              </View>
              <Text variant="heading" className="mt-2.5 font-bold">
                Check a shelf
              </Text>
              <Text variant="label" tone="soft" className="mt-0.5">
                Correct existing stock
              </Text>
            </Pressable>
          </View>
        </View>
      </FadeInUp>

      {/* ZONE 2: Today's Pantry Status — Boxes & Shelf Triage */}
      <FadeInUp index={1}>
        <View className="gap-3.5">
          <View className="flex-row items-center justify-between px-1">
            <Text variant="heading" className="font-bold">
              Today&apos;s Pantry Status
            </Text>
            <Text variant="micro" tone="soft" className="font-semibold">
              Goal: {targetBoxes} family boxes
            </Text>
          </View>

          {/* Box Readiness & Handout Card */}
          <Card className="gap-3.5 p-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${plan.achievableBoxes} of ${targetBoxes} boxes can be packed right now. Tap to open box builder.`}
              onPress={() => {
                cueTap();
                router.push('/(tabs)/build');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              className="gap-2.5"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text variant="heading" className="font-bold">
                  Boxes You Can Pack Now
                </Text>
                <Text variant="label" tone="brand" className="font-bold">
                  Pack Boxes →
                </Text>
              </View>

              <View className="flex-row items-baseline gap-2">
                <AnimatedCounter
                  value={plan.achievableBoxes}
                  style={{
                    fontSize: 34,
                    lineHeight: 40,
                    fontWeight: '800',
                    color: COLORS.textPrimary,
                  }}
                />
                <Text variant="heading" tone="soft">
                  of {targetBoxes} box goal
                </Text>
              </View>

              <ProgressBar
                progress={Math.min(1, plan.achievableBoxes / Math.max(1, targetBoxes))}
                color={plan.achievableBoxes >= targetBoxes ? COLORS.statusGood : COLORS.secondary}
                height={8}
              />

              <Text variant="label" tone="soft">
                {plan.limitingCategory && plan.achievableBoxes < targetBoxes
                  ? `${CATEGORY_LABELS[plan.limitingCategory] ?? plan.limitingCategory} runs out first — short ${
                      plan.shortfallPerCategory[plan.limitingCategory]
                    } units for ${targetBoxes} boxes.`
                  : `Shelves hold enough balanced food for all ${targetBoxes} boxes.`}
              </Text>
            </Pressable>

            {readyCount > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${readyCount} packed boxes waiting for families to pick up. Tap to hand out.`}
                onPress={() => {
                  cueTap();
                  router.push('/ready-boxes');
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                className="min-h-[52px] flex-row items-center justify-between gap-3 rounded-lg bg-secondary-tint px-3.5 py-3"
              >
                <View className="flex-1 flex-row items-center gap-2.5">
                  <MaterialCommunityIcons
                    name="package-variant-closed-check"
                    size={22}
                    color={COLORS.secondaryDark}
                  />
                  <Text variant="label" className="flex-1 font-bold" style={{ color: COLORS.secondaryDark }}>
                    {readyCount} packed {readyCount === 1 ? 'box' : 'boxes'} waiting for pickup
                  </Text>
                </View>
                <Text variant="label" className="font-bold" style={{ color: COLORS.secondaryDark }}>
                  Hand out →
                </Text>
              </Pressable>
            )}
          </Card>

          {/* Shelves & Expiration Triage Card */}
          <Card className="gap-3 p-5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${totalStockCount} usable units on shelves. Tap to view inventory.`}
              onPress={() => {
                cueTap();
                router.push('/(tabs)/inventory');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              className="gap-1.5"
            >
              <View className="flex-row items-center justify-between">
                <Text variant="heading" className="font-bold">
                  On Your Shelves
                </Text>
                <Text variant="label" tone="brand" className="font-bold">
                  View Shelves →
                </Text>
              </View>

              <View className="flex-row items-baseline gap-2">
                <AnimatedCounter
                  value={totalStockCount}
                  style={{
                    fontSize: 34,
                    lineHeight: 40,
                    fontWeight: '800',
                    color: COLORS.textPrimary,
                  }}
                />
                <Text variant="heading" tone="soft">
                  usable units in pantry
                </Text>
              </View>
            </Pressable>

            {allExpiringOrPast.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${allExpiringOrPast.length} items (${expiringUnitCount} units) need date attention. Tap to view.`}
                onPress={() => {
                  cueTap();
                  router.push('/expiring-soon');
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  backgroundColor: pastDateItems.length > 0 ? '#FBEAE8' : '#FFF2DB',
                  borderColor:
                    pastDateItems.length > 0 ? COLORS.statusCritical : COLORS.statusWarning,
                })}
                className="min-h-[52px] flex-row items-center justify-between gap-2.5 rounded-lg border px-3.5 py-3"
              >
                <View className="flex-1 flex-row items-center gap-2.5">
                  <MaterialCommunityIcons
                    name="clock-alert-outline"
                    size={22}
                    color={pastDateItems.length > 0 ? COLORS.statusCritical : '#80500E'}
                  />
                  <Text
                    variant="label"
                    className="flex-1 font-bold"
                    style={{
                      color: pastDateItems.length > 0 ? COLORS.statusCritical : '#80500E',
                    }}
                  >
                    {pastDateItems.length > 0 && usableSoonItems.length > 0
                      ? `${usableSoonItems.length} expiring soon · ${pastDateItems.length} past date`
                      : pastDateItems.length > 0
                        ? `${pastDateItems.length} ${pastDateItems.length === 1 ? 'item' : 'items'} past expiration date`
                        : `${usableSoonItems.length} ${usableSoonItems.length === 1 ? 'item' : 'items'} (${expiringUnitCount} units) to pack first`}
                  </Text>
                </View>
                <Text
                  variant="micro"
                  className="font-bold"
                  style={{
                    color: pastDateItems.length > 0 ? COLORS.statusCritical : '#80500E',
                  }}
                >
                  Review →
                </Text>
              </Pressable>
            ) : (
              <Text variant="label" tone="soft">
                All shelf stock is well within your {settings.expirationWarningDays}-day window.
              </Text>
            )}
          </Card>
        </View>
      </FadeInUp>

      {/* ZONE 3: Shortages Triage ("Items Running Low") */}
      {lowCategories.length > 0 && (
        <FadeInUp index={2}>
          <Card className="gap-3.5 p-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={24}
                  color={COLORS.statusCritical}
                />
                <Text variant="heading" className="font-bold">
                  Items Running Low
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  cueTap();
                  router.push('/(tabs)/needs');
                }}
                hitSlop={8}
                className="min-h-[48px] justify-center py-1"
              >
                <Text variant="label" tone="brand" className="font-bold">
                  Ask Donors →
                </Text>
              </Pressable>
            </View>

            <Text variant="body" tone="soft">
              Shortages for your {targetBoxes}-box goal:
            </Text>

            <View className="gap-2.5">
              {lowCategories.slice(0, 3).map((item) => (
                <Pressable
                  key={item.category}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}: need ${item.deficit} more. Tap to ask donors.`}
                  onPress={() => {
                    cueTap();
                    router.push('/(tabs)/needs');
                  }}
                  className="min-h-[60px] flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-3.5"
                >
                  <View className="flex-1 flex-row items-center gap-3 pr-2">
                    <CategoryIcon
                      category={item.category}
                      size="md"
                      shape="square"
                      tone={item.isLimiting ? 'critical' : 'secondary'}
                    />
                    <View className="flex-1">
                      <Text variant="body" className="font-bold">
                        {item.label}
                      </Text>
                      <Text variant="label" tone="soft">
                        {item.isLimiting
                          ? `Stopping boxes · ${item.current} usable on shelf`
                          : `${item.current} of ${item.threshold} goal`}
                      </Text>
                    </View>
                  </View>

                  <Badge label={`Need ${item.deficit}`} tone="critical" />
                </Pressable>
              ))}
            </View>
          </Card>
        </FadeInUp>
      )}

      {/* ZONE 4: Recent Shift Activity & Impact Report Bridge */}
      <FadeInUp index={3}>
        <View className="gap-2.5">
          <View className="flex-row items-center justify-between px-1">
            <Text variant="heading" className="font-bold">
              Recent Shift Activity
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                cueTap();
                router.push('/reports');
              }}
              hitSlop={8}
              className="min-h-[48px] justify-center"
            >
              <Text variant="label" tone="brand" className="font-bold">
                Reports &amp; CSV →
              </Text>
            </Pressable>
          </View>

          <Card className="p-0">
            {activities.length === 0 ? (
              <View className="p-4">
                <Text variant="body" tone="soft">
                  Activity appears here as volunteers scan donations, weigh crates, or pack boxes.
                </Text>
              </View>
            ) : (
              activities.slice(0, 4).map((act, index) => (
                <View
                  key={act.id || index}
                  style={index > 0 ? RULE_ABOVE_FAINT : undefined}
                  className="flex-row items-center gap-3 p-4"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-lg bg-secondary-tint">
                    <MaterialCommunityIcons
                      name={act.icon as any}
                      size={20}
                      color={COLORS.secondaryDark}
                    />
                  </View>
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      {act.text}
                    </Text>
                    <Text variant="label" tone="soft">
                      {formatActivityTime(act.time)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>
      </FadeInUp>

      <QuickAddStaplesModal
        visible={staplesModalVisible}
        onClose={() => setStaplesModalVisible(false)}
      />
    </Screen>
  );
}
