import React, { useState } from "react";
import { Alert } from "react-native";
import { Button } from "./ui";
import { usePantryStore, type SourceOrg } from "../lib/store";
import type { PreparedPhoto } from "../lib/photo";
import { getSavedCapture, saveCapture } from "../lib/capture-queue";

export function SaveCaptureButton({
  shots,
  mode,
  locationId = null,
  sourceOrg = null,
  disabled = false,
}: {
  shots: PreparedPhoto[];
  mode: "donation" | "shelf_audit";
  locationId?: string | null;
  sourceOrg?: SourceOrg | null;
  disabled?: boolean;
}) {
  const { session, settings } = usePantryStore();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!session?.user.id || !settings.pantryId) {
      Alert.alert(
        "Choose a pantry first",
        "Sign in and select your pantry before saving photos.",
      );
      return;
    }
    if (mode === "shelf_audit" && !locationId) {
      Alert.alert(
        "Choose a shelf first",
        "Select the location these photos cover.",
      );
      return;
    }
    const userId = session.user.id,
      pantryId = settings.pantryId;
    const persist = async () => {
      setBusy(true);
      try {
        await saveCapture(userId, pantryId, {
          mode,
          locationId,
          sourceOrg,
          shots,
        });
        Alert.alert(
          "Photos saved on this device",
          "Use “Resume a saved scan” on Home when you have a connection.",
        );
      } catch {
        Alert.alert(
          "Could not save photos",
          "Your photos are still here. Free some device storage and retry.",
        );
      } finally {
        setBusy(false);
      }
    };
    setBusy(true);
    try {
      if (await getSavedCapture(userId, pantryId))
        Alert.alert(
          "Replace your saved scan?",
          "There is already a saved scan for this pantry.",
          [
            { text: "Keep it", style: "cancel" },
            { text: "Replace", onPress: persist },
          ],
        );
      else await persist();
    } catch {
      Alert.alert(
        "Could not read saved scans",
        "Your photos are still here. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      label="Save photos for later"
      variant="secondary"
      block
      disabled={disabled || shots.length === 0}
      loading={busy}
      onPress={save}
    />
  );
}
