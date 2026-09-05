import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { computeAllocation } from '../lib/allocation';
import { FadeInUp, ProgressBar } from '../components/motion';
import { Badge, Button, Card, CategoryIcon, EmptyState, Screen, Text } from '../components/ui';
import { cueSuccess, cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';

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
  const targetBoxes = parseInt(params.targetBoxes as string, 10) || 12;
  const familySize = parseInt(params.familySize as string, 10) || 4;

  const { inventory, bulkLots, boxRules, deductItems } = usePantryStore();
  const plan = computeAllocation(inventory, boxRules, targetBoxes, familySize, bulkLots);

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

  const handleFinish = () => {
    deductItems(plan.allocatedItems.map(a => ({ id: a.item.id, count: a.countToGrab })));
    cueSuccess();
    Alert.alert(
      'Boxes packed',
      `${plan.achievableBoxes} ${plan.achievableBoxes === 1 ? 'box is' : 'boxes are'} ready, and the shelf counts have come down to match.`,
      [{ text: 'Done', onPress: () => router.replace('/(tabs)') }],
    );
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
            Each box, family of {familySize}: {recipe}
          </Text>
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
                      {item.expiration ? (
                        <Text variant="micro" tone="soft" className="mt-0.5">
                          Expires {item.expiration}
                        </Text>
                      ) : null}
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
            disabled={!allDone}
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
