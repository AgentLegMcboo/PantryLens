import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import {
  BOX_CATEGORIES,
  BOX_PRESETS,
  describeRules,
  itemsPerBox,
  MAX_PER_CATEGORY,
  normaliseRules,
  uniqueBoxName,
  type BoxPreset,
} from '../lib/box-presets';
import {
  DIET_TAG_GROUPS,
  DIET_TAG_LABELS,
  EXCLUSION_CAVEAT,
  isAllergenTag,
  type DietTag,
} from '../lib/diet';
import { cueSuccess, cueTap } from '../lib/feedback';
import { type BoxRules, type BoxTemplate, usePantryStore } from '../lib/store';
import { FolderChips, FolderManager } from './box-folders';
import { Button, categoryIcon, Chip, Input, Row, Sheet, Stepper, Text, Toggle } from './ui';

/** What Build is packing: a saved template, or a preset used as-is. */
export type BoxSelection = { kind: 'template'; id: string } | { kind: 'preset'; key: string };

/** The box being edited. No `id` means it hasn't been saved yet. */
interface Draft {
  id?: string;
  name: string;
  rules: BoxRules;
  scalesWithFamily: boolean;
  folderId: string | null;
  excludesTags: DietTag[];
  requiresTags: DietTag[];
}

const title = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

/**
 * Choosing, making, filing and reusing boxes.
 *
 * One sheet with three modes (the list, the editor, and folder management)
 * rather than sheets opening sheets. Stacked modals are unreliable on iOS, and
 * switching mode in place keeps "back" obvious.
 *
 * Folders organise the list, but every box type keeps its contents summary
 * right under its name. Filing a box away must never make it harder to see
 * what it holds.
 *
 * `selectedKey` is `template:<id>` or `preset:<key>`, matching what Build
 * resolved, so the tick sits on the box actually being packed, including the
 * default when nothing was picked.
 */
export function BoxPicker({
  visible,
  onClose,
  selectedKey,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selectedKey: string;
  onSelect: (selection: BoxSelection) => void;
}) {
  const { boxTemplates, boxFolders, saveBoxTemplate, deleteBoxTemplate, setDefaultBoxTemplate } =
    usePantryStore();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'list' | 'folders'>('list');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // Always reopen on the list, not half-way through something abandoned.
  useEffect(() => {
    if (!visible) {
      setDraft(null);
      setMode('list');
    }
  }, [visible]);

  const pick = (selection: BoxSelection) => {
    cueTap();
    onSelect(selection);
    onClose();
  };

  const takenNames = () => boxTemplates.map(t => t.name);

  const editTemplate = (template: BoxTemplate) => {
    cueTap();
    setDraft({
      id: template.id,
      name: template.name,
      rules: template.rules,
      scalesWithFamily: template.scales_with_family,
      folderId: template.folder_id ?? null,
      excludesTags: template.excludes_tags ?? [],
      requiresTags: template.requires_tags ?? [],
    });
  };

  const startFrom = (preset?: BoxPreset) => {
    cueTap();
    setDraft(
      preset
        ? {
            name: uniqueBoxName(preset.name, takenNames()),
            rules: { ...preset.rules },
            scalesWithFamily: preset.scalesWithFamily,
            folderId: null,
            excludesTags: preset.excludesTags ?? [],
            requiresTags: preset.requiresTags ?? [],
          }
        : {
            name: '',
            rules: normaliseRules({}),
            scalesWithFamily: true,
            folderId: null,
            excludesTags: [],
            requiresTags: [],
          },
    );
  };

  const setCount = (category: keyof BoxRules, value: number) =>
    setDraft(prev => (prev ? { ...prev, rules: { ...prev.rules, [category]: value } } : prev));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await saveBoxTemplate(draft);
      cueSuccess();
      // Saving a box is nearly always because you're about to pack it.
      onSelect({ kind: 'template', id: saved.id });
      onClose();
    } catch (err: any) {
      Alert.alert('Could not save that box', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await setDefaultBoxTemplate(draft.id);
      cueSuccess();
    } catch (err: any) {
      Alert.alert('Could not change the default', err?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!draft?.id) return;
    const { id, name } = draft;
    Alert.alert(`Delete "${name}"?`, 'Stock is not affected. Only the box definition goes.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBoxTemplate(id);
            setDraft(null);
          } catch (err: any) {
            Alert.alert('Could not delete that box', err?.message ?? 'Please try again.');
          }
        },
      },
    ]);
  };

  // ------------------------------------------------------------------ editor
  if (draft) {
    const saved = draft.id ? boxTemplates.find(t => t.id === draft.id) : undefined;
    const isDefault = !!saved?.is_default;
    const total = itemsPerBox(draft.rules);

    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={draft.id ? 'Edit box' : 'New box'}
        subtitle="Saved boxes are shared with everyone in your pantry."
      >
        <Input
          label="Name"
          value={draft.name}
          onChangeText={name => setDraft(prev => (prev ? { ...prev, name } : prev))}
          placeholder="Senior box"
        />

        <FolderChips
          kind="template"
          value={draft.folderId}
          onChange={folderId => setDraft(prev => (prev ? { ...prev, folderId } : prev))}
        />

        <Row
          icon="account-group-outline"
          label="Scale with family size"
          hint={
            draft.scalesWithFamily
              ? 'The amounts below are for a family of 4, and grow or shrink with the household.'
              : 'Every household gets exactly these amounts.'
          }
          right={
            <Toggle
              value={draft.scalesWithFamily}
              accessibilityLabel="Scale with family size"
              onValueChange={scalesWithFamily =>
                setDraft(prev => (prev ? { ...prev, scalesWithFamily } : prev))
              }
            />
          }
        />

        {/* Who the box is FOR, as opposed to what is in it.
            Amounts come next; this comes first because it decides which stock the
            amounts can be filled from. */}
        <View className="gap-3 rounded-md bg-subtle p-3">
          <Text variant="label" className="font-bold">
            Who can eat it
          </Text>
          <Text variant="micro" tone="soft">
            Most boxes need none of this. Set it for a household that has told you
            about an allergy, a diet, or having nowhere to cook.
          </Text>

          {DIET_TAG_GROUPS.map(group => (
            <View key={group.title} className="gap-2">
              <Text variant="micro" tone="soft" className="font-bold">
                {group.title === 'Known to contain' ? 'Leave out anything containing' : group.title}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {group.tags.map(tag => {
                  // Allergens are a reason to EXCLUDE; diet and usability are a
                  // reason to REQUIRE. Nobody wants a box that must contain milk.
                  const excluding = isAllergenTag(tag);
                  const list = excluding ? draft.excludesTags : draft.requiresTags;
                  const on = list.includes(tag);
                  return (
                    <Chip
                      key={tag}
                      label={DIET_TAG_LABELS[tag]}
                      selected={on}
                      onPress={() =>
                        setDraft(prev => {
                          if (!prev) return prev;
                          const key = excluding ? 'excludesTags' : 'requiresTags';
                          const next = on
                            ? prev[key].filter(t => t !== tag)
                            : [...prev[key], tag];
                          return { ...prev, [key]: next };
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>
          ))}

          {draft.excludesTags.length > 0 && (
            <Text variant="micro" tone="soft">
              {EXCLUSION_CAVEAT}
            </Text>
          )}
          {draft.requiresTags.length > 0 && (
            <Text variant="micro" tone="soft">
              Only food recorded as{' '}
              {draft.requiresTags.map(t => DIET_TAG_LABELS[t].toLowerCase()).join(' and ')} goes in.
              A tin nobody has tagged will not be used, so this box draws on less stock than the
              others.
            </Text>
          )}
        </View>

        {BOX_CATEGORIES.map((category, i) => (
          <Row
            key={category}
            icon={categoryIcon(String(category))}
            label={title(String(category))}
            divider={i < BOX_CATEGORIES.length - 1}
            right={
              <Stepper
                value={draft.rules[category]}
                min={0}
                max={MAX_PER_CATEGORY}
                onChange={value => setCount(category, value)}
              />
            }
          />
        ))}

        <Text variant="micro" tone={total === 0 ? 'critical' : 'soft'} className="px-1">
          {total === 0
            ? 'A box needs at least one item in it.'
            : `${total} ${total === 1 ? 'item' : 'items'} per box${draft.scalesWithFamily ? ' for a family of 4' : ''}.`}
        </Text>

        <Button
          label={draft.id ? 'Save changes' : 'Save box'}
          block
          loading={busy}
          disabled={total === 0 || !draft.name.trim()}
          onPress={save}
        />

        {draft.id && !isDefault && (
          <Button
            label="Make this the default"
            variant="secondary"
            block
            disabled={busy}
            onPress={makeDefault}
          />
        )}

        {draft.id &&
          (isDefault ? (
            <Text variant="micro" tone="soft" className="px-1 text-center">
              This is your default box, the one Needs and the dashboard measure against.
              Make another box the default before deleting it.
            </Text>
          ) : (
            <Button
              label="Delete this box"
              variant="criticalGhost"
              className="self-center"
              disabled={busy}
              onPress={remove}
            />
          ))}

        <Button
          label="Back to boxes"
          variant="ghost"
          className="self-center"
          onPress={() => setDraft(null)}
        />
      </Sheet>
    );
  }

  // ------------------------------------------------------------------ folders
  if (mode === 'folders') {
    const counts = boxTemplates.reduce<Record<string, number>>((acc, t) => {
      if (t.folder_id) acc[t.folder_id] = (acc[t.folder_id] ?? 0) + 1;
      return acc;
    }, {});

    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Box type folders"
        subtitle="Group your box types. Deleting a folder keeps the boxes in it."
      >
        <FolderManager kind="template" counts={counts} />
        <Button
          label="Back to boxes"
          variant="ghost"
          className="self-center"
          onPress={() => setMode('list')}
        />
      </Sheet>
    );
  }

  // ------------------------------------------------------------------ list
  const templateFolders = boxFolders.filter(f => f.kind === 'template');

  // No folders at all: a plain list, without an "unfiled" heading over
  // everything. With folders: one section each, then whatever isn't in one.
  const sections: { id: string; title: string | null; items: BoxTemplate[] }[] =
    templateFolders.length === 0
      ? [{ id: 'all', title: null, items: boxTemplates }]
      : [
          ...templateFolders.map(folder => ({
            id: folder.id,
            title: folder.name,
            items: boxTemplates.filter(t => t.folder_id === folder.id),
          })),
          {
            id: 'none',
            title: 'Not in a folder',
            items: boxTemplates.filter(
              t => !t.folder_id || !templateFolders.some(f => f.id === t.folder_id),
            ),
          },
        ].filter(section => section.items.length > 0);

  const renderTemplate = (template: BoxTemplate, isLast: boolean) => {
    const selected = selectedKey === `template:${template.id}`;
    return (
      <Row
        key={template.id}
        icon={selected ? 'check-circle' : 'package-variant-closed'}
        label={template.name}
        // The contents stay on the row whatever folder it's in.
        hint={`${template.is_default ? 'Default · ' : ''}${
          template.scales_with_family ? '' : 'Fixed · '
        }${describeRules(template.rules)}`}
        divider={!isLast}
        onPress={() => pick({ kind: 'template', id: template.id })}
        right={
          <Pressable
            onPress={() => editTemplate(template)}
            hitSlop={10}
            accessibilityLabel={`Edit ${template.name}`}
            className="h-9 w-9 items-center justify-center rounded-lg bg-subtle"
          >
            <MaterialCommunityIcons name="pencil-outline" size={17} color={COLORS.primaryDark} />
          </Pressable>
        }
      />
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose a box"
      subtitle="Tap a box to pack it. Saved boxes can be reused by anyone in your pantry."
    >
      <View className="flex-row items-center justify-between px-1">
        <Text variant="label" tone="soft" className="font-semibold">
          Your boxes
        </Text>
        <Pressable
          onPress={() => {
            cueTap();
            setMode('folders');
          }}
          hitSlop={8}
          accessibilityRole="button"
          className="flex-row items-center gap-1"
        >
          <MaterialCommunityIcons name="folder-outline" size={16} color={COLORS.primaryDark} />
          <Text variant="micro" tone="brand" className="font-bold">
            Folders
          </Text>
        </Pressable>
      </View>

      {boxTemplates.length === 0 ? (
        <Text variant="micro" tone="soft" className="px-1">
          None saved yet. Save a copy of a preset below, or build your own.
        </Text>
      ) : (
        sections.map(section =>
          section.title === null ? (
            <View key={section.id}>
              {section.items.map((t, i) => renderTemplate(t, i === section.items.length - 1))}
            </View>
          ) : (
            <View key={section.id}>
              <Pressable
                onPress={() => {
                  cueTap();
                  setCollapsed(prev => ({ ...prev, [section.id]: !prev[section.id] }));
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed[section.id] }}
                className="flex-row items-center gap-2 px-1 py-2"
              >
                <MaterialCommunityIcons
                  name={collapsed[section.id] ? 'chevron-right' : 'chevron-down'}
                  size={18}
                  color={COLORS.textSecondary}
                />
                <MaterialCommunityIcons
                  name="folder-outline"
                  size={16}
                  color={section.id === 'none' ? COLORS.textSecondary : COLORS.primaryLight}
                />
                <Text variant="label" className="flex-1 font-semibold">
                  {section.title}
                </Text>
                <Text variant="micro" tone="soft">
                  {section.items.length}
                </Text>
              </Pressable>
              {!collapsed[section.id] && (
                <View className="pl-2">
                  {section.items.map((t, i) => renderTemplate(t, i === section.items.length - 1))}
                </View>
              )}
            </View>
          ),
        )
      )}

      <Text variant="label" tone="soft" className="mt-4 px-1 font-semibold">
        Start from a preset
      </Text>
      <View>
        {BOX_PRESETS.map((preset, i) => {
          const selected = selectedKey === `preset:${preset.key}`;
          return (
            <Row
              key={preset.key}
              icon={selected ? 'check-circle' : 'package-variant'}
              label={preset.name}
              hint={`${preset.description} ${describeRules(preset.rules)}`}
              divider={i < BOX_PRESETS.length - 1}
              onPress={() => pick({ kind: 'preset', key: preset.key })}
              right={
                <Pressable
                  onPress={() => startFrom(preset)}
                  hitSlop={10}
                  accessibilityLabel={`Save a copy of ${preset.name}`}
                >
                  <Text variant="micro" tone="brand" className="font-bold">
                    Save a copy
                  </Text>
                </Pressable>
              }
            />
          );
        })}
      </View>

      <Button
        label="Build a new box"
        variant="secondary"
        block
        className="mt-2"
        icon={<MaterialCommunityIcons name="plus" size={18} color={COLORS.textPrimary} />}
        onPress={() => startFrom()}
      />
    </Sheet>
  );
}
