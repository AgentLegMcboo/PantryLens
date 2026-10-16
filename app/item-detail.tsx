import { parsePrintedDate } from '../lib/intake';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { FadeInUp, Tappable } from '../components/motion';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  InfoLabel,
  Input,
  ItemThumb,
  Stepper,
  Text,
} from '../components/ui';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { renderItemPhoto, storeItemPhoto } from '../lib/item-photos';
import {
  DIET_TAG_GROUPS,
  DIET_TAG_LABELS,
  isAllergenTag,
  normaliseDietTags,
  type DietTag,
} from '../lib/diet';
import {
  Category,
  Condition,
  CONDITION_LABELS,
  isUsableCondition,
  usePantryStore,
} from '../lib/store';
import { orderShelves } from '../lib/shelves';

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
  const { getItem, updateItem, deleteItem, locations, settings } = usePantryStore();

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
  const [locationId, setLocationId] = useState<string | null>(item?.location_id ?? null);
  const [dietTags, setDietTags] = useState<DietTag[]>(normaliseDietTags(item?.diet_tags));
  const [photoBusy, setPhotoBusy] = useState(false);

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

  const report = (title: string) => (err: any) => {
    cueWarn();
    Alert.alert(title, err?.message ?? 'Please try again.');
  };

  const handleSave = () => {
    if (expiration.trim() && !parsePrintedDate(expiration)) {
      Alert.alert('Check the printed date', 'Enter YYYY-MM-DD or MM/YYYY, or leave it blank if unknown.'); return;
    }
    // The stepper goes to zero and the hint says so, so zero has to actually
    // mean gone — the same thing it means on the shelf list. Saving a 0-count
    // item would otherwise leave a row nothing can ever be packed from.
    if (count === 0) {
      deleteItem(item.id).catch(report('Could not remove that item'));
      cueSuccess();
      router.back();
      return;
    }

    updateItem(item.id, {
      name: name.trim(),
      category,
      count,
      expiration: parsePrintedDate(expiration),
      condition,
      location_id: locationId,
      diet_tags: dietTags,
    }).catch(report('Could not save your changes'));
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
          deleteItem(item.id).catch(report('Could not remove that item'));
          router.back();
        },
      },
    ]);
  };

  /**
   * Putting a picture on an item by hand.
   *
   * Scanning attaches photos going forward, but it can do nothing for stock that
   * was already on the shelf when that arrived — and a pantry's whole existing
   * inventory is exactly that. This is how those rows get a picture: point the
   * camera at the tin, or pick a shot already on the phone.
   *
   * It also covers the cases scanning never will — something typed in by hand,
   * a crop the model boxed badly, a product whose pack shot is not what is
   * actually in the bag.
   */
  const setPhotoFrom = async (
    launch: () => Promise<ImagePicker.ImagePickerResult>,
  ) => {
    if (!settings.pantryId) return;
    const result = await launch();
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setPhotoBusy(true);
    try {
      const jpeg = await renderItemPhoto(result.assets[0].uri);
      if (!jpeg) throw new Error('That photo could not be read.');

      const url = await storeItemPhoto(item.id, settings.pantryId, jpeg);
      if (!url) throw new Error('The photo could not be saved. Check your connection.');

      // Straight into the store, so the shelf list behind this screen updates
      // without waiting for a refetch.
      await updateItem(item.id, { image_url: url });
      cueSuccess();
    } catch (err: any) {
      cueWarn();
      Alert.alert('Could not add that photo', err?.message ?? 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoPress = () => {
    cueTap();
    const options: any[] = [
      {
        text: 'Take a photo',
        onPress: () =>
          setPhotoFrom(async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert(
                'Camera access needed',
                'Turn it on in Settings › PantryLens to photograph this item.',
              );
              return { canceled: true } as ImagePicker.ImagePickerResult;
            }
            return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
          }),
      },
      {
        text: 'Choose from photos',
        onPress: () =>
          setPhotoFrom(() =>
            ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 }),
          ),
      },
    ];

    if (item.image_url) {
      options.push({
        text: 'Remove photo',
        style: 'destructive',
        // The stored file is left alone: a replacement overwrites it at the same
        // path, and a delete would take a pack shot's URL with it for no reason.
        onPress: () =>
          updateItem(item.id, { image_url: null }).catch(
            report('Could not remove that photo'),
          ),
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
      item.image_url ? 'Change the photo' : 'Add a photo',
      'A picture makes this item findable at a glance on the shelf list.',
      options,
    );
  };

  const usable = isUsableCondition(condition);

  return (
    <KeyboardScreen contentContainerClassName="gap-3 pt-4">
      <FadeInUp index={0}>
        <Card className="gap-3.5 p-4">
          <View className="flex-row items-center gap-3">
            <Tappable
              onPress={handlePhotoPress}
              disabled={photoBusy}
              accessibilityLabel={item.image_url ? 'Change the photo' : 'Add a photo'}
            >
              <ItemThumb
                imageUrl={item.image_url}
                category={category}
                size="md"
                className="h-16 w-16"
              />
              {/* A small camera badge, because a thumbnail does not otherwise
                  look like something you can press. */}
              <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-md border-2 border-card bg-brand">
                {photoBusy ? (
                  <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
                ) : (
                  <MaterialCommunityIcons
                    name={item.image_url ? 'pencil' : 'camera-plus-outline'}
                    size={12}
                    color={COLORS.textOnPrimary}
                  />
                )}
              </View>
            </Tappable>
            <View className="flex-1">
              <Text variant="label" className="mb-1.5 font-bold">
                Name
              </Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Canned black beans 15 oz"
              />
            </View>
          </View>

          <View className="gap-2">
            <Text variant="label" className="font-bold">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <Chip
                  key={cat}
                  className="min-h-[40px] px-3 py-1.5"
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
        <Card className="gap-3.5 p-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <InfoLabel
                variant="body"
                label="On the shelf"
                tip="Counting down to zero takes the item off the shelf."
              />
            </View>
            <Stepper value={count} min={0} onChange={setCount} />
          </View>

          <Input
            label="Date printed on it"
            value={expiration}
            onChangeText={setExpiration}
            placeholder="YYYY-MM-DD or MM/YYYY"
            error={expiration.trim() && !parsePrintedDate(expiration) ? "Enter a real printed date, or leave blank." : null}
            hint="Leave it blank if there is no date to read."
          />

          {locations.length > 0 ? (
            <View className="gap-2">
              <Text variant="label" className="font-bold">
                Shelf
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {orderShelves(locations).map(({ loc, label }) => (
                  <Chip
                    key={loc.id}
                    className="min-h-[40px] px-3 py-1.5"
                    label={label}
                    selected={locationId === loc.id}
                    onPress={() => setLocationId(locationId === loc.id ? null : loc.id)}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text variant="micro" tone="soft">
              No shelves yet. Add them from Inventory to file this somewhere.
            </Text>
          )}
        </Card>
      </FadeInUp>

      {/* The only place a flagged item can be cleared. Intake can mark a can
          dented, which holds it out of every box — without this the item was
          stuck that way for good, and the shelf slowly filled with stock the
          allocator refused to touch. */}
      <FadeInUp index={2}>
        <Card className="gap-2.5 p-4">
          <InfoLabel
            variant="body"
            label="Fit to give out?"
            tip="Anything but Good is held out of every box until someone marks it Good again."
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
                  className={`${'min-h-[40px] px-3 py-1.5'} ${
                    active ? (good ? 'border-good bg-good' : 'border-critical bg-critical') : ''
                  }`}
                  onPress={() => {
                    (good ? cueTap : cueWarn)();
                    setCondition(cond);
                  }}
                />
              );
            })}
          </View>

          {!usable && (
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={COLORS.statusCritical}
              />
              <Text variant="micro" tone="critical" className="flex-1 font-bold">
                Held out of boxes until someone marks it Good.
              </Text>
            </View>
          )}
        </Card>
      </FadeInUp>

      {/* Allergens, diet, and whether somebody without a kitchen can use it.
          Barcoded products arrive with the allergens already filled in from Open
          Food Facts. The last two nobody publishes, so they are a question for
          whoever is holding the tin — and they are the two that decide whether a
          parcel is food or a problem for someone living in a car. */}
      <FadeInUp index={3}>
        <Card className="gap-3 p-4">
          <InfoLabel
            variant="body"
            label="Who can eat it"
            tip={'Used to build boxes for households with an allergy, a diet, or nowhere to cook. Tick only what you know: unticked means nobody checked, never that the food is free of it.'}
          />

          {DIET_TAG_GROUPS.map((group, groupIndex) => (
            <View
              key={group.title}
              className="gap-1.5"
            >
              <InfoLabel label={group.title} tip={group.hint} />
              <View className="flex-row flex-wrap gap-2">
                {group.tags.map(tag => {
                  const on = dietTags.includes(tag);
                  return (
                    <Chip
                      key={tag}
                      label={DIET_TAG_LABELS[tag]}
                      selected={on}
                      className={`min-h-[40px] px-3 py-1.5 ${on && isAllergenTag(tag) ? 'border-warn bg-warn' : ''}`}
                      onPress={() => {
                        cueTap();
                        setDietTags(prev =>
                          normaliseDietTags(on ? prev.filter(t => t !== tag) : [...prev, tag]),
                        );
                      }}
                    />
                  );
                })}
              </View>
            </View>
          ))}

        </Card>
      </FadeInUp>

      <FadeInUp index={4}>
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
        <View className="gap-1">
          <Button label="Save changes" block className="rounded-md" onPress={handleSave} />
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
