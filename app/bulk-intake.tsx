import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { FadeInUp } from '../components/motion';
import {
  Button,
  Card,
  CardHeader,
  CategoryIcon,
  Chip,
  Input,
  Panel,
  Section,
  Stepper,
  Text,
} from '../components/ui';
import { cueSuccess, cueTap } from '../lib/feedback';
import { Category, SOURCE_ORG_LABELS, SourceOrg, usePantryStore } from '../lib/store';

const CATEGORIES: Category[] = [
  'grain',
  'vegetable',
  'protein',
  'breakfast',
  'snack',
  'hygiene',
  'baby',
];
const SOURCES: SourceOrg[] = ['food_bank', 'grocery', 'drive', 'individual', 'other'];

/** Accepts "9/2026", "09/2026", "2026-09-01" — cans usually print only month and year. */
function parseLooseDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const monthYear = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) return `${monthYear[2]}-${monthYear[1].padStart(2, '0')}-01`;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  return null;
}

/**
 * Weighing a bulk drop.
 *
 * Bulk intake matches what pantries actually do with a big food-bank or grocery
 * load: weigh it, write down the weight, sort into bins. Nobody counts every
 * can. Weight stays the recorded truth and the unit estimate is derived, always
 * labelled as an estimate.
 *
 * The screen is built around the one number you walk over here to type. The
 * weight field is the size of the figure on the scale display, and everything
 * else — where it came from, the earliest date in the load — sits below it in
 * the order the volunteer finds it out.
 */
export default function BulkIntakeScreen() {
  const router = useRouter();
  const { lbsPerUnit, bulkLots, addBulkLot } = usePantryStore();

  const [category, setCategory] = useState<Category>('protein');
  const [weight, setWeight] = useState('');
  const [expiration, setExpiration] = useState('');
  const [sourceOrg, setSourceOrg] = useState<SourceOrg>('food_bank');
  const [sourceName, setSourceName] = useState('');
  const [notes, setNotes] = useState('');
  const [unitOverride, setUnitOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [weightFocused, setWeightFocused] = useState(false);

  const lbs = Number(weight.replace(/[^0-9.]/g, '')) || 0;
  const perUnit = lbsPerUnit[category] || 1;
  const autoUnits = Math.floor(lbs / perUnit);
  const estUnits = unitOverride ?? autoUnits;

  const parsedExpiration = useMemo(() => parseLooseDate(expiration), [expiration]);
  const expirationInvalid = expiration.trim().length > 0 && !parsedExpiration;
  const canSave = lbs > 0 && !expirationInvalid && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      await addBulkLot({
        category,
        weight_lbs: lbs,
        est_units: estUnits,
        expiration: parsedExpiration,
        date_added: new Date().toISOString().split('T')[0],
        source_org: sourceOrg,
        source_name: sourceName.trim() || null,
        notes: notes.trim() || null,
      });
      cueSuccess();
      setSavedCount(n => n + 1);
      setWeight('');
      setExpiration('');
      setNotes('');
      setUnitOverride(null);
    } catch (err: any) {
      Alert.alert('Could not save lot', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardScreen>
      <FadeInUp index={0}>
        <Card>
          <CardHeader
            title="What did you weigh?"
            subtitle="One weigh-in per category, the same way you sort into bins."
          />
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <Chip
                key={cat}
                label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                selected={cat === category}
                onPress={() => {
                  setCategory(cat);
                  setUnitOverride(null);
                }}
              />
            ))}
          </View>
        </Card>
      </FadeInUp>

      <FadeInUp index={1}>
        <Card className="gap-5">
          <View className="gap-2">
            <Text variant="label" tone="soft" className="font-semibold">
              Weight at the scale
            </Text>
            <View className="flex-row items-center gap-3">
              {/* Deliberately the biggest control on the page. It is the one
                  number the volunteer walked over here to type, and it is read
                  off a scale display in the same size. */}
              <TextInput
                value={weight}
                onChangeText={v => {
                  setWeight(v);
                  setUnitOverride(null);
                }}
                onFocus={() => setWeightFocused(true)}
                onBlur={() => setWeightFocused(false)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={COLORS.borderStrong}
                className={`h-16 flex-1 rounded-md border-[1.5px] bg-card px-4 text-[34px] font-bold text-ink ${
                  weightFocused ? 'border-brand' : 'border-outline'
                }`}
              />
              <Text variant="title" tone="soft" className="font-bold">
                lb
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-3 border-t border-hairline pt-5">
            <View className="flex-1">
              <Text variant="body" className="font-semibold">
                Estimated units
              </Text>
              <Text variant="micro" tone="soft" className="mt-0.5">
                {lbs > 0
                  ? `${lbs} lb ÷ ${perUnit} lb per unit`
                  : `Uses ${perUnit} lb per ${category} unit`}
              </Text>
            </View>
            <Stepper value={estUnits} min={0} onChange={setUnitOverride} />
          </View>

          <Panel className="flex-row gap-3">
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text variant="micro" tone="soft" className="flex-1">
              The weight is what gets recorded. The unit count is an estimate so this load still
              counts toward box building — adjust it if you know better.
            </Text>
          </Panel>
        </Card>
      </FadeInUp>

      <FadeInUp index={2}>
        <Card className="gap-5">
          <CardHeader title="Where it came from" className="mb-0" />

          <Input
            label="Earliest expiration in the load"
            value={expiration}
            onChangeText={setExpiration}
            placeholder="MM/YYYY or 2026-09-01"
            error={expirationInvalid ? 'Could not read that date — try MM/YYYY.' : null}
            hint="Use the soonest date you spot while sorting, so the whole lot gets pulled in time."
          />

          <View className="gap-2">
            <Text variant="label" tone="soft" className="font-semibold">
              Source
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SOURCES.map(src => (
                <Chip
                  key={src}
                  label={SOURCE_ORG_LABELS[src]}
                  selected={src === sourceOrg}
                  onPress={() => setSourceOrg(src)}
                />
              ))}
            </View>
          </View>

          <Input
            label="Donor name (optional)"
            value={sourceName}
            onChangeText={setSourceName}
            placeholder="Regional Food Bank"
          />

          <Input
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="3 crates dented, set aside"
          />
        </Card>
      </FadeInUp>

      <FadeInUp index={3}>
        <View className="gap-3">
          <Button
            label={lbs > 0 ? `Save ${lbs} lb of ${category}` : 'Save this lot'}
            block
            loading={saving}
            disabled={!canSave}
            icon={
              <MaterialCommunityIcons
                name="scale-balance"
                size={19}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={handleSave}
          />

          {savedCount > 0 && (
            <View className="flex-row items-center justify-center gap-2">
              <MaterialCommunityIcons
                name="check-circle"
                size={16}
                color={COLORS.statusGood}
              />
              <Text variant="label" tone="good" className="font-semibold">
                {savedCount} lot{savedCount === 1 ? '' : 's'} saved. Weigh another, or head back.
              </Text>
            </View>
          )}

          <Button
            label="Done"
            variant="secondary"
            block
            onPress={() => {
              cueTap();
              router.back();
            }}
          />
        </View>
      </FadeInUp>

      {bulkLots.length > 0 && (
        <FadeInUp index={4}>
          <Section title="Recent bulk lots">
            {bulkLots.slice(0, 5).map(lot => (
              <View key={lot.id} className="flex-row items-center gap-3">
                <CategoryIcon category={lot.category} />
                <View className="flex-1">
                  <Text variant="body" className="font-semibold capitalize">
                    {lot.category} — {lot.weight_lbs} lb
                  </Text>
                  <Text variant="micro" tone="soft" className="mt-0.5">
                    ~{lot.est_units} units · received {lot.date_added}
                    {lot.expiration ? ` · expires ${lot.expiration}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        </FadeInUp>
      )}
    </KeyboardScreen>
  );
}
