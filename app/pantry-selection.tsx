import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../components/brand-mark';
import { Button, Card, Input, Segmented, Text } from '../components/ui';
import { COLORS, RULE_BELOW_FAINT } from '../constants/theme';
import { cueSuccess } from '../lib/feedback';
import { ACTIVE_PANTRY_KEY, usePantryStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { Tappable } from '../components/motion';

export default function PantrySelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = usePantryStore((state) => state.signOut);

  const [subMode, setSubMode] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [pantryName, setPantryName] = useState('');
  // Here to add a second pantry, rather than because they have none yet.
  const adding = usePantryStore((state) => state.addingPantry && !!state.settings.pantryId);
  const setAddingPantry = usePantryStore((state) => state.setAddingPantry);
  // Leaving by any route — Back, the system back gesture, finishing — ends add
  // mode, so the root gate goes back to keeping people with a pantry out of here.
  useEffect(() => () => setAddingPantry(false), [setAddingPantry]);

  /** Opens the pantry just created or joined, and remembers it on this device. */
  const openPantry = async (pantryId: string | null | undefined) => {
    if (pantryId) await AsyncStorage.setItem(ACTIVE_PANTRY_KEY, pantryId).catch(() => {});
    setAddingPantry(false);
    await usePantryStore.getState().fetchData();
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateCustom = async () => {
    const trimmed = pantryName.trim();
    if (!trimmed) {
      setError('Please enter a name for your food bank.');
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const { data, error: createError } = await supabase
        .rpc('create_pantry', { pantry_name: trimmed })
        .single<{ pantry_id: string; pantry_code: string }>();
      if (createError) throw createError;

      cueSuccess();
      await openPantry(data.pantry_id);
      Alert.alert(`${trimmed} is ready`, `Your volunteer code is:\n\n${data.pantry_code}`, [
        { text: 'Open Food Bank', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      // Said where it can be read, not swallowed: a pantry that was never
      // created must not look as if it was.
      setError(err?.message ?? 'Could not create the food bank. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinWithCode = async () => {
    const trimmed = inviteCode.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter the volunteer code.');
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const { data: joinedId, error: joinError } = await supabase.rpc('join_pantry_by_code', {
        code: trimmed,
      });
      if (joinError) throw joinError;

      cueSuccess();
      await openPantry(joinedId as string);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err?.message ?? 'That code did not match a food bank. Check it and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-canvas">
      {/* Top Bar */}
      <View className="flex-row items-center justify-between bg-canvas px-gutter py-3.5" style={RULE_BELOW_FAINT}>
        {/* Back only when adding another pantry. Someone with no pantry yet
            has nowhere to go back to — the root gate keeps them here. */}
        {adding ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel="Back to your pantry"
            onPress={() => {
              setAddingPantry(false);
              router.back();
            }}
            hitSlop={8}
            className="flex-row items-center gap-1.5"
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.textPrimary} />
            <Text variant="body" className="font-semibold">
              Back
            </Text>
          </Tappable>
        ) : (
          <BrandMark />
        )}

        <Tappable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => {
            Alert.alert('Sign out?', 'You will return to the sign-in screen.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
            ]);
          }}
          className="rounded-lg border border-hairline bg-card px-3 py-2"
        >
          <Text variant="label" tone="critical" className="font-medium text-sm">
            Sign out
          </Text>
        </Tappable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Big accessible title */}
        <View className="mb-5">
          <Text
            variant="headline"
            className="font-bold text-2xl text-ink"
            style={{ fontSize: 26, lineHeight: 32 }}
          >
            {adding ? 'Add a food bank' : 'Set up your food bank'}
          </Text>
          <Text variant="body" tone="soft" className="mt-1.5 text-base">
            Start a new food bank, or join one with the code from your coordinator.
          </Text>
        </View>

          <Card className="gap-5 p-5">
            <Segmented
              value={subMode}
              onChange={(s) => {
                setError(null);
                setSubMode(s);
              }}
              options={[
                { value: 'create', label: 'New food bank', icon: 'plus-box-outline' },
                { value: 'join', label: 'Invite code', icon: 'key-outline' },
              ]}
            />

            {subMode === 'create' ? (
              <View className="gap-4">
                <Text variant="body" tone="soft" className="text-base">
                  Enter your community pantry or food bank name to create a fresh inventory.
                </Text>
                <Input
                  label="Food Bank Name"
                  value={pantryName}
                  onChangeText={(t) => {
                    setPantryName(t);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. St. Peter Community Pantry"
                  returnKeyType="go"
                  onSubmitEditing={handleCreateCustom}
                  error={error}
                  editable={!busy}
                />
                <Button
                  label="Create & Open Food Bank"
                  block
                  loading={busy}
                  disabled={!pantryName.trim()}
                  onPress={handleCreateCustom}
                />
              </View>
            ) : (
              <View className="gap-4">
                <Text variant="body" tone="soft" className="text-base">
                  Enter the 6-character volunteer code given to you by your pantry manager.
                </Text>
                <Input
                  label="Volunteer Invite Code"
                  value={inviteCode}
                  onChangeText={(t) => {
                    setInviteCode(t.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="e.g. PANTRY-1A2B"
                  autoCapitalize="characters"
                  returnKeyType="go"
                  onSubmitEditing={handleJoinWithCode}
                  error={error}
                  editable={!busy}
                />
                <Button
                  label="Join & Open Food Bank"
                  block
                  loading={busy}
                  disabled={!inviteCode.trim()}
                  onPress={handleJoinWithCode}
                />
              </View>
            )}
          </Card>

      </ScrollView>
    </View>
  );
}
