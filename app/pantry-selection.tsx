import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AuthBackdrop, AuthBrand } from '../components/auth-layout';
import { KeyboardScreen } from '../components/keyboard-screen';
import { FadeInUp } from '../components/motion';
import { Button, Card, Input, Segmented, Text } from '../components/ui';
import { cueSuccess } from '../lib/feedback';
import { supabase } from '../lib/supabase';
import { usePantryStore } from '../lib/store';

type Mode = 'join' | 'create';

/**
 * The one screen between signing in and using the app.
 *
 * It carries the same pantry-behind-glass treatment as Log In and Sign Up — the
 * shared one now, rather than its own third copy of the photograph and scrim —
 * and asks for one thing at a time: two stacked forms made the choice look like
 * paperwork, when it is really a single either/or a volunteer answers once.
 */
export default function PantrySelectionScreen() {
  const session = usePantryStore(state => state.session);
  const signOut = usePantryStore(state => state.signOut);

  const [mode, setMode] = useState<Mode>('join');
  const [inviteCode, setInviteCode] = useState('');
  const [pantryName, setPantryName] = useState('');
  const [loadingJoin, setLoadingJoin] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  // Shown under the field rather than only in an alert — a mistyped code is a
  // correction to make in place, not something to dismiss first.
  const [error, setError] = useState<string | null>(null);

  const busy = loadingJoin || loadingCreate;
  const trimmedCode = inviteCode.trim();
  const trimmedName = pantryName.trim();

  const switchMode = (next: Mode) => {
    setError(null);
    setMode(next);
  };

  const handleJoinPantry = async () => {
    if (!trimmedCode || !session?.user) return;
    setError(null);
    setLoadingJoin(true);

    try {
      // Server-side lookup-and-enrol. Doing this from the client needed a policy
      // that let any signed-in user read every pantry in the database; the RPC
      // sees them all so the caller doesn't have to.
      const { error: joinError } = await supabase.rpc('join_pantry_by_code', {
        code: trimmedCode,
      });

      if (joinError) {
        setError(
          joinError.message.includes('No pantry found')
            ? 'No pantry has that code. Check it with whoever invited you.'
            : joinError.message,
        );
        setLoadingJoin(false);
        return;
      }

      cueSuccess();
      // Let the RootLayout routing effect take over by triggering a refresh via store
      usePantryStore.getState().fetchData();
    } catch (err: any) {
      setError(err.message);
      Alert.alert('Could not join', err.message);
    }
    setLoadingJoin(false);
  };

  const handleCreatePantry = async () => {
    if (!trimmedName || !session?.user) return;
    setError(null);
    setLoadingCreate(true);

    try {
      // Creates the pantry, enrols the caller as its admin and generates a
      // collision-free code in one transaction. Split across two client inserts
      // this could half-succeed, leaving a pantry nobody was a member of — and
      // therefore nobody could see.
      const { data, error: createError } = await supabase
        .rpc('create_pantry', { pantry_name: trimmedName })
        .single<{ pantry_id: string; pantry_code: string }>();

      if (createError) throw createError;

      cueSuccess();
      // The code is the only way anyone else gets in, so it is shown here rather
      // than generated and discarded the way it used to be.
      Alert.alert(
        `${trimmedName} is set up`,
        `Share this invite code with your volunteers:\n\n${data.pantry_code}`,
      );

      usePantryStore.getState().fetchData();
    } catch (err: any) {
      setError(err.message);
      Alert.alert('Could not create pantry', err.message);
    }
    setLoadingCreate(false);
  };

  const joining = mode === 'join';
  const canSubmit = joining ? !!trimmedCode : !!trimmedName;

  return (
    <View className="flex-1 bg-canvas">
      <AuthBackdrop />

      <KeyboardScreen className="bg-transparent" contentContainerClassName="justify-center grow">
        <FadeInUp index={0}>
          <AuthBrand
            icon="home-heart"
            title="One last step"
            subtitle="PantryLens keeps one shared inventory per pantry. Join the one your team already uses, or start a new one."
          />
        </FadeInUp>

        <FadeInUp index={1}>
          <Card
            className="gap-5"
            style={{
              shadowColor: '#2B2420',
              shadowOpacity: 0.16,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 14 },
              elevation: 8,
            }}
          >
            {/* One question, two answers — clearer than two forms competing. */}
            <Segmented
              value={mode}
              onChange={switchMode}
              options={[
                { value: 'join', label: 'Join a pantry', icon: 'account-multiple-plus-outline' },
                { value: 'create', label: 'Start a new one', icon: 'plus-box-outline' },
              ]}
            />

            {joining ? (
              <Input
                label="Invite code"
                value={inviteCode}
                onChangeText={txt => {
                  setInviteCode(txt.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="PANTRY-1A2B3C"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleJoinPantry}
                editable={!busy}
                error={error}
                hint="Whoever set up your pantry has this code."
                // A code is read back character by character, so it gets the
                // spacing to match.
                className="text-center text-heading font-semibold tracking-[2px]"
              />
            ) : (
              <Input
                label="Pantry name"
                value={pantryName}
                onChangeText={txt => {
                  setPantryName(txt);
                  if (error) setError(null);
                }}
                placeholder="Grace Community Pantry"
                autoCapitalize="words"
                returnKeyType="go"
                onSubmitEditing={handleCreatePantry}
                editable={!busy}
                error={error}
                hint="You'll be the admin, and get a code to invite your volunteers."
              />
            )}

            <Button
              label={joining ? 'Join pantry' : 'Create pantry'}
              block
              loading={busy}
              disabled={!canSubmit}
              onPress={joining ? handleJoinPantry : handleCreatePantry}
            />
          </Card>
        </FadeInUp>

        <FadeInUp index={2}>
          <View className="flex-row items-center justify-center gap-2">
            <Text variant="micro" tone="soft" numberOfLines={1} className="shrink">
              Signed in as {session?.user?.email ?? 'this device'}
            </Text>
            <Pressable onPress={signOut} disabled={busy} hitSlop={8}>
              <Text variant="micro" tone="brand" className="font-bold">
                Sign out
              </Text>
            </Pressable>
          </View>
        </FadeInUp>
      </KeyboardScreen>
    </View>
  );
}
