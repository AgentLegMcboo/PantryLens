import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { log } from './log';
import { SCAN_PHOTO_BUCKET } from './scan-history';
import { supabase } from './supabase';

/**
 * A signed link to the first photo of the signed-in volunteer's most recent
 * donation scan in this pantry, or null if they have none yet.
 *
 * Refreshed whenever the calling screen comes into focus, so finishing a scan
 * and landing back on Home shows the new photo. Never throws: this decorates a
 * button, and a failure just means the fallback picture.
 */
export function useLastScanPhoto(pantryId: string | null | undefined, userId: string | null | undefined) {
  const [uri, setUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!pantryId || !userId) {
        setUri(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const { data, error } = await supabase
            .from('scans')
            .select('photo_paths')
            .eq('pantry_id', pantryId)
            .eq('scanned_by', userId)
            .eq('mode', 'donation')
            .not('photo_paths', 'is', null)
            .order('started_at', { ascending: false })
            .limit(5);
          if (error) throw error;
          const path = (data ?? [])
            .map((row: { photo_paths: string[] | null }) => row.photo_paths?.[0])
            .find((p): p is string => !!p);
          if (!path) {
            if (!cancelled) setUri(null);
            return;
          }
          const signed = await supabase.storage.from(SCAN_PHOTO_BUCKET).createSignedUrl(path, 3600);
          if (signed.error) throw signed.error;
          if (!cancelled) setUri(signed.data.signedUrl);
        } catch (err) {
          log.warn('store', 'could not load the last scan photo', err);
          if (!cancelled) setUri(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [pantryId, userId]),
  );

  return uri;
}
