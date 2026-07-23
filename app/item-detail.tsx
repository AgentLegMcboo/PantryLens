import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { usePantryStore } from '../lib/store';

export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { getItem, updateItem, deleteItem } = usePantryStore();

  const item = getItem(id as string);

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

  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [count, setCount] = useState(item.count);
  const [expiration, setExpiration] = useState(item.expiration || '');

  const handleSave = () => {
    updateItem(item.id, {
      name: name.trim(),
      category: category as any,
      count,
      expiration: expiration.trim() || null
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
    </ScrollView>
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
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F4EBE1',
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
