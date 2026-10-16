import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { todayISO, windowEndISO } from './expiry';
import { isUsableCondition, type InventoryItem } from './store';

/**
 * What the bell counts: unread notifications.
 *
 * A notification is one item plus what is wrong with it — expiring soon, past
 * its date, or damaged. Opening the Notifications page marks every current one
 * as read, so the number on the bell goes back to zero. Something new (another
 * item expiring, or an expiring item passing its date) is a new notification
 * and makes the number come back.
 */

type Kind = 'soon' | 'past' | 'damaged';

/** The keys for everything the Notifications page currently lists. */
export function notificationKeys(inventory: InventoryItem[], warningDays: number): string[] {
  const window = windowEndISO(warningDays);
  const now = todayISO();
  const keys: string[] = [];
  for (const i of inventory) {
    if (i.count <= 0) continue;
    if (i.expiration && i.expiration <= window) {
      const kind: Kind = i.expiration < now ? 'past' : 'soon';
      keys.push(`${i.id}:${kind}`);
    }
    if (!isUsableCondition(i.condition)) keys.push(`${i.id}:damaged`);
  }
  return keys;
}

const storageKey = (pantryId: string) => `pantrylens.notifications.read.${pantryId}`;

type ReadState = {
  pantryId: string | null;
  read: Set<string>;
  /** Bumped on every markRead, so a slow load can't overwrite a newer read. */
  version: number;
  load: (pantryId: string) => void;
  markRead: (keys: string[]) => void;
};

export const useReadNotifications = create<ReadState>((set, get) => ({
  pantryId: null,
  read: new Set(),
  version: 0,
  load: (pantryId) => {
    if (get().pantryId === pantryId) return;
    set({ pantryId, read: new Set() });
    const startedAt = get().version;
    AsyncStorage.getItem(storageKey(pantryId))
      .then((raw) => {
        if (get().pantryId !== pantryId || get().version !== startedAt) return;
        set({ read: new Set(raw ? (JSON.parse(raw) as string[]) : []) });
      })
      .catch(() => {});
  },
  markRead: (keys) => {
    const { pantryId } = get();
    if (!pantryId) return;
    // Only what is listed now: keys for resolved notifications are dropped, so
    // the stored set never grows past the current list.
    const read = new Set(keys);
    set({ read, version: get().version + 1 });
    AsyncStorage.setItem(storageKey(pantryId), JSON.stringify([...read])).catch(() => {});
  },
}));

/** How many current notifications haven't been seen on the Notifications page. */
export function useUnreadCount(
  pantryId: string | null | undefined,
  inventory: InventoryItem[],
  warningDays: number,
): number {
  const load = useReadNotifications((s) => s.load);
  const read = useReadNotifications((s) => s.read);
  useEffect(() => {
    if (pantryId) load(pantryId);
  }, [pantryId, load]);
  const keys = useMemo(() => notificationKeys(inventory, warningDays), [inventory, warningDays]);
  return keys.filter((k) => !read.has(k)).length;
}
