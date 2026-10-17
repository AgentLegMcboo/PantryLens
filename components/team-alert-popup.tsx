import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { COLORS } from '../constants/theme';
import { cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { useTeamAlerts } from '../lib/team-alerts';
import { timeAgo } from '../lib/time';
import { Button, Sheet, Text } from './ui';

const seenKey = (pantryId: string) => `pantrylens.alerts.popped.${pantryId}`;

/**
 * A team alert ("We need protein…") pops up on Home the first time you land
 * there after it was sent, so it isn't missed in the bell. Once per alert per
 * phone, and never for alerts you sent yourself.
 */
export function TeamAlertPopup() {
  const router = useRouter();
  const pantryId = usePantryStore(s => s.settings.pantryId);
  const myId = usePantryStore(s => s.session?.user.id);
  const alerts = useTeamAlerts(s => s.alerts);
  const loadAlerts = useTeamAlerts(s => s.load);
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [focused, setFocused] = useState(false);
  const [goNeeds, setGoNeeds] = useState(false);

  useEffect(() => {
    if (!pantryId) return;
    loadAlerts(pantryId);
    AsyncStorage.getItem(seenKey(pantryId))
      .then(raw => setSeen(new Set(raw ? (JSON.parse(raw) as string[]) : [])))
      .catch(() => setSeen(new Set()));
  }, [pantryId, loadAlerts]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const unseen = seen ? alerts.filter(a => !seen.has(a.id) && a.created_by !== myId) : [];
  const alert = unseen[0];

  const dismiss = (toNeeds = false) => {
    cueTap();
    if (!pantryId || !seen) return;
    // Every alert waiting counts as seen, so a backlog doesn't pop up one by one.
    const next = new Set([...seen, ...unseen.map(a => a.id)]);
    setSeen(next);
    setGoNeeds(toNeeds);
    AsyncStorage.setItem(seenKey(pantryId), JSON.stringify([...next].slice(-50))).catch(() => {});
  };

  return (
    <Sheet
      visible={focused && !!alert}
      onClose={() => dismiss()}
      onDismiss={() => {
        if (goNeeds) {
          setGoNeeds(false);
          router.push('/(tabs)/needs');
        }
      }}
      title="From your team"
    >
      {alert ? (
        <View className="gap-4">
          <View className="flex-row gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: COLORS.primaryLight }}
            >
              <MaterialCommunityIcons name="bullhorn-outline" size={22} color={COLORS.primaryDark} />
            </View>
            <View className="flex-1 gap-1">
              <Text variant="heading" className="font-bold">
                {alert.message}
              </Text>
              <Text variant="micro" tone="soft">
                {timeAgo(alert.created_at)}
                {unseen.length > 1 ? ` · ${unseen.length - 1} more in Notifications` : ''}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Got it" variant="secondary" block className="rounded-md" onPress={() => dismiss()} />
            </View>
            <View className="flex-1">
              <Button label="See needs" block className="rounded-md" onPress={() => dismiss(true)} />
            </View>
          </View>
        </View>
      ) : (
        <View />
      )}
    </Sheet>
  );
}
