import { useAppAppearance } from '../lib/appearance';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { AuthLayout } from '../components/auth-layout';
import { Button, Input, Text } from '../components/ui';
import { OAuthCancelled, signInWithGoogle } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Tappable } from '../components/motion';

export default function SignUpScreen() {
  useAppAppearance(state => state.scheme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Almost there', 'Enter an email and a password to create your account.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('Could not create the account', error.message);
    } else {
      Alert.alert(
        'Account created',
        'Check your email if a confirmation was sent, then sign in.',
      );
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
        Alert.alert('Google sign-in failed', error.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="PantryLens"
      subtitle="Photograph a donation. Know what you can give out."
      cardTitle="Create an account"
      cardSubtitle="Then join your pantry, or start a new one."
      onGooglePress={handleGoogle}
      googleLoading={googleLoading}
      disabled={loading}
      footer={
        <>
          <Text variant="label" tone="soft">
            Already have one?
          </Text>
          <Link href="/login" asChild>
            <Tappable hitSlop={8}>
              <Text variant="label" tone="brand" className="font-bold">
                Sign in
              </Text>
            </Tappable>
          </Link>
        </>
      }
    >
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="next"
        placeholder="volunteer@pantry.org"
      />

      <Input
        label="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={handleSignUp}
        placeholder="At least 6 characters"
      />

      <Button
        label="Create account"
        block
        loading={loading}
        disabled={googleLoading}
        onPress={handleSignUp}
      />
    </AuthLayout>
  );
}
