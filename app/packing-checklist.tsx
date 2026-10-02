import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { computeAllocation, isBulkUnit } from '../lib/allocation';
import { DIET_TAG_LABELS, normaliseDietTags } from '../lib/diet';
import { normaliseRules } from '../lib/box-presets';
import { FadeInUp, ProgressBar } from '../components/motion';
import { Badge, Button, Card, CategoryIcon, EmptyState, Screen, Text } from '../components/ui';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { type PackLine, usePantryStore } from '../lib/store';

/**
 * The pick list, walked one shelf at a time.
 *
 * The old version opened on a card explaining the per-box recipe in shouted
 * capitals, then category cards whose rows carried a tick, a name, a date, a
 * "USE FIRST" badge and a "Grab 3" badge — five things per line, none of which
 * was the one a volunteer needs while walking a shelf with a trolley.
 *
 * This is a checklist, so it is built like one: how far through you are at the
 * top, big tap targets down the page, and the finish button only lights up when
 * the trolley is actually full. Ticking a row visibly strikes it out — the
 * progress you can see is what makes a long pick list bearable.
 */
export default function PackingChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { inventory, bulkLots, boxRules, locations, settings, packBoxes } = usePantryStore();
  // Build always passes this. The fallback only matters if the screen is opened
  // some other way, and then the pantry's own target beats an invented one.
  const targetBoxes = parseInt(params.targetBoxes as string, 10) || settings.boxTarget;
  const familySize = parseInt(params.familySize as string, 10) || 4;
  /**
   * The box's dietary rules, carried from Build.
   *
   * The plan is recomputed here rather than passed whole, so without these the
   * pick list would be built from a different pool than the figure the
   * volunteer agreed to — and the difference would be exactly the food the box
   * exists to keep out.
   */
  const parseTags = (raw: unknown) =>
    normaliseDietTags(String(raw ?? '').split(',').filter(Boolean));
  const excludes = parseTags(params.excludes);
  const requires = parseTags(params.requires);

  // The box chosen on Build. Carried in the route rather than looked up, because
  // a preset used once was never saved to look up. Anything unreadable falls
  // back to the pantry default rather than packing an empty box.
  const boxName = typeof params.boxName === 'string' && params.boxName ? params.boxName : null;
  const scales = params.scales !== '0';
  let routeRules: ReturnType<typeof normaliseRules> | null = null;
  try {
    routeRules = typeof params.rules === 'string' ? normaliseRules(JSON.parse(params.rules)) : null;
  } catch {
    routeRules = null;
  }

  /**
   * The pick list is a snapshot taken when the screen opens, not a live view.
   *
   * It used to be recomputed on every render, so when another volunteer's
   * changes arrived over realtime the rows could shift under your finger mid-
   * pick, and ticks keyed by position could land on a different item. The
   * server reconciles against the real stock when you finish, and reports any
   * line that ran short, so the list doesn't need to chase the database.
   */
  const [plan] = useState(() =>
    computeAllocation(inventory, routeRules ?? boxRules, targetBoxes, familySize, bulkLots, {
      warningDays: settings.expirationWarningDays,
      excludes,
      requires,
    }),
  );

  /**
   * One id per checklist. If "Finish" is retried after a dropped connection,
   * the server recognises the same pack and doesn't deduct the shelf twice.
   */
  const [runId] = useState(() => Crypto.randomUUID());
  const [packing, setPacking] = useState(false);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allKeys = useMemo(
    () =>
      plan.packingChecklist.flatMap(group =>
        group.items.map((item, i) => `${group.category}-${item.id}-${i}`),
      ),
    [plan.packingChecklist],
  );

  const doneCount = allKeys.filter(key => checked[key]).length;
  const total = allKeys.length;
  const allDone = total > 0 && doneCount === total;

  const toggle = (key: string) => {
    cueTap();
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFinish = async () => {
    if (packing) return;

    const lines: PackLine[] = plan.allocatedItems.map(a => ({
      kind: isBulkUnit(a.item) ? 'lot' : 'item',
      id: a.item.id,
      count: a.countToGrab,
    }));
    // Captured now: once the refetch lands, those rows may no longer exist.
    const nameOf = new Map(plan.allocatedItems.map(a => [a.item.id, a.item.name]));

    setPacking(true);
    try {
      // Awaited. This used to be fired and forgotten, so the success alert
      // below appeared whether or not the shelf was ever updated.
      const result = await packBoxes({
        runId,
        boxCount: plan.achievableBoxes,
        lines,
        boxName: boxName ?? 'Standard family box',
        perBox: plan.perBoxNeeds,
      });

      const boxes = `${plan.achievableBoxes} ${plan.achievableBoxes === 1 ? 'box is' : 'boxes are'}`;

      if (result.shortfalls.length > 0) {
        cueWarn();
        const detail = result.shortfalls
          .map(sf => `• ${nameOf.get(sf.id) ?? 'An item'}: needed ${sf.wanted}, records had ${sf.taken}`)
          .join('\n');
        Alert.alert(
          'Packed, but some counts were short',
          `${boxes} done and the shelf is updated. The records had less than you picked for:\n\n${detail}\n\nSomeone may have packed from the same stock. Worth a look at those shelves.`,
          [{ text: 'Done', onPress: () => router.replace('/(tabs)') }],
        );
        return;
      }

      cueSuccess();
      Alert.alert(
        'Boxes packed',
        `${boxes} off the shelf and waiting in Ready to go. They count as given out once families pick them up.`,
        [
          { text: 'Done', style: 'cancel', onPress: () => router.replace('/(tabs)') },
          { text: 'See ready boxes', onPress: () => router.replace('/ready-boxes') },
        ],
      );
    } catch (err: any) {
      cueWarn();
      Alert.alert(
        'Could not update the shelf',
        `${err?.message ?? 'The connection dropped.'}\n\nYour boxes are still packed. It's safe to try again: the same pack can't be counted twice.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Try again', onPress: () => handleFinish() },
        ],
      );
    } finally {
      setPacking(false);
    }
  };

  const recipe = Object.entries(plan.perBoxNeeds)
    .filter(([, qty]) => qty > 0)
    .map(([cat, qty]) => `${qty} ${cat}`)
    .join(' · ');

  if (total === 0) {
    return (
      <View className="flex-1 justify-center bg-canvas">
        <EmptyState
          icon="package-variant"
          title="Nothing to pick yet"
          body="A box needs every category the recipe calls for. Add stock, or lower the per-box amounts in pantry settings."
          actionLabel="Back to building"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <Screen>
      {/* How far through you are, which is the only thing this screen has to
          keep telling you while your eyes are on the shelf. */}
      <FadeInUp index={0}>
        <View className="px-1">
          <View className="flex-row items-baseline justify-between">
            <Text variant="headline">
              {doneCount} of {total} picked
            </Text>
            <Text variant="label" tone="soft">
              {plan.achievableBoxes} {plan.achievableBoxes === 1 ? 'box' : 'boxes'}
            </Text>
          </View>

          <View className="mt-3">
            <ProgressBar
              progress={total === 0 ? 0 : doneCount / total}
              color={allDone ? COLORS.statusGood : COLORS.primaryLight}
              height={10}
            />
          </View>

          <Text variant="micro" tone="soft" className="mt-3 capitalize">
            {boxName ?? 'Each box'}{scales ? `, family of ${familySize}` : ''}: {recipe}
          </Text>

          {/* Why this list is shorter than the volunteer expects. Said here as
              well as on Build, because this is the screen they walk the room
              with and the one where a substitution gets made on the fly. */}
          {(excludes.length > 0 || requires.length > 0) && (
            <View className="mt-3 flex-row gap-2">
              <MaterialCommunityIcons
                name="shield-alert-outline"
                size={15}
                color={COLORS.statusWarning}
                style={{ marginTop: 1 }}
              />
              <Text variant="micro" tone="soft" className="flex-1">
                {requires.length > 0 && (
                  <>
                    Only food recorded as{' '}
                    {requires.map(t => DIET_TAG_LABELS[t].toLowerCase()).join(' and ')}.{' '}
                  </>
                )}
                {excludes.length > 0 && (
                  <>
                    Nothing known to contain{' '}
                    {excludes
                      .map(t => DIET_TAG_LABELS[t].toLowerCase().replace(' / gluten', ' or gluten'))
                      .join(' or ')}
                    .{' '}
                  </>
                )}
                If you swap something in, check it yourself — the app only knows what it was told.
              </Text>
            </View>
          )}
        </View>
      </FadeInUp>

      {plan.packingChecklist.map((group, groupIndex) => {
        return (
          <FadeInUp key={group.category} index={groupIndex + 1}>
            <Card className="gap-1">
              <View className="mb-2 flex-row items-center gap-3">
                <CategoryIcon category={group.category} />
                <Text variant="heading" className="flex-1 capitalize">
                  {group.category}
                </Text>
                <Text variant="micro" tone="soft">
                  {group.allocatedCount} total · {group.neededPerBox} per box
                </Text>
              </View>

              {group.items.map((item, i) => {
                const key = `${group.category}-${item.id}-${i}`;
                const isChecked = !!checked[key];
                // Where to walk. A pick list that says what but not where sends a
                // volunteer round the room once per line.
                const place = locations.find(
                  l => l.id === inventory.find(inv => inv.id === item.id)?.location_id,
                )?.name;

                return (
                  <Pressable
                    key={key}
                    onPress={() => toggle(key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    // 56px so it can be hit while holding a tin.
                    className="min-h-[56px] flex-row items-center gap-3 border-b border-hairline py-2"
                  >
                    <MaterialCommunityIcons
                      name={isChecked ? 'check-circle' : 'circle-outline'}
                      size={28}
                      color={isChecked ? COLORS.statusGood : COLORS.borderStrong}
                    />

                    <View className="flex-1">
                      <Text
                        variant="body"
                        tone={isChecked ? 'soft' : 'default'}
                        className="font-semibold"
                        style={isChecked ? { textDecorationLine: 'line-through' } : undefined}
                      >
                        {item.name}
                      </Text>
                      {(place || item.expiration) && (
                        <Text variant="micro" tone="soft" className="mt-0.5">
                          {[place, item.expiration && `expires ${item.expiration}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      )}
                    </View>

                    {item.useFirst && !isChecked ? <Badge label="Use first" tone="warn" /> : null}

                    {/* The count is what the volunteer is actually reading off
                        this row, so it gets to be the biggest thing on it. */}
                    <Text
                      variant="title"
                      tone={isChecked ? 'soft' : 'default'}
                      className="min-w-[32px] text-right"
                    >
                      {item.count}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          </FadeInUp>
        );
      })}

      <FadeInUp index={plan.packingChecklist.length + 1}>
        <View className="gap-3">
          <Button
            label={allDone ? 'Finish and update the shelf' : `${total - doneCount} still to pick`}
            block
            loading={packing}
            disabled={!allDone || packing}
            icon={
              <MaterialCommunityIcons
                name="check-all"
                size={20}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={handleFinish}
          />
          <Text variant="micro" tone="soft" className="text-center">
            {allDone
              ? 'This takes what you picked back off the shelf counts.'
              : 'Tick every line as it goes in the trolley.'}
          </Text>
        </View>
      </FadeInUp>
    </Screen>
  );
}
