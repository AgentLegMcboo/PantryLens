import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { AnimatedCounter, FadeInUp, PRESS_SCALE, Tappable } from '../../components/motion';
import { Card, cardShadow, Screen, Text, CategoryIcon } from '../../components/ui';
import { buildStockUnits } from '../../lib/allocation';
import { isExpiringSoon } from '../../lib/expiry';
import { InventoryItem, usePantryStore } from '../../lib/store';
import { cuePress, cueTap } from '../../lib/feedback';
import { QuickAddStaplesModal } from '../../components/quick-add-staples';

/**
 * Clean, Accessible Pantry Dashboard.
 *
 * Designed with senior volunteers in mind:
 * 1. High contrast, large text sizes (no tiny 11px micro-copy)
 * 2. Big, easy-to-tap touch targets (52px - 64px)
 * 3. Plain, simple English: no tech jargon (no "dock sensors", "bay cameras", or "bottlenecks")
 * 4. Clean, dignified card design: no artificial pill-shaped cutouts or generic stock photos
 * 5. Clear pantry switching so volunteers can work across different food banks
 */

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
  const { inventory, bulkLots, settings, activities, thresholds, readyBoxes } = usePantryStore();
  const [staplesModalVisible, setStaplesModalVisible] = useState(false);

  const readyCount = readyBoxes.reduce((sum, r) => sum + (r.boxes - r.boxes_collected), 0);
  const targetBoxes = settings.boxTarget || 42;
  const totalStockCount = inventory.reduce((sum: number, i: InventoryItem) => sum + i.count, 0);

  const expiringItems = useMemo(() => {
    return inventory.filter((i: InventoryItem) =>
      isExpiringSoon(i.expiration, settings.expirationWarningDays)
    );
  }, [inventory, settings.expirationWarningDays]);

  const expiringCount = expiringItems.reduce((sum: number, item: InventoryItem) => sum + item.count, 0);

  const givable = buildStockUnits(inventory, bulkLots);
  const lowCategories = useMemo(() => {
    return Object.keys(thresholds)
      .map((cat: string) => {
        const total = givable
          .filter((i: InventoryItem) => i.category === cat)
          .reduce((sum: number, i: InventoryItem) => sum + i.count, 0);
        const threshold = (thresholds as any)[cat];
        return {
          category: cat,
          current: total,
          threshold,
          deficit: Math.max(0, threshold - total),
        };
      })
      .filter((item) => item.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);
  }, [givable, thresholds]);

  return (
    <Screen contentContainerClassName="gap-5">
      {/* 1. Header: Food Bank Identity & Volunteer Greeting */}
      <View className="gap-1.5 pt-1">

        <Text
          style={{
            fontWeight: '800',
            letterSpacing: -0.6,
            fontSize: 28,
            lineHeight: 34,
            color: COLORS.textPrimary,
          }}
        >
          Welcome to your pantry
        </Text>
        <Text variant="body" tone="soft" className="leading-6">
          Here is what is ready today and what needs your help.
        </Text>
      </View>

      {/* 2. Primary Actions: Scan Donations & Quick Add Staples */}
      <FadeInUp index={0}>
        <View className="gap-2.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan donations. Take a photo or scan barcode to add food."
            onPress={() => {
              cuePress();
              router.push('/log-donation');
            }}
            style={({ pressed }) => ({
              ...cardShadow,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? PRESS_SCALE : 1 }],
            })}
            className="min-h-[72px] flex-row items-center justify-between rounded-lg bg-brand p-5"
          >
            <View className="flex-1 flex-row items-center gap-4">
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-white/20">
                <MaterialCommunityIcons name="camera-outline" size={28} color="#FFFFFF" />
              </View>
              <View className="flex-1 gap-0.5">
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>
                  Scan Donations
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.9)' }}>
                  Take photos or scan barcodes to add food
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={28} color="#FFFFFF" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="One-tap quick add common pantry staples without typing"
            onPress={() => {
              cueTap();
              setStaplesModalVisible(true);
            }}
            style={({ pressed }) => ({
              ...cardShadow,
              transform: [{ scale: pressed ? PRESS_SCALE : 1 }],
            })}
            className="flex-row items-center justify-between rounded-lg border border-hairline bg-card p-4"
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                <MaterialCommunityIcons name="lightning-bolt" size={24} color={COLORS.secondaryDark} />
              </View>
              <View className="flex-1">
                <Text variant="body" className="font-bold text-base">
                  One-Tap Quick Add Staples
                </Text>
                <Text variant="label" tone="soft" className="text-xs">
                  Add beans, rice, pasta & soup cases without typing
                </Text>
              </View>
            </View>
            <View className="rounded-md border border-hairline bg-subtle px-3 py-1.5">
              <Text variant="label" tone="brand" className="font-bold text-xs">
                Quick Add →
              </Text>
            </View>
          </Pressable>
        </View>
      </FadeInUp>

      {/* 3. Core Working Status: Boxes Ready & Total Stock */}
      <FadeInUp index={1}>
        <View className="gap-3.5">
          {/* Box Readiness Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${readyCount} of ${targetBoxes} food boxes ready for families.`}
            onPress={() => {
              cueTap();
              router.push(readyCount > 0 ? '/ready-boxes' : '/(tabs)/build');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card className="gap-3 p-5">
              <View className="flex-row items-center justify-between">
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
                  Food Boxes Ready
                </Text>
                <Text variant="label" tone="brand" className="font-bold">
                  {readyCount > 0 ? 'View Ready Boxes →' : 'Start Packing →'}
                </Text>
              </View>

              <View className="flex-row items-baseline gap-2">
                <AnimatedCounter
                  value={readyCount}
                  style={{
                    fontSize: 34,
                    fontWeight: '800',
                    color: COLORS.textPrimary,
                  }}
                />
                <Text style={{ fontSize: 18, color: COLORS.textSecondary }}>
                  of {targetBoxes} boxes needed today
                </Text>
              </View>

              <View className="h-3 w-full overflow-hidden rounded-md bg-subtle">
                <View
                  style={{
                    width: `${Math.min(100, Math.max(5, Math.round((readyCount / targetBoxes) * 100)))}%`,
                  }}
                  className="h-full rounded-md bg-secondary"
                />
              </View>

              <Text variant="label" tone="soft">
                {readyCount > 0
                  ? `${readyCount} packed boxes are ready for families to collect.`
                  : 'Assemble boxes from available shelf inventory.'}
              </Text>
            </Card>
          </Pressable>

          {/* Shelves & Expiration Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${totalStockCount} items on shelves. ${expiringCount} items expiring soon.`}
            onPress={() => {
              cueTap();
              router.push('/(tabs)/inventory');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Card className="gap-3 p-5">
              <View className="flex-row items-center justify-between">
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
                  Current Inventory
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
                    fontWeight: '800',
                    color: COLORS.textPrimary,
                  }}
                />
                <Text style={{ fontSize: 18, color: COLORS.textSecondary }}>
                  total items in pantry
                </Text>
              </View>

              {expiringCount > 0 ? (
                <View className="flex-row items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                  <MaterialCommunityIcons
                    name="clock-alert-outline"
                    size={20}
                    color={COLORS.statusWarning}
                  />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#904C00' }}>
                    {expiringCount} items expiring soon (give these out first)
                  </Text>
                </View>
              ) : (
                <Text variant="label" tone="soft">
                  All inventory is well within expiration dates.
                </Text>
              )}
            </Card>
          </Pressable>
        </View>
      </FadeInUp>

      {/* 4. Shortages Card (Plain English: "Food We Need Most") */}
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
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
                  Items Running Low
                </Text>
              </View>
              <Tappable
                onPress={() => {
                  cueTap();
                  router.push('/(tabs)/needs');
                }}
                className="py-1"
              >
                <Text variant="label" tone="brand" className="font-bold">
                  See All Needs →
                </Text>
              </Tappable>
            </View>

            <Text variant="body" tone="soft">
              We are short on these items for box packing:
            </Text>

            <View className="gap-2.5">
              {lowCategories.slice(0, 3).map((item) => (
                <View
                  key={item.category}
                  className="flex-row items-center justify-between rounded-md border border-hairline bg-canvas p-3"
                >
                  <View className="flex-row items-center gap-3">
                    <CategoryIcon category={item.category} size="sm" shape="square" />
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                        {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                      </Text>
                      <Text variant="label" tone="soft">
                        Goal: {item.threshold} items
                      </Text>
                    </View>
                  </View>

                  <View className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5">
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.statusCritical }}>
                      Need {item.deficit} more
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </FadeInUp>
      )}

      {/* 5. Helpful Simple Actions: Weigh Bulk & Count Shelf */}
      <FadeInUp index={3}>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Weigh Bulk Deliveries"
            onPress={() => {
              cueTap();
              router.push('/bulk-intake');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            className="flex-1"
          >
            <Card className="gap-2 p-4">
              <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                <MaterialCommunityIcons name="scale" size={24} color={COLORS.secondaryDark} />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                Weigh Deliveries
              </Text>
              <Text variant="label" tone="soft">
                Large grocery & crate drops
              </Text>
            </Card>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Audit Shelf Inventory"
            onPress={() => {
              cueTap();
              router.push('/shelf-audit');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            className="flex-1"
          >
            <Card className="gap-2 p-4">
              <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
                <MaterialCommunityIcons
                  name="clipboard-check-outline"
                  size={24}
                  color={COLORS.secondaryDark}
                />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                Count Shelves
              </Text>
              <Text variant="label" tone="soft">
                Verify counts on shelf
              </Text>
            </Card>
          </Pressable>
        </View>
      </FadeInUp>

      {/* 6. Recent Activity */}
      <FadeInUp index={4}>
        <View className="gap-2.5">
          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
            Recent Activity
          </Text>

          <Card className="divide-y divide-hairline/60 p-0">
            {activities.length === 0 ? (
              <View className="p-4">
                <Text variant="body" tone="soft">
                  Activity will appear here when donations are scanned or boxes are packed.
                </Text>
              </View>
            ) : (
              activities.slice(0, 4).map((act, index) => (
                <View key={act.id || index} className="flex-row items-center gap-3 p-3.5">
                  <View className="h-9 w-9 items-center justify-center rounded-md bg-secondary-tint">
                    <MaterialCommunityIcons
                      name={act.icon as any}
                      size={20}
                      color={COLORS.secondaryDark}
                    />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.textPrimary }}>
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
