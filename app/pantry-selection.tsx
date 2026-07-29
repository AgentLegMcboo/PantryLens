import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { supabase } from '../lib/supabase';
import { usePantryStore } from '../lib/store';

export default function PantrySelectionScreen() {
  const router = useRouter();
  const session = usePantryStore(state => state.session);
  const signOut = usePantryStore(state => state.signOut);

  const [inviteCode, setInviteCode] = useState('');
  const [pantryName, setPantryName] = useState('');
  const [loadingJoin, setLoadingJoin] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);

  const handleJoinPantry = async () => {
    if (!inviteCode || !session?.user) return;
    setLoadingJoin(true);

    try {
      const { data: pantries, error: fetchError } = await supabase
        .from('pantries')
        .select('id, name')
        .eq('invite_code', inviteCode.trim())
        .single();

      if (fetchError || !pantries) {
        Alert.alert('Error', 'Invalid invite code.');
        setLoadingJoin(false);
        return;
      }

      const { error: joinError } = await supabase
        .from('pantry_members')
        .insert({
          pantry_id: pantries.id,
          user_id: session.user.id,
          role: 'volunteer'
        });

      if (joinError) {
        if (joinError.code === '23505') {
          // Already joined
        } else {
          throw joinError;
        }
      }
      
      // Let the RootLayout routing effect take over by triggering a refresh via store
      usePantryStore.getState().fetchData();

    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoadingJoin(false);
  };

  const handleCreatePantry = async () => {
    if (!pantryName || !session?.user) return;
    setLoadingCreate(true);

    try {
      const generatedCode = 'PANTRY-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      
      const { data: pantry, error: createError } = await supabase
        .from('pantries')
        .insert({
          name: pantryName,
          invite_code: generatedCode
        })
        .select('id')
        .single();

      if (createError) throw createError;

      const { error: memberError } = await supabase
        .from('pantry_members')
        .insert({
          pantry_id: pantry.id,
          user_id: session.user.id,
          role: 'admin'
        });

      if (memberError) throw memberError;

      usePantryStore.getState().fetchData();

    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoadingCreate(false);
  };

  return (
    <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>You need to join or create a pantry to continue.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Join an Existing Pantry</Text>
        <Text style={styles.label}>Invite Code</Text>
        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="e.g. PANTRY-1234"
          autoCapitalize="characters"
        />
        <TouchableOpacity style={styles.btn} onPress={handleJoinPantry} disabled={loadingJoin}>
          {loadingJoin ? <ActivityIndicator color={COLORS.textOnPrimary} /> : <Text style={styles.btnText}>Join Pantry</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create a New Pantry</Text>
        <Text style={styles.label}>Pantry Name</Text>
        <TextInput
          style={styles.input}
          value={pantryName}
          onChangeText={setPantryName}
          placeholder="My Community Pantry"
        />
        <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.statusCritical }]} onPress={handleCreatePantry} disabled={loadingCreate}>
          {loadingCreate ? <ActivityIndicator color={COLORS.textOnPrimary} /> : <Text style={styles.btnText}>Create Pantry</Text>}
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingVertical: 80 },
  header: { marginBottom: SPACING.xl },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  card: { backgroundColor: COLORS.cardSurface, borderRadius: RADII.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginTop: SPACING.sm, marginBottom: 4 },
  input: { backgroundColor: COLORS.background, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.borderSoft, paddingHorizontal: SPACING.sm, height: 48, fontSize: 15 },
  btn: { backgroundColor: COLORS.primaryLight, borderRadius: RADII.md, padding: SPACING.md, alignItems: 'center', marginTop: SPACING.md },
  btnText: { color: COLORS.textOnPrimary, fontWeight: 'bold', fontSize: 16 },
  divider: { height: 1, backgroundColor: COLORS.borderSoft, marginVertical: SPACING.xl },
  signOutBtn: { marginTop: SPACING.xl, alignItems: 'center' },
  signOutText: { color: COLORS.textSecondary, fontSize: 14, textDecorationLine: 'underline' }
});
