import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { useTeamAlerts } from '../lib/team-alerts';
import { timeAgo } from '../lib/time';
import { TopNotificationBubble } from './top-notification-bubble';

const seenKey = (pantryId: string) => `pantrylens.alerts.popped.${pantryId}`;

/**
 * A team alert ("We need protein…") pops up on Home the first time you land
 * there after it was sent, so it isn't missed in the bell. Once per alert per
 * phone, and never for alerts you sent yourself.
 */
export function TeamAlertPopup({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter();
  const segments: readonly string[] = useSegments();
  const onHome = segments[0] === '(tabs)' && (!segments[1] || segments[1] === 'index');
  const pantryId = usePantryStore(s => s.settings.pantryId);
  const myId = usePantryStore(s => s.session?.user.id);
  const alerts = useTeamAlerts(s => s.alerts);
  const loadAlerts = useTeamAlerts(s => s.load);
  const [seenState, setSeen] = useState<{ pantryId: string; ids: Set<string> } | null>(null);
  const seen = seenState?.pantryId === pantryId ? seenState.ids : null;
  const goNeeds = useRef(false);

  useEffect(() => {
    let active = true;
    goNeeds.current = false;
    setSeen(null);
    if (!pantryId) return;
    loadAlerts(pantryId);
    AsyncStorage.getItem(seenKey(pantryId))
      .then(raw => {
        const values: unknown = JSON.parse(raw ?? '[]');
        const ids = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
        if (active) setSeen({ pantryId, ids: new Set(ids) });
      })
      .catch(() => { if (active) setSeen({ pantryId, ids: new Set() }); });
    return () => { active = false; };
  }, [pantryId, loadAlerts]);

  const unseen = seen ? alerts.filter(a => !seen.has(a.id) && a.created_by !== myId) : [];
  const alert = unseen[0];

  const dismiss = (toNeeds = false) => {
    cueTap();
    if (!pantryId || !seen) return;
    // Every alert waiting counts as seen, so a backlog doesn't pop up one by one.
    const next = new Set([...seen, ...unseen.map(a => a.id)]);
    setSeen({ pantryId, ids: next });
    goNeeds.current = toNeeds;
    AsyncStorage.setItem(seenKey(pantryId), JSON.stringify([...next].slice(-50))).catch(() => {});
  };

  return (
    <TopNotificationBubble
      visible={enabled && onHome && !!alert}
      message={alert?.message ?? ''}
      detail={alert ? `${timeAgo(alert.created_at)}${unseen.length > 1 ? ` · ${unseen.length - 1} more in Notifications` : ''}` : ''}
      onClose={() => dismiss()}
      onPress={() => dismiss(true)}
      onDismiss={() => {
        if (goNeeds.current) {
          goNeeds.current = false;
          router.push('/(tabs)/needs');
        }
      }}
    />
  );
}
