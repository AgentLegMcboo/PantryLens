import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { Button, Chip, Input, Row, Sheet, Text } from './ui';
import { BoxRules, usePantryStore } from '../lib/store';
import { Tappable } from './motion';

/**
 * Adding, naming and stocking the places in a pantry.
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

  const [newLocation, setNewLocation] = useState('');
  /** Which place is open in the editor, if any. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const editingLocation = locations.find(l => l.id === editing?.id);
  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  const handleAdd = async () => {
    const name = newLocation.trim();
    if (!name) return;
    if (locations.some(l => l.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Already there', `You already have a place called "${name}".`);
      return;
    }
    try {
      await addLocation(name);
      setNewLocation('');
    } catch (err: any) {
      Alert.alert('Could not add that place', err?.message ?? 'Please try again.');
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
    Alert.alert(
      `Remove "${name}"?`,
      'The food stays on the shelf list — it just stops being assigned anywhere.',
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

  return (
    <>
      {locations.map((loc, i) => (
        <Row
          key={loc.id}
          icon="map-marker-outline"
          label={loc.name}
          hint={
            loc.categories?.length
              ? loc.categories.join(', ')
              : 'Takes anything — nothing files itself here'
          }
          divider={i < locations.length - 1}
          onPress={() => setEditing({ id: loc.id, name: loc.name })}
        />
      ))}

      {locations.length === 0 && (
        <Text variant="label" tone="soft" className="pb-2">
          None yet. Add the shelves and bins you already use — "Shelf A",
          "Freezer", "Back room".
        </Text>
      )}

      <View className="mt-4 flex-row items-end gap-3">
        <View className="flex-1">
          <Input
            label="Add a place"
            value={newLocation}
            onChangeText={setNewLocation}
            placeholder="Shelf A"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
        </View>
        <Tappable
          onPress={handleAdd}
          accessibilityLabel="Add this place"
          disabled={!newLocation.trim()}
          className={`h-12 w-12 items-center justify-center rounded-md bg-brand ${
            newLocation.trim() ? '' : 'opacity-40'
          }`}
        >
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnPrimary} />
        </Tappable>
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title="Rename this place"
        subtitle="Everything filed here follows the new name."
      >
        <Input
          label="Name"
          value={editing?.name ?? ''}
          onChangeText={name => setEditing(prev => (prev ? { ...prev, name } : prev))}
          placeholder="Shelf A"
          returnKeyType="done"
          onSubmitEditing={handleRename}
        />

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
          label="Remove this place"
          variant="criticalGhost"
          className="self-center"
          onPress={handleRemove}
        />
      </Sheet>
    </>
  );
}
