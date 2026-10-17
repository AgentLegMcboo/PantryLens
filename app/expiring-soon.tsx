import { ResponsiveRow } from '../components/ui/responsive-row';
import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RULE_ABOVE } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { Badge, Button, Card, CategoryIcon, EmptyState, Row, Sheet, Text } from '../components/ui';
import { daysUntil, windowEndISO } from '../lib/expiry';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import {
  CONDITION_LABELS,
  ExitReason,
  InventoryItem,
  isUsableCondition,
  usePantryStore,
} from '../lib/store';
import { shelfLabels } from '../lib/shelves';
import { notificationKeys, useReadNotifications } from '../lib/notifications';
import { useTeamAlerts } from '../lib/team-alerts';
import { timeAgo } from '../lib/time';

/** How a window of days should read: past, this week, or merely soon. */
function urgency(days: number) {
  if (days < 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Past date' };
  if (days === 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Today' };
  if (days <= 7) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: `${days}d left` };
  return { colour: COLORS.statusWarning, tone: 'warn' as const, label: `${days}d left` };
}

export default function ExpiringSoonScreen() {
  useAppAppearance(state => state.scheme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { inventory, locations, settings, recordExit } = usePantryStore();
  const [exitItem, setExitItem] = useState<InventoryItem | null>(null);

  const warningStr = windowEndISO(settings.expirationWarningDays);

  const cleared = useReadNotifications(s => s.cleared);
  const clearAll = useReadNotifications(s => s.clear);
  const keyFor = (item: InventoryItem) =>
    `${item.id}:${(daysUntil(item.expiration!) ?? 0) < 0 ? 'past' : 'soon'}`;
  const expiring = inventory
    .filter(item => item.count > 0 && !!item.expiration && item.expiration <= warningStr)
    .filter(item => !cleared.has(keyFor(item)))
    .sort((a, b) => a.expiration!.localeCompare(b.expiration!));

  const allUndated = inventory.filter(item => item.count > 0 && !item.expiration && item.category !== 'hygiene');
  const unknownDates = cleared.has(`undated:${allUndated.length}`) ? [] : allUndated;
  const pastDateItems = expiring.filter(i => (daysUntil(i.expiration!) ?? 0) < 0);
  const soonItems = expiring.filter(i => (daysUntil(i.expiration!) ?? 0) >= 0);
  const unitsAtRisk = expiring.reduce((sum, item) => sum + item.count, 0);
  // Damaged or flagged stock: held out of every box until someone clears it.
  // Inventory and Build show a closable banner for this; it always lives here.
  const heldBack = inventory.filter(
    i => i.count > 0 && !isUsableCondition(i.condition) && !cleared.has(`${i.id}:damaged`),
  );

  // Seeing this page reads every notification on it, so the bell clears.
  const markRead = useReadNotifications(s => s.markRead);
  const allTeamAlerts = useTeamAlerts(s => s.alerts);
  const teamAlerts = allTeamAlerts.filter(a => !cleared.has(`alert:${a.id}`));
  const onClearAll = () => {
    cueTap();
    Alert.alert('Clear all notifications?', 'They stay cleared on this phone. Anything new still shows up.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () =>
          clearAll([
            ...cleared,
            ...notificationKeys(inventory, settings.expirationWarningDays, allTeamAlerts.map(a => a.id)),
            `undated:${allUndated.length}`,
          ]),
      },
    ]);
  };
  const loadRead = useReadNotifications(s => s.load);
  useEffect(() => {
    if (!settings.pantryId) return;
    loadRead(settings.pantryId);
    markRead(notificationKeys(inventory, settings.expirationWarningDays, teamAlerts.map(a => a.id)));
  }, [settings.pantryId, inventory, settings.expirationWarningDays, loadRead, markRead, teamAlerts]);

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
    const place = item.location_id ? shelfLabels(locations)[item.location_id] : undefined;

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

          <ResponsiveRow className="flex-row items-center justify-between gap-2 pt-1">
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
              className="min-h-[44px] shrink-0 flex-row items-center gap-1.5 rounded-md border border-hairline bg-subtle px-3 py-2"
            >
              <MaterialCommunityIcons
                name="tray-arrow-up"
                size={16}
                color={COLORS.textPrimary}
              />
              <Text variant="label" className="font-bold" numberOfLines={1}>
                Take off shelf
              </Text>
            </Pressable>
          </ResponsiveRow>
        </Card>
      </FadeInUp>
    );
  };

  return (
    <View className="flex-1 bg-transparent">
      <FlatList
        data={expiring}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        contentContainerClassName="px-gutter pt-gutter"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          expiring.length > 0 || heldBack.length > 0 || unknownDates.length > 0 || teamAlerts.length > 0 ? (
            <FadeInUp index={0}>
              <View className="mb-3 flex-row justify-end">
                <Pressable
                  onPress={onClearAll}
                  accessibilityRole="button"
                  hitSlop={8}
                  className="min-h-[40px] flex-row items-center gap-1.5 rounded-md border border-hairline px-3"
                >
                  <MaterialCommunityIcons name="notification-clear-all" size={17} color={COLORS.textSecondary} />
                  <Text variant="label" className="font-semibold">
                    Clear all
                  </Text>
                </Pressable>
              </View>
              {teamAlerts.length > 0 && (
                <Card className="mb-5 gap-1 p-4">
                  <View className="mb-1 flex-row items-center gap-2">
                    <MaterialCommunityIcons name="bullhorn-outline" size={20} color={COLORS.primaryDark} />
                    <Text variant="heading" className="flex-1 font-bold">
                      From your team
                    </Text>
                  </View>
                  {teamAlerts.map((a, i) => (
                    <View key={a.id} className="gap-0.5 py-2.5" style={i > 0 ? RULE_ABOVE : undefined}>
                      <Text variant="body" className="font-semibold">
                        {a.message}
                      </Text>
                      <Text variant="micro" tone="soft">
                        {timeAgo(a.created_at)}
                      </Text>
                    </View>
                  ))}
                </Card>
              )}
              {heldBack.length > 0 && (
                <Card className="mb-5 gap-1 p-4">
                  <View className="mb-1 flex-row items-center gap-2">
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COLORS.statusCritical} />
                    <Text variant="heading" className="flex-1 font-bold">
                      Held back from boxes
                    </Text>
                    <Badge label={`${heldBack.length}`} tone="critical" />
                  </View>
                  <Text variant="label" tone="soft" className="mb-1">
                    Damaged or flagged. Left out of every box until it's checked.
                  </Text>
                  {heldBack.map(item => (
                    <View key={item.id} className="flex-row items-center gap-3 py-2.5" style={RULE_ABOVE}>
                      <CategoryIcon category={item.category} tone="critical" />
                      <View className="flex-1">
                        <Text variant="body" className="font-semibold">
                          {item.name}
                        </Text>
                        <Text variant="micro" tone="critical" className="font-bold">
                          {CONDITION_LABELS[item.condition || 'ok']} · {item.count}{' '}
                          {item.count === 1 ? 'unit' : 'units'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          cueTap();
                          setExitItem(item);
                        }}
                        accessibilityRole="button"
                        hitSlop={8}
                        className="shrink-0 rounded-md border border-hairline bg-subtle px-3 py-2"
                      >
                        <Text variant="label" className="font-bold" numberOfLines={1}>
                          Take off shelf
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </Card>
              )}
                {unknownDates.length > 0 && (
                  <Card className="mb-2 gap-2">
                    <Text variant="label" className="font-bold">{unknownDates.length} batches have no recorded date</Text>
                    <Text variant="micro" tone="soft">Unknown does not mean checked. Read the package and record its date when available.</Text>
                    <Button label={`Check ${unknownDates[0].name}`} variant="secondary" size="compact" onPress={() => router.push({ pathname: '/item-detail', params: { id: unknownDates[0].id } })} />
                  </Card>
                )}
              {expiring.length > 0 && (
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
              )}
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
          heldBack.length > 0 ? null : (
          <EmptyState
            icon="check-circle-outline"
            tone="good"
            title="Nothing on the clock"
            body={`No stock expires in the next ${settings.expirationWarningDays} days. This page fills itself in when something does.`}
            actionLabel="Go back"
            onAction={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
          />
          )
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
