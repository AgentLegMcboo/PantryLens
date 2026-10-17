import { useAppAppearance } from "../../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { COLORS, fw } from "../../constants/theme";
import { Card, cardShadow, Row, Screen, Text } from "../../components/ui";
import { buildStockUnits, computeAllocation } from "../../lib/allocation";
import { windowEndISO } from "../../lib/expiry";
import { InventoryItem, usePantryStore } from "../../lib/store";
import { cuePress, cueTap } from "../../lib/feedback";
import { QuickAddStaplesModal } from "../../components/quick-add-staples";
import { ShelfCheckSheet } from "../../components/shelf-check";
import { SpotlightTour, useSpotlightTarget, type TourStep } from "../../components/spotlight";

const HOME_TOUR: TourStep[] = [
  { target: "header.Home.pantry", title: "Your pantry", body: "Tap here for settings, your team, reports, or to switch pantries." },
  { target: "header.Home.bell", title: "Notifications", body: "A red number means food is expiring soon. Check here every visit." },
  { target: "header.Home.theme", title: "Light or dark", body: "Change how the app looks." },
  { target: "header.Home.menu", title: "Every screen", body: "Lost? Find any page in the app from here." },
  { target: "home.scan", title: "Scan donations", body: "Start here when food comes in. Take a picture, PantryLens finds the items." },
  { target: "home.tools", title: "Other ways in", body: "Add by hand, weigh a big delivery, or fix a shelf's count." },
  { target: "home.reports", title: "Reports", body: "See what came in and went out, and export it." },
];

const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein",
  grain: "Grains & Pasta",
  vegetable: "Vegetables",
  breakfast: "Breakfast",
  snack: "Snacks",
  baby: "Baby Needs",
  hygiene: "Hygiene",
};

export default function DashboardScreen() {
  const scheme = useAppAppearance((state) => state.scheme);
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings, thresholds, readyBoxes } =
    usePantryStore();
  const [staplesModalVisible, setStaplesModalVisible] = useState(false);
  const [shelfCheckOpen, setShelfCheckOpen] = useState(false);
  const scanTarget = useSpotlightTarget("home.scan");
  const toolsTarget = useSpotlightTarget("home.tools");
  const reportsTarget = useSpotlightTarget("home.reports");

  const readyCount = readyBoxes.reduce(
    (sum, r) => sum + (r.boxes - r.boxes_collected),
    0,
  );
  const targetBoxes = settings.boxTarget || 12;
  const familySize = settings.defaultFamilySize || 4;

  const givable = useMemo(
    () => buildStockUnits(inventory, bulkLots),
    [inventory, bulkLots],
  );
  const totalStockCount = useMemo(
    () => givable.reduce((sum: number, i: InventoryItem) => sum + i.count, 0),
    [givable],
  );

  const plan = useMemo(
    () =>
      computeAllocation(
        inventory,
        boxRules,
        targetBoxes,
        familySize,
        bulkLots,
        {
          warningDays: settings.expirationWarningDays,
        },
      ),
    [
      inventory,
      boxRules,
      targetBoxes,
      familySize,
      bulkLots,
      settings.expirationWarningDays,
    ],
  );

  // Matches AppHeader and app/expiring-soon.tsx so the numbers never disagree.
  const warningStr = windowEndISO(settings.expirationWarningDays);
  const allExpiringOrPast = useMemo(
    () =>
      inventory.filter(
        (i: InventoryItem) =>
          i.count > 0 && !!i.expiration && i.expiration <= warningStr,
      ),
    [inventory, warningStr],
  );
  const lowCategories = useMemo(() => {
    return Object.keys(thresholds)
      .map((cat: string) => {
        const total =
          plan.categoryTotals[cat as keyof typeof plan.categoryTotals] ?? 0;
        const threshold = (thresholds as any)[cat] ?? 0;
        const neededForBoxes =
          (plan.shortfallPerCategory as Record<string, number>)[cat] ?? 0;
        const neededTotal =
          ((plan.perBoxNeeds as Record<string, number>)[cat] ?? 0) *
          targetBoxes;
        const deficit = Math.max(threshold - total, neededForBoxes);
        const isLimiting =
          plan.limitingCategory === cat && plan.achievableBoxes < targetBoxes;
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
    <Screen contentContainerClassName="gap-6">
      {/* ZONE 1: Unified Intake & Shelf Tools — everything a volunteer does when food arrives */}
      <View>
        <View className="gap-3">
          {/* The main job, as one clear brand slab: icon, what it is, one short
              line, a chevron. No lip clipped by the corners, no boxed arrow,
              no second line of subtitle. */}
          {/* The card's shape lives on a plain View with fixed styles: a
              Pressable's style *function* was being dropped by NativeWind,
              which left the card thin and the photo unclipped. */}
          <View ref={scanTarget} collapsable={false} style={[styles.scanCard, cardShadow]}>
            <LinearGradient
              colors={
                scheme === "dark"
                  ? ["#E7AC7A", "#DFA06B"]
                  : ["#EDBC94", "#DFA06B"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan donations. Take photos or scan barcodes to add food."
              onPress={() => {
                cuePress();
                router.push("/log-donation");
              }}
              style={styles.scanPress}
            >
              {({ pressed }) => (
                <View style={[styles.scanRow, pressed && styles.pressed]}>
                  <View style={styles.scanIcon}>
                    <MaterialCommunityIcons
                      name="camera-outline"
                      size={29}
                      color={COLORS.textOnAccent}
                    />
                  </View>
                  <View className="flex-1">
                    <Text variant="title" tone="on" style={[styles.scanTitle, { color: COLORS.textOnAccent }]}>
                      Scan donations
                    </Text>
                    <Text variant="body" tone="on" style={[styles.scanSubtitle, { color: COLORS.textOnAccent }]}>
                      Photos or barcodes
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={30}
                    color={COLORS.textOnAccent}
                  />
                </View>
              )}
            </Pressable>
          </View>

          <View ref={toolsTarget} collapsable={false}>
          <Card className="py-0">
            <Row
              icon="lightning-bolt-outline"
              label="Quick Add"
              hint="Enter items by hand"
              onPress={() => {
                cueTap();
                setStaplesModalVisible(true);
              }}
            />
            <Row
              icon="scale"
              label="Weigh a delivery"
              hint="Crates and pallets by weight"
              onPress={() => router.push("/bulk-intake")}
            />
            <Row
              icon="clipboard-check-outline"
              label="Check a shelf"
              hint="Compare a shelf count with inventory"
              divider={false}
              onPress={() => {
                cueTap();
                setShelfCheckOpen(true);
              }}
            />
          </Card>
          </View>
        </View>
      </View>

      <View className="gap-3">
        <Text variant="heading" className="px-1">
          Today’s pantry
        </Text>
        <Card className="py-0">
          <Row
            icon="clipboard-list-outline"
            label={`${totalStockCount.toLocaleString()} units on your shelves`}
            hint="View inventory"
            onPress={() => router.push("/(tabs)/inventory")}
          />
          <Row
            icon="cube-outline"
            label={`${plan.achievableBoxes} boxes you can pack`}
            hint={`Goal: ${targetBoxes} boxes · ${familySize} people per family`}
            divider={false}
            onPress={() => router.push("/(tabs)/build")}
          />
        </Card>
        <View ref={reportsTarget} collapsable={false}>
        <Card className="py-0">
          <Row
            icon="chart-box-outline"
            label="Reports & activity"
            hint="What came in, what went out, CSV exports"
            divider={false}
            onPress={() => router.push("/reports")}
          />
        </Card>
        </View>
      </View>

      {(allExpiringOrPast.length > 0 ||
        readyCount > 0 ||
        lowCategories.length > 0) && (
        <View className="gap-3">
          <Text variant="heading" className="px-1">
            Needs attention
          </Text>
          <Card className="py-0">
            {allExpiringOrPast.length > 0 && (
              <Row
                icon="clock-alert-outline"
                label={`${allExpiringOrPast.length} items need a date check`}
                hint="Review expiring and past-date food"
                divider={readyCount > 0 || lowCategories.length > 0}
                onPress={() => router.push("/expiring-soon")}
              />
            )}
            {readyCount > 0 && (
              <Row
                icon="package-variant-closed"
                label={`${readyCount} boxes ready for pickup`}
                hint="Open Ready to go"
                divider={lowCategories.length > 0}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/build",
                    params: { section: "ready" },
                  })
                }
              />
            )}
            {lowCategories.length > 0 && (
              <Row
                icon="bullhorn-outline"
                label={`${lowCategories[0].label} is running low`}
                hint={`Need ${lowCategories[0].deficit} more units · view needs`}
                divider={false}
                onPress={() => router.push("/(tabs)/needs")}
              />
            )}
          </Card>
        </View>
      )}


      <SpotlightTour tourKey="home" steps={HOME_TOUR} />
      <ShelfCheckSheet
        visible={shelfCheckOpen}
        onClose={() => setShelfCheckOpen(false)}
      />
      <QuickAddStaplesModal
        visible={staplesModalVisible}
        onClose={() => setStaplesModalVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scanCard: { minHeight: 116, borderRadius: 22, overflow: "hidden" },
  scanPress: { flex: 1, minHeight: 116, justifyContent: "center" },
  scanIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.25,
  },
  scanSubtitle: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fw("500"),
    // Lifts the line off the light end of the gradient.
    textShadowColor: "rgba(80, 40, 10, 0.25)",
    textShadowRadius: 2,
  },
  pressed: { opacity: 0.85 },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
});
