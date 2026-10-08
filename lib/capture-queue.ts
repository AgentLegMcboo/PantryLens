import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { PreparedPhoto } from "./photo";
import type { SourceOrg } from "./store";

export interface SavedCapture {
  id: string;
  createdAt: string;
  mode: "donation" | "shelf_audit";
  locationId: string | null;
  sourceOrg: SourceOrg | null;
  shots: PreparedPhoto[];
}

const key = (userId: string, pantryId: string) =>
  `pantrylens.captures.${userId}.${pantryId}`;
export async function getSavedCapture(
  userId: string,
  pantryId: string,
): Promise<SavedCapture | null> {
  const raw = await AsyncStorage.getItem(key(userId, pantryId));
  return raw ? JSON.parse(raw) : null;
}
export async function saveCapture(
  userId: string,
  pantryId: string,
  capture: Omit<SavedCapture, "id" | "createdAt">,
) {
  // Base64 survives a process restart and a camera cache cleanup on both platforms.
  const stable = {
    ...capture,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    shots: capture.shots.map((s) => ({
      ...s,
      uri: `data:image/jpeg;base64,${s.base64}`,
    })),
  };
  await AsyncStorage.setItem(key(userId, pantryId), JSON.stringify(stable));
}
export async function clearSavedCapture(userId: string, pantryId: string) {
  await AsyncStorage.removeItem(key(userId, pantryId));
}
