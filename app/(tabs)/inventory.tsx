import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { CONDITION_LABELS, InventoryItem, isUsableCondition, usePantryStore } from '../../lib/store';
import { KeyboardAvoidingView, Platform } from 'react-native';

/** Whole days since the pantry received this item — the FIFO signal. */
function daysOnShelf(dateAdded: string): number {
  const then = new Date(`${dateAdded}T00:00:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

export default function InventoryScreen() {
  const router = useRouter();
  const { inventory, updateItem, deleteItem, addItems, settings } = usePantryStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'expiration' | 'oldest' | 'count' | 'name'>('expiration');

  // Manual Add Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<InventoryItem['category']>('grain');
  const [newCount, setNewCount] = useState('1');
  const [newExp, setNewExp] = useState('');

  const categories = [
    { id: 'all', label: 'All Items' },
    { id: 'grain', label: 'Grain' },
    { id: 'vegetable', label: 'Vegetables' },
    { id: 'protein', label: 'Protein' },
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'snack', label: 'Snacks' },
    { id: 'hygiene', label: 'Hygiene' },
    { id: 'baby', label: 'Baby' }
  ];

  // Filtering & Sorting
  const warningLimit = new Date();
  warningLimit.setDate(new Date().getDate() + settings.expirationWarningDays);
  const warningStr = warningLimit.toISOString().split('T')[0];

  const filteredItems = inventory
    .filter(item => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'count') return b.count - a.count;
      // FIFO: what has been sitting on the shelf longest goes out first.
      if (sortBy === 'oldest') return (a.date_added || '').localeCompare(b.date_added || '');
      // Default: Expiration order (items with dates first, soonest first)
      if (!a.expiration) return 1;
      if (!b.expiration) return -1;
      return new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
    });

  const handleManualAdd = () => {
    if (!newName.trim()) return;
    addItems([
      {
        name: newName,
        category: newCat,
        count: parseInt(newCount, 10) || 1,
        expiration: newExp.trim() || null
      }
    ], 'manual');

    setNewName('');
    setNewCount('1');
    setNewExp('');
    setModalVisible(false);
  };

  const getCategoryColor = (cat: string) => {
    return (COLORS.categories as any)[cat] || COLORS.categories.unknown;
  };

  const renderItemRow = ({ item }: { item: InventoryItem }) => {
    const isExpiringSoon = !!item.expiration && item.expiration <= warningStr;
    const catColor = getCategoryColor(item.category);

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => router.push({ pathname: '/item-detail', params: { id: item.id } })}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemNameCol}>
            <Text style={styles.itemName}>{item.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.categoryBadge, { backgroundColor: catColor }]}>
                <Text style={styles.categoryBadgeText}>{item.category.toUpperCase()}</Text>
              </View>
              {isExpiringSoon && (
                <View style={styles.expiringBadge}>
                  <MaterialCommunityIcons name="alert-outline" size={12} color={COLORS.textOnPrimary} />
                  <Text style={styles.expiringBadgeText}>EXPIRING SOON</Text>
                </View>
              )}
              {!isUsableCondition(item.condition) && (
                <View style={styles.damagedBadge}>
                  <MaterialCommunityIcons name="close-octagon-outline" size={12} color={COLORS.textOnPrimary} />
                  <Text style={styles.expiringBadgeText}>
                    {CONDITION_LABELS[item.condition || 'ok'].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Stepper Count adjustment */}
          <View style={styles.countContainer}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => {
                if (item.count > 1) updateItem(item.id, { count: item.count - 1 });
                else deleteItem(item.id);
              }}
            >
              <MaterialCommunityIcons name="minus" size={16} color={COLORS.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.countText}>{item.count}</Text>

            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => updateItem(item.id, { count: item.count + 1 })}
            >
              <MaterialCommunityIcons name="plus" size={16} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.itemFooter}>
          <Text style={styles.expirationText}>
            {item.expiration ? `Exp: ${item.expiration}` : 'No exp date recorded'}
          </Text>
          <Text style={styles.sourceText}>
            {item.date_added ? `On shelf ${daysOnShelf(item.date_added)}d` : `Source: ${item.source}`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Sort Bar */}
      <View style={styles.topControls}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items by name..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={COLORS.textSecondary}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnPrimary} />
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        horizontal
        data={categories}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.pillsList}
        contentContainerStyle={styles.pillsContent}
        renderItem={({ item }) => {
          const active = selectedCategory === item.id;
          return (
            <TouchableOpacity
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => setSelectedCategory(item.id)}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Sort Selector Bar */}
      <View style={styles.sortBar}>
        <Text style={styles.resultCount}>Showing {filteredItems.length} SKUs</Text>
        <View style={styles.sortOptions}>
          <TouchableOpacity onPress={() => setSortBy('expiration')}>
            <Text style={[styles.sortLink, sortBy === 'expiration' && styles.sortLinkActive]}>Expiration</Text>
          </TouchableOpacity>
          <Text style={styles.sortDivider}>|</Text>
          <TouchableOpacity onPress={() => setSortBy('oldest')}>
            <Text style={[styles.sortLink, sortBy === 'oldest' && styles.sortLinkActive]}>Oldest (FIFO)</Text>
          </TouchableOpacity>
          <Text style={styles.sortDivider}>·</Text>
          <TouchableOpacity onPress={() => setSortBy('count')}>
            <Text style={[styles.sortLink, sortBy === 'count' && styles.sortLinkActive]}>Count</Text>
          </TouchableOpacity>
          <Text style={styles.sortDivider}>|</Text>
          <TouchableOpacity onPress={() => setSortBy('name')}>
            <Text style={[styles.sortLink, sortBy === 'name' && styles.sortLinkActive]}>Name</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Inventory Items List */}
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={renderItemRow}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clipboard-text-search-outline" size={48} color={COLORS.textSecondary} />
            <Text style={styles.emptyTitle}>No matching items found</Text>
            <Text style={styles.emptySub}>Try searching for another name or clearing the category filter.</Text>
          </View>
        }
      />

      {/* Manual Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        {/* The manual-add fields sit low on the sheet; without this the keyboard
            covers them and there is no way to scroll them into view. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Item Manually</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Item Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Canned Black Beans (15 oz)"
              value={newName}
              onChangeText={setNewName}
              placeholderTextColor={COLORS.textSecondary}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <View style={styles.categoryPickerRow}>
              {['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catPickChip, newCat === cat && styles.catPickChipActive]}
                  onPress={() => setNewCat(cat as any)}
                >
                  <Text style={[styles.catPickText, newCat === cat && styles.catPickTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={newCount}
                  onChangeText={setNewCount}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Text style={styles.inputLabel}>Expiration Date (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  value={newExp}
                  onChangeText={setNewExp}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleManualAdd}>
              <Text style={styles.submitButtonText}>Add to Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topControls: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: SPACING.touch,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.xs,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  addButton: {
    backgroundColor: COLORS.primaryLight,
    width: SPACING.touch,
    height: SPACING.touch,
    borderRadius: RADII.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillsList: {
    maxHeight: 44,
    marginVertical: SPACING.sm,
  },
  pillsContent: {
    paddingHorizontal: SPACING.md,
  },
  pill: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  pillActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pillTextActive: {
    color: COLORS.textOnPrimary,
  },
  sortBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  resultCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  sortOptions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLink: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  sortLinkActive: {
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  sortDivider: {
    fontSize: 12,
    color: COLORS.borderSoft,
    marginHorizontal: 4,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 100,
  },
  itemCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemNameCol: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADII.sm,
    marginRight: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  damagedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.statusCritical,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  expiringBadge: {
    backgroundColor: COLORS.statusWarning,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADII.sm,
  },
  expiringBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: 2,
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: 2,
  },
  stepperButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: '#F4EBE1',
  },
  expirationText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  sourceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: SPACING.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    padding: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  modalInput: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 44,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.xs,
  },
  catPickChip: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  catPickChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryLight,
  },
  catPickText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  catPickTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
});
