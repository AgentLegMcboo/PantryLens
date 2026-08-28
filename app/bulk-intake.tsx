import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { CARD_ELEVATION, COLORS, RADII, SPACING } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import {
  Category,
  SOURCE_ORG_LABELS,
  SourceOrg,
  usePantryStore
} from '../lib/store';
import { cueSuccess, cueTap } from '../lib/feedback';
import { PressableScale } from '../components/motion';

const CATEGORIES: Category[] = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'];
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
 * Bulk intake matches what pantries actually do with a big food-bank or grocery
 * drop: weigh the load, write down the weight, sort into bins. Nobody counts
 * every can. Weight stays the recorded truth and the unit estimate is derived,
 * always labelled as an estimate.
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
        notes: notes.trim() || null
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
    <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Which category?</Text>
        <Text style={styles.cardSub}>One weigh-in per category, the same way you sort into bins.</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map(cat => {
            const active = cat === category;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => { cueTap(); setCategory(cat); setUnitOverride(null); }}
                style={[
                  styles.chip,
                  active && { backgroundColor: COLORS.categories[cat], borderColor: COLORS.categories[cat] }
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Weight at the scale</Text>
        <View style={styles.weightRow}>
          <TextInput
            style={styles.weightInput}
            value={weight}
            onChangeText={v => { setWeight(v); setUnitOverride(null); }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={COLORS.textSecondary}
          />
          <Text style={styles.weightUnit}>lb</Text>
        </View>

        <View style={styles.estimateBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.estimateLabel}>Estimated units</Text>
            <Text style={styles.estimateHint}>
              {lbs > 0
                ? `${lbs} lb ÷ ${perUnit} lb per unit`
                : `Uses ${perUnit} lb per ${category} unit`}
            </Text>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => { cueTap(); setUnitOverride(Math.max(0, estUnits - 1)); }}
            >
              <Text style={styles.stepperGlyph}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{estUnits}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => { cueTap(); setUnitOverride(estUnits + 1); }}
            >
              <Text style={styles.stepperGlyph}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.noteBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.noteText}>
            The weight is what gets recorded. The unit count is an estimate so this load still
            counts toward box building — adjust it if you know better.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expiration & source</Text>

        <Text style={styles.label}>Earliest expiration in the load</Text>
        <TextInput
          style={styles.input}
          value={expiration}
          onChangeText={setExpiration}
          placeholder="MM/YYYY or 2026-09-01"
          placeholderTextColor={COLORS.textSecondary}
        />
        <Text style={[styles.hint, expirationInvalid && { color: COLORS.statusCritical }]}>
          {expirationInvalid
            ? 'Could not read that date — try MM/YYYY.'
            : 'Use the soonest date you spot while sorting, so the whole lot gets pulled in time.'}
        </Text>

        <Text style={styles.label}>Where it came from</Text>
        <View style={styles.chipWrap}>
          {SOURCES.map(src => {
            const active = src === sourceOrg;
            return (
              <TouchableOpacity
                key={src}
                onPress={() => setSourceOrg(src)}
                style={[styles.chip, active && styles.chipActiveNeutral]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {SOURCE_ORG_LABELS[src]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Donor name (optional)</Text>
        <TextInput
          style={styles.input}
          value={sourceName}
          onChangeText={setSourceName}
          placeholder="e.g. Regional Food Bank"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. 3 crates dented, set aside"
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      <PressableScale
        style={[styles.saveBtn, !canSave && { opacity: 0.5 }] as any}
        cue="press"
        onPress={handleSave}
        disabled={!canSave}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons name="scale-balance" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.saveBtnText}>Save this lot</Text>
          </>
        )}
      </PressableScale>

      {savedCount > 0 && (
        <Text style={styles.savedNote}>
          {savedCount} lot{savedCount === 1 ? '' : 's'} saved. Add another, or head back.
        </Text>
      )}

      <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>

      {bulkLots.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent bulk lots</Text>
          {bulkLots.slice(0, 5).map(lot => (
            <View key={lot.id} style={styles.lotRow}>
              <View style={[styles.lotSwatch, { backgroundColor: COLORS.categories[lot.category] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lotTitle}>
                  {lot.category.charAt(0).toUpperCase() + lot.category.slice(1)} — {lot.weight_lbs} lb
                </Text>
                <Text style={styles.lotSub}>
                  ~{lot.est_units} units est. · received {lot.date_added}
                  {lot.expiration ? ` · expires ${lot.expiration}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: SPACING.xl * 2 },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    ...CARD_ELEVATION,
    padding: SPACING.md
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  cardSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.background
  },
  chipActiveNeutral: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryLight },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  chipTextActive: { color: COLORS.textOnPrimary },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  weightInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.md,
    height: 64,
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  weightUnit: { fontSize: 20, fontWeight: '700', color: COLORS.textSecondary },
  estimateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft
  },
  estimateLabel: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  estimateHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepperBtn: {
    width: SPACING.touch,
    height: SPACING.touch,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepperGlyph: { fontSize: 24, fontWeight: '700', color: COLORS.primaryDark },
  stepperValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, minWidth: 44, textAlign: 'center' },
  noteBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: SPACING.sm
  },
  noteText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginTop: SPACING.md, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: SPACING.touch,
    fontSize: 15,
    color: COLORS.textPrimary
  },
  hint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  saveBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    minHeight: SPACING.touch + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.textOnPrimary },
  savedNote: { fontSize: 13, color: COLORS.secondary, textAlign: 'center', fontWeight: '600' },
  doneBtn: {
    borderRadius: RADII.md,
    minHeight: SPACING.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.cardSurface
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  lotRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  lotSwatch: { width: 6, height: 36, borderRadius: RADII.sm },
  lotTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  lotSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }
});
