import { ResponsiveRow } from "../components/ui/responsive-row";
import { useAppAppearance } from "../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabOverlayInset } from '../lib/tab-overlay';
import { COLORS } from "../constants/theme";
import { FolderChips, FolderManager } from "../components/box-folders";
import { FadeInUp, ProgressBar, Tappable } from "../components/motion";
import {
  Button,
  Card,
  Input,
  Panel,
  Screen,
  Sheet,
  Text,
} from "../components/ui";
import { describeRules } from "../lib/box-presets";
import { cueSuccess, cueTap, cueWarn } from "../lib/feedback";
import { type PackRun, usePantryStore } from "../lib/store";
import { timeAgo } from "../lib/time";
import { ReadyBoxesArt } from "./onboarding-mocks";

/**
 * Boxes that are packed and waiting for families.
 *
 * Packing and handing out are separate moments at a real pantry: boxes get made
 * up ahead of a distribution and sit by the door until someone collects them.
 * Each batch is ticked off as families collect, and only what's collected
 * counts as given out.
 *
 * A batch can have its own name ("Garcia family") and live in a folder
 * ("Saturday distribution"). Whatever it's called, the card still says which
 * box type it is and what each box holds. A name is for finding a batch, not
 * for hiding what's in it.
 */
export function ReadyBoxesContent({ onPlan }: { onPlan?: () => void } = {}) {
  useAppAppearance((state) => state.scheme);
  const router = useRouter();
  const tabOverlayInset = useTabOverlayInset();
  const insets = useSafeAreaInsets();
  const { readyBoxes, boxFolders, collectBoxes, updatePackRun } =
    usePantryStore();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    label: string;
    folderId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const leftIn = (run: PackRun) => run.boxes - run.boxes_collected;
  const waiting = readyBoxes.reduce((sum, r) => sum + leftIn(r), 0);

  const record = (run: PackRun, count: number) => {
    collectBoxes(run.id, count)
      .then((result) => {
        if (!result.applied) {
          cueWarn();
          Alert.alert(
            "This batch just changed",
            `Someone else updated it at the same moment, so that tap wasn't counted. It now has ${Math.max(0, result.boxes - result.boxes_collected)} left.`,
          );
        } else if (result.boxes_collected >= result.boxes) {
          cueSuccess();
        }
      })
      .catch((err: any) => {
        cueWarn();
        Alert.alert(
          "Couldn't record that",
          `${err?.message ?? "The connection dropped."}\n\nThe count has been put back. It's safe to tap again.`,
        );
      });
  };

  const allPickedUp = (run: PackRun) => {
    const left = leftIn(run);
    Alert.alert(
      `Mark all ${left} as picked up?`,
      `Every remaining box in ${run.label ? `"${run.label}"` : "this batch"} counts as given out.`,
      [
        { text: "Not yet", style: "cancel" },
        { text: "All picked up", onPress: () => record(run, left) },
      ],
    );
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updatePackRun(editing.id, {
        label: editing.label,
        folderId: editing.folderId,
      });
      cueSuccess();
      setEditing(null);
    } catch (err: any) {
      Alert.alert("Couldn't save that", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (readyBoxes.length === 0) {
    return (
      <ScrollView className="flex-1 bg-transparent" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: (tabOverlayInset || insets.bottom) + 20 }}>
        {/* The onboarding box art, scaled down. It says what fills this
            screen better than a row of icons did. */}
        <View style={{ height: 250, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 430, height: 430, transform: [{ scale: 0.62 }] }}>
            <ReadyBoxesArt />
          </View>
        </View>
        <Text variant="title" className="mt-4 text-center font-bold">
          No boxes waiting
        </Text>
        <Text variant="body" tone="soft" className="mt-1.5 max-w-[300px] text-center">
          Packed boxes show up here until families pick them up.
        </Text>
        <Button
          label="Plan boxes"
          className="mt-5 self-center rounded-md"
          onPress={onPlan ?? (() => router.push("/(tabs)/build"))}
        />
      </ScrollView>
    );
  }

  const packedFolders = boxFolders.filter((f) => f.kind === "packed");

  // No folders: one plain list. With folders: a section each, then the unfiled.
  const sections: { id: string; title: string | null; runs: PackRun[] }[] =
    packedFolders.length === 0
      ? [{ id: "all", title: null, runs: readyBoxes }]
      : [
          ...packedFolders.map((folder) => ({
            id: folder.id,
            title: folder.name,
            runs: readyBoxes.filter((r) => r.folder_id === folder.id),
          })),
          {
            id: "none",
            title: "Not in a folder",
            runs: readyBoxes.filter(
              (r) =>
                !r.folder_id ||
                !packedFolders.some((f) => f.id === r.folder_id),
            ),
          },
        ].filter((section) => section.runs.length > 0);

  const folderCounts = readyBoxes.reduce<Record<string, number>>((acc, r) => {
    if (r.folder_id) acc[r.folder_id] = (acc[r.folder_id] ?? 0) + 1;
    return acc;
  }, {});

  const editingRun = editing
    ? readyBoxes.find((r) => r.id === editing.id)
    : undefined;

  const renderRun = (run: PackRun) => {
    const left = leftIn(run);
    const boxType = run.box_name ?? "Box";

    return (
      <Card key={run.id} className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-md bg-secondary-tint">
            <MaterialCommunityIcons
              name="package-variant-closed"
              size={22}
              color={COLORS.secondaryDark}
            />
          </View>

          <View className="flex-1">
            <Text variant="heading">{run.label ?? boxType}</Text>
            {/* A named batch still says what it IS, on its own line, before
                anything else. */}
            {run.label ? (
              <View className="mt-0.5 flex-row items-center gap-1">
                <MaterialCommunityIcons
                  name="package-variant-closed"
                  size={13}
                  color={COLORS.textSecondary}
                />
                <Text variant="micro" tone="soft" className="font-semibold">
                  {boxType}
                </Text>
              </View>
            ) : null}
            <Text variant="micro" tone="soft" className="mt-0.5">
              Packed {timeAgo(run.created_at)} · {run.units_taken} units in{" "}
              {run.boxes} {run.boxes === 1 ? "box" : "boxes"}
            </Text>
          </View>

          <Tappable
            onPress={() => {
              cueTap();
              setEditing({
                id: run.id,
                label: run.label ?? "",
                folderId: run.folder_id,
              });
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Name or file ${run.label ?? boxType}`}
            className="h-12 w-12 items-center justify-center rounded-lg bg-secondary-tint"
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={20}
              color={COLORS.secondaryDark}
            />
          </Tappable>
        </View>

        <View className="gap-1.5">
          <ResponsiveRow className="flex-row items-baseline justify-between">
            <Text variant="label" className="font-semibold">
              {left} of {run.boxes} left
            </Text>
            <Text variant="micro" tone="soft">
              {run.boxes_collected} picked up
            </Text>
          </ResponsiveRow>
          <ProgressBar
            progress={run.boxes > 0 ? run.boxes_collected / run.boxes : 0}
            color={COLORS.statusGood}
            height={8}
          />
        </View>

        {run.per_box ? (
          <Text variant="micro" tone="soft">
            Each box: {describeRules(run.per_box)}
          </Text>
        ) : null}

        <ResponsiveRow className="flex-row gap-2">
          <Button
            label="Hand out 1"
            size="compact"
            className="flex-1 justify-center"
            icon={
              <MaterialCommunityIcons
                name="hand-heart-outline"
                size={17}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={() => {
              cueTap();
              record(run, 1);
            }}
          />
          <Button
            label="All picked up"
            variant="secondary"
            size="compact"
            className="flex-1 justify-center"
            icon={
              <MaterialCommunityIcons
                name="check-all"
                size={17}
                color={COLORS.textPrimary}
              />
            }
            onPress={() => allPickedUp(run)}
          />
        </ResponsiveRow>
      </Card>
    );
  };

  return (
    <>
      <Screen>
        <FadeInUp index={0}>
          <View className="px-1">
            <ResponsiveRow className="flex-row items-center justify-between gap-3">
              <Text variant="headline" className="flex-1">
                {waiting} {waiting === 1 ? "box" : "boxes"} ready to go
              </Text>
              <Tappable
                onPress={() => {
                  cueTap();
                  setFoldersOpen(true);
                }}
                hitSlop={8}
                accessibilityRole="button"
                className="flex-row items-center gap-1"
              >
                <MaterialCommunityIcons
                  name="folder-outline"
                  size={16}
                  color={COLORS.primaryDark}
                />
                <Text variant="micro" tone="brand" className="font-bold">
                  Folders
                </Text>
              </Tappable>
            </ResponsiveRow>
            <Text variant="body" tone="soft" className="mt-1">
              Tap “Hand out 1” as each family collects a box. Use the pencil to
              name a batch or put it in a folder.
            </Text>
            <Text variant="micro" tone="soft" className="mt-2">
              {readyBoxes.reduce((sum, run) => sum + run.boxes_collected, 0)}{" "}
              picked up across these batches
            </Text>
          </View>
        </FadeInUp>

        {sections.map((section, i) => (
          <FadeInUp key={section.id} index={i + 1}>
            {section.title === null ? (
              <View className="gap-gap">{section.runs.map(renderRun)}</View>
            ) : (
              <View className="gap-3">
                <Tappable
                  onPress={() => {
                    cueTap();
                    setCollapsed((prev) => ({
                      ...prev,
                      [section.id]: !prev[section.id],
                    }));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed[section.id] }}
                  className="flex-row items-center gap-2 px-1"
                >
                  <MaterialCommunityIcons
                    name={
                      collapsed[section.id] ? "chevron-right" : "chevron-down"
                    }
                    size={20}
                    color={COLORS.textSecondary}
                  />
                  <MaterialCommunityIcons
                    name="folder-outline"
                    size={18}
                    color={
                      section.id === "none"
                        ? COLORS.textSecondary
                        : COLORS.primaryLight
                    }
                  />
                  <Text variant="heading" className="flex-1">
                    {section.title}
                  </Text>
                  {/* Boxes, not batches: the number at the door is how many are left. */}
                  <Text variant="micro" tone="soft" className="font-semibold">
                    {section.runs.reduce((sum, r) => sum + leftIn(r), 0)} left
                  </Text>
                </Tappable>
                {!collapsed[section.id] && (
                  <View className="gap-gap">{section.runs.map(renderRun)}</View>
                )}
              </View>
            )}
          </FadeInUp>
        ))}
      </Screen>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title="Name and file this batch"
        subtitle={
          editingRun
            ? `${editingRun.boxes} × ${editingRun.box_name ?? "box"}`
            : undefined
        }
      >
        <Input
          label="Name"
          value={editing?.label ?? ""}
          onChangeText={(label) =>
            setEditing((prev) => (prev ? { ...prev, label } : prev))
          }
          placeholder={editingRun?.box_name ?? "Garcia family"}
          maxLength={80}
          hint="Leave it blank to show the box type's name."
        />

        <FolderChips
          kind="packed"
          value={editing?.folderId ?? null}
          onChange={(folderId) =>
            setEditing((prev) => (prev ? { ...prev, folderId } : prev))
          }
        />

        {/* Right where you're renaming it, so the name never floats free of
            what's actually in the boxes. */}
        {editingRun ? (
          <Panel className="gap-1">
            <Text variant="label" className="font-semibold">
              {editingRun.box_name ?? "Box"}
            </Text>
            <Text variant="micro" tone="soft">
              {editingRun.per_box
                ? `Each box: ${describeRules(editingRun.per_box)}`
                : "Packed before box contents were recorded."}
            </Text>
          </Panel>
        ) : null}

        <Button label="Save" block loading={saving} onPress={saveEdit} />
      </Sheet>

      <Sheet
        visible={foldersOpen}
        onClose={() => setFoldersOpen(false)}
        title="Batch folders"
        subtitle="Group packed boxes by distribution day, or by where they're going. Deleting a folder keeps its batches."
      >
        <FolderManager kind="packed" counts={folderCounts} />
      </Sheet>
    </>
  );
}
