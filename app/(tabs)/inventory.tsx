import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { COLORS } from '../../constants/theme';
import {
  Badge,
  Button,
  Card,
  CategoryIcon,
  Chip,
  EmptyState,
  Input,
  Stepper,
  Text,
} from '../../components/ui';
import {
  CONDITION_LABELS,
  InventoryItem,
  isUsableCondition,
  usePantryStore,
} from '../../lib/store';

/**
 * The shelf, as a list.
 *
 * The old version stacked a search bar, a pill row, a four-option sort bar and
 * then rows carrying up to three badges plus a stepper — six competing controls
 * before a single item. Sorting is now one chip row that doubles as the filter
 * summary, rows carry at most one status badge, and the count control has room
 * to be tapped.
 */

/** Whole days since the pantry received this item — the FIFO signal. */
function daysOnShelf(dateAdded: string): number {
  const then = new Date(`${dateAdded}T00:00:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'grain', label: 'Grain' },
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'protein', label: 'Protein' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snacks' },
  { id: 'hygiene', label: 'Hygiene' },
  { id: 'baby', label: 'Baby' },
];

const SORTS = [
  { id: 'expiration', label: 'Expiring first' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'count', label: 'Most stock' },
  { id: 'name', label: 'A–Z' },
] as const;

export default function InventoryScreen() {
  const router = useRouter();
  const { inventory, updateItem, deleteItem, addItems, settings } = usePantryStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]['id']>('expiration');

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<InventoryItem['category']>('grain');
  const [newCount, setNewCount] = useState(1);
  const [newExp, setNewExp] = useState('');

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
      if (!a.expiration) return 1;
      if (!b.expiration) return -1;
      return new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
    });

  const handleManualAdd = () => {
    if (!newName.trim()) return;
    addItems(
      [
        {
          name: newName,
          category: newCat,
          count: newCount,
          expiration: newExp.trim() || null,
        },
      ],
      'manual',
    );
    setNewName('');
    setNewCount(1);
    setNewExp('');
    setModalVisible(false);
  };

  const renderItemRow = ({ item }: { item: InventoryItem }) => {
    const isExpiringSoon = !!item.expiration && item.expiration <= warningStr;
    const damaged = !isUsableCondition(item.condition);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/item-detail', params: { id: item.id } })}
      >
        <Card className="mb-3">
          <View className="flex-row items-start gap-3">
            {/* The category as a glyph rather than an uppercase word or an
                arbitrary hue — it identifies the row without adding anything to
                read, and leaves colour free to mean damaged or expiring. */}
            <CategoryIcon category={item.category} tone={damaged ? 'critical' : 'brand'} />

            <View className="flex-1">
              <Text variant="body" className="font-semibold">
                {item.name}
              </Text>
              <Text variant="micro" tone="soft" className="mt-1">
                {item.expiration ? `Expires ${item.expiration}` : 'No expiry recorded'}
                {item.date_added ? ` · on shelf ${daysOnShelf(item.date_added)}d` : ''}
              </Text>

              {/* At most one badge. Damage outranks expiry — it blocks packing. */}
              {damaged ? (
                <Badge
                  label={CONDITION_LABELS[item.condition || 'ok']}
                  tone="critical"
                  className="mt-2"
                />
              ) : isExpiringSoon ? (
                <Badge label="Use first" tone="warn" className="mt-2" />
              ) : null}
            </View>

            <Stepper
              value={item.count}
              min={0}
              onChange={next => {
                if (next === 0) deleteItem(item.id);
                else updateItem(item.id, { count: next });
              }}
            />
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-canvas">
      <View className="px-gutter pt-4 gap-4">
        <View className="flex-row items-center gap-3">
          <View className="h-12 flex-1 flex-row items-center gap-2 rounded-md border-[1.5px] border-outline bg-card px-3">
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
            <TextInput
              className="flex-1 text-body text-ink"
              placeholder="Search items"
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={COLORS.textSecondary}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setModalVisible(true)}
            accessibilityLabel="Add an item by hand"
            style={({ pressed }) => ({
              borderBottomWidth: pressed ? 2 : 4,
              borderBottomColor: COLORS.primaryDeep,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
            className="h-12 w-12 items-center justify-center rounded-md bg-brand"
          >
            <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnPrimary} />
          </Pressable>
        </View>

        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={c => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-gutter"
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected={selectedCategory === item.id}
              onPress={() => setSelectedCategory(item.id)}
            />
          )}
        />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        renderItem={renderItemRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-gutter pt-4 pb-28"
        ListHeaderComponent={
          <View className="mb-4 flex-row items-center justify-between">
            <Text variant="micro" tone="soft">
              {filteredItems.length} {filteredItems.length === 1 ? 'product' : 'products'}
            </Text>
            <Pressable
              onPress={() => {
                const i = SORTS.findIndex(s => s.id === sortBy);
                setSortBy(SORTS[(i + 1) % SORTS.length].id);
              }}
              className="flex-row items-center gap-1"
              accessibilityLabel={`Sorted by ${SORTS.find(s => s.id === sortBy)?.label}. Tap to change.`}
            >
              <MaterialCommunityIcons name="swap-vertical" size={16} color={COLORS.primaryDark} />
              <Text variant="micro" tone="brand" className="font-semibold">
                {SORTS.find(s => s.id === sortBy)?.label}
              </Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-text-search-outline"
            title="Nothing here yet"
            body={
              search || selectedCategory !== 'all'
                ? 'Try another search, or clear the category filter.'
                : 'Photograph a donation to fill the shelves.'
            }
            actionLabel={search || selectedCategory !== 'all' ? 'Clear the filters' : undefined}
            onAction={
              search || selectedCategory !== 'all'
                ? () => {
                    setSearch('');
                    setSelectedCategory('all');
                  }
                : undefined
            }
          />
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t-lg bg-canvas px-gutter pb-10 pt-6 gap-4">
              <View className="flex-row items-center justify-between">
                <Text variant="title">Add an item</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
                </Pressable>
              </View>

              <Input
                label="Name"
                placeholder="Canned black beans 15 oz"
                value={newName}
                onChangeText={setNewName}
              />

              <View className="gap-2">
                <Text variant="label" tone="soft">
                  Category
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <Chip
                      key={cat.id}
                      label={cat.label}
                      selected={newCat === cat.id}
                      onPress={() => setNewCat(cat.id as any)}
                    />
                  ))}
                </View>
              </View>

              <View className="flex-row gap-4">
                <View className="gap-2">
                  <Text variant="label" tone="soft">
                    Quantity
                  </Text>
                  <Stepper value={newCount} min={1} onChange={setNewCount} />
                </View>
                <View className="flex-1">
                  <Input
                    label="Expires (optional)"
                    placeholder="YYYY-MM-DD"
                    value={newExp}
                    onChangeText={setNewExp}
                  />
                </View>
              </View>

              <Button label="Add to inventory" block className="mt-2" onPress={handleManualAdd} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
