import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { CARD_ELEVATION, COLORS, RADII, SPACING } from '../constants/theme';
import { InventoryItem, usePantryStore } from '../lib/store';

export default function ExpiringSoonScreen() {
  const router = useRouter();
  const { inventory, settings } = usePantryStore();

  const now = new Date();
  const warningLimit = new Date();
  warningLimit.setDate(now.getDate() + settings.expirationWarningDays);
  const warningStr = warningLimit.toISOString().split('T')[0];

  const expiringItems = inventory
    .filter(item => !!item.expiration && item.expiration <= warningStr)
    .sort((a, b) => new Date(a.expiration!).getTime() - new Date(b.expiration!).getTime());

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemCategory}>{item.category.toUpperCase()}</Text>
        </View>

        <View style={styles.expBadge}>
          <MaterialCommunityIcons name="clock-alert-outline" size={14} color={COLORS.textOnPrimary} />
          <Text style={styles.expBadgeText}>Exp: {item.expiration}</Text>
        </View>
      </View>

      <View style={styles.itemFooter}>
        <Text style={styles.countText}>Current Stock: {item.count} units</Text>

        <TouchableOpacity
          style={styles.packFirstBtn}
          onPress={() => router.push('/(tabs)/build')}
        >
          <Text style={styles.packFirstBtnText}>Prioritize in Build Boxes</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <MaterialCommunityIcons name="alert-circle-outline" size={24} color={COLORS.statusWarning} />
        <View style={{ marginLeft: SPACING.xs, flex: 1 }}>
          <Text style={styles.bannerTitle}>
            Expiring Within {settings.expirationWarningDays} Days ({expiringItems.length} SKUs)
          </Text>
          <Text style={styles.bannerSub}>
            Items listed below are automatically marked "Use First" by the allocation engine to prevent waste.
          </Text>
        </View>
      </View>

      <FlatList
        data={expiringItems}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="check-circle-outline" size={48} color={COLORS.statusGood} />
            <Text style={styles.emptyTitle}>No Expiring Items Found!</Text>
            <Text style={styles.emptySub}>All inventory items are well within their expiration date window.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  banner: {
    backgroundColor: '#FEF8F0',
    borderColor: COLORS.statusWarning,
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: SPACING.md,
    margin: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
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
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  itemCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    ...CARD_ELEVATION,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  expBadge: {
    backgroundColor: COLORS.statusWarning,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADII.sm,
  },
  expBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: 3,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  packFirstBtn: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  packFirstBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.statusGood,
    marginTop: SPACING.xs,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
