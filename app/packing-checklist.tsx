import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { computeAllocation } from '../lib/allocation';
import { usePantryStore } from '../lib/store';

export default function PackingChecklistScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetBoxes = parseInt(params.targetBoxes as string, 10) || 12;
  const familySize = parseInt(params.familySize as string, 10) || 4;

  const { inventory, bulkLots, boxRules, deductItems } = usePantryStore();
  const plan = computeAllocation(inventory, boxRules, targetBoxes, familySize, bulkLots);

  // Local state for checked off items
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFinishPacking = () => {
    const itemsToDeduct = plan.allocatedItems.map(a => ({
      id: a.item.id,
      count: a.countToGrab
    }));

    deductItems(itemsToDeduct);
    Alert.alert(
      'Packing Complete!',
      `Successfully packed ${plan.achievableBoxes} family boxes. Stock counts have been updated.`,
      [{ text: 'Return Home', onPress: () => router.replace('/(tabs)') }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Info */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="package-variant" size={28} color={COLORS.primaryLight} />
          <View style={{ marginLeft: SPACING.xs, flex: 1 }}>
            <Text style={styles.headerTitle}>Family Box Packing Checklist</Text>
            <Text style={styles.headerSub}>
              Packing {plan.achievableBoxes} boxes (Family of {familySize})
            </Text>
          </View>
        </View>

        <View style={styles.recipeBanner}>
          <Text style={styles.recipeTitle}>PER-BOX RECIPE:</Text>
          <Text style={styles.recipeText}>
            {Object.entries(plan.perBoxNeeds)
              .filter(([_, qty]) => qty > 0)
              .map(([cat, qty]) => `${qty} ${cat.toUpperCase()}`)
              .join(' • ')}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Items to Grab from Shelves (Expiration Order)</Text>

      {plan.packingChecklist.map(group => (
        <View key={group.category} style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{group.category.toUpperCase()}</Text>
            </View>
            <Text style={styles.groupNeededText}>
              Need: {group.allocatedCount} total ({group.neededPerBox} / box)
            </Text>
          </View>

          {group.items.map((item, idx) => {
            const isChecked = !!checkedIds[`${group.category}-${item.id}-${idx}`];
            const checkKey = `${group.category}-${item.id}-${idx}`;

            return (
              <TouchableOpacity
                key={checkKey}
                style={[styles.itemRow, isChecked && styles.itemRowChecked]}
                onPress={() => toggleCheck(checkKey)}
              >
                <MaterialCommunityIcons
                  name={isChecked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={24}
                  color={isChecked ? COLORS.statusGood : COLORS.textSecondary}
                />

                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                    {item.name}
                  </Text>
                  {item.expiration && (
                    <Text style={styles.itemExp}>Exp: {item.expiration}</Text>
                  )}
                </View>

                {item.useFirst && (
                  <View style={styles.useFirstBadge}>
                    <Text style={styles.useFirstText}>USE FIRST</Text>
                  </View>
                )}

                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyText}>Grab {item.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Complete Button */}
      <TouchableOpacity style={styles.finishBtn} onPress={handleFinishPacking}>
        <MaterialCommunityIcons name="check-all" size={22} color={COLORS.textOnPrimary} />
        <Text style={styles.finishBtnText}>Finish Packing & Deduct Stock from Inventory</Text>
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
  headerCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  recipeBanner: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.sm,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
  },
  recipeTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  recipeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  categoryCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  categoryBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  groupNeededText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4EBE1',
  },
  itemRowChecked: {
    opacity: 0.6,
  },
  itemInfo: {
    flex: 1,
    marginLeft: SPACING.xs,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
  },
  itemExp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  useFirstBadge: {
    backgroundColor: COLORS.statusWarning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
    marginRight: 6,
  },
  useFirstText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  qtyBadge: {
    backgroundColor: COLORS.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADII.sm,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  finishBtn: {
    backgroundColor: COLORS.statusGood,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    minHeight: SPACING.touch,
  },
  finishBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
});
