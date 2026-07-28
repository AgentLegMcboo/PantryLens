import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { computeAllocation } from '../../lib/allocation';
import { usePantryStore } from '../../lib/store';

export default function NeedsScreen() {
  const { inventory, boxRules, thresholds, settings } = usePantryStore();
  const plan = computeAllocation(inventory, boxRules, 12, settings.defaultFamilySize);

  const [copied, setCopied] = useState(false);

  // Compute overall needs (limiting category + threshold deficits)
  const categoryDeficits: { category: string; deficit: number; reason: string }[] = [];

  // 1. Limiting category priority
  if (plan.shortfallPerCategory[plan.limitingCategory] > 0) {
    categoryDeficits.push({
      category: plan.limitingCategory,
      deficit: plan.shortfallPerCategory[plan.limitingCategory],
      reason: 'Limiting Category for Family Boxes'
    });
  }

  // 2. Threshold deficits
  Object.keys(thresholds).forEach(cat => {
    if (cat === plan.limitingCategory) return;
    const current = inventory.filter(i => i.category === cat).reduce((s, i) => s + i.count, 0);
    const min = (thresholds as any)[cat];
    if (current < min) {
      categoryDeficits.push({
        category: cat,
        deficit: min - current,
        reason: `Low stock threshold alert`
      });
    }
  });

  const formattedFlyerText = `🛒 MOST NEEDED FOOD ITEMS - ${settings.pantryName.toUpperCase()}
Date: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}

Our food pantry is currently experiencing critical shortages in the following categories:

${categoryDeficits.map(item => `• ${item.category.toUpperCase()} ITEMS (Need approx. ${item.deficit} units)\n  Focus: Canned meats, beans, peanut butter, grains, formula`).join('\n\n')}

Drop-off Location: Pantry Rear Entrance (Mon-Fri 9am-4pm)
Thank you for helping feed our local community! ❤️`;

  const handleCopy = () => {
    Clipboard.setString(formattedFlyerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    Alert.alert('Copied to Clipboard!', 'Donation request flyer text is ready to paste into emails or social media.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBanner}>
        <MaterialCommunityIcons name="bullhorn" size={24} color={COLORS.primaryLight} />
        <Text style={styles.headerTitle}>Targeted Donation Ask</Text>
      </View>
      <Text style={styles.headerSub}>
        PantryLens auto-generates this list from your real-time inventory shortages so donors bring what you actually need instead of generic food.
      </Text>

      {/* Visual Flyer Card */}
      <View style={styles.flyerCard}>
        <View style={styles.flyerHeader}>
          <Text style={styles.flyerTitle}>{settings.pantryName}</Text>
          <Text style={styles.flyerSubtitle}>WEEKLY DONATION NEED LIST</Text>
        </View>

        <View style={styles.flyerBody}>
          {categoryDeficits.length > 0 ? (
            categoryDeficits.map(item => (
              <View key={item.category} style={styles.needItemCard}>
                <View style={styles.needHeaderRow}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{item.category.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.reasonText}>{item.reason}</Text>
                </View>

                <Text style={styles.itemTitle}>
                  {item.category === 'protein' && 'Canned Tuna, Beans, Peanut Butter, Canned Chicken'}
                  {item.category === 'grain' && 'Rice (2lb), Whole Wheat Pasta, Oats, Cereal'}
                  {item.category === 'vegetable' && 'Canned Corn, Green Beans, Diced Tomatoes'}
                  {item.category === 'breakfast' && 'Pancake Mix, Oatmeal, Syrup, Cereal'}
                  {item.category === 'snack' && 'Granola Bars, Fruit Cups, Crackers'}
                  {item.category === 'baby' && 'Infant Formula Powder, Baby Food Jars'}
                  {item.category === 'hygiene' && 'Bar Soap, Shampoo, Toothpaste, Diapers'}
                </Text>
                <Text style={styles.deficitCount}>Shortfall: ~{item.deficit} units required</Text>
              </View>
            ))
          ) : (
            <View style={styles.noShortage}>
              <MaterialCommunityIcons name="check-decagram" size={36} color={COLORS.statusGood} />
              <Text style={styles.noShortageTitle}>All Categories Well Stocked!</Text>
              <Text style={styles.noShortageSub}>Your current inventory exceeds all low-stock warning thresholds.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
        <MaterialCommunityIcons
          name={copied ? 'content-copy' : 'content-copy'}
          size={20}
          color={COLORS.textOnPrimary}
        />
        <Text style={styles.copyBtnText}>
          {copied ? 'Copied to Clipboard!' : 'Copy Request Text to Clipboard'}
        </Text>
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
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: SPACING.xs,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  flyerCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  flyerHeader: {
    backgroundColor: COLORS.primaryLight,
    padding: SPACING.md,
    alignItems: 'center',
  },
  flyerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  flyerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
    marginTop: 2,
  },
  flyerBody: {
    padding: SPACING.md,
  },
  needItemCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  needHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
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
  reasonText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  deficitCount: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.statusCritical,
  },
  noShortage: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  noShortageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.statusGood,
    marginTop: SPACING.xs,
  },
  noShortageSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  copyBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: SPACING.touch,
  },
  copyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
});
