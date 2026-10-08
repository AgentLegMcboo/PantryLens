import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppRouter } from "./app-navigation";
import { useWorkspaceLayout } from "./workspace-layout";
import React, { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { COLORS, TYPOGRAPHY } from "../constants/theme";
import { Badge, Button, Card, CategoryIcon, PageHeading, Screen, Text } from "./ui";
import { computeAllocation } from "../lib/allocation";
import { stockTotals } from "../lib/stock";
import { usePantryStore } from "../lib/store";
import { getSavedCapture } from "../lib/capture-queue";
import { processImageScan } from "../lib/ai_vision";

const categories = [
  "grain",
  "vegetable",
  "protein",
  "breakfast",
  "snack",
  "hygiene",
  "baby",
] as const;
export default function DashboardScreen() {
  const router = useAppRouter();
  const { wide } = useWorkspaceLayout();
  const {
    inventory,
    bulkLots,
    settings,
    activities,
    thresholds,
    boxRules,
    boxTemplates,
    setAuditDraft,
    pendingIntakes,
    syncError,
    syncing,
    flushIntakes,
    fetchData,
    session,
    setDraft,
    setDraftSource,
    setDraftLocation,
  } = usePantryStore();
  const [resuming, setResuming] = useState(false);
  const totals = stockTotals(inventory, bulkLots);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const defaultBox = boxTemplates.find(t => t.is_default);
  const plan = computeAllocation(
    inventory,
    boxRules,
    settings.boxTarget,
    defaultBox?.scales_with_family === false ? 4 : settings.defaultFamilySize,
    bulkLots,
    { warningDays: settings.expirationWarningDays, excludes: defaultBox?.excludes_tags, requires: defaultBox?.requires_tags },
  );
  const warning = new Date();
  warning.setDate(warning.getDate() + settings.expirationWarningDays);
  const expiring = inventory
    .filter((i) => i.expiration && new Date(i.expiration) <= warning)
    .reduce((s, i) => s + i.count, 0);
  const low = categories.filter((c) => totals[c] < thresholds[c]);
  const resume = async () => {
    if (!session?.user.id || !settings.pantryId) return;
    setResuming(true);
    try {
      const saved = await getSavedCapture(session.user.id, settings.pantryId);
      if (!saved) {
        Alert.alert(
          "No saved scan",
          "Use “Save for later” after photographing a donation.",
        );
        return;
      }
      const result = await processImageScan(saved.shots.map((s) => s.base64));
      if (result.photosRead < result.photosSent)
        throw new Error(
          "Some photos could not be read. Your scan is still saved; retry before reviewing.",
        );
      if (saved.mode === "shelf_audit" && saved.locationId) {
        setAuditDraft({ locationId: saved.locationId, photos: saved.shots.length, counted: result.candidates });
        router.push("/audit-review");
        return;
      }
      setDraft(result.candidates as any, saved.shots, saved.createdAt);
      setDraftSource(saved.sourceOrg);
      setDraftLocation(saved.locationId);
      // The saved capture remains available until the verified intake is saved.
      router.push({
        pathname: "/review-verify",
        params: { source: saved.mode },
      });
    } catch (e: any) {
      Alert.alert(
        "Could not resume scan",
        e.message ?? "Your photos are still saved. Try again when connected.",
      );
    } finally {
      setResuming(false);
    }
  };
  const expiringItems = inventory.filter(i => i.expiration && new Date(i.expiration) <= warning)
    .sort((a, b) => a.expiration!.localeCompare(b.expiration!));
  const categoryNames: Record<string, string> = { grain: 'Grains', vegetable: 'Vegetables', protein: 'Protein', breakfast: 'Breakfast', snack: 'Snacks', hygiene: 'Hygiene', baby: 'Baby essentials' };
  return (
    <Screen>
      <PageHeading title="Good things start here."
        description="Your shelves, your neighbours. Everything you need for today."
        action={wide ? <Text variant="label" tone="soft">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text> : undefined} />

      {(pendingIntakes > 0 || syncError) && (
        <Card className="flex-row flex-wrap items-center gap-3" style={{ backgroundColor: COLORS.warningTint }}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={22} color={COLORS.statusWarning} />
          <Text variant="label" selectable style={{ flex: 1, minWidth: 160 }}>{pendingIntakes > 0 ? `${pendingIntakes} intake${pendingIntakes === 1 ? '' : 's'} saved on this device, awaiting sync.` : syncError}</Text>
          <Button label="Retry sync" size="compact" variant="secondary" loading={syncing} onPress={() => pendingIntakes > 0 ? flushIntakes() : fetchData()} />
        </Card>
      )}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
        <View style={{ flex: wide ? 1.35 : undefined, flexDirection: 'row', backgroundColor: COLORS.primary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ flex: 1, marginRight: wide ? '35%' : 0, padding: wide ? 28 : 20, gap: 12 }}>
            <MaterialCommunityIcons name="camera-outline" size={25} color={COLORS.textOnPrimary} />
            <Text style={{ ...TYPOGRAPHY.heroTitle, color: COLORS.textOnPrimary }}>A photo. A fuller pantry.</Text>
            <Text variant="label" tone="on">Photograph a donation, review the items, and add them to your shelves.</Text>
            <View className="items-start mt-2"><Button label="Log a donation" variant="secondary" icon={<MaterialCommunityIcons name="camera-outline" size={18} color={COLORS.primary} />} onPress={() => router.push('/log-donation')} /></View>
          </View>
          {wide && <Image source={require('../assets/images/donation-scan.jpg')} resizeMode="cover" style={{ position: 'absolute', right: 0, top: 0, width: '35%', height: '100%' }} />}
        </View>
        <Card style={{ flex: wide ? 1 : undefined, gap: 12, justifyContent: 'space-between' }}>
          <View className="flex-row items-center justify-between"><Text style={TYPOGRAPHY.sectionTitle}>Ready to make a difference</Text><MaterialCommunityIcons name="package-variant-closed" size={21} color={COLORS.primary} /></View>
          <View className="flex-row items-baseline gap-2"><Text style={{ ...TYPOGRAPHY.metric, fontSize: 56, lineHeight: 62, color: COLORS.primary }}>{plan.achievableBoxes}</Text><Text variant="label" tone="soft">/ {settings.boxTarget} family boxes</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Boxes ready" accessibilityValue={{ min: 0, max: settings.boxTarget, now: plan.achievableBoxes }} style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceContainer }}><View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, plan.achievableBoxes / settings.boxTarget * 100)}%`, backgroundColor: COLORS.secondary }} /></View>
          <Text variant="label" tone="soft">{plan.achievableBoxes < settings.boxTarget ? `${plan.shortfallPerCategory[plan.limitingCategory]} more ${categoryNames[plan.limitingCategory].toLowerCase()} units would help reach your goal.` : 'Enough of every required category to reach your goal.'}</Text>
          <Button label="Plan your boxes" variant="secondary" block icon={<MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.primary} />} onPress={() => router.push('/(tabs)/build')} />
        </Card>
      </View>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[
            { value: total.toLocaleString(), label: 'Units on shelves', hint: bulkLots.length ? 'Includes bulk estimates' : 'Across all categories', icon: 'archive-outline', route: '/(tabs)/inventory' },
            { value: String(inventory.length), label: 'Stock entries', hint: 'Grouped in your inventory', icon: 'format-list-bulleted', route: '/(tabs)/inventory' },
            { value: String(expiring), label: 'Use first', hint: `Within ${settings.expirationWarningDays} days`, icon: 'clock-outline', route: '/expiring-soon' },
            { value: String(low.length), label: 'Low categories', hint: low.length ? 'See what to ask for' : 'All above minimum', icon: 'heart-outline', route: '/(tabs)/needs' },
          ].map((m, index) => (
            <Pressable key={m.label} accessibilityRole="button" accessibilityLabel={`${m.value} ${m.label}. ${m.hint}`}
              onPress={() => router.push(m.route as any)}
              style={({ pressed }) => ({ width: wide ? '25%' : '50%', padding: wide ? 22 : 16, gap: 5, backgroundColor: pressed ? COLORS.primaryTint : COLORS.cardSurface,
                borderLeftWidth: (wide ? index > 0 : index % 2 === 1) ? 1 : 0, borderTopWidth: !wide && index >= 2 ? 1 : 0, borderColor: COLORS.borderSoft })}>
              <View className="flex-row items-center justify-between"><Text style={{ ...TYPOGRAPHY.metric, color: COLORS.primary }}>{m.value}</Text><MaterialCommunityIcons name={m.icon as any} size={20} color={COLORS.textSecondary} /></View>
              <Text variant="label" className="font-semibold">{m.label}</Text><Text variant="micro" tone="soft">{m.hint}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {[
          { label: 'Find an item', icon: 'magnify', route: '/(tabs)/inventory' },
          { label: 'Weigh bulk food', icon: 'scale-balance', route: '/bulk-intake' },
          { label: 'Audit a shelf', icon: 'clipboard-check-outline', route: '/shelf-audit' },
        ].map(a => <Pressable key={a.label} accessibilityRole="button" onPress={() => router.push(a.route as any)}
          style={({ pressed }) => ({ flexGrow: 1, flexBasis: wide ? 0 : '44%', minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
            backgroundColor: pressed ? COLORS.primaryTint : COLORS.cardSurface, borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: 8 })}>
          <MaterialCommunityIcons name={a.icon as any} size={21} color={COLORS.primary} /><Text variant="label" className="font-semibold">{a.label}</Text>
        </Pressable>)}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        <Card style={{ flex: wide ? 1.3 : undefined, width: wide ? undefined : '100%', padding: 0, overflow: 'hidden' }}>
          <View className="flex-row flex-wrap items-center justify-between gap-2 px-5 py-4"><Text accessibilityRole="header" style={TYPOGRAPHY.sectionTitle}>On the shelves</Text><Button label={wide ? 'View inventory' : 'View all'} variant="ghost" size="compact" onPress={() => router.push('/(tabs)/inventory')} /></View>
          {categories.map(c => {
            const below = totals[c] < thresholds[c];
            return <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: COLORS.borderSoft }}>
              <CategoryIcon category={c} size="sm" /><Text variant="label" className="flex-1 font-medium">{categoryNames[c]}</Text>
              {below && <Badge label="Low stock" tone="warn" />}<View style={{ minWidth: 46, alignItems: 'flex-end' }}><Text variant="label" className="font-semibold">{totals[c]}</Text><Text variant="micro" tone="soft">units</Text></View>
            </View>;
          })}
          {bulkLots.length > 0 && <Text variant="micro" tone="soft" className="px-5 py-3 border-t border-hairline">Includes estimated units from weighed bulk donations.</Text>}
        </Card>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 20 }}>
          <Card style={{ gap: 16 }}>
            <View className="flex-row items-center justify-between"><Text accessibilityRole="header" style={TYPOGRAPHY.sectionTitle}>Use these first</Text><MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.statusWarning} /></View>
            <Text variant="label" tone="soft">Items closest to their best-by date.</Text>
            {expiringItems.length ? expiringItems.slice(0, 3).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.count} units. Open item details.`}
              onPress={() => router.push({ pathname: '/item-detail', params: { id: item.id } })}
              className="flex-row items-center gap-3 border-t border-hairline pt-3" style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1, minHeight: 60 })}>
              <CategoryIcon category={item.category} size="sm" /><View className="flex-1 gap-1"><Text variant="label" className="font-medium">{item.name}</Text><Text variant="micro" tone="soft">{item.count} units · {new Date(`${item.expiration}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></View><MaterialCommunityIcons name="chevron-right" size={19} color={COLORS.textSecondary} />
            </Pressable>) : <Text variant="label" tone="soft">No items in your expiration window.</Text>}
            {expiringItems.length > 0 && <Button label="Review expiring stock" variant="secondary" size="compact" block onPress={() => router.push('/expiring-soon')} />}
          </Card>
          <Card style={{ gap: 16 }}>
            <Text accessibilityRole="header" style={TYPOGRAPHY.sectionTitle}>Recent activity</Text>
            {activities.length === 0 ? <Text variant="label" tone="soft">Donations and packed boxes will appear here.</Text> : activities.slice(0, 3).map(a => <View key={a.id} className="flex-row items-start gap-3">
              <MaterialCommunityIcons name={a.icon === 'scale-balance' ? 'scale-balance' : 'check-circle-outline'} size={20} color={COLORS.primary} /><View className="flex-1 gap-1"><Text variant="label">{a.text}</Text><Text variant="micro" tone="soft">{new Date(a.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></View>
            </View>)}
            <Button label="Resume saved scan" variant="ghost" size="compact" block loading={resuming} onPress={resume} />
          </Card>
        </View>
      </View>
    </Screen>
  );
}
