import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { supabase } from '../lib/supabase';

export default function SignUpScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    setLoading(false);
    
    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Success', 'Account created! Check your email to verify if required, or sign in.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.brandBox}>
        <Text style={styles.brandTitle}>Join PantryLens</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create Account</Text>

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.signInBtn} onPress={handleSignUp} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.signInBtnText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Link href="/sign-in" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}> Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, justifyContent: 'center', minHeight: '100%' },
  brandBox: { alignItems: 'center', marginBottom: SPACING.xl },
  brandTitle: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
  card: { backgroundColor: COLORS.cardSurface, borderRadius: RADII.lg, borderWidth: 1, borderColor: COLORS.borderSoft, padding: SPACING.lg },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginTop: SPACING.sm, marginBottom: 4 },
  input: { backgroundColor: COLORS.background, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.borderSoft, paddingHorizontal: SPACING.sm, height: 48, fontSize: 15, color: COLORS.textPrimary },
  signInBtn: { backgroundColor: COLORS.primaryLight, borderRadius: RADII.md, padding: SPACING.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SPACING.lg, minHeight: SPACING.touch },
  signInBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.textOnPrimary },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  footerLink: { color: COLORS.primaryLight, fontSize: 14, fontWeight: '600' }
});
