import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { Card, CategoryIcon, Text } from './ui';

export interface StapleItem {
  id: string;
  name: string;
  category: 'protein' | 'grain' | 'vegetable' | 'breakfast' | 'snack';
  unitDesc: string;
  presetPacks: number[];
}

export const TOP_STAPLES: StapleItem[] = [
  { id: 'staple-1', name: 'Black Beans (15oz)', category: 'protein', unitDesc: '15 oz can', presetPacks: [1, 6, 12, 24] },
  { id: 'staple-2', name: 'Peanut Butter (16oz)', category: 'protein', unitDesc: '16 oz jar', presetPacks: [1, 4, 12] },
  { id: 'staple-3', name: 'Canned Sweet Corn (15oz)', category: 'vegetable', unitDesc: '15 oz can', presetPacks: [1, 6, 12, 24] },
  { id: 'staple-4', name: 'White Rice (2 lb)', category: 'grain', unitDesc: '2 lb bag', presetPacks: [1, 5, 10, 20] },
  { id: 'staple-5', name: 'Canned Tuna in Water', category: 'protein', unitDesc: '5 oz can', presetPacks: [1, 8, 24, 48] },
  { id: 'staple-6', name: 'Whole Grain Pasta (16oz)', category: 'grain', unitDesc: '1 lb box', presetPacks: [1, 6, 12, 20] },
  { id: 'staple-7', name: 'Cut Green Beans (14.5oz)', category: 'vegetable', unitDesc: '14.5 oz can', presetPacks: [1, 6, 12, 24] },
  { id: 'staple-8', name: 'Diced Tomatoes (15oz)', category: 'vegetable', unitDesc: '15 oz can', presetPacks: [1, 6, 12, 24] },
  { id: 'staple-9', name: 'Rolled Oats (42oz)', category: 'breakfast', unitDesc: 'tub', presetPacks: [1, 4, 8, 12] },
  { id: 'staple-10', name: 'Macaroni & Cheese', category: 'grain', unitDesc: '7.25 oz box', presetPacks: [1, 12, 24] },
  { id: 'staple-11', name: 'Canned Chicken Breast', category: 'protein', unitDesc: '12.5 oz can', presetPacks: [1, 6, 12, 24] },
  { id: 'staple-12', name: 'Dry Pinto Beans (1 lb)', category: 'protein', unitDesc: '1 lb bag', presetPacks: [1, 10, 20] },
];

interface QuickAddStaplesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function QuickAddStaplesModal({ visible, onClose }: QuickAddStaplesModalProps) {
  const inventory = usePantryStore((state) => state.inventory);
  const addItems = usePantryStore((state) => state.addItems);
  const updateItem = usePantryStore((state) => state.updateItem);
  const addActivity = usePantryStore((state) => state.addActivity);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleQuickAdd = async (staple: StapleItem, amount: number) => {
    cueTap();
    setBusyId(`${staple.id}-${amount}`);
    try {
      const existing = inventory.find(
        (i) => i.name.toLowerCase().trim() === staple.name.toLowerCase().trim()
      );

      if (existing) {
        const nextCount = existing.count + amount;
        await updateItem(existing.id, { count: nextCount });
        addActivity(`Added ${amount} units of ${staple.name} (now ${nextCount})`, 'plus-box-outline');
        setToastMessage(`✓ Added ${amount} of ${staple.name}. Shelf now has ${nextCount}.`);
      } else {
        await addItems([
          {
            name: staple.name,
            category: staple.category,
            count: amount,
            source: 'donation',
            expiration: null,
          },
        ]);
        addActivity(`Added ${amount} units of ${staple.name}`, 'plus-box-outline');
        setToastMessage(`✓ Added ${amount} of ${staple.name} to shelf.`);
      }

      cueSuccess();
      setTimeout(() => {
        setToastMessage((cur) => (cur?.includes(staple.name) ? null : cur));
      }, 3500);
    } catch {
      cueWarn();
      setToastMessage(`⚠️ Could not add ${staple.name}. Please try again.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[85%] rounded-t-xl border-t border-hairline bg-canvas">
          {/* Header */}
          <View className="border-b border-hairline/60 px-5 pb-3.5 pt-4">
            <View className="mb-2 h-1.5 w-12 self-center rounded-md bg-hairline" />
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text variant="title" className="font-bold text-xl">
                  One-Tap Quick Add Staples
                </Text>
                <Text variant="body" tone="soft" className="mt-0.5 text-sm">
                  Tap any case quantity to add food without typing on a keyboard.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close quick add"
                hitSlop={10}
                className="h-10 w-10 items-center justify-center rounded-lg border border-hairline bg-card"
              >
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Toast Banner */}
          {toastMessage && (
            <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-lg bg-good/15 border border-good/40 p-3">
              <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.statusGood} />
              <Text variant="body" className="flex-1 font-semibold text-sm" style={{ color: '#2B5A24' }}>
                {toastMessage}
              </Text>
            </View>
          )}

          {/* List of staples */}
          <ScrollView contentContainerClassName="p-4 gap-3 pb-12" showsVerticalScrollIndicator={false}>
            {TOP_STAPLES.map((staple) => {
              const currentStock = inventory.find(
                (i) => i.name.toLowerCase().trim() === staple.name.toLowerCase().trim()
              )?.count ?? 0;

              return (
                <Card key={staple.id} className="gap-3 p-3.5">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center gap-3">
                      <CategoryIcon category={staple.category} size="md" />
                      <View className="flex-1">
                        <Text variant="body" className="font-bold text-base">
                          {staple.name}
                        </Text>
                        <Text variant="label" tone="soft" className="mt-0.5 text-xs">
                          {staple.unitDesc} · Currently on shelf:{' '}
                          <Text className="font-bold">{currentStock} units</Text>
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* One-tap preset buttons */}
                  <View className="flex-row gap-2 pt-1 border-t border-hairline/60">
                    {staple.presetPacks.map((pack) => {
                      const isBusy = busyId === `${staple.id}-${pack}`;
                      const label = pack === 1 ? '+1 unit' : pack >= 24 ? `+${pack} (Flat)` : pack >= 12 ? `+${pack} (Case)` : `+${pack}`;

                      return (
                        <Pressable
                          key={pack}
                          disabled={!!busyId}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${pack} units of ${staple.name}`}
                          onPress={() => handleQuickAdd(staple, pack)}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.75 : 1,
                            minHeight: 48,
                          })}
                          className="flex-1 items-center justify-center rounded-lg border border-hairline bg-card py-2.5 px-1 shadow-sm"
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color={COLORS.primary} />
                          ) : (
                            <Text variant="label" tone="brand" className="font-bold text-sm text-center">
                              {label}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
