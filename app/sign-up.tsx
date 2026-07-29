import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { AuthLayout, authStyles as s } from '../components/auth-layout';
import { COLORS } from '../constants/theme';
import { OAuthCancelled, signInWithGoogle } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('Sign Up Failed', error.message);
    } else {
      Alert.alert('Success', 'Account created! Check your email to verify if required, or log in.');
    }
  };

  // With Google there is no separate sign-up — the first login creates the
  // account, so this is the same call as on the login screen.
  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
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
      cardTitle="Create Account"
      cardSubtitle="Start tracking your pantry in minutes."
      onGooglePress={handleGoogle}
      googleLoading={googleLoading}
      disabled={loading}
      footer={
        <>
          <Text style={s.footerText}>Already have an account?</Text>
          <Link href="/login" asChild>
            <TouchableOpacity>
              <Text style={s.footerLink}> Log In</Text>
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
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={handleSignUp}
        placeholder="At least 6 characters"
        placeholderTextColor={COLORS.textSecondary}
      />

      <TouchableOpacity
        style={s.primaryBtn}
        onPress={handleSignUp}
        disabled={loading || googleLoading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <>
            <Text style={s.primaryBtnText}>Create Account</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.textOnPrimary} />
          </>
        )}
      </TouchableOpacity>
    </AuthLayout>
  );
}
