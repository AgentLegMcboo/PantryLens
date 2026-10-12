import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AuthLayout } from '../components/auth-layout';
import { Button, Input, Text } from '../components/ui';
import { OAuthCancelled, signInWithGoogle } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Almost there', 'Enter your email and password to sign in.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) Alert.alert('Could not sign in', error.message);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // The auth listener in the store picks the session up and routes onward.
      await signInWithGoogle();
    } catch (error: any) {
      // Backing out of the browser sheet is not a failure worth alerting about.
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
      cardTitle="Welcome back"
      cardSubtitle="Sign in to your pantry."
      onGooglePress={handleGoogle}
      googleLoading={googleLoading}
      disabled={loading}
      footer={
        <>
          <Text variant="label" tone="soft">
            New here?
          </Text>
          <Link href="/sign-up" asChild>
            <Pressable hitSlop={8}>
              <Text variant="label" tone="brand" className="font-bold">
                Create an account
              </Text>
            </Pressable>
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
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        placeholder="••••••••"
      />

      <Button label="Sign in" block loading={loading} disabled={googleLoading} onPress={handleLogin} />

    </AuthLayout>
  );
}
