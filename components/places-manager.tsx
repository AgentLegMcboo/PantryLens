import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { Button, Chip, Input, Row, Sheet, Text } from './ui';
import { BoxRules, usePantryStore } from '../lib/store';
import { Tappable } from './motion';

/**
 * Adding, naming and stocking the shelves in a pantry, and the sub-shelves
 * inside them (one level: "Back room › Top shelf").
 *
 * Lived in Settings, which was the wrong room: shelves and bins are not a
 * preference you set once and forget, they are the thing you rearrange while
 * standing in front of the inventory wondering where something went. It belongs
 * beside the list it organises.
 *
 * Kept as its own component rather than inlined so the whole editor — add,
 * rename, what-goes-here, remove — is one piece wherever it is opened from.
 */
export function PlacesManager() {
  const { locations, addLocation, renameLocation, setLocationCategories, deleteLocation, boxRules } =
    usePantryStore();

  const [newShelf, setNewShelf] = useState('');
  const [newSub, setNewSub] = useState('');
  /** Which shelf is open in the editor, if any. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const editingLocation = locations.find(l => l.id === editing?.id);
  const categories = Object.keys(boxRules) as (keyof BoxRules)[];
  const topLevel = locations.filter(l => !l.parent_id);
  const subsOf = (id: string) => locations.filter(l => l.parent_id === id);

  /** Names are unique among siblings: two shelves can each have a "Top shelf". */
  const taken = (name: string, parentId: string | null) =>
    locations.some(
      l => (l.parent_id ?? null) === parentId && l.name.toLowerCase() === name.toLowerCase(),
    );

  const add = async (raw: string, parentId: string | null, clear: () => void) => {
    const name = raw.trim();
    if (!name) return;
    if (taken(name, parentId)) {
      Alert.alert('Already there', `There's already a shelf called "${name}" here.`);
      return;
    }
    try {
      await addLocation(name, parentId);
      clear();
    } catch (err: any) {
      Alert.alert('Could not add that shelf', err?.message ?? 'Please try again.');
    }
  };

  const handleRename = async () => {
    if (!editing?.name.trim()) return;
    try {
      await renameLocation(editing.id, editing.name);
      setEditing(null);
    } catch (err: any) {
      Alert.alert('Could not rename it', err?.message ?? 'Please try again.');
    }
  };

  const handleRemove = () => {
    if (!editing) return;
    const { id, name } = editing;
    const subs = subsOf(id).length;
    Alert.alert(
      `Remove "${name}"?`,
      subs
        ? `Its ${subs} sub-shelf${subs === 1 ? '' : 's'} go too. The food stays on the list, just unfiled.`
        : 'The food stays on the list — it just stops being filed anywhere.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setEditing(null);
            deleteLocation(id).catch((err: any) =>
              Alert.alert('Could not remove it', err?.message ?? 'Please try again.'),
            );
          },
        },
      ],
    );
  };

  const hint = (categoriesHere?: string[]) =>
    categoriesHere?.length ? categoriesHere.join(', ') : 'Takes anything';

  return (
    <>
      {/* Adding comes first: it is what most people open this for. */}
      <View className="mb-3 flex-row items-end gap-3">
        <View className="flex-1">
          <Input
            label="New shelf"
            value={newShelf}
            onChangeText={setNewShelf}
            placeholder="Back room"
            returnKeyType="done"
            onSubmitEditing={() => add(newShelf, null, () => setNewShelf(''))}
          />
        </View>
        <Tappable
          onPress={() => add(newShelf, null, () => setNewShelf(''))}
          accessibilityLabel="Add this shelf"
          disabled={!newShelf.trim()}
          className={`h-12 w-12 items-center justify-center rounded-md bg-brand ${
            newShelf.trim() ? '' : 'opacity-40'
          }`}
        >
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnAccent} />
        </Tappable>
      </View>

      {topLevel.map((loc, i) => (
        <View key={loc.id}>
          <Row
            icon="bookshelf"
            label={loc.name}
            hint={
              subsOf(loc.id).length
                ? `${subsOf(loc.id).length} sub-shelf${subsOf(loc.id).length === 1 ? '' : 's'} · ${hint(loc.categories)}`
                : hint(loc.categories)
            }
            divider={false}
            onPress={() => setEditing({ id: loc.id, name: loc.name })}
          />
          {subsOf(loc.id).map(sub => (
            <View key={sub.id} className="ml-[52px]">
              <Row
                icon="chevron-down"
                label={sub.name}
                hint={hint(sub.categories)}
                divider={false}
                onPress={() => setEditing({ id: sub.id, name: sub.name })}
              />
            </View>
          ))}
          {i < topLevel.length - 1 && <View className="h-px bg-hairline" />}
        </View>
      ))}

      {locations.length === 0 && (
        <Text variant="label" tone="soft" className="pb-2">
          None yet. Add the shelves and bins you already use — "Canned wall",
          "Freezer", "Back room".
        </Text>
      )}

      <Sheet
        visible={!!editing}
        onClose={() => {
          setEditing(null);
          setNewSub('');
        }}
        title={editingLocation?.parent_id ? 'Edit sub-shelf' : 'Edit shelf'}
        subtitle="Everything filed here follows the new name."
      >
        <Input
          label="Name"
          value={editing?.name ?? ''}
          onChangeText={name => setEditing(prev => (prev ? { ...prev, name } : prev))}
          placeholder="Canned wall"
          returnKeyType="done"
          onSubmitEditing={handleRename}
        />

        {/* Sub-shelves: only on a top-level shelf, one level deep. */}
        {editingLocation && !editingLocation.parent_id && (
          <View className="gap-2">
            <Text variant="label" tone="soft" className="font-semibold">
              Sub-shelves
            </Text>
            {subsOf(editingLocation.id).length > 0 && (
              <Text variant="label">
                {subsOf(editingLocation.id).map(sub => sub.name).join(' · ')}
              </Text>
            )}
            <View className="flex-row items-end gap-3">
              <View className="flex-1">
                <Input
                  value={newSub}
                  onChangeText={setNewSub}
                  placeholder="Top shelf"
                  returnKeyType="done"
                  onSubmitEditing={() => add(newSub, editingLocation.id, () => setNewSub(''))}
                />
              </View>
              <Tappable
                onPress={() => add(newSub, editingLocation.id, () => setNewSub(''))}
                accessibilityLabel="Add this sub-shelf"
                disabled={!newSub.trim()}
                className={`h-12 w-12 items-center justify-center rounded-md bg-brand ${
                  newSub.trim() ? '' : 'opacity-40'
                }`}
              >
                <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnAccent} />
              </Tappable>
            </View>
          </View>
        )}

        {/* What this bin is FOR. Their tables and bins are already labelled this
            way — "canned vegetables", "pasta" — so telling the app the same thing
            turns sorting from a step somebody performs into something that has
            already happened by the time they look. */}
        <View className="gap-2">
          <Text variant="label" tone="soft" className="font-semibold">
            What goes here?
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {categories.map(cat => {
              const key = String(cat);
              const on = editingLocation?.categories?.includes(key as any) ?? false;
              return (
                <Chip
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  selected={on}
                  onPress={() => {
                    if (!editingLocation) return;
                    const next = on
                      ? editingLocation.categories.filter(c => c !== key)
                      : [...(editingLocation.categories ?? []), key as any];
                    setLocationCategories(editingLocation.id, next).catch((err: any) =>
                      Alert.alert('Could not save that', err?.message ?? 'Please try again.'),
                    );
                  }}
                />
              );
            })}
          </View>
          <Text variant="micro" tone="soft">
            Scanned items of these categories file themselves here. Leave it empty
            and nothing does.
          </Text>
        </View>

        <Button label="Save" block onPress={handleRename} />
        <Button
          label={editingLocation?.parent_id ? 'Remove this sub-shelf' : 'Remove this shelf'}
          variant="criticalGhost"
          className="self-center"
          onPress={handleRemove}
        />
      </Sheet>
    </>
  );
}
