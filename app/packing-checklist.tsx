import { ResponsiveRow } from '../components/ui/responsive-row';
import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { computeAllocation, isBulkUnit } from '../lib/allocation';
import { DIET_TAG_LABELS, normaliseDietTags } from '../lib/diet';
import { normaliseItems, normaliseRules } from '../lib/box-presets';
import { describeRules } from '../lib/box-presets';
import { describeFamilySizes, normaliseFamilySizes } from '../lib/box-families';
import { FadeInUp, PRESS_SCALE_ROW, ProgressBar, Tappable } from '../components/motion';
import { Badge, Button, Card, CategoryIcon, EmptyState, Screen, Sheet, Text } from '../components/ui';
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
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { inventory, bulkLots, boxRules, locations, settings, packBoxes, packBoxBatch } = usePantryStore();
  // Build always passes this. The fallback only matters if the screen is opened
  // some other way, and then the pantry's own target beats an invented one.
  const targetBoxes = parseInt(params.targetBoxes as string, 10) || settings.boxTarget;
  const familySize = parseInt(params.familySize as string, 10) || 4;
  const individualFamilies = params.individualFamilies === '1';
  let routeFamilySizes: number[];
  try {
    routeFamilySizes = normaliseFamilySizes(JSON.parse(String(params.familySizes ?? '[]')), targetBoxes, familySize);
  } catch {
    routeFamilySizes = normaliseFamilySizes([], targetBoxes, familySize);
  }
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
  let routeItems: ReturnType<typeof normaliseItems> = [];
  try {
    routeItems = typeof params.items === 'string' ? normaliseItems(JSON.parse(params.items)) : [];
  } catch {
    routeItems = [];
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
      items: routeItems,
      familySizes: routeFamilySizes,
      scalesWithFamily: scales,
    }),
  );

  /**
   * One line per food per shelf. The plan lists each stock row on its own, so
   * two deliveries of red potatoes showed as two "Red potatoes" lines. Merged
   * here for reading only: finishing still uses the plan's per-row picks.
   */
  const pickGroups = useMemo(
    () =>
      plan.packingChecklist.map(group => {
        const merged = new Map<string, (typeof group.items)[number]>();
        for (const item of group.items) {
          const loc = inventory.find(inv => inv.id === item.id)?.location_id ?? '';
          const key = `${item.name.trim().toLowerCase()}|${loc}`;
          const prev = merged.get(key);
          if (!prev) {
            merged.set(key, { ...item });
          } else {
            prev.count += item.count;
            prev.useFirst = prev.useFirst || item.useFirst;
            if (item.expiration && (!prev.expiration || item.expiration < prev.expiration)) {
              prev.expiration = item.expiration;
            }
          }
        }
        return { ...group, items: [...merged.values()] };
      }),
    // The plan is a snapshot taken once, so this only needs working out once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan],
  );

  /**
   * One id per checklist. If "Finish" is retried after a dropped connection,
   * the server recognises the same pack and doesn't deduct the shelf twice.
   */
  const [runId] = useState(() => Crypto.randomUUID());
  const [individualRunIds] = useState(() => plan.boxes.map(() => Crypto.randomUUID()));
  const [boxContentsOpen, setBoxContentsOpen] = useState(false);
  const [contentsIndex, setContentsIndex] = useState(0);
  const [packing, setPacking] = useState(false);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allKeys = useMemo(
    () =>
      pickGroups.flatMap(group =>
        group.items.map((item, i) => `${group.label ?? group.category}-${item.id}-${i}`),
      ),
    [pickGroups],
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
      const result = individualFamilies ? await packBoxBatch(plan.boxes.map((box, index) => ({
        runId: individualRunIds[index],
        boxCount: 1,
        lines: box.allocatedItems.map(pick => ({
          kind: isBulkUnit(pick.item) ? 'lot' as const : 'item' as const,
          id: pick.item.id,
          count: pick.countToGrab,
        })),
        boxName: boxName ?? 'Standard family box',
        perBox: { ...box.perBoxNeeds, familySize: box.familySize, boxNumber: box.number, items: box.itemNeeds },
      }))) : await packBoxes({
        runId,
        boxCount: plan.achievableBoxes,
        lines,
        boxName: boxName ?? 'Standard family box',
        perBox: { ...plan.perBoxNeeds, familySize, items: plan.boxes[0]?.itemNeeds ?? [] },
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
        `${err?.message ?? 'The connection dropped.'}\n\n${individualFamilies ? 'Some boxes may already be saved in Ready to go. Retry to finish saving this batch; saved boxes will not be counted twice.' : "Your boxes are still packed. It's safe to try again: the same pack can't be counted twice."}`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Try again', onPress: () => handleFinish() },
        ],
      );
    } finally {
      setPacking(false);
    }
  };

  const recipe = describeRules(plan.perBoxNeeds, plan.boxes[0]?.itemNeeds ?? []);

  if (total === 0) {
    return (
      <View className="flex-1 justify-center bg-transparent">
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
    <>
    <Screen>
      {/* How far through you are, which is the only thing this screen has to
          keep telling you while your eyes are on the shelf. */}
      <FadeInUp index={0}>
        <View className="px-1">
          <ResponsiveRow className="flex-row items-baseline justify-between">
            <Text variant="headline">
              {doneCount} of {total} picked
            </Text>
            <Text variant="label" tone="soft">
              {plan.achievableBoxes} {plan.achievableBoxes === 1 ? 'box' : 'boxes'}
            </Text>
          </ResponsiveRow>

          <View className="mt-3">
            <ProgressBar
              progress={total === 0 ? 0 : doneCount / total}
              color={allDone ? COLORS.statusGood : COLORS.primaryLight}
              height={10}
            />
          </View>

          <Text variant="micro" tone="soft" className="mt-3 capitalize">
            {individualFamilies ? describeFamilySizes(plan.familySizes.slice(0, plan.achievableBoxes)) : `${boxName ?? 'Each box'}${scales ? `, family of ${familySize}` : ''}: ${recipe}`}
          </Text>
          {individualFamilies && (
            <Button label="See what goes in each box" variant="secondary" className="mt-3" onPress={() => setBoxContentsOpen(true)} />
          )}
          {plan.achievableBoxes < targetBoxes && <Text variant="micro" tone="warn" className="mt-2">
            Picking for boxes 1–{plan.achievableBoxes}. The remaining {targetBoxes - plan.achievableBoxes} need more stock.
          </Text>}

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

      {pickGroups.map((group, groupIndex) => {
        const groupKeys = group.items.map((item, i) => `${group.label ?? group.category}-${item.id}-${i}`);
        const groupAllChecked = groupKeys.length > 0 && groupKeys.every(k => !!checked[k]);

        return (
          <FadeInUp key={group.label ?? group.category} index={groupIndex + 1}>
            <Card className="gap-1">
              <View className="mb-2 flex-row items-center gap-3">
                <CategoryIcon category={group.category} />
                <View className="flex-1">
                  <Text variant="heading" className={group.label ? undefined : 'capitalize'}>
                    {group.label ?? group.category}
                  </Text>
                  <Text variant="micro" tone="soft">
                    {group.allocatedCount} total{individualFamilies ? ' · shared pick list for your boxes' : ` · ${group.neededPerBox} per box`}
                  </Text>
                </View>
                {groupKeys.length > 1 && (
                  <Tappable
                    onPress={() => {
                      cueTap();
                      setChecked(prev => {
                        const next = { ...prev };
                        for (const k of groupKeys) next[k] = !groupAllChecked;
                        return next;
                      });
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={groupAllChecked ? `Uncheck all ${group.label ?? group.category}` : `Check all ${group.label ?? group.category}`}
                    className="min-h-[40px] flex-row items-center gap-1 rounded-md bg-subtle px-3 py-1.5"
                  >
                    <MaterialCommunityIcons
                      name={groupAllChecked ? 'check-all' : 'playlist-check'}
                      size={16}
                      color={groupAllChecked ? COLORS.statusGood : COLORS.primaryDark}
                    />
                    <Text variant="micro" tone={groupAllChecked ? 'good' : 'brand'} className="font-bold">
                      {groupAllChecked ? 'All picked' : 'Check all'}
                    </Text>
                  </Tappable>
                )}
              </View>

              {group.items.map((item, i) => {
                const key = `${group.label ?? group.category}-${item.id}-${i}`;
                const isChecked = !!checked[key];
                // Where to walk. A pick list that says what but not where sends a
                // volunteer round the room once per line.
                const place = locations.find(
                  l => l.id === inventory.find(inv => inv.id === item.id)?.location_id,
                )?.name;

                return (
                  <Tappable
                    scaleTo={PRESS_SCALE_ROW}
                    key={key}
                    onPress={() => toggle(key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    // 60px so it can be hit easily while holding a tin.
                    className="min-h-[60px] flex-row items-center gap-3 py-2.5"
                    style={i < group.items.length - 1 ? RULE_BELOW : undefined}
                  >
                    <MaterialCommunityIcons
                      name={isChecked ? 'check-circle' : 'circle-outline'}
                      size={30}
                      color={isChecked ? COLORS.statusGood : COLORS.borderStrong}
                    />

                    <View className="flex-1 gap-1">
                      <Text
                        variant="body"
                        tone={isChecked ? 'soft' : 'default'}
                        className="font-semibold"
                        style={isChecked ? { textDecorationLine: 'line-through' } : undefined}
                      >
                        {item.name}
                      </Text>
                      {(place || item.expiration) && (
                        <View className="flex-row flex-wrap items-center gap-2">
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
                          {item.expiration && (
                            <Text variant="micro" tone="soft">
                              Expires {item.expiration}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>

                    {item.useFirst && !isChecked ? <Badge label="Use first" tone="warn" /> : null}

                    {/* The count is what the volunteer is actually reading off
                        this row, so it gets to be the biggest thing on it. */}
                    <View className="min-w-[44px] items-end">
                      <Text
                        variant="title"
                        tone={isChecked ? 'soft' : 'default'}
                        className="font-bold"
                      >
                        ×{item.count}
                      </Text>
                    </View>
                  </Tappable>
                );
              })}
            </Card>
          </FadeInUp>
        );
      })}

      <FadeInUp index={pickGroups.length + 1}>
        <View className="gap-3">
          {allDone && (
            <View
              className="flex-row items-center gap-3 rounded-lg border px-4 py-3"
              style={{ backgroundColor: '#EEF4E9', borderColor: COLORS.statusGood }}
            >
              <MaterialCommunityIcons name="check-decagram" size={24} color={COLORS.statusGood} />
              <Text variant="label" className="flex-1 font-bold" style={{ color: '#2E5128' }}>
                Trolley full! All {total} items picked for {plan.achievableBoxes}{' '}
                {plan.achievableBoxes === 1 ? 'box' : 'boxes'}.
              </Text>
            </View>
          )}
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
    <Sheet visible={boxContentsOpen} onClose={() => setBoxContentsOpen(false)} title="Pack each box"
      subtitle="Use the box numbers when labeling your packed boxes. Each household has its own quantities.">
      <View className="flex-row items-center justify-between gap-2">
        <Button label="Previous" variant="secondary" size="compact" disabled={contentsIndex === 0} onPress={() => setContentsIndex(index => index - 1)} />
        <Text variant="label">{contentsIndex + 1} of {plan.boxes.length}</Text>
        <Button label="Next" variant="secondary" size="compact" disabled={contentsIndex >= plan.boxes.length - 1} onPress={() => setContentsIndex(index => index + 1)} />
      </View>
      {plan.boxes.slice(contentsIndex, contentsIndex + 1).map(box => (
        <Card key={box.number} className="gap-2">
          <Text variant="heading">Box {box.number} · {box.familySize} {box.familySize === 1 ? 'person' : 'people'}</Text>
          {box.allocatedItems.map((pick, index) => (
            <Text key={`${pick.item.id}-${index}`} variant="label">{pick.countToGrab} × {pick.item.name}</Text>
          ))}
        </Card>
      ))}
      <Button label="Back to picking" block onPress={() => setBoxContentsOpen(false)} />
    </Sheet>
    </>
  );
}
