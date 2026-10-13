import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { Badge, Button, Card, CategoryIcon, EmptyState, Row, Sheet, Text } from '../components/ui';
import { daysUntil, windowEndISO } from '../lib/expiry';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { ExitReason, InventoryItem, usePantryStore } from '../lib/store';

/** How a window of days should read: past, this week, or merely soon. */
function urgency(days: number) {
  if (days < 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Past date' };
  if (days === 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Today' };
  if (days <= 7) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: `${days}d left` };
  return { colour: COLORS.statusWarning, tone: 'warn' as const, label: `${days}d left` };
}

export default function ExpiringSoonScreen() {
  const router = useRouter();
  const { inventory, locations, settings, recordExit } = usePantryStore();
  const [exitItem, setExitItem] = useState<InventoryItem | null>(null);

  const warningStr = windowEndISO(settings.expirationWarningDays);

  const expiring = inventory
    .filter(item => item.count > 0 && !!item.expiration && item.expiration <= warningStr)
    .sort((a, b) => a.expiration!.localeCompare(b.expiration!));

  const pastDateItems = expiring.filter(i => (daysUntil(i.expiration!) ?? 0) < 0);
  const soonItems = expiring.filter(i => (daysUntil(i.expiration!) ?? 0) >= 0);
  const unitsAtRisk = expiring.reduce((sum, item) => sum + item.count, 0);

  const handleDisposition = (reason: ExitReason) => {
    if (!exitItem) return;
    const item = exitItem;
    setExitItem(null);

    const prompts: Record<ExitReason, { title: string; body: string; verb: string }> = {
      given_out: {
        title: `Give out ${item.count} ${item.count === 1 ? 'unit' : 'units'} of ${item.name}?`,
        body: 'They come off the shelf and count as food that reached a household.',
        verb: 'Give out',
      },
      discarded: {
        title: `Throw away ${item.count} ${item.count === 1 ? 'unit' : 'units'} of ${item.name}?`,
        body: 'They come off the shelf and count as waste in your pantry report.',
        verb: 'Throw away',
      },
      correction: {
        title: `Remove ${item.name}?`,
        body: 'For fixing a mistake. Nothing is counted as given out or wasted.',
        verb: 'Remove',
      },
    };
    const prompt = prompts[reason];

    Alert.alert(prompt.title, prompt.body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: prompt.verb,
        style: reason === 'given_out' ? 'default' : 'destructive',
        onPress: async () => {
          try {
            await recordExit([item.id], reason);
            cueSuccess();
          } catch (err: any) {
            cueWarn();
            Alert.alert('Could not update shelf', err?.message ?? 'Please try again.');
          }
        },
      },
    ]);
  };

  const renderRow = ({ item, index }: { item: InventoryItem; index: number }) => {
    const days = daysUntil(item.expiration!) ?? 0;
    const state = urgency(days);
    const place = locations.find(l => l.id === item.location_id)?.name;

    return (
      <FadeInUp index={index + 1}>
        <Card className="mb-3 gap-3">
          <View className="flex-row items-center gap-3.5">
            <View className="h-12 w-1.5 rounded-sm" style={{ backgroundColor: state.colour }} />
            <CategoryIcon
              category={item.category}
              tone={days < 0 ? 'critical' : 'secondary'}
            />

            <View className="flex-1">
              <Text variant="body" className="font-bold">
                {item.name}
              </Text>
              <View className="mt-1 flex-row flex-wrap items-center gap-2">
                {place && (
                  <View className="flex-row items-center gap-1 rounded bg-secondary-tint px-2 py-0.5">
                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={13}
                      color={COLORS.secondaryDark}
                    />
                    <Text variant="micro" className="font-bold" style={{ color: COLORS.secondaryDark }}>
                      {place}
                    </Text>
                  </View>
                )}
                <Text variant="micro" tone="soft" className="capitalize">
                  {item.count} {item.count === 1 ? 'unit' : 'units'} · {item.expiration}
                </Text>
              </View>
            </View>

            <Badge label={state.label} tone={state.tone} />
          </View>

          <View className="flex-row items-center justify-between gap-2 pt-1">
            <Text variant="micro" tone={days < 0 ? 'critical' : 'soft'} className="flex-1">
              {days < 0
                ? 'Automatically held out of family boxes'
                : 'Pulled first when packing boxes'}
            </Text>
            <Pressable
              onPress={() => {
                cueTap();
                setExitItem(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Take ${item.name} off the shelf`}
              className="min-h-[44px] flex-row items-center gap-1.5 rounded-md border border-hairline bg-subtle px-3 py-2"
            >
              <MaterialCommunityIcons
                name="tray-arrow-up"
                size={16}
                color={COLORS.textPrimary}
              />
              <Text variant="label" className="font-bold">
                Take off shelf
              </Text>
            </Pressable>
          </View>
        </Card>
      </FadeInUp>
    );
  };

  return (
    <View className="flex-1 bg-canvas">
      <FlatList
        data={expiring}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        contentContainerClassName="px-gutter pt-gutter pb-28"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          expiring.length > 0 ? (
            <FadeInUp index={0}>
              <View className="mb-5 gap-2 px-1">
                <Text variant="headline">
                  {unitsAtRisk} {unitsAtRisk === 1 ? 'unit' : 'units'} to check first
                </Text>
                <Text variant="body" tone="soft">
                  Everything inside your {settings.expirationWarningDays}-day window, ordered
                  soonest first.
                </Text>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  {soonItems.length > 0 && (
                    <Badge
                      label={`${soonItems.length} expiring soon (pack first)`}
                      tone="warn"
                    />
                  )}
                  {pastDateItems.length > 0 && (
                    <Badge
                      label={`${pastDateItems.length} past date (clear from shelf)`}
                      tone="critical"
                    />
                  )}
                </View>
              </View>
            </FadeInUp>
          ) : null
        }
        ListFooterComponent={
          soonItems.length > 0 ? (
            <FadeInUp index={expiring.length + 1}>
              <Button
                label="Build boxes with usable stock"
                block
                className="mt-2"
                icon={
                  <MaterialCommunityIcons
                    name="package-variant-closed"
                    size={19}
                    color={COLORS.textOnPrimary}
                  />
                }
                onPress={() => router.push('/(tabs)/build')}
              />
              <Text variant="micro" tone="soft" className="mt-3 text-center">
                Box building automatically pulls the shortest-dated usable stock first.
              </Text>
            </FadeInUp>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="check-circle-outline"
            tone="good"
            title="Nothing on the clock"
            body={`No stock expires in the next ${settings.expirationWarningDays} days. This page fills itself in when something does.`}
            actionLabel="Back to the shelf"
            onAction={() => router.push('/(tabs)/inventory')}
          />
        }
      />

      <Sheet
        visible={!!exitItem}
        onClose={() => setExitItem(null)}
        title="Where is it going?"
        subtitle={
          exitItem
            ? `${exitItem.name} (${exitItem.count} ${exitItem.count === 1 ? 'unit' : 'units'})`
            : undefined
        }
      >
        <View className="overflow-hidden rounded-lg border border-hairline bg-card">
          <Row
            icon="hand-heart-outline"
            label="Given out to a family"
            hint="Counts as food that reached a household"
            onPress={() => handleDisposition('given_out')}
          />
          <Row
            icon="trash-can-outline"
            label="Thrown away"
            hint="Counts as expired or damaged waste in Reports"
            tone="critical"
            onPress={() => handleDisposition('discarded')}
          />
          <Row
            icon="eraser"
            label="Mistake — just remove"
            hint="Fixes a count error without recording an exit"
            divider={false}
            onPress={() => handleDisposition('correction')}
          />
        </View>
      </Sheet>
    </View>
  );
}
