import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { FadeInUp } from '../components/motion';
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Input,
  Panel,
  Stepper,
  Text,
} from '../components/ui';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import {
  Category,
  Condition,
  CONDITION_LABELS,
  isUsableCondition,
  usePantryStore,
} from '../lib/store';

const CATEGORIES: Category[] = [
  'grain',
  'vegetable',
  'protein',
  'breakfast',
  'snack',
  'hygiene',
  'baby',
];

/**
 * One item, editable.
 *
 * Was a single card holding nine stacked label-and-control pairs with a 44px
 * stepper wedged among them — a form with no shape, where "how many are on the
 * shelf" looked exactly as important as "what date is printed on the tin".
 *
 * Three cards now, each answering one question, in the order a volunteer holding
 * the tin would ask them: what is it, how many and how long, is it fit to give
 * out. Condition gets a card of its own because it is the only field here that
 * silently removes stock from every box the app builds.
 */
export default function ItemDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { getItem, updateItem, deleteItem } = usePantryStore();

  const item = getItem(id as string);

  // Every hook runs before the not-found branch, without exception. These used
  // to sit below an early return, so the moment the item left the store — a
  // delete, or a realtime refetch landing while this screen was open — React
  // saw fewer hooks than the previous render and tore the app down.
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<Category>(item?.category ?? 'unknown');
  const [count, setCount] = useState(item?.count ?? 1);
  const [expiration, setExpiration] = useState(item?.expiration || '');
  const [condition, setCondition] = useState<Condition>(item?.condition ?? 'ok');

  if (!item) {
    return (
      <View className="flex-1 justify-center bg-canvas">
        <EmptyState
          icon="package-variant"
          title="This item is gone"
          body="It was deleted, or packed into a box, while you had this open."
          actionLabel="Back to the shelf"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const handleSave = () => {
    // The stepper goes to zero and the hint says so, so zero has to actually
    // mean gone — the same thing it means on the shelf list. Saving a 0-count
    // item would otherwise leave a row nothing can ever be packed from.
    if (count === 0) {
      deleteItem(item.id);
      cueSuccess();
      router.back();
      return;
    }

    updateItem(item.id, {
      name: name.trim(),
      category,
      count,
      expiration: expiration.trim() || null,
      condition,
    });
    cueSuccess();
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Remove this item?', `"${item.name}" will come off the shelf entirely.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteItem(item.id);
          router.back();
        },
      },
    ]);
  };

  const usable = isUsableCondition(condition);

  return (
    <KeyboardScreen>
      <FadeInUp index={0}>
        <Card className="gap-5">
          <Input label="What is it?" value={name} onChangeText={setName} placeholder="Canned black beans 15 oz" />

          <View className="gap-2">
            <Text variant="label" tone="soft" className="font-semibold">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <Chip
                  key={cat}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                  selected={category === cat}
                  onPress={() => setCategory(cat)}
                />
              ))}
            </View>
          </View>
        </Card>
      </FadeInUp>

      <FadeInUp index={1}>
        <Card className="gap-5">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body" className="font-semibold">
                How many on the shelf?
              </Text>
              <Text variant="micro" tone="soft" className="mt-0.5">
                Counting down to zero removes the item.
              </Text>
            </View>
            <Stepper value={count} min={0} onChange={setCount} />
          </View>

          <Input
            label="Date printed on it"
            value={expiration}
            onChangeText={setExpiration}
            placeholder="YYYY-MM-DD"
            hint="Leave it blank if there is no date to read."
          />
        </Card>
      </FadeInUp>

      {/* The only place a flagged item can be cleared. Intake can mark a can
          dented, which holds it out of every box — without this the item was
          stuck that way for good, and the shelf slowly filled with stock the
          allocator refused to touch. */}
      <FadeInUp index={2}>
        <Card>
          <CardHeader
            title="Is it fit to give out?"
            subtitle="Anything but Good is held back from every box until someone clears it."
          />

          <View className="flex-row flex-wrap gap-2">
            {(Object.keys(CONDITION_LABELS) as Condition[]).map(cond => {
              const active = condition === cond;
              const good = cond === 'ok';
              return (
                <Chip
                  key={cond}
                  label={CONDITION_LABELS[cond]}
                  selected={active}
                  className={
                    active
                      ? good
                        ? 'border-good bg-good'
                        : 'border-critical bg-critical'
                      : undefined
                  }
                  onPress={() => {
                    (good ? cueTap : cueWarn)();
                    setCondition(cond);
                  }}
                />
              );
            })}
          </View>

          {!usable && (
            <Panel className="mt-4 flex-row gap-3">
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color={COLORS.statusCritical}
              />
              <Text variant="label" tone="critical" className="flex-1">
                Held out of box building until someone marks it Good again.
              </Text>
            </Panel>
          )}
        </Card>
      </FadeInUp>

      <FadeInUp index={3}>
        <View className="flex-row items-center justify-between px-1">
          <Text variant="micro" tone="soft">
            Received {item.date_added}
          </Text>
          <Text variant="micro" tone="soft" className="capitalize">
            {item.source.replace('_', ' ')}
          </Text>
        </View>
      </FadeInUp>

      <FadeInUp index={4}>
        <View className="gap-3">
          <Button label="Save changes" block onPress={handleSave} />
          <Button
            label="Remove from the shelf"
            variant="criticalGhost"
            size="compact"
            className="self-center"
            icon={
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={COLORS.statusCritical}
              />
            }
            onPress={handleDelete}
          />
        </View>
      </FadeInUp>
    </KeyboardScreen>
  );
}
