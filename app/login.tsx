import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AuthLayout } from '../components/auth-layout';
import { Button, Input, Text } from '../components/ui';
import { OAuthCancelled, oauthRedirectUri, signInWithGoogle } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { DEMO_PANTRIES, usePantryStore } from '../lib/store';

export default function LoginScreen() {
  const loginAsDemo = usePantryStore((state) => state.loginAsDemo);
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

      <View className="relative my-3 items-center justify-center">
        <View className="h-px w-full bg-hairline/60" />
        <Text variant="label" tone="soft" className="absolute bg-card px-3 font-medium">
          Or try a food bank directly
        </Text>
      </View>

      <View className="gap-2.5">
        {DEMO_PANTRIES.map((pantry) => (
          <Pressable
            key={pantry.id}
            accessibilityRole="button"
            accessibilityLabel={`Enter ${pantry.name}`}
            onPress={() => loginAsDemo(pantry.id)}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            className="flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-3.5"
          >
            <View className="flex-1 pr-3">
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2B2420' }}>
                {pantry.name}
              </Text>
              <Text variant="label" tone="soft" className="mt-0.5">
                {pantry.description}
              </Text>
            </View>
            <View className="rounded-md border border-hairline bg-card px-3 py-1.5">
              <Text variant="label" tone="brand" className="font-bold">
                Open →
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Dev only: the Expo Go redirect host changes with the network, and it
          must be allow-listed in Supabase or login falls back to Site URL. */}
      {__DEV__ && (
        <Text variant="micro" tone="soft" className="text-center" selectable>
          Redirect URI: {oauthRedirectUri}
        </Text>
      )}
    </AuthLayout>
  );
}
