import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { BOX_CATEGORIES, MAX_PER_CATEGORY, type BoxItemRule } from '../lib/box-presets';
import { cueTap } from '../lib/feedback';
import { type BoxRules, usePantryStore } from '../lib/store';
import { Tappable } from './motion';
import { CategoryIcon, Input, Stepper, Text } from './ui';

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The particular products a box must hold, as opposed to "any 2 protein".
 *
 * Pick one from what's in inventory, or type a name for something you expect
 * to have. Each comes with its own count, and the pick list fills it with
 * exactly that product.
 */
export function BoxItemsEditor({
  items,
  onChange,
}: {
  items: BoxItemRule[];
  onChange: (items: BoxItemRule[]) => void;
}) {
  const inventory = usePantryStore(s => s.inventory);
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);

  // One entry per product, however many deliveries it arrived in.
  const products = useMemo(() => {
    const byName = new Map<string, { name: string; category: keyof BoxRules; units: number }>();
    for (const i of inventory) {
      const key = i.name.trim().toLowerCase();
      if (!key) continue;
      const existing = byName.get(key);
      if (existing) existing.units += i.count;
      else
        byName.set(key, {
          name: i.name.trim(),
          category: (BOX_CATEGORIES.includes(i.category as keyof BoxRules) ? i.category : 'snack') as keyof BoxRules,
          units: i.count,
        });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory]);

  const chosen = new Set(items.map(i => i.name.toLowerCase()));
  const q = query.trim().toLowerCase();
  const matches = products
    .filter(p => !chosen.has(p.name.toLowerCase()) && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 8);
  const exact = products.some(p => p.name.toLowerCase() === q) || chosen.has(q);

  const add = (name: string, category: keyof BoxRules) => {
    cueTap();
    onChange([...items, { name: name.trim(), category, count: 1 }]);
    setQuery('');
  };
  const update = (index: number, patch: Partial<BoxItemRule>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const remove = (index: number) => {
    cueTap();
    onChange(items.filter((_, i) => i !== index));
  };
  // Tapping the category moves it to the next one: enough for a typed-in item.
  const nextCategory = (c: keyof BoxRules) =>
    BOX_CATEGORIES[(BOX_CATEGORIES.indexOf(c) + 1) % BOX_CATEGORIES.length];

  const showList = browsing || q.length > 0;

  return (
    <View className="gap-2">
      <View className="px-1">
        <Text variant="label" className="font-bold">
          Specific items
        </Text>
        <Text variant="micro" tone="soft">
          Optional. For exact products, like formula or peanut butter.
        </Text>
      </View>

      {items.map((item, index) => (
        <View key={item.name} className="min-h-[52px] flex-row items-center gap-3 py-1.5" style={RULE_BELOW}>
          <CategoryIcon category={item.category} tone="secondary" />
          <View className="flex-1">
            <Text variant="body" className="font-semibold" numberOfLines={1}>
              {item.name}
            </Text>
            <Tappable
              onPress={() => {
                cueTap();
                update(index, { category: nextCategory(item.category) });
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Category ${item.category}. Tap to change.`}
            >
              <Text variant="micro" tone="soft">
                {title(item.category)} ▾
              </Text>
            </Tappable>
          </View>
          <Stepper
            value={item.count}
            min={1}
            max={MAX_PER_CATEGORY}
            onChange={count => update(index, { count })}
          />
          <Tappable
            onPress={() => remove(index)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            className="h-8 w-8 items-center justify-center"
          >
            <MaterialCommunityIcons name="close" size={18} color={COLORS.textSecondary} />
          </Tappable>
        </View>
      ))}

      <Input
        label="Add an item"
        value={query}
        onChangeText={setQuery}
        placeholder="Search inventory or type a name"
        returnKeyType="done"
        onFocus={() => setBrowsing(true)}
        onSubmitEditing={() => {
          if (q && !exact) add(query, 'snack');
        }}
      />

      {showList && (
        <View className="rounded-md border border-hairline px-3">
          {q.length > 0 && !exact && (
            <Tappable
              onPress={() => add(query, matches[0]?.category ?? 'snack')}
              accessibilityRole="button"
              className="min-h-[46px] flex-row items-center gap-2"
              style={matches.length ? RULE_BELOW : undefined}
            >
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.primaryDark} />
              <Text variant="label" className="flex-1 font-bold" style={{ color: COLORS.primaryDark }} numberOfLines={1}>
                Add “{query.trim()}”
              </Text>
            </Tappable>
          )}
          {matches.map((p, i) => (
            <Tappable
              key={p.name}
              onPress={() => add(p.name, p.category)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${p.name}`}
              className="min-h-[46px] flex-row items-center gap-2"
              style={i < matches.length - 1 ? RULE_BELOW : undefined}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.secondaryDark} />
              <Text variant="label" className="flex-1 font-semibold" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="micro" tone="soft">
                {p.units} on hand
              </Text>
            </Tappable>
          ))}
          {matches.length === 0 && q.length === 0 && (
            <Text variant="micro" tone="soft" className="py-3">
              Nothing in inventory yet. Type a name to add one.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
