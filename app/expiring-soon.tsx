import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { Badge, Button, Card, EmptyState, Text } from '../components/ui';
import { daysUntil, windowEndISO } from '../lib/expiry';
import { InventoryItem, usePantryStore } from '../lib/store';

/**
 * What to use before it is wasted.
 *
 * The old version led with a yellow banner explaining the allocation engine,
 * then rows carrying the raw ISO date and a "Prioritize in Build Boxes" button
 * on every single line — the same action repeated twenty times.
 *
 * A volunteer standing at the shelf wants one thing from this screen: what goes
 * first. So the ordering IS the answer, each row says how long it has in days
 * rather than in a date they must subtract from today, and the action sits once
 * at the bottom where an action belongs.
 */

/** How a window of days should read: past, this week, or merely soon. */
function urgency(days: number) {
  if (days < 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Past date' };
  if (days === 0) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: 'Today' };
  if (days <= 7) return { colour: COLORS.statusCritical, tone: 'critical' as const, label: `${days}d left` };
  return { colour: COLORS.statusWarning, tone: 'warn' as const, label: `${days}d left` };
}

export default function ExpiringSoonScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { inventory, settings } = usePantryStore();

  const warningStr = windowEndISO(settings.expirationWarningDays);

  const expiring = inventory
    .filter(item => !!item.expiration && item.expiration <= warningStr)
    .sort((a, b) => a.expiration!.localeCompare(b.expiration!));

  const unitsAtRisk = expiring.reduce((sum, item) => sum + item.count, 0);

  const renderRow = ({ item, index }: { item: InventoryItem; index: number }) => {
    const days = daysUntil(item.expiration!) ?? 0;
    const state = urgency(days);

    return (
      <FadeInUp index={index + 1}>
        <Card className="mb-3 flex-row items-center gap-4">
          {/* Urgency is carried by the bar, not by a second badge. The rows are
              already in order, so the colour only has to confirm it. */}
          <View className="h-11 w-1.5 rounded-sm" style={{ backgroundColor: state.colour }} />

          <View className="flex-1">
            <Text variant="body" className="font-semibold">
              {item.name}
            </Text>
            <Text variant="micro" tone="soft" className="mt-1 capitalize">
              {item.category} · {item.count} {item.count === 1 ? 'unit' : 'units'} ·{' '}
              {item.expiration}
            </Text>
          </View>

          <Badge label={state.label} tone={state.tone} />
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
        contentContainerClassName="px-gutter pt-gutter"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          expiring.length > 0 ? (
            <FadeInUp index={0}>
              <View className="mb-5 px-1">
                <Text variant="headline">
                  {unitsAtRisk} {unitsAtRisk === 1 ? 'unit' : 'units'} to use first
                </Text>
                <Text variant="body" tone="soft" className="mt-1">
                  Everything here is inside your {settings.expirationWarningDays}-day window,
                  soonest at the top. Pack from the top down and none of it is wasted.
                </Text>
              </View>
            </FadeInUp>
          ) : null
        }
        ListFooterComponent={
          expiring.length > 0 ? (
            <FadeInUp index={expiring.length + 1}>
              <Button
                label="Build boxes with these"
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
                Box building already pulls the shortest-dated stock first.
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
    </View>
  );
}
