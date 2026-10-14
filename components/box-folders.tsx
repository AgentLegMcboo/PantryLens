import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { type BoxFolderKind, usePantryStore } from '../lib/store';
import { Button, Chip, Input, Row, Text } from './ui';
import { Tappable } from './motion';

/**
 * Folders for boxes: choosing one, and managing them.
 *
 * Used for both box types (the picker on Build) and packed batches (Ready to
 * go). Those are separate sets of folders, told apart by `kind`, but they look
 * and work the same, so there's one set of controls.
 *
 * Nothing here opens a sheet of its own. Both places that use these controls
 * are already inside a sheet, and a modal stacked on a modal is unreliable on
 * iOS, so adding, renaming and deleting all happen inline.
 */

const NOUN: Record<BoxFolderKind, [string, string]> = {
  template: ['box type', 'box types'],
  packed: ['batch', 'batches'],
};

const EXAMPLE: Record<BoxFolderKind, string> = {
  template: 'Holiday',
  packed: 'Saturday distribution',
};

/** A name field with an add button, the same wherever a folder is created. */
function AddFolderField({
  kind,
  label,
  autoFocus,
  onAdded,
  onCancel,
}: {
  kind: BoxFolderKind;
  label?: string;
  autoFocus?: boolean;
  onAdded?: (folderId: string) => void;
  onCancel?: () => void;
}) {
  const addBoxFolder = usePantryStore(state => state.addBoxFolder);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const folder = await addBoxFolder(kind, name);
      setName('');
      onAdded?.(folder.id);
    } catch (err: any) {
      Alert.alert('Could not add that folder', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">
        <Input
          label={label}
          value={name}
          onChangeText={setName}
          placeholder={EXAMPLE[kind]}
          maxLength={60}
          autoFocus={autoFocus}
          returnKeyType="done"
          onSubmitEditing={add}
        />
      </View>
      <Tappable
        onPress={add}
        disabled={!name.trim() || busy}
        accessibilityRole="button"
        accessibilityLabel="Add this folder"
        className={`h-12 w-12 items-center justify-center rounded-md bg-brand ${
          name.trim() && !busy ? '' : 'opacity-40'
        }`}
      >
        <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnPrimary} />
      </Tappable>
      {onCancel ? (
        <Tappable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="h-12 w-12 items-center justify-center rounded-md bg-subtle"
        >
          <MaterialCommunityIcons name="close" size={20} color={COLORS.textPrimary} />
        </Tappable>
      ) : null}
    </View>
  );
}

/**
 * Picks the folder something goes in, or none. Can make a new folder on the
 * spot, since that's usually the moment you realise you want one.
 */
export function FolderChips({
  kind,
  value,
  onChange,
}: {
  kind: BoxFolderKind;
  value: string | null;
  onChange: (folderId: string | null) => void;
}) {
  const boxFolders = usePantryStore(state => state.boxFolders);
  const folders = boxFolders.filter(f => f.kind === kind);
  const [adding, setAdding] = useState(false);

  return (
    <View className="gap-2">
      <Text variant="label" tone="soft" className="font-semibold">
        Folder
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Chip label="No folder" selected={value === null} onPress={() => onChange(null)} />
        {folders.map(folder => (
          <Chip
            key={folder.id}
            label={folder.name}
            selected={value === folder.id}
            onPress={() => onChange(folder.id)}
          />
        ))}
        {!adding && <Chip label="+ New folder" onPress={() => setAdding(true)} />}
      </View>
      {adding && (
        <AddFolderField
          kind={kind}
          autoFocus
          onCancel={() => setAdding(false)}
          onAdded={folderId => {
            onChange(folderId);
            setAdding(false);
          }}
        />
      )}
    </View>
  );
}

/** Lists folders of one kind, with inline rename and delete, and a way to add one. */
export function FolderManager({
  kind,
  counts,
}: {
  kind: BoxFolderKind;
  /** How many things are filed in each folder, by folder id. */
  counts: Record<string, number>;
}) {
  const { boxFolders, renameBoxFolder, deleteBoxFolder } = usePantryStore();
  const folders = boxFolders.filter(f => f.kind === kind);
  const [one, many] = NOUN[kind];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      await renameBoxFolder(editingId, editName);
      setEditingId(null);
    } catch (err: any) {
      Alert.alert('Could not rename that folder', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string, name: string) => {
    const n = counts[id] ?? 0;
    Alert.alert(
      `Delete "${name}"?`,
      n > 0
        ? `The ${n} ${n === 1 ? one : many} in it stay. They just won't be in a folder.`
        : 'It is empty.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBoxFolder(id);
              setEditingId(null);
            } catch (err: any) {
              Alert.alert('Could not delete that folder', err?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <View>
      {folders.length === 0 && (
        <Text variant="label" tone="soft" className="pb-2">
          No folders yet.
        </Text>
      )}

      {folders.map((folder, i) => {
        const n = counts[folder.id] ?? 0;
        if (editingId === folder.id) {
          return (
            <View key={folder.id} className="gap-2 py-3" style={RULE_BELOW}>
              <Input
                value={editName}
                onChangeText={setEditName}
                maxLength={60}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={save}
              />
              <View className="flex-row items-center gap-2">
                <Button label="Save" size="compact" loading={busy} onPress={save} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="compact"
                  onPress={() => setEditingId(null)}
                />
                <View className="flex-1" />
                <Button
                  label="Delete"
                  variant="criticalGhost"
                  size="compact"
                  onPress={() => remove(folder.id, folder.name)}
                />
              </View>
            </View>
          );
        }
        return (
          <Row
            key={folder.id}
            icon="folder-outline"
            label={folder.name}
            hint={`${n} ${n === 1 ? one : many} · tap to rename or delete`}
            divider={i < folders.length - 1}
            onPress={() => {
              setEditingId(folder.id);
              setEditName(folder.name);
            }}
          />
        );
      })}

      <View className="mt-4">
        <AddFolderField kind={kind} label="Add a folder" />
      </View>
    </View>
  );
}
