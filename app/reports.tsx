import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import {
  Button,
  Card,
  CardHeader,
  CategoryIcon,
  EmptyState,
  Screen,
  Segmented,
  Text,
} from '../components/ui';
import { cueTap } from '../lib/feedback';
import {
  bulkLotsCsv,
  exitsCsv,
  fetchExits,
  inventoryCsv,
  shareCsv,
  type StockExit,
} from '../lib/reports';
import { usePantryStore } from '../lib/store';

/**
 * What the pantry did, in the two numbers anybody asks for.
 *
 * A food bank or a grant officer wants to know how much food reached households
 * and how much was thrown away. The app has been collecting both since exits got
 * a reason attached; this is the first place either has been readable.
 *
 * It is also the honest answer to "MESA already uses spreadsheets". A prettier
 * inventory screen does not replace a spreadsheet — being able to hand somebody
 * the numbers does.
 */
const PERIODS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 0, label: 'All time' },
] as const;

const sinceFor = (days: number): string | null => {
  if (days === 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export default function ReportsScreen() {
  const { inventory, bulkLots, locations, settings, readyBoxes } = usePantryStore();

  // Packed but not collected. Not "given out" yet, and worth saying so, or a
  // pantry that packed ahead of distribution day reads its numbers as a drop.
  const waitingBoxes = readyBoxes.reduce((sum, r) => sum + (r.boxes - r.boxes_collected), 0);
  const waitingUnits = readyBoxes.reduce(
    (sum, r) => sum + Math.round((r.units_taken * (r.boxes - r.boxes_collected)) / Math.max(1, r.boxes)),
    0,
  );

  const [days, setDays] = useState<number>(30);
  const [exits, setExits] = useState<StockExit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!settings.pantryId) return;

    setLoading(true);
    fetchExits(settings.pantryId, sinceFor(days))
      .then(rows => !cancelled && setExits(rows))
      .catch(() => !cancelled && setExits([]))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [settings.pantryId, days]);

  const givenOut = exits.filter(e => e.reason === 'given_out');
  const discarded = exits.filter(e => e.reason === 'discarded');
  const units = (rows: StockExit[]) => rows.reduce((sum, e) => sum + e.count, 0);

  const givenUnits = units(givenOut);
  const wastedUnits = units(discarded);
  const movedUnits = givenUnits + wastedUnits;

  /** Given out as a share of everything that left, waste included. */
  const rescuedPct = movedUnits > 0 ? Math.round((givenUnits / movedUnits) * 100) : null;

  // What arrived in the same window, so the two sides can be compared.
  const since = sinceFor(days);
  const receivedUnits = inventory
    .filter(i => !since || new Date(`${i.date_added}T00:00:00`).toISOString() >= since)
    .reduce((sum, i) => sum + i.count, 0);
  const receivedLbs = bulkLots
    .filter(l => !since || new Date(`${l.date_added}T00:00:00`).toISOString() >= since)
    .reduce((sum, l) => sum + l.weight_lbs, 0);

  const byCategory = Object.entries(
    exits.reduce<Record<string, { given: number; wasted: number }>>((acc, e) => {
      acc[e.category] ??= { given: 0, wasted: 0 };
      if (e.reason === 'given_out') acc[e.category].given += e.count;
      if (e.reason === 'discarded') acc[e.category].wasted += e.count;
      return acc;
    }, {}),
  )
    .filter(([, v]) => v.given + v.wasted > 0)
    .sort((a, b) => b[1].given + b[1].wasted - (a[1].given + a[1].wasted));

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (settings.pantryName || 'pantry').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const exportCsv = async (name: string, csv: string) => {
    setBusy(true);
    try {
      cueTap();
      await shareCsv(name, csv);
    } catch (err: any) {
      Alert.alert('Could not export', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <FadeInUp index={0}>
        <Segmented
          value={days}
          options={PERIODS.map(p => ({ value: p.value, label: p.label }))}
          onChange={setDays}
        />
      </FadeInUp>

      {/* The headline pair. Food out and food wasted are the two numbers, and
          they belong side by side — one is only meaningful against the other. */}
      <FadeInUp index={1}>
        <Card className="flex-row items-center">
          <View className="flex-1">
            <Text variant="headline" tone="good">
              {givenUnits}
            </Text>
            <Text variant="micro" tone="soft" className="mt-1">
              units given out
            </Text>
          </View>

          <View className="h-10 w-px bg-hairline" />

          <View className="flex-1 pl-5">
            <Text variant="headline" tone="critical">
              {wastedUnits}
            </Text>
            <Text variant="micro" tone="soft" className="mt-1">
              units thrown away
            </Text>
          </View>
        </Card>
      </FadeInUp>

      {rescuedPct !== null && (
        <FadeInUp index={2}>
          <View className="gap-2 px-1">
            <View className="h-2.5 flex-row overflow-hidden rounded-full bg-muted">
              <View className="bg-good" style={{ flex: givenUnits }} />
              <View className="bg-critical" style={{ flex: wastedUnits }} />
            </View>
            <Text variant="micro" tone="soft">
              {rescuedPct}% of everything that left the shelf reached a household.
            </Text>
          </View>
        </FadeInUp>
      )}

      {waitingBoxes > 0 && (
        <FadeInUp index={2}>
          <Text variant="micro" tone="soft" className="px-1">
            Not counted yet: {waitingBoxes} packed {waitingBoxes === 1 ? 'box' : 'boxes'} (about{' '}
            {waitingUnits} units) waiting for pickup. They count as given out once collected.
          </Text>
        </FadeInUp>
      )}

      <FadeInUp index={3}>
        <Card className="flex-row items-center">
          <View className="flex-1">
            <Text variant="heading">{receivedUnits}</Text>
            <Text variant="micro" tone="soft" className="mt-1">
              units taken in
            </Text>
          </View>
          <View className="h-10 w-px bg-hairline" />
          <View className="flex-1 pl-5">
            <Text variant="heading">{Math.round(receivedLbs)} lb</Text>
            <Text variant="micro" tone="soft" className="mt-1">
              weighed in bulk
            </Text>
          </View>
        </Card>
      </FadeInUp>

      {byCategory.length > 0 && (
        <FadeInUp index={4}>
          <Card>
            <CardHeader
              title="By category"
              subtitle="Where the food went, and where it was lost."
            />
            {byCategory.map(([category, v], i) => (
              <View
                key={category}
                className={`flex-row items-center gap-3 py-3 ${
                  i < byCategory.length - 1 ? 'border-b border-hairline' : ''
                }`}
              >
                <CategoryIcon category={category} />
                <Text variant="body" className="flex-1 capitalize">
                  {category}
                </Text>
                <Text variant="label" tone="good" className="font-bold">
                  {v.given}
                </Text>
                <Text variant="micro" tone="soft">
                  /
                </Text>
                <Text variant="label" tone="critical" className="font-bold">
                  {v.wasted}
                </Text>
              </View>
            ))}
          </Card>
        </FadeInUp>
      )}

      {!loading && exits.length === 0 && (
        <FadeInUp index={5}>
          <EmptyState
            icon="chart-line"
            title="Nothing has left the shelf yet"
            body="Once stock is given out or thrown away, the numbers appear here. Use 'Take off shelf' in Inventory rather than deleting — deleting records nothing."
          />
        </FadeInUp>
      )}

      {/* The spreadsheet bridge. Whoever MESA reports to still wants a sheet, and
          an app that cannot produce one is an app you run ALONGSIDE a
          spreadsheet rather than instead of it. */}
      <FadeInUp index={6}>
        <Card className="gap-3">
          <CardHeader
            title="Export"
            subtitle="Opens the share sheet with a CSV any spreadsheet will read."
            className="mb-0"
          />
          <Button
            label="Current shelf"
            variant="secondary"
            block
            disabled={busy}
            icon={
              <MaterialCommunityIcons
                name="file-delimited-outline"
                size={18}
                color={COLORS.textPrimary}
              />
            }
            onPress={() =>
              exportCsv(`${slug}-inventory-${stamp}.csv`, inventoryCsv(inventory, locations))
            }
          />
          <Button
            label="What left the shelf"
            variant="secondary"
            block
            disabled={busy || exits.length === 0}
            icon={
              <MaterialCommunityIcons
                name="file-delimited-outline"
                size={18}
                color={COLORS.textPrimary}
              />
            }
            onPress={() => exportCsv(`${slug}-exits-${stamp}.csv`, exitsCsv(exits))}
          />
          <Button
            label="Bulk donations"
            variant="secondary"
            block
            disabled={busy || bulkLots.length === 0}
            icon={
              <MaterialCommunityIcons
                name="file-delimited-outline"
                size={18}
                color={COLORS.textPrimary}
              />
            }
            onPress={() => exportCsv(`${slug}-bulk-lots-${stamp}.csv`, bulkLotsCsv(bulkLots))}
          />
        </Card>
      </FadeInUp>
    </Screen>
  );
}
