import { useAppAppearance } from "../../lib/appearance";
import { resetTours } from "../../components/spotlight";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { COLORS } from "../../constants/theme";
import { KeyboardScreen } from "../../components/keyboard-screen";
import {
  Button,
  Card,
  CardHeader,
  categoryIcon,
  Input,
  Row,
  Segmented,
  Sheet,
  Stepper,
  Text,
  Toggle,
} from "../../components/ui";
import {
  cueSuccess,
  cueTap,
  cueWarn,
  getFeedbackPrefs,
  setHapticsEnabled,
  setSoundEnabled,
} from "../../lib/feedback";
import {
  canEditPantry,
  canManageTeam,
  ROLE_BLURBS,
  ROLE_LABELS,
} from "../../lib/permissions";
import { BoxRules, usePantryStore } from "../../lib/store";
import { useAccessibilityStore } from "../../lib/accessibility";

/**
 * Pantry settings.
 *
 * Seven cards of stacked label-and-control pairs, each drawn slightly
 * differently — 32px steppers here, a full-width chip row there, a red Sign Out
 * slab at the bottom — which is how a settings page ends up reading as a
 * spreadsheet nobody wants to scroll.
 *
 * It is the same seven groups, but every line is now the same `Row` at the same
 * height with the same divider, and every control is the one the rest of the app
 * uses.
 *
 * Almost everything on this screen writes to the pantry row, which only a
 * manager may change — so for a volunteer the same groups are shown as plain
 * lines of text. They were controls until now, and tapping them appeared to
 * work: the database refuses an update by matching no rows rather than by
 * erroring, so the number moved on screen and was gone at the next refresh.
 */
export default function SettingsScreen() {
  useAppAppearance((state) => state.scheme);
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  const openBoxesAfterDismiss = useRef(false);
  const { mode, setMode } = useAppAppearance();
  useEffect(() => {
    if (
      ["pantry", "boxes", "stock", "display", "sound"].includes(
        params.section ?? "",
      )
    ) {
      setSettingsSection(params.section!);
    }
  }, [params.section]);
  const closeSection = () => {
    setSettingsSection(null);
    if (params.section) router.setParams({ section: undefined });
  };
  const sectionTitles: Record<string, string> = {
    pantry: "Pantry details",
    boxes: "Box defaults",
    stock: "Stock alerts",
    display: "Appearance & accessibility",
    sound: "Feel & sound",
    developer: "Developer",
  };
  const initialPrefs = getFeedbackPrefs();
  const [haptics, setHaptics] = useState(initialPrefs.hapticsEnabled);
  const [sound, setSound] = useState(initialPrefs.soundEnabled);
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);
  const setSeniorMode = useAccessibilityStore((state) => state.setSeniorMode);

  const {
    settings,
    boxRules,
    thresholds,
    members,
    updateSettings,
    updateThresholds,
    resetPantryData,
    deletePantry,
    replayOnboarding,
    signOut,
  } = usePantryStore();
  const [resetting, setResetting] = useState<string | null>(null);

  // The database decides this; the screen only stops offering what will be
  // refused. See lib/permissions.ts.
  const canEdit = canEditPantry(settings.userRole);

  const [pantryName, setPantryName] = useState(settings.pantryName);
  const [dropoffLocation, setDropoffLocation] = useState(
    settings.dropoffLocation,
  );
  const [dropoffHours, setDropoffHours] = useState(settings.dropoffHours);
  const [savingName, setSavingName] = useState(false);

  // The fields are seeded from the store, which is empty until the pantry loads.
  useEffect(() => {
    setPantryName(settings.pantryName);
    setDropoffLocation(settings.dropoffLocation);
    setDropoffHours(settings.dropoffHours);
  }, [settings.pantryName, settings.dropoffLocation, settings.dropoffHours]);

  const categories = Object.keys(boxRules) as (keyof BoxRules)[];
  const nameChanged =
    pantryName.trim() !== settings.pantryName ||
    dropoffLocation.trim() !== settings.dropoffLocation ||
    dropoffHours.trim() !== settings.dropoffHours;

  const handleSavePantryName = async () => {
    const trimmed = pantryName.trim();
    if (!trimmed) {
      Alert.alert(
        "Name required",
        "A pantry needs a name your volunteers will recognise.",
      );
      return;
    }

    setSavingName(true);
    try {
      await updateSettings({
        pantryName: trimmed,
        dropoffLocation: dropoffLocation.trim(),
        dropoffHours: dropoffHours.trim(),
      });
    } catch (err: any) {
      // Admin-only under RLS; the store turns a silent refusal into this error.
      Alert.alert("Could not save", err?.message ?? "Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSettingChange = async (
    updates: Parameters<typeof updateSettings>[0],
  ) => {
    try {
      await updateSettings(updates);
    } catch (err: any) {
      Alert.alert("Could not save", err?.message ?? "Please try again.");
    }
  };

  // Thresholds used to be written and forgotten. They go to the same
  // manager-only row as everything else here, so a refusal needs saying.
  const handleThresholdChange = async (updates: Partial<typeof thresholds>) => {
    try {
      await updateThresholds(updates);
    } catch (err: any) {
      Alert.alert("Could not save", err?.message ?? "Please try again.");
    }
  };

  /**
   * The development reset.
   *
   * Everything here is destructive and none of it ships: the whole card is
   * behind __DEV__. The real guard is in the database though — both functions
   * are owner-only — because a function that exists is reachable from the API
   * whether or not a button points at it.
   */
  const devAction = async (key: string, run: () => Promise<string>) => {
    setResetting(key);
    try {
      const message = await run();
      cueSuccess();
      Alert.alert("Done", message);
    } catch (err: any) {
      cueWarn();
      Alert.alert("Could not do that", err?.message ?? "Please try again.");
    } finally {
      setResetting(null);
    }
  };

  const confirmClear = () => {
    Alert.alert(
      "Clear all pantry data?",
      "Every item, scan, count, pack, donation record and learned name goes, along with their photos.\n\nKept: your shelves, box types, folders, team and settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear it",
          style: "destructive",
          onPress: () =>
            devAction("clear", async () => {
              const counts = await resetPantryData();
              const parts = Object.entries(counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`);
              return parts.length > 0
                ? `Removed ${parts.join(", ")}.`
                : "There was nothing to remove.";
            }),
        },
      ],
    );
  };

  const confirmDeletePantry = () => {
    Alert.alert(
      `Delete "${settings.pantryName}" entirely?`,
      "The pantry and everything in it goes, and every member is removed — not just you. You will land back on pantry selection.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete the pantry",
          style: "destructive",
          onPress: () =>
            devAction("delete", async () => {
              const name = await deletePantry();
              return `${name} is gone. Create or join one to carry on.`;
            }),
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign out?",
      "You will need to sign in again to reach this pantry.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => signOut() },
      ],
    );
  };

  return (
    <>
      <KeyboardScreen>
        <View className="gap-2 px-1">
          <Text variant="headline">Pantry settings</Text>
          <Text variant="body" tone="soft">
            Choose a group to view or change its settings.
          </Text>
        </View>
        {!canEdit && (
          <View>
            <Card className="flex-row items-start gap-3">
              <MaterialCommunityIcons
                name="lock-outline"
                size={20}
                color={COLORS.textSecondary}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1">
                <Text variant="label" className="font-bold">
                  You are a {ROLE_LABELS[settings.userRole].toLowerCase()}
                </Text>
                <Text variant="micro" tone="soft" className="mt-1">
                  {ROLE_BLURBS[settings.userRole]} Pantry details, box defaults
                  and stock alerts are read-only — ask your pantry owner if it
                  needs changing.
                </Text>
              </View>
            </Card>
          </View>
        )}
        <Card className="py-0">
          <Row
            icon="storefront-outline"
            label="Pantry details"
            hint="Name, drop-off location and hours"
            onPress={() => setSettingsSection("pantry")}
          />
          <Row
            icon="cube-outline"
            label="Box defaults"
            hint={`${settings.boxTarget} boxes · ${settings.defaultFamilySize} people per family`}
            onPress={() => setSettingsSection("boxes")}
          />
          <Row
            icon="bell-outline"
            label="Stock alerts"
            hint="Low stock and use-first dates"
            divider={false}
            onPress={() => setSettingsSection("stock")}
          />
        </Card>
        <Card className="py-0">
          <Row
            icon="theme-light-dark"
            label="Appearance & accessibility"
            hint="Light, dark, automatic and larger text"
            onPress={() => setSettingsSection("display")}
          />
          <Row
            icon="vibrate"
            label="Feel & sound"
            hint="Haptic feedback and sound effects"
            divider={false}
            onPress={() => setSettingsSection("sound")}
          />
        </Card>
        <View>
          <Card>
            <Row
              icon="account-multiple-outline"
              label="Team"
              hint={
                members.length
                  ? `${members.length} ${members.length === 1 ? "person" : "people"} · you are the ${ROLE_LABELS[
                      settings.userRole
                    ].toLowerCase()}`
                  : `You are the ${ROLE_LABELS[settings.userRole].toLowerCase()}`
              }
              divider={false}
              onPress={() => router.push("/team")}
            />
          </Card>
        </View>
        <View>
          <View className="gap-4">
            <Text variant="micro" tone="soft" className="px-1 text-center">
              {settings.pantryName || "This pantry"} · Role: {ROLE_LABELS[settings.userRole].toLowerCase()}.
            </Text>
            <Button
              label="Sign out"
              variant="criticalGhost"
              className="self-center"
              icon={
                <MaterialCommunityIcons
                  name="logout"
                  size={18}
                  color={COLORS.statusCritical}
                />
              }
              onPress={handleSignOut}
            />
          </View>
        </View>
        {__DEV__ && (
          <Card className="py-0">
            <Row
              icon="tools"
              label="Developer"
              divider={false}
              onPress={() => setSettingsSection("developer")}
            />
          </Card>
        )}
      </KeyboardScreen>
      <Sheet
        visible={settingsSection !== null}
        onClose={closeSection}
        title={sectionTitles[settingsSection ?? ""] ?? "Settings"}
        onDismiss={() => {
          if (openBoxesAfterDismiss.current) {
            openBoxesAfterDismiss.current = false;
            router.push("/(tabs)/build");
          }
        }}
      >
        {settingsSection === "pantry" && (
          <View>
            <Card className={canEdit ? "gap-4" : undefined}>
              {!canEdit ? (
                <>
                  <Row
                    icon="storefront-outline"
                    label="Pantry name"
                    hint={settings.pantryName || "Not set"}
                  />
                  <Row
                    icon="map-marker-outline"
                    label="Drop-off location"
                    hint={settings.dropoffLocation || "Not set yet"}
                  />
                  <Row
                    icon="clock-outline"
                    label="Drop-off hours"
                    hint={settings.dropoffHours || "Not set yet"}
                    divider={false}
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Pantry name"
                    value={pantryName}
                    onChangeText={setPantryName}
                    hint="What every volunteer sees at the top of the app."
                  />
                  {/* Where and when donors can drop food off. Needs puts these in the
                  message it writes for donors; they used to be hardcoded, so every
                  pantry's message sent people to the same made-up rear entrance. */}
                  <Input
                    label="Drop-off location"
                    value={dropoffLocation}
                    onChangeText={setDropoffLocation}
                    placeholder="Rear entrance, 12 Main St"
                    maxLength={120}
                  />
                  <Input
                    label="Drop-off hours"
                    value={dropoffHours}
                    onChangeText={setDropoffHours}
                    placeholder="Mon–Fri, 9am–4pm"
                    maxLength={80}
                    hint="Both go in the donor message on Needs. Leave them blank and it's left out."
                  />
                  {/* Only appears once there is something to save — a Save button that
                  is always there is a Save button nobody reads. */}
                  {nameChanged && (
                    <Button
                      label="Save changes"
                      loading={savingName}
                      onPress={handleSavePantryName}
                    />
                  )}
                </>
              )}
            </Card>
          </View>
        )}
        {settingsSection === "boxes" && (
          <View className="gap-4">
            <View>
              <Card>
                <CardHeader
                  title="Boxes you usually pack"
                  subtitle="Needs uses this goal. Boxes starts with it."
                />
                <Row
                  icon="package-variant-closed"
                  label="Boxes per distribution"
                  stackControl
                  hint={!canEdit ? "Set by your pantry manager." : undefined}
                  divider={false}
                  right={
                    canEdit ? (
                      <Stepper
                        value={settings.boxTarget}
                        min={1}
                        max={200}
                        onChange={(next) =>
                          handleSettingChange({ boxTarget: next })
                        }
                      />
                    ) : (
                      <Text
                        variant="heading"
                        tone="soft"
                        className="min-w-[36px] text-center font-bold"
                      >
                        {settings.boxTarget}
                      </Text>
                    )
                  }
                />
              </Card>
            </View>
            <View>
              <Card>
                <CardHeader
                  title="Usual family size"
                  subtitle="Used by Needs and as the starting size in Boxes."
                />
                <Segmented
                  value={settings.defaultFamilySize}
                  disabled={!canEdit}
                  options={[2, 4, 6].map((size) => ({
                    value: size,
                    label: `${size} people`,
                  }))}
                  onChange={(size) =>
                    handleSettingChange({ defaultFamilySize: size })
                  }
                />
              </Card>
            </View>
            <View>
              <Card>
                <Row
                  icon="package-variant-closed"
                  label="What goes in a box"
                  hint="Open Boxes to choose a box type, edit its contents, or start from a preset."
                  divider={false}
                  onPress={() => {
                    openBoxesAfterDismiss.current = true;
                    closeSection();
                  }}
                />
              </Card>
            </View>
          </View>
        )}
        {settingsSection === "stock" && (
          <View className="gap-4">
            <View>
              <Card>
                <CardHeader
                  title="Tell me when stock is low"
                  subtitle="Below this total, a category starts showing up on the dashboard and in Needs."
                />
                {categories.map((cat, i) => (
                  <Row
                    key={cat}
                    icon={categoryIcon(String(cat))}
                    label={
                      String(cat).charAt(0).toUpperCase() + String(cat).slice(1)
                    }
                    divider={i < categories.length - 1}
                    right={
                      canEdit ? (
                        <Stepper
                          value={thresholds[cat]}
                          min={1}
                          onChange={(next) =>
                            handleThresholdChange({ [cat]: next })
                          }
                        />
                      ) : (
                        <Text
                          variant="heading"
                          tone="soft"
                          className="min-w-[36px] text-center font-bold"
                        >
                          {thresholds[cat]}
                        </Text>
                      )
                    }
                  />
                ))}
              </Card>
            </View>
            <View>
              <Card>
                <CardHeader
                  title="Flag stock as use-first"
                  subtitle="How far ahead to look when deciding what is about to expire."
                />
                <Segmented
                  value={settings.expirationWarningDays}
                  disabled={!canEdit}
                  options={[14, 21, 30].map((days) => ({
                    value: days,
                    label: `${days} days`,
                  }))}
                  onChange={(days) =>
                    handleSettingChange({ expirationWarningDays: days })
                  }
                />
              </Card>
            </View>
          </View>
        )}
        {settingsSection === "display" && (
          <View className="gap-4">
            <View className="gap-3">
              <Text variant="heading">Appearance</Text>
              <Segmented
                value={mode}
                options={[
                  { value: "auto", label: "Automatic" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                onChange={setMode}
              />
              <Text variant="micro" tone="soft">
                Automatic follows your device’s appearance.
              </Text>
            </View>
            <View>
              <Card>
                <CardHeader
                  title="Larger text"
                  subtitle="Larger text and stronger contrast make the app easier to read."
                />
                <Row
                  icon="format-size"
                  label="Larger text"
                  hint={
                    seniorMode
                      ? "Active — large fonts and high contrast enabled"
                      : "Standard text size"
                  }
                  divider={false}
                  right={
                    <Toggle
                      value={seniorMode}
                      accessibilityLabel="Larger text mode"
                      onValueChange={(v) => {
                        cueTap();
                        setSeniorMode(v);
                      }}
                    />
                  }
                />
              </Card>
            </View>
          </View>
        )}
        {settingsSection === "sound" && (
          <View>
            <Card>
              <CardHeader
                title="Feel & sound"
                subtitle="Sound is off by default — a back room is loud and the phone is often shared."
              />
              <Row
                icon="vibrate"
                label="Haptic feedback"
                hint="A light tick when you tap or confirm."
                right={
                  <Toggle
                    value={haptics}
                    accessibilityLabel="Haptic feedback"
                    onValueChange={(v) => {
                      setHaptics(v);
                      setHapticsEnabled(v);
                    }}
                  />
                }
              />
              <Row
                icon="volume-high"
                label="Sound effects"
                hint="Soft confirmation tones when something is saved."
                divider={false}
                right={
                  <Toggle
                    value={sound}
                    accessibilityLabel="Sound effects"
                    onValueChange={(v) => {
                      setSound(v);
                      setSoundEnabled(v);
                    }}
                  />
                }
              />
            </Card>
          </View>
        )}
        {__DEV__ && settingsSection === "developer" && (
          <View>
            <Card>
              <CardHeader
                title="Developer"
                subtitle="Only in a development build. A release bundle does not contain this card."
              />
              <Row
                icon="broom"
                label="Clear all pantry data"
                hint="Items, scans, counts, packs, donation records and photos. Keeps shelves, box types, team and settings."
                right={
                  resetting === "clear" ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.statusCritical}
                    />
                  ) : undefined
                }
                onPress={
                  canManageTeam(settings.userRole) ? confirmClear : undefined
                }
              />
              <Row
                icon="restart"
                label="Replay the intro"
                hint="Forgets that onboarding was finished, on this device only."
                onPress={() =>
                  devAction("onboarding", async () => {
                    await replayOnboarding();
                    return "The intro will play next time the app starts.";
                  })
                }
              />
              <Row
                icon="lightbulb-on-outline"
                label="Replay the tips"
                hint="Shows each tab's first-visit tips again."
                onPress={() =>
                  devAction("tours", async () => {
                    await resetTours();
                    return "The tips will show again next time the app starts.";
                  })
                }
              />
              <Row
                icon="delete-forever-outline"
                label="Delete this pantry"
                hint="The pantry, its data and everyone's membership. Lands you back on pantry selection."
                tone="critical"
                divider={false}
                right={
                  resetting === "delete" ? (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.statusCritical}
                    />
                  ) : undefined
                }
                onPress={
                  canManageTeam(settings.userRole)
                    ? confirmDeletePantry
                    : undefined
                }
              />

              {!canManageTeam(settings.userRole) && (
                <Text variant="micro" tone="soft" className="mt-3">
                  Clearing and deleting are owner-only, enforced by the database
                  rather than by this screen. You are{" "}
                  {ROLE_LABELS[settings.userRole].toLowerCase()} here.
                </Text>
              )}
            </Card>
          </View>
        )}
      </Sheet>
    </>
  );
}
