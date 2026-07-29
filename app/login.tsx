import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { AuthLayout, authStyles as s } from '../components/auth-layout';
import { COLORS } from '../constants/theme';
import { OAuthCancelled, oauthRedirectUri, signInWithGoogle } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) Alert.alert('Login Failed', error.message);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // The auth listener in the store picks the session up and routes onward.
      await signInWithGoogle();
    } catch (error: any) {
      // Backing out of the browser sheet is not a failure worth alerting about.
      if (!(error instanceof OAuthCancelled)) {
        Alert.alert('Google Sign In Failed', error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="PantryLens"
      subtitle="AI Donation Intake & Box Allocation Engine"
      cardTitle="Log In"
      cardSubtitle="Welcome back to PantryLens."
      onGooglePress={handleGoogle}
      googleLoading={googleLoading}
      disabled={loading}
      footer={
        <>
          <Text style={s.footerText}>Don&apos;t have an account?</Text>
          <Link href="/sign-up" asChild>
            <TouchableOpacity>
              <Text style={s.footerLink}> Sign Up</Text>
            </TouchableOpacity>
          </Link>
        </>
      }
    >
      <Text style={s.label}>Email Address</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="next"
        placeholder="volunteer@pantry.org"
        placeholderTextColor={COLORS.textSecondary}
      />

      <Text style={s.label}>Password</Text>
      <TextInput
        style={s.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        placeholder="••••••••"
        placeholderTextColor={COLORS.textSecondary}
      />

      <TouchableOpacity
        style={s.primaryBtn}
        onPress={handleLogin}
        disabled={loading || googleLoading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <>
            <Text style={s.primaryBtnText}>Log In</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.textOnPrimary} />
          </>
        )}
      </TouchableOpacity>

      {/* Dev only: the Expo Go redirect host changes with the network, and it
          must be allow-listed in Supabase or login falls back to Site URL. */}
      {__DEV__ && (
        <Text style={s.devHint} selectable>
          Redirect URI: {oauthRedirectUri}
        </Text>
      )}
    </AuthLayout>
  );
}
