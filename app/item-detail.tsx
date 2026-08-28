import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { CARD_ELEVATION, COLORS, RADII, SPACING } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { cueTap, cueWarn } from '../lib/feedback';
import { Condition, CONDITION_LABELS, isUsableCondition, usePantryStore } from '../lib/store';

export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { getItem, updateItem, deleteItem } = usePantryStore();

  const item = getItem(id as string);

  // Every hook runs before the not-found branch, without exception. These used
  // to sit below an early return, so the moment the item left the store — a
  // delete, or a realtime refetch landing while this screen was open — React
  // saw fewer hooks than the previous render and tore the app down.
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? 'unknown');
  const [count, setCount] = useState(item?.count ?? 1);
  const [expiration, setExpiration] = useState(item?.expiration || '');
  const [condition, setCondition] = useState<Condition>(item?.condition ?? 'ok');

  if (!item) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Item not found in inventory.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Back to Inventory</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSave = () => {
    updateItem(item.id, {
      name: name.trim(),
      category: category as any,
      count,
      expiration: expiration.trim() || null,
      condition
    });
    Alert.alert('Saved!', 'Item updated successfully.');
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Item?', `Remove "${item.name}" from live inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteItem(item.id);
          router.back();
        }
      }
    ]);
  };

  return (
    <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Item Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.catGrid}>
          {['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'].map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && styles.catChipActive]}
              onPress={() => setCategory(cat as any)}
            >
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Quantity in Stock</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setCount(Math.max(1, count - 1))}
          >
            <MaterialCommunityIcons name="minus" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.stepVal}>{count}</Text>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setCount(count + 1)}
          >
            <MaterialCommunityIcons name="plus" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Expiration Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          value={expiration}
          onChangeText={setExpiration}
        />

        {/* The only place a flagged item can be cleared. Intake can mark a can
            dented, which holds it out of every box — without this the item was
            stuck that way for good, and the shelf slowly filled with stock the
            allocator refused to touch. */}
        <Text style={styles.label}>Condition</Text>
        <View style={styles.catGrid}>
          {(Object.keys(CONDITION_LABELS) as Condition[]).map(cond => {
            const active = condition === cond;
            const good = cond === 'ok';
            return (
              <TouchableOpacity
                key={cond}
                style={[
                  styles.catChip,
                  active && {
                    backgroundColor: good ? COLORS.statusGood : COLORS.statusCritical,
                    borderColor: good ? COLORS.statusGood : COLORS.statusCritical
                  }
                ]}
                onPress={() => {
                  if (cond === 'ok') cueTap();
                  else cueWarn();
                  setCondition(cond);
                }}
              >
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                  {CONDITION_LABELS[cond]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!isUsableCondition(condition) && (
          <Text style={styles.conditionNote}>
            Held out of box building until someone marks it Good again.
          </Text>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Added: {item.date_added}</Text>
          <Text style={styles.metaText}>Source: {item.source}</Text>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.statusCritical} />
          <Text style={styles.deleteBtnText}>Delete Item</Text>
        </TouchableOpacity>
      </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    ...CARD_ELEVATION,
    padding: SPACING.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 44,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.xs,
  },
  catChip: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  catChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  catChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  catChipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    width: 140,
    height: 44,
  },
  stepBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepVal: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  conditionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.statusCritical,
    marginTop: SPACING.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  saveBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    minHeight: SPACING.touch,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  deleteBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDF3F2',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.statusCritical,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.statusCritical,
    marginLeft: 4,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  notFoundText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  backBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primaryLight,
    padding: SPACING.sm,
    borderRadius: RADII.md,
  },
  backBtnText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
});
