import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { computeAllocation } from '../../lib/allocation';
import { AnimatedCounter, FadeInUp, PressableScale, Pulse } from '../../components/motion';
import { InventoryItem, usePantryStore } from '../../lib/store';

/**
 * Activity rows store an ISO timestamp, which was being rendered raw —
 * "2026-08-05T14:22:09.481Z" under every line. What a volunteer wants from this
 * column is how long ago, not to the millisecond.
 */
function formatActivityTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DashboardScreen() {
  const router = useRouter();
  const { inventory, bulkLots, boxRules, settings, activities, thresholds } = usePantryStore();

  // The dashboard's headline figure. A round dozen is the usual weekly ask and
  // is what Build Boxes opens on, so the two screens agree.
  const DASHBOARD_TARGET_BOXES = 12;
  const plan = computeAllocation(
    inventory,
    boxRules,
    DASHBOARD_TARGET_BOXES,
    settings.defaultFamilySize,
    bulkLots
  );
  const isShort = plan.shortfallPerCategory[plan.limitingCategory] > 0;

  // Compute expiring items
  const now = new Date();
  const warningLimit = new Date();
  warningLimit.setDate(now.getDate() + settings.expirationWarningDays);

  const expiringCount = inventory.filter((i: InventoryItem) => {
    if (!i.expiration) return false;
    return new Date(i.expiration) <= warningLimit;
  }).reduce((sum: number, item: InventoryItem) => sum + item.count, 0);

  const totalStockCount = inventory.reduce((sum: number, item: InventoryItem) => sum + item.count, 0);

  // Low stock category calculation
  const lowCategories = Object.keys(thresholds).filter((cat: string) => {
    const total = inventory.filter((i: InventoryItem) => i.category === cat).reduce((sum: number, i: InventoryItem) => sum + i.count, 0);
    return total < (thresholds as any)[cat];
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* A red alarm that fires whatever the numbers say is an alarm nobody
          reads. When stock covers the target this states that instead, in the
          calm colour, and keeps the route through to Build Boxes. */}
      <FadeInUp index={0}>
      {isShort ? (
        <View style={styles.alertBanner}>
          <View style={styles.alertHeader}>
            <Pulse active={plan.achievableBoxes === 0}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={COLORS.statusCritical} />
            </Pulse>
            <Text style={styles.alertTitle}>Limiting Category Alert</Text>
          </View>
          <Text style={styles.alertText}>
            You can make <Text style={{ fontWeight: 'bold' }}>{plan.achievableBoxes} balanced boxes</Text> right now.{' '}
            <Text style={{ color: COLORS.statusCritical, fontWeight: 'bold', textTransform: 'capitalize' }}>
              {plan.limitingCategory}
            </Text>{' '}
            is holding you back by {plan.shortfallPerCategory[plan.limitingCategory]} units.
          </Text>
          <PressableScale
            style={styles.alertButton}
            cue="press"
            onPress={() => router.push('/(tabs)/build')}
          >
            <Text style={styles.alertButtonText}>Optimize Box Allocations</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.textOnPrimary} />
          </PressableScale>
        </View>
      ) : (
        <View style={styles.readyBanner}>
          <View style={styles.alertHeader}>
            <MaterialCommunityIcons name="check-circle-outline" size={24} color={COLORS.statusGood} />
            <Text style={styles.readyTitle}>Stock is balanced</Text>
          </View>
          <Text style={styles.alertText}>
            Enough on the shelves for{' '}
            <Text style={{ fontWeight: 'bold' }}>
              {plan.achievableBoxes} balanced box{plan.achievableBoxes === 1 ? '' : 'es'}
            </Text>{' '}
            for a family of {settings.defaultFamilySize}. No category is short.
          </Text>
          <PressableScale
            style={styles.readyButton}
            cue="press"
            onPress={() => router.push('/(tabs)/build')}
          >
            <Text style={styles.readyButtonText}>Start Building Boxes</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.textOnPrimary} />
          </PressableScale>
        </View>
      )}
      </FadeInUp>

      {/* Metrics Row */}
      <View style={styles.metricsGrid}>
        <FadeInUp index={1} style={styles.metricFlex}>
          <View style={[styles.metricCard, { borderLeftColor: COLORS.primaryLight, borderLeftWidth: 4 }]}>
            <Text style={styles.metricLabel}>Total Items</Text>
            <AnimatedCounter value={totalStockCount} style={styles.metricValue} />
            <Text style={styles.metricSub}>Across {inventory.length} SKUs</Text>
          </View>
        </FadeInUp>

        <FadeInUp index={2} style={styles.metricFlex}>
          <View style={[styles.metricCard, { borderLeftColor: COLORS.statusGood, borderLeftWidth: 4 }]}>
            <Text style={styles.metricLabel}>Box Capacity</Text>
            <AnimatedCounter value={plan.achievableBoxes} style={[styles.metricValue, { color: COLORS.statusGood }]} />
            <Text style={styles.metricSub}>Family of {settings.defaultFamilySize}</Text>
          </View>
        </FadeInUp>

        <FadeInUp index={3} style={styles.metricFlex}>
          <PressableScale
            style={[styles.metricCard, { borderLeftColor: COLORS.statusWarning, borderLeftWidth: 4 }]}
            onPress={() => router.push('/expiring-soon')}
          >
            <Text style={styles.metricLabel}>Expiring Soon</Text>
            <AnimatedCounter value={expiringCount} style={[styles.metricValue, { color: COLORS.statusWarning }]} />
            <Text style={styles.metricSub}>Use First items</Text>
          </PressableScale>
        </FadeInUp>
      </View>

      {/* Primary Action Buttons */}
      <Text style={styles.sectionHeader}>Quick Actions</Text>

      <PressableScale
        style={styles.primaryActionButton}
        cue="press"
        onPress={() => router.push('/log-donation')}
      >
        <View style={styles.actionIconContainer}>
          <MaterialCommunityIcons name="camera-outline" size={28} color={COLORS.textOnPrimary} />
        </View>
        <View style={styles.actionTextContainer}>
          <Text style={styles.primaryActionTitle}>Log Donation</Text>
          <Text style={styles.primaryActionSub}>Photograph bags or boxes for AI auto-intake</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.textOnPrimary} />
      </PressableScale>

      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={[styles.secondaryActionButton, { backgroundColor: COLORS.cardSurface }]}
          onPress={() => router.push('/bulk-intake')}
        >
          <MaterialCommunityIcons name="scale-balance" size={24} color={COLORS.secondary} />
          <Text style={styles.secondaryActionTitle}>Bulk Donation</Text>
          <Text style={styles.secondaryActionSub}>Log by weight</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, { backgroundColor: COLORS.cardSurface }]}
          onPress={() => router.push('/shelf-audit')}
        >
          <MaterialCommunityIcons name="format-list-checks" size={24} color={COLORS.secondary} />
          <Text style={styles.secondaryActionTitle}>Audit Shelf</Text>
          <Text style={styles.secondaryActionSub}>Re-count stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, { backgroundColor: COLORS.cardSurface }]}
          onPress={() => router.push('/(tabs)/build')}
        >
          <MaterialCommunityIcons name="package-variant-closed" size={24} color={COLORS.primaryLight} />
          <Text style={styles.secondaryActionTitle}>Build Boxes</Text>
          <Text style={styles.secondaryActionSub}>Plan family distribution</Text>
        </TouchableOpacity>
      </View>

      {/* Low Stock Categories */}
      {lowCategories.length > 0 && (
        <View style={styles.lowStockSection}>
          <Text style={styles.sectionHeader}>Low Stock Warnings</Text>
          <View style={styles.lowStockCard}>
            {lowCategories.map((cat: string) => (
              <View key={cat} style={styles.lowStockRow}>
                <View style={styles.lowStockCategoryTag}>
                  <Text style={styles.lowStockCategoryText}>{cat.toUpperCase()}</Text>
                </View>
                <Text style={styles.lowStockDetail}>
                  {inventory.filter((i: InventoryItem) => i.category === cat).reduce((s: number, i: InventoryItem) => s + i.count, 0)} units in stock (Min:{' '}
                  {(thresholds as any)[cat]})
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.needButton}
              onPress={() => router.push('/(tabs)/needs')}
            >
              <Text style={styles.needButtonText}>Generate Donation Request Flyer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recent Activity Log */}
      <Text style={styles.sectionHeader}>Recent Pantry Activity</Text>
      <View style={styles.activityCard}>
        {activities.length === 0 ? (
          <Text style={styles.activityEmpty}>
            Nothing logged yet. Scanning a donation or auditing a shelf will show up here.
          </Text>
        ) : (
          activities.slice(0, 5).map((act: any) => (
            <View key={act.id} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <MaterialCommunityIcons name={act.icon as any} size={20} color={COLORS.primaryLight} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityText}>{act.text}</Text>
                <Text style={styles.activityTime}>{formatActivityTime(act.time)}</Text>
              </View>
            </View>
          ))
        )}
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
    paddingBottom: 100,
  },
  alertBanner: {
    backgroundColor: '#FDF3F2',
    borderColor: COLORS.statusCritical,
    borderWidth: 1,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  readyBanner: {
    backgroundColor: '#F2F8F1',
    borderColor: COLORS.statusGood,
    borderWidth: 1,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  readyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.statusGood,
    marginLeft: SPACING.xs,
  },
  readyButton: {
    backgroundColor: COLORS.statusGood,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginRight: SPACING.xs,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.statusCritical,
    marginLeft: SPACING.xs,
  },
  alertText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  alertButton: {
    backgroundColor: COLORS.statusCritical,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginRight: SPACING.xs,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  metricFlex: { flex: 1 },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  primaryActionButton: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    minHeight: SPACING.touch,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  actionTextContainer: {
    flex: 1,
  },
  primaryActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  primaryActionSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  secondaryActionButton: {
    flex: 1,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginHorizontal: 4,
  },
  secondaryActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  secondaryActionSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  lowStockSection: {
    marginBottom: SPACING.sm,
  },
  lowStockCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
  },
  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  lowStockCategoryTag: {
    backgroundColor: '#FDF3F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADII.sm,
    marginRight: SPACING.sm,
  },
  lowStockCategoryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.statusCritical,
  },
  lowStockDetail: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  needButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  needButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  activityCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F4EBE1',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  activityTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activityEmpty: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    paddingVertical: SPACING.xs,
  },
});
