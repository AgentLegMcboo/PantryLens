import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { usePantryStore } from '../lib/store';

export default function SignInScreen() {
  const router = useRouter();
  const updateSettings = usePantryStore(state => state.updateSettings);

  const [pantryCode, setPantryCode] = useState('GRACE-PANTRY-782');
  const [password, setPassword] = useState('••••••••');

  const handleSignIn = () => {
    updateSettings({ isSignedIn: true });
    router.replace('/(tabs)');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.brandBox}>
        <View style={styles.logoCircle}>
          <MaterialCommunityIcons name="camera-iris" size={40} color={COLORS.textOnPrimary} />
        </View>
        <Text style={styles.brandTitle}>PantryLens</Text>
        <Text style={styles.brandTagline}>AI Donation Intake & Box Allocation Engine</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pantry Volunteer Sign In</Text>
        <Text style={styles.cardSub}>
          Use your pantry's shared code to access live inventory.
        </Text>

        <Text style={styles.label}>Pantry Access Code</Text>
        <TextInput
          style={styles.input}
          value={pantryCode}
          onChangeText={setPantryCode}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
          <Text style={styles.signInBtnText}>Enter Pantry Account</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.textOnPrimary} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    justifyContent: 'center',
    minHeight: '100%',
  },
  brandBox: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  brandTagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.lg,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    marginTop: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 48,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  signInBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    minHeight: SPACING.touch,
  },
  signInBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginRight: SPACING.xs,
  },
});
