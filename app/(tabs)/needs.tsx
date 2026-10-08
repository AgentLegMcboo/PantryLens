import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { COLORS, TYPOGRAPHY } from "../../constants/theme";
import { stockTotals, donationMessage } from '../../lib/stock';
import { computeAllocation } from "../../lib/allocation";
import { useWorkspaceLayout } from "../../components/workspace-layout";
import {
  Button,
  Card,
  CategoryIcon,
  Badge,
  Panel,
  PageHeading,
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
  const { wide } = useWorkspaceLayout();
  const { inventory, bulkLots, boxRules, thresholds, settings } = usePantryStore();
  const plan = computeAllocation(
    inventory,
    boxRules,
    12,
    settings.defaultFamilySize,
    bulkLots,
  );

  const [flyerOpen, setFlyerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const totals = stockTotals(inventory, bulkLots);

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
    const current = totals[cat as keyof typeof totals];
    const min = (thresholds as any)[cat];
    const boxDeficit = plan.shortfallPerCategory[cat as keyof typeof plan.shortfallPerCategory] ?? 0;
    const deficit = Math.max(0, min - current, boxDeficit);
    if (deficit > 0 && !deficits.some(d => d.category === cat)) {
      deficits.push({
        category: cat,
        deficit,
        reason: boxDeficit > 0 ? "Needed for 12 boxes" : "Below the level you set",
      });
    }
  });

  const flyerText = donationMessage(settings.pantryName, deficits, EXAMPLES, settings.dropOffDetails);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(flyerText);
      cueSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      Alert.alert('Could not copy', 'Open the message preview to select and copy the request.');
    }
  };
  const categoryNames: Record<string,string> = {grain:'Grains',vegetable:'Vegetables',protein:'Protein',breakfast:'Breakfast',snack:'Snacks',hygiene:'Hygiene',baby:'Baby essentials'};
  const requestCard = (
    <Card style={{gap:20}}>
      <View className="flex-row items-center gap-3"><View className="h-10 w-10 rounded-md bg-brand-tint items-center justify-center"><MaterialCommunityIcons name="text-box-outline" size={22} color={COLORS.primary} /></View><View className="flex-1 gap-1"><Text style={TYPOGRAPHY.sectionTitle}>Ready to share</Text><Text variant="micro" tone="soft">One request, based on real stock.</Text></View></View>
      {wide && <Panel><Text variant="label" selectable style={{lineHeight:23}}>{flyerText}</Text></Panel>}
      <Button label={copied ? 'Request copied' : 'Copy donation request'} block
        icon={<MaterialCommunityIcons name={copied ? 'check' : 'content-copy'} size={18} color={COLORS.textOnPrimary} />} onPress={handleCopy} />
      <Text variant="micro" tone={copied ? 'good' : 'soft'} accessibilityLiveRegion="polite">{copied ? 'Copied. Ready to paste into a message or post.' : 'Paste into a community post, email, or printed flyer.'}</Text>
      {!wide && <Button label="Preview message" variant="ghost" size="compact" block onPress={() => setFlyerOpen(true)} />}
      {settings.dropOffDetails ? <View className="flex-row items-start gap-2 border-t border-hairline pt-4"><MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.primary} /><Text variant="micro" tone="soft" className="flex-1">{settings.dropOffDetails}</Text></View> : <Text variant="micro" tone="soft">Add drop-off details in Settings to include them in your request.</Text>}
    </Card>
  );
  return (
    <>
      <Screen>
        <PageHeading title="Donation needs" description="Help your community give what your pantry needs most." />
        {deficits.length === 0 ? (
          <Card className="items-center py-12 gap-4"><View className="h-16 w-16 items-center justify-center rounded-full bg-good-tint"><MaterialCommunityIcons name="check" size={34} color={COLORS.statusGood} /></View><Text variant="title">Your shelves are well stocked</Text><Text variant="label" tone="soft" className="text-center">Every category meets your pantry minimum and current box goal.</Text></Card>
        ) : (
          <>
            <View className="flex-row items-center gap-3 rounded-lg bg-brand-tint p-5"><MaterialCommunityIcons name="hand-heart-outline" size={26} color={COLORS.primary} /><View className="flex-1 gap-1"><Text variant="label" className="font-semibold">{deficits.length} {deficits.length === 1 ? 'category needs' : 'categories need'} a little support</Text><Text variant="micro" tone="soft">Your biggest packing need comes first. Updated from your inventory.</Text></View></View>
            <View style={{flexDirection:wide?'row':'column',gap:20,alignItems:'flex-start'}}>
              <Card style={{flex:wide?1.15:undefined,width:wide?undefined:'100%',padding:0,overflow:'hidden'}}>
                <View className="px-5 py-4"><Text style={TYPOGRAPHY.sectionTitle}>What to ask for</Text></View>
                {deficits.map((item,i) => (
                  <View key={item.category} style={{padding:20,gap:14,borderTopWidth:1,borderTopColor:COLORS.borderSoft}}>
                    <View className="flex-row items-center gap-3"><CategoryIcon category={item.category} size="md" /><View className="flex-1 gap-1"><Text variant="body" className="font-semibold">{categoryNames[item.category]??item.category}</Text><Text variant="micro" tone="soft">{totals[item.category as keyof typeof totals]} units on hand</Text></View><View className="items-end gap-1"><Text variant="title" tone="brand">+{item.deficit}</Text><Text variant="micro" tone="soft">units needed</Text></View></View>
                    <Text variant="label" tone="soft">{EXAMPLES[item.category] ?? 'Any shelf-stable items'}</Text>
                    {item.reason === 'Stopping boxes going out' ? <Badge label="Priority · needed for 12 balanced boxes" tone="warn" /> : <Badge label={item.reason === 'Needed for 12 boxes' ? 'Needed for your box goal' : 'Below pantry minimum'} tone="neutral" />}
                  </View>
                ))}
              </Card>
              <View style={{flex:wide?1:undefined,width:wide?undefined:'100%'}}>{requestCard}</View>
            </View>
          </>
        )}
      </Screen>
      <Sheet visible={flyerOpen} onClose={() => setFlyerOpen(false)} title="Donation request" subtitle="Review the message before sharing.">
        <Panel><Text variant="label" selectable style={{lineHeight:23}}>{flyerText}</Text></Panel>
        <Button label={copied?'Request copied':'Copy request'} block onPress={handleCopy} />
      </Sheet>
    </>
  );
}
