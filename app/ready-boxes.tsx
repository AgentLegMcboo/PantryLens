import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { COLORS } from "../constants/theme";
import { FolderChips, FolderManager } from "../components/box-folders";
import { FadeInUp, ProgressBar } from "../components/motion";
import {
  Button,
  Card,
  EmptyState,
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

/** The empty screen's how-it-works strip. */
const HOW_IT_WORKS = [
  { icon: "package-variant-closed", label: "Choose a box" },
  { icon: "clipboard-check-outline", label: "Pack it" },
  { icon: "hand-heart-outline", label: "Hand it out" },
] as const;

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
export default function ReadyBoxesScreen() {
  const router = useRouter();
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
      <View className="flex-1 justify-center bottom-50 bg-canvas">
        <EmptyState
          icon="package-variant-closed"
          title="No boxes waiting"
          body="Packed boxes wait here until families pick them up."
          actionLabel="Build boxes"
          actionVariant="primary"
          onAction={() => router.push("/(tabs)/build")}
        >
          {/* How boxes get here, in three glances. An empty screen that only
              says "nothing" gives no clue what would ever fill it. */}
          <View className="mt-7 w-full flex-row items-start">
            {HOW_IT_WORKS.map((step, i) => (
              <React.Fragment key={step.label}>
                {i > 0 && (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={COLORS.borderStrong}
                    style={{ marginTop: 13 }}
                  />
                )}
                <View className="flex-1 items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-subtle">
                    <MaterialCommunityIcons
                      name={step.icon}
                      size={20}
                      color={COLORS.primaryLight}
                    />
                  </View>
                  <Text
                    variant="micro"
                    tone="soft"
                    className="mt-2 text-center font-semibold"
                  >
                    {step.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </EmptyState>
      </View>
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
          <View className="h-11 w-11 items-center justify-center rounded-md bg-subtle">
            <MaterialCommunityIcons
              name="package-variant-closed"
              size={22}
              color={COLORS.primaryLight}
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

          <Pressable
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
            className="h-9 w-9 items-center justify-center rounded-full bg-subtle"
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={17}
              color={COLORS.primaryDark}
            />
          </Pressable>
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-baseline justify-between">
            <Text variant="label" className="font-semibold">
              {left} of {run.boxes} left
            </Text>
            <Text variant="micro" tone="soft">
              {run.boxes_collected} picked up
            </Text>
          </View>
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

        <View className="flex-row gap-2">
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
        </View>
      </Card>
    );
  };

  return (
    <>
      <Screen>
        <FadeInUp index={0}>
          <View className="px-1">
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="headline" className="flex-1">
                {waiting} {waiting === 1 ? "box" : "boxes"} ready to go
              </Text>
              <Pressable
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
              </Pressable>
            </View>
            <Text variant="body" tone="soft" className="mt-1">
              Tap “Hand out 1” as each family collects a box. Use the pencil to
              name a batch or put it in a folder.
            </Text>
          </View>
        </FadeInUp>

        {sections.map((section, i) => (
          <FadeInUp key={section.id} index={i + 1}>
            {section.title === null ? (
              <View className="gap-gap">{section.runs.map(renderRun)}</View>
            ) : (
              <View className="gap-3">
                <Pressable
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
                </Pressable>
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
