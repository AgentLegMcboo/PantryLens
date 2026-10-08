import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../../constants/theme';
import { computeAllocation } from '../../lib/allocation';
import { Button, Card, CategoryIcon, Badge, PageHeading, Screen, Stepper, Segmented, Text } from '../../components/ui';
import { useAppRouter } from '../../components/app-navigation';
import { useWorkspaceLayout } from '../../components/workspace-layout';
import { BoxRules, usePantryStore } from '../../lib/store';

export default function BuildBoxesScreen() {
  const router = useAppRouter();
  const { wide } = useWorkspaceLayout();
  const { inventory, bulkLots, boxRules, settings } = usePantryStore();
  const [requestedBoxes, setRequestedBoxes] = useState(12);
  const [familySize, setFamilySize] = useState(settings.defaultFamilySize || 4);
  const plan = computeAllocation(inventory, boxRules, requestedBoxes, familySize, bulkLots);
  const categories = (Object.keys(boxRules) as (keyof BoxRules)[]).filter(cat => plan.perBoxNeeds[cat] > 0);
  const isShort = plan.achievableBoxes < requestedBoxes;
  const canPack = plan.achievableBoxes > 0;
  return (
    <Screen>
      <PageHeading title="Build boxes" description="A balanced box for every family. Start with what’s on your shelves." />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
        <Card style={{ flex: wide ? 1 : undefined, gap: 24 }}>
          <View className="flex-row items-center gap-3"><View className="h-8 w-8 items-center justify-center rounded-full bg-brand-tint"><Text variant="label" tone="brand" className="font-semibold">1</Text></View><Text style={TYPOGRAPHY.sectionTitle}>Set your packing goal</Text></View>
          <View className="gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-3"><View className="gap-1"><Text className="font-medium">Number of boxes</Text><Text variant="micro" tone="soft">How many would you like to prepare?</Text></View><Stepper value={requestedBoxes} min={1} max={200} onChange={setRequestedBoxes} /></View>
          </View>
          <View style={{ height: 1, backgroundColor: COLORS.borderSoft }} />
          <View className="gap-3"><View className="gap-1"><Text className="font-medium">Family size</Text><Text variant="micro" tone="soft">Portions adjust for each household.</Text></View>
            <Segmented options={[{value:2,label:'2 people'},{value:4,label:'4 people'},{value:6,label:'6 people'}]} value={familySize} onChange={setFamilySize} />
            {![2,4,6].includes(familySize) && <Text variant="micro" tone="soft">Using your pantry default: {familySize} people.</Text>}
          </View>
          <View className="flex-row items-start gap-2 rounded-md bg-subtle p-3"><MaterialCommunityIcons name="information-outline" size={18} color={COLORS.textSecondary} /><Text variant="micro" tone="soft" className="flex-1">Your pantry’s box recipe determines how much of each category goes into a box.</Text></View>
        </Card>
        <Card style={{ flex: wide ? 1 : undefined, gap: 20, justifyContent: 'space-between' }}>
          <View className="flex-row items-center justify-between"><Text style={TYPOGRAPHY.sectionTitle}>Available with current stock</Text><MaterialCommunityIcons name="package-variant-closed" size={24} color={COLORS.primary} /></View>
          <View className="flex-row items-baseline gap-2"><Text selectable style={{ ...TYPOGRAPHY.metric, fontSize: 64, lineHeight: 72, color: COLORS.primary }}>{plan.achievableBoxes}</Text><Text tone="soft">of {requestedBoxes} boxes</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Boxes available" accessibilityValue={{min:0,max:requestedBoxes,now:plan.achievableBoxes}} style={{ height: 6, backgroundColor: COLORS.surfaceContainer, borderRadius: 6 }}><View style={{height:6,borderRadius:6,backgroundColor:COLORS.secondary,width:`${Math.min(100,plan.achievableBoxes/requestedBoxes*100)}%`}} /></View>
          <View className="rounded-md bg-subtle p-4"><Text variant="label">{isShort ? `${plan.limitingCategory.charAt(0).toUpperCase()+plan.limitingCategory.slice(1)} runs out first. Add ${plan.shortfallPerCategory[plan.limitingCategory]} more units to reach ${requestedBoxes} boxes.` : 'You have enough of every required category. Ready when you are.'}</Text></View>
          <Button label={canPack ? `Start packing ${plan.achievableBoxes} ${plan.achievableBoxes === 1 ? 'box' : 'boxes'}` : 'Add stock to start packing'} block disabled={!canPack}
            icon={<MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.textOnPrimary} />}
            onPress={() => router.push({pathname:'/packing-checklist',params:{targetBoxes:requestedBoxes,familySize}})} />
        </Card>
      </View>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View className="p-5 gap-1"><Text accessibilityRole="header" style={TYPOGRAPHY.sectionTitle}>What goes into each box</Text><Text variant="label" tone="soft">For a family of {familySize} · planning {requestedBoxes} boxes</Text></View>
        <View className="flex-row bg-subtle px-5 py-3"><Text variant="micro" tone="soft" className="flex-1">CATEGORY / PER BOX</Text><Text variant="micro" tone="soft">STOCK / NEEDED</Text></View>
        {categories.map(cat => {
          const short = plan.shortfallPerCategory[cat];
          const perBox = plan.perBoxNeeds[cat];
          return (
            <View key={cat} className="flex-row items-center gap-3 border-t border-hairline px-5 py-4">
              <CategoryIcon category={cat} size="sm" />
              <View className="flex-1 gap-1"><Text variant="label" className="capitalize font-semibold">{cat === 'vegetable' ? 'Vegetables' : cat === 'grain' ? 'Grains' : cat}</Text><Text variant="micro" tone="soft">{perBox} {perBox === 1 ? 'unit' : 'units'} per box</Text></View>
              <View className="items-end gap-1"><Text variant="label" className="font-medium" style={{fontVariant:['tabular-nums']}}>{plan.categoryTotals[cat]} <Text variant="micro" tone="soft">/ {perBox * requestedBoxes}</Text></Text><Badge label={short > 0 ? `${short} short` : 'Enough stock'} tone={short > 0 ? 'warn' : 'good'} /></View>
            </View>
          );
        })}
        <View className="flex-row items-start gap-2 border-t border-hairline p-4"><MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.textSecondary} /><Text variant="micro" tone="soft" className="flex-1">Past-date and damaged items are excluded. Soonest-expiring stock is packed first.</Text></View>
      </Card>
      {isShort && <View className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-tint p-5"><View style={{flex:1,minWidth:180,gap:4}}><Text variant="label" className="font-semibold">Help fill the gaps</Text><Text variant="micro" tone="soft">Create a donation request using your current shortages.</Text></View><Button label="View donation needs" variant="secondary" size="compact" onPress={() => router.push('/(tabs)/needs')} /></View>}
    </Screen>
  );
}
