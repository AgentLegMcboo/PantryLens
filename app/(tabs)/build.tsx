import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { computeAllocation } from '../../lib/allocation';
import { BoxRules, usePantryStore } from '../../lib/store';

export default function BuildBoxesScreen() {
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings } = usePantryStore();

  const [requestedBoxes, setRequestedBoxes] = useState<number>(12);
  const [familySize, setFamilySize] = useState<number>(settings.defaultFamilySize || 4);

  const plan = computeAllocation(inventory, boxRules, requestedBoxes, familySize, bulkLots);

  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Target Configuration Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Set Distribution Target</Text>

        <View style={styles.inputRow}>
          <Text style={styles.label}>Boxes Needed:</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setRequestedBoxes(Math.max(1, requestedBoxes - 1))}
            >
              <MaterialCommunityIcons name="minus" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{requestedBoxes}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => setRequestedBoxes(requestedBoxes + 1)}
            >
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputRow}>
          <Text style={styles.label}>Family Size:</Text>
          <View style={styles.sizePicker}>
            {[2, 4, 6].map(sz => (
              <TouchableOpacity
                key={sz}
                style={[styles.sizeChip, familySize === sz && styles.sizeChipActive]}
                onPress={() => setFamilySize(sz)}
              >
                <Text style={[styles.sizeChipText, familySize === sz && styles.sizeChipTextActive]}>
                  {sz} People
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Allocation Engine Output Result */}
      <View style={[styles.resultCard, plan.achievableBoxes < requestedBoxes && styles.resultCardWarning]}>
        <View style={styles.resultHeader}>
          <Text style={styles.resultLabel}>Achievable Balanced Boxes</Text>
          <View style={styles.resultBadge}>
            <Text style={styles.resultBadgeText}>{plan.achievableBoxes} / {requestedBoxes}</Text>
          </View>
        </View>

        {plan.achievableBoxes < requestedBoxes ? (
          <View style={styles.limitingAlert}>
            <View style={styles.alertTitleRow}>
              <MaterialCommunityIcons name="alert-octagon" size={24} color={COLORS.statusCritical} />
              <Text style={styles.limitingTitle}>
                {String(plan.limitingCategory).toUpperCase()} IS YOUR LIMITING CATEGORY
              </Text>
            </View>
            <Text style={styles.limitingText}>
              You wanted {requestedBoxes} boxes, but can only pack {plan.achievableBoxes} full boxes.{' '}
              <Text style={{ fontWeight: 'bold' }}>{String(plan.limitingCategory).toUpperCase()}</Text> is short by{' '}
              <Text style={{ color: COLORS.statusCritical, fontWeight: 'bold' }}>
                {plan.shortfallPerCategory[plan.limitingCategory]} units
              </Text>.
            </Text>
          </View>
        ) : (
          <View style={styles.successAlert}>
            <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.statusGood} />
            <Text style={styles.successText}>
              Great news! You have enough stock to assemble all {requestedBoxes} requested family boxes.
            </Text>
          </View>
        )}

        {/* Category Requirement Breakdown Table */}
        <Text style={styles.tableTitle}>Category Stock vs Requirement Breakdown</Text>
        {categories.map((cat: keyof BoxRules) => {
          const needPerBox = plan.perBoxNeeds[cat];
          if (needPerBox === 0) return null;

          const totalNeed = requestedBoxes * needPerBox;
          const currentStock = plan.categoryTotals[cat];
          const deficit = plan.shortfallPerCategory[cat];
          const isLimiting = cat === plan.limitingCategory && deficit > 0;

          return (
            <View key={String(cat)} style={[styles.tableRow, isLimiting && styles.tableRowLimiting]}>
              <View style={styles.catNameCol}>
                <Text style={[styles.catName, isLimiting && { color: COLORS.statusCritical }]}>
                  {String(cat).toUpperCase()}
                </Text>
                <Text style={styles.catSub}>{needPerBox} per box</Text>
              </View>

              <View style={styles.catStatCol}>
                <Text style={styles.catStock}>{currentStock} in stock</Text>
                <Text style={styles.catNeeded}>Target: {totalNeed}</Text>
              </View>

              <View style={styles.statusCol}>
                {deficit > 0 ? (
                  <View style={styles.deficitBadge}>
                    <Text style={styles.deficitText}>-{deficit} short</Text>
                  </View>
                ) : (
                  <View style={styles.goodBadge}>
                    <MaterialCommunityIcons name="check" size={12} color={COLORS.statusGood} />
                    <Text style={styles.goodText}>Ready</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        style={styles.primaryChecklistBtn}
        onPress={() =>
          router.push({
            pathname: '/packing-checklist',
            params: { targetBoxes: requestedBoxes, familySize }
          })
        }
      >
        <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={COLORS.textOnPrimary} />
        <Text style={styles.primaryChecklistBtnText}>Generate Volunteer Packing Checklist</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryNeedBtn}
        onPress={() => router.push('/(tabs)/needs')}
      >
        <MaterialCommunityIcons name="bullhorn-outline" size={20} color={COLORS.primaryDark} />
        <Text style={styles.secondaryNeedBtnText}>Create Donation Request Flyer for Shortages</Text>
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
    paddingBottom: 100,
  },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
  },
  stepBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 12,
  },
  sizePicker: {
    flexDirection: 'row',
  },
  sizeChip: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 6,
  },
  sizeChipActive: {
    backgroundColor: COLORS.primaryLight,
  },
  sizeChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sizeChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  resultCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  resultCardWarning: {
    borderColor: COLORS.statusCritical,
    borderWidth: 1.5,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  resultLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  resultBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADII.full,
  },
  resultBadgeText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  limitingAlert: {
    backgroundColor: '#FDF3F2',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  limitingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.statusCritical,
    marginLeft: SPACING.xs,
  },
  limitingText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  successAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F8F1',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  successText: {
    fontSize: 13,
    color: COLORS.statusGood,
    marginLeft: SPACING.xs,
    flex: 1,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F4EBE1',
  },
  tableRowLimiting: {
    backgroundColor: '#FFF5F4',
    paddingHorizontal: 6,
    borderRadius: RADII.sm,
  },
  catNameCol: {
    flex: 1.2,
  },
  catName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  catSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  catStatCol: {
    flex: 1.2,
  },
  catStock: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  catNeeded: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  statusCol: {
    flex: 0.8,
    alignItems: 'flex-end',
  },
  deficitBadge: {
    backgroundColor: '#FDF3F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  deficitText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.statusCritical,
  },
  goodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goodText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.statusGood,
    marginLeft: 2,
  },
  primaryChecklistBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    minHeight: SPACING.touch,
  },
  primaryChecklistBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
  secondaryNeedBtn: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryNeedBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryDark,
    marginLeft: SPACING.xs,
  },
});
