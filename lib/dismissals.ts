import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * A banner the volunteer can close, which stays closed until what it is about
 * changes.
 *
 * `signature` describes the situation the banner reports (for example the ids
 * of the items it counts). Closing it stores that signature; the banner comes
 * back only when the signature differs — a new item goes out of date, say — so
 * a dismissal never hides news. The same information always lives on the
 * Notifications page, so nothing is lost by closing it.
 *
 * Hidden until the stored value has been read, so a closed banner doesn't
 * flash on screen at launch.
 */
export function useDismissible(key: string, signature: string): [visible: boolean, dismiss: () => void] {
  const storageKey = `pantrylens.dismissed.${key}`;
  const [stored, setStored] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then(v => !cancelled && setStored(v))
      .catch(() => !cancelled && setStored(null));
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setStored(signature);
    AsyncStorage.setItem(storageKey, signature).catch(() => {});
  }, [storageKey, signature]);

  const visible = stored !== undefined && stored !== signature;
  return [visible, dismiss];
}
