import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { lookupBarcode } from '../lib/ai_vision';
import { InventoryItem, usePantryStore } from '../lib/store';

export default function ReviewVerifyScreen() {
  const router = useRouter();
  const { currentDraft, addItems } = usePantryStore();

  const [draftItems, setDraftItems] = useState<Partial<InventoryItem>[]>(
    currentDraft.length > 0
      ? currentDraft
      : [
          { name: 'Creamy Peanut Butter 16 oz', category: 'protein', count: 2, expiration: '2026-08-20', confidence: 0.96 },
          { name: 'Black Beans 15 oz', category: 'protein', count: 4, expiration: '2027-02-15', confidence: 0.92 },
          { name: 'Rotini Pasta 16 oz', category: 'grain', count: 3, expiration: '2026-09-01', confidence: 0.98 },
          { name: 'Canned Green Beans 14.5 oz', category: 'vegetable', count: 5, expiration: '2026-08-10', confidence: 0.64 }
        ]
  );

  // Move low-confidence (<0.70) items to top for priority review
  const sortedDraft = [...draftItems].sort((a, b) => (a.confidence || 1) - (b.confidence || 1));

  const updateItemAtIndex = (index: number, updates: Partial<InventoryItem>) => {
    const next = [...draftItems];
    next[index] = { ...next[index], ...updates };
    setDraftItems(next);
  };

  const removeItemAtIndex = (index: number) => {
    const next = draftItems.filter((_, i) => i !== index);
    setDraftItems(next);
  };

  const handleBarcodeScan = (index: number) => {
    const item = lookupBarcode('0111222333');
    updateItemAtIndex(index, {
      name: item.name,
      category: item.category,
      expiration: item.expiration,
      confidence: 1.0
    });
    Alert.alert('Barcode Identified!', `Resolved to "${item.name}" (${item.category?.toUpperCase()})`);
  };

  const handleSaveToInventory = () => {
    addItems(draftItems, 'donation');
    Alert.alert('Success!', 'All verified donation items have been written to inventory database.', [
      { text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <MaterialCommunityIcons name="shield-check-outline" size={24} color={COLORS.primaryLight} />
        <View style={{ marginLeft: SPACING.xs, flex: 1 }}>
          <Text style={styles.bannerTitle}>Human Verification Step</Text>
          <Text style={styles.bannerSub}>
            Check AI draft guesses below. Tap to edit counts or categories before adding to inventory.
          </Text>
        </View>
      </View>

      {sortedDraft.map((item, idx) => {
        const isLowConf = (item.confidence || 1) < 0.70;

        return (
          <View
            key={idx}
            style={[styles.itemCard, isLowConf && styles.itemCardLowConf]}
          >
            {/* Header / Confidence Badge */}
            <View style={styles.cardHeader}>
              {isLowConf ? (
                <View style={styles.lowConfBadge}>
                  <MaterialCommunityIcons name="alert-circle" size={14} color={COLORS.statusWarning} />
                  <Text style={styles.lowConfBadgeText}>NEEDS HUMAN CHECK ({Math.round((item.confidence || 0) * 100)}%)</Text>
                </View>
              ) : (
                <View style={styles.highConfBadge}>
                  <MaterialCommunityIcons name="check" size={14} color={COLORS.statusGood} />
                  <Text style={styles.highConfBadgeText}>HIGH CONFIDENCE ({Math.round((item.confidence || 0) * 100)}%)</Text>
                </View>
              )}

              <TouchableOpacity onPress={() => removeItemAtIndex(idx)}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Editable Name */}
            <Text style={styles.inputLabel}>Item Name</Text>
            <TextInput
              style={styles.nameInput}
              value={item.name}
              onChangeText={txt => updateItemAtIndex(idx, { name: txt })}
            />

            {/* Category Chips */}
            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.catRow}>
              {['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, item.category === cat && styles.catChipActive]}
                  onPress={() => updateItemAtIndex(idx, { category: cat as any })}
                >
                  <Text style={[styles.catChipText, item.category === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Count & Expiration */}
            <View style={styles.bottomRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateItemAtIndex(idx, { count: Math.max(1, (item.count || 1) - 1) })}
                  >
                    <MaterialCommunityIcons name="minus" size={16} color={COLORS.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.stepVal}>{item.count || 1}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => updateItemAtIndex(idx, { count: (item.count || 1) + 1 })}
                  >
                    <MaterialCommunityIcons name="plus" size={16} color={COLORS.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flex: 1.2 }}>
                <Text style={styles.inputLabel}>Expiration Date</Text>
                <TextInput
                  style={styles.expInput}
                  placeholder="YYYY-MM-DD"
                  value={item.expiration || ''}
                  onChangeText={txt => updateItemAtIndex(idx, { expiration: txt })}
                />
              </View>
            </View>

            {isLowConf && (
              <TouchableOpacity
                style={styles.barcodeBtn}
                onPress={() => handleBarcodeScan(idx)}
              >
                <MaterialCommunityIcons name="barcode-scan" size={18} color={COLORS.primaryDark} />
                <Text style={styles.barcodeBtnText}>Scan Barcode Fast-Path</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity style={styles.commitBtn} onPress={handleSaveToInventory}>
        <MaterialCommunityIcons name="database-check" size={22} color={COLORS.textOnPrimary} />
        <Text style={styles.commitBtnText}>Add All Verified Items to Inventory</Text>
      </TouchableOpacity>
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
    paddingBottom: SPACING.xl,
  },
  banner: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  bannerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  itemCardLowConf: {
    borderColor: COLORS.statusWarning,
    borderWidth: 1.5,
    backgroundColor: '#FFFBF5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  lowConfBadge: {
    backgroundColor: '#FEF3E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lowConfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.statusWarning,
    marginLeft: 3,
  },
  highConfBadge: {
    backgroundColor: '#F2F8F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  highConfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.statusGood,
    marginLeft: 3,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 2,
  },
  nameInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 4,
  },
  catChip: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  catChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  catChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  catChipTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.sm,
    height: 38,
  },
  stepBtn: {
    width: 32,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 8,
  },
  expInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 8,
    height: 38,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  barcodeBtn: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.sm,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  barcodeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryDark,
    marginLeft: 4,
  },
  commitBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    minHeight: SPACING.touch,
  },
  commitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
});
