import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, FONTS, RADII, SPACING } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { FadeInUp, PressableScale } from '../components/motion';
import { cueSuccess, cueTap } from '../lib/feedback';
import { supabase } from '../lib/supabase';
import { usePantryStore } from '../lib/store';

type Mode = 'join' | 'create';

/**
 * The one screen between signing in and using the app.
 *
 * It carries the same pantry-behind-glass treatment as Log In and Sign Up so the
 * hand-off doesn't feel like a different product, and it asks for one thing at a
 * time: two stacked forms made the choice look like paperwork, when it is really
 * a single either/or a volunteer answers once.
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
    if (next === mode) return;
    cueTap();
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
        `Share this invite code with your volunteers:\n\n${data.pantry_code}`
      );

      usePantryStore.getState().fetchData();

    } catch (err: any) {
      setError(err.message);
      Alert.alert('Could not create pantry', err.message);
    }
    setLoadingCreate(false);
  };

  const canSubmit = mode === 'join' ? !!trimmedCode : !!trimmedName;

  return (
    <View style={styles.root}>
      <Image source={require('../assets/images/pantry-bg.jpg')} style={styles.bg} blurRadius={5} />
      <LinearGradient
        colors={['rgba(251,246,238,0.55)', 'rgba(251,246,238,0.90)', COLORS.background]}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
        <FadeInUp index={0}>
          <View style={styles.brandBox}>
            <View style={styles.logoCircle}>
              <MaterialCommunityIcons name="home-heart" size={34} color={COLORS.textOnPrimary} />
            </View>
            <Text style={styles.brandTitle}>One last step</Text>
            <Text style={styles.brandTagline}>
              PantryLens keeps a single shared inventory per pantry. Join the one your team already
              uses, or start a new one.
            </Text>
          </View>
        </FadeInUp>

        <FadeInUp index={1}>
          <View style={styles.card}>
            {/* One question, two answers — clearer than two forms competing. */}
            <View style={styles.segment}>
              {(['join', 'create'] as Mode[]).map(m => {
                const active = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.segmentTab, active && styles.segmentTabActive]}
                    onPress={() => switchMode(m)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <MaterialCommunityIcons
                      name={m === 'join' ? 'account-multiple-plus-outline' : 'plus-box-outline'}
                      size={16}
                      color={active ? COLORS.textOnPrimary : COLORS.textSecondary}
                    />
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {m === 'join' ? 'Join a pantry' : 'Start a new one'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === 'join' ? (
              <>
                <Text style={styles.fieldLabel}>Invite code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput, !!error && styles.inputError]}
                  value={inviteCode}
                  onChangeText={txt => {
                    setInviteCode(txt.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="PANTRY-1A2B3C"
                  placeholderTextColor={COLORS.borderSoft}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleJoinPantry}
                  editable={!busy}
                />
                <Text style={[styles.hint, !!error && styles.hintError]}>
                  {error ?? 'Whoever set up your pantry has this code.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Pantry name</Text>
                <TextInput
                  style={[styles.input, !!error && styles.inputError]}
                  value={pantryName}
                  onChangeText={txt => {
                    setPantryName(txt);
                    if (error) setError(null);
                  }}
                  placeholder="Grace Community Pantry"
                  placeholderTextColor={COLORS.borderSoft}
                  autoCapitalize="words"
                  returnKeyType="go"
                  onSubmitEditing={handleCreatePantry}
                  editable={!busy}
                />
                <Text style={[styles.hint, !!error && styles.hintError]}>
                  {error ?? "You'll be the admin, and get a code to invite your volunteers."}
                </Text>
              </>
            )}

            <PressableScale
              style={[styles.primaryBtn, (!canSubmit || busy) && styles.primaryBtnDisabled] as any}
              cue="press"
              disabled={!canSubmit || busy}
              onPress={mode === 'join' ? handleJoinPantry : handleCreatePantry}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.textOnPrimary} />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>
                    {mode === 'join' ? 'Join pantry' : 'Create pantry'}
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.textOnPrimary} />
                </>
              )}
            </PressableScale>
          </View>
        </FadeInUp>

        <FadeInUp index={2}>
          <View style={styles.accountRow}>
            <Text style={styles.accountText} numberOfLines={1}>
              Signed in as {session?.user?.email ?? 'this device'}
            </Text>
            <TouchableOpacity onPress={signOut} disabled={busy} hitSlop={8}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </FadeInUp>
      </KeyboardScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  bg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.55 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: SPACING.lg, justifyContent: 'center', flexGrow: 1 },

  brandBox: { alignItems: 'center', marginBottom: SPACING.xl },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  brandTitle: { fontSize: 30, fontFamily: FONTS.serifSemi, color: COLORS.textPrimary },
  brandTagline: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },

  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.lg,
    shadowColor: '#2B2420',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: 4,
    gap: 4,
    marginBottom: SPACING.lg,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: RADII.sm,
  },
  segmentTabActive: { backgroundColor: COLORS.primaryLight },
  segmentText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  segmentTextActive: { color: COLORS.textOnPrimary },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.md,
    height: SPACING.touch,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  // A code is read back character by character, so it gets the spacing to match.
  codeInput: {
    textAlign: 'center',
    letterSpacing: 2,
    fontSize: 17,
    fontWeight: '600',
  },
  inputError: { borderColor: COLORS.statusCritical },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    minHeight: 34,
  },
  hintError: { color: COLORS.statusCritical },

  primaryBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    minHeight: SPACING.touch,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.textOnPrimary },

  accountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  accountText: { fontSize: 12, color: COLORS.textSecondary, flexShrink: 1 },
  signOutText: { fontSize: 12, fontWeight: '600', color: COLORS.primaryLight },
});
