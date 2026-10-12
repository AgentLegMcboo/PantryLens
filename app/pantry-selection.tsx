import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Input, Segmented, Text } from '../components/ui';
import { COLORS, RULE_BELOW_FAINT, RULE_ABOVE_FAINT } from '../constants/theme';
import { cueSuccess, cueTap } from '../lib/feedback';
import { DEMO_PANTRIES, usePantryStore } from '../lib/store';
import { supabase } from '../lib/supabase';

type Mode = 'select' | 'custom';

export default function PantrySelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = usePantryStore((state) => state.session);
  const signOut = usePantryStore((state) => state.signOut);
  const currentPantryId = usePantryStore((state) => state.settings.pantryId);
  const switchDemoPantry = usePantryStore((state) => state.switchDemoPantry);
  const loginAsDemo = usePantryStore((state) => state.loginAsDemo);

  const [mode, setMode] = useState<Mode>('select');
  const [subMode, setSubMode] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');
  const [pantryName, setPantryName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPantry = (pantryId: string) => {
    cueTap();
    if (!session?.user || session.user.id === 'demo-user-123') {
      loginAsDemo(pantryId);
    } else {
      switchDemoPantry(pantryId);
    }
    cueSuccess();
    router.replace('/(tabs)');
  };

  const handleCreateCustom = async () => {
    const trimmed = pantryName.trim();
    if (!trimmed) {
      setError('Please enter a name for your food bank.');
      return;
    }
    setError(null);
    setBusy(true);

    try {
      if (session?.user && session.user.id !== 'demo-user-123') {
        const { data, error: createError } = await supabase
          .rpc('create_pantry', { pantry_name: trimmed })
          .single<{ pantry_id: string; pantry_code: string }>();

        if (createError) throw createError;

        cueSuccess();
        Alert.alert(
          `${trimmed} is ready`,
          `Your volunteer code is:\n\n${data.pantry_code}`,
          [{ text: 'Open Food Bank', onPress: () => router.replace('/(tabs)') }]
        );
        usePantryStore.getState().fetchData();
        return;
      }
    } catch {
      // Graceful local fallback if offline or RPC unavailable
    }

    // Set custom pantry locally
    usePantryStore.setState((state) => ({
      settings: {
        ...state.settings,
        pantryId: `custom-${Date.now()}`,
        pantryName: trimmed,
        userRole: 'admin',
        boxTarget: 30,
        expirationWarningDays: 30,
        inviteCode: `FOOD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      },
      inventory: [
        { id: 'c-1', name: 'White Rice (2 lb)', category: 'grain', count: 40, expiration: '2027-06-01', date_added: new Date().toISOString(), source: 'donation' },
        { id: 'c-2', name: 'Peanut Butter (16oz)', category: 'protein', count: 24, expiration: '2026-12-15', date_added: new Date().toISOString(), source: 'donation' },
        { id: 'c-3', name: 'Canned Sweet Corn', category: 'vegetable', count: 35, expiration: '2027-01-20', date_added: new Date().toISOString(), source: 'donation' },
      ],
      isLoaded: true,
      onboarded: true,
    }));

    cueSuccess();
    setBusy(false);
    router.replace('/(tabs)');
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
      if (session?.user && session.user.id !== 'demo-user-123') {
        const { error: joinError } = await supabase.rpc('join_pantry_by_code', { code: trimmed });
        if (joinError) throw joinError;

        cueSuccess();
        usePantryStore.getState().fetchData();
        router.replace('/(tabs)');
        return;
      }
    } catch {
      // Local fallback
    }

    // Check if matches demo pantries or default
    const matched = DEMO_PANTRIES.find((p) => p.name.toUpperCase().includes(trimmed)) || DEMO_PANTRIES[0];
    handleSelectPantry(matched.id);
  };

  return (
    <View style={{ paddingTop: insets.top }} className="flex-1 bg-canvas">
      {/* Top Bar */}
      <View className="flex-row items-center justify-between bg-canvas px-gutter py-3.5" style={RULE_BELOW_FAINT}>
        {currentPantryId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to food bank"
            onPress={() => router.replace('/(tabs)')}
            className="flex-row items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 py-2"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.textPrimary} />
            <Text variant="label" className="font-semibold text-base">
              Back to pantry
            </Text>
          </Pressable>
        ) : (
          <View className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-brand">
              <MaterialCommunityIcons name="home-heart" size={22} color={COLORS.textOnPrimary} />
            </View>
            <Text variant="headline" className="font-bold text-lg">
              PantryLens
            </Text>
          </View>
        )}

        <Pressable
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
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Big accessible title */}
        <View className="mb-5">
          <Text
            variant="headline"
            className="font-bold text-2xl text-ink"
            style={{ fontSize: 26, lineHeight: 32 }}
          >
            Choose a Food Bank
          </Text>
          <Text variant="body" tone="soft" className="mt-1.5 text-base">
            Select the pantry you are working with today, or set up a new one for your location.
          </Text>
        </View>

        {/* Tab switch between available pantries & custom */}
        <Segmented
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { value: 'select', label: 'Food Banks (3 Available)', icon: 'storefront-outline' },
            { value: 'custom', label: 'Create / Join New', icon: 'plus-box-outline' },
          ]}
          className="mb-5"
        />

        {mode === 'select' ? (
          <View className="gap-4">
            {DEMO_PANTRIES.map((pantry) => {
              const isActive = currentPantryId === pantry.id;
              return (
                <Card
                  key={pantry.id}
                  className={`gap-3 border p-5 ${
                    isActive ? 'border-good bg-good/5' : 'border-hairline bg-card'
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-bold text-xl text-ink">
                          {pantry.name}
                        </Text>
                        {isActive && (
                          <View className="rounded-md bg-good/15 px-2 py-0.5">
                            <Text variant="micro" className="font-bold text-good text-xs">
                              Active Now
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text variant="label" tone="soft" className="mt-1 text-sm font-medium">
                        {pantry.location}
                      </Text>
                    </View>
                    <View className="h-10 w-10 items-center justify-center rounded-lg bg-surfaceContainer">
                      <MaterialCommunityIcons
                        name="warehouse"
                        size={22}
                        color={COLORS.textPrimary}
                      />
                    </View>
                  </View>

                  <Text variant="body" tone="soft" className="text-sm">
                    {pantry.description}
                  </Text>

                  {/* Key Stats */}
                  <View className="flex-row items-center gap-4 pt-3" style={RULE_ABOVE_FAINT}>
                    <View className="flex-row items-center gap-1.5">
                      <MaterialCommunityIcons name="package-variant-closed" size={18} color={COLORS.textSecondary} />
                      <Text variant="label" tone="soft" className="text-sm">
                        Target: <Text className="font-bold text-ink">{pantry.boxTarget} boxes</Text>
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <MaterialCommunityIcons name="format-list-bulleted" size={18} color={COLORS.textSecondary} />
                      <Text variant="label" tone="soft" className="text-sm">
                        Items: <Text className="font-bold text-ink">{pantry.inventory.length} varieties</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Big action button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${pantry.name}`}
                    onPress={() => handleSelectPantry(pantry.id)}
                    className={`mt-1 min-h-[52px] items-center justify-center rounded-lg ${
                      isActive ? 'bg-subtle border border-hairline' : 'bg-brand'
                    }`}
                  >
                    <Text
                      variant="label"
                      className={`text-base font-bold ${isActive ? 'text-ink' : 'text-white'}`}
                    >
                      {isActive ? 'Continue with This Pantry →' : `Open ${pantry.name} →`}
                    </Text>
                  </Pressable>
                </Card>
              );
            })}
          </View>
        ) : (
          <Card className="gap-5 p-5">
            <Segmented
              value={subMode}
              onChange={(s) => {
                setError(null);
                setSubMode(s);
              }}
              options={[
                { value: 'create', label: 'Start New Food Bank', icon: 'plus-box-outline' },
                { value: 'join', label: 'Enter Invite Code', icon: 'key-outline' },
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
        )}
      </ScrollView>
    </View>
  );
}
