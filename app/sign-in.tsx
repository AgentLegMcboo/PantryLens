import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import React, { useState, useEffect } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    
    if (error) {
      Alert.alert('Sign In Failed', error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const redirectUrl = makeRedirectUri({
        path: '/(tabs)',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No url returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        // Parse the URL to extract the access and refresh tokens
        const urlParams = new URL(result.url).hash.substring(1);
        const params = new URLSearchParams(urlParams);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;
        }
      }
    } catch (error: any) {
      Alert.alert('Google Sign In Failed', error.message);
    } finally {
      setGoogleLoading(false);
    }
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
        <Text style={styles.cardTitle}>Sign In</Text>
        <Text style={styles.cardSub}>Welcome back to PantryLens.</Text>

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn} disabled={googleLoading || loading}>
          {googleLoading ? (
            <ActivityIndicator color={COLORS.textPrimary} />
          ) : (
            <>
              <MaterialCommunityIcons name="google" size={20} color={COLORS.textPrimary} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.dividerBox}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="volunteer@pantry.org"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />

        <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} disabled={loading || googleLoading}>
          {loading ? (
            <ActivityIndicator color={COLORS.textOnPrimary} />
          ) : (
            <>
              <Text style={styles.signInBtnText}>Sign In</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.textOnPrimary} />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Link href="/sign-up" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}> Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </View>
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
  googleBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
  },
  dividerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderSoft,
  },
  dividerText: {
    marginHorizontal: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: 14,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  footerLink: {
    color: COLORS.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  }
});
