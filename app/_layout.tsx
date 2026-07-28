import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { usePantryStore } from '../lib/store';

export default function RootLayout() {
  const initialize = usePantryStore(state => state.initialize);
  const isLoaded = usePantryStore(state => state.isLoaded);
  const session = usePantryStore(state => state.session);
  const pantryId = usePantryStore(state => state.settings.pantryId);
  
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'sign-in' || segments[0] === 'sign-up';
    
    if (!session && !inAuthGroup) {
      // Redirect to sign-in
      router.replace('/sign-in');
    } else if (session && !pantryId && segments[0] !== 'pantry-selection') {
      // User is logged in but doesn't have a pantry assigned yet
      router.replace('/pantry-selection');
    } else if (session && pantryId && (inAuthGroup || segments[0] === 'pantry-selection')) {
      // User is logged in and has a pantry, keep them out of auth screens
      router.replace('/(tabs)');
    }
  }, [isLoaded, session, pantryId, segments]);

  if (!isLoaded) {
    return null; // Or a loading spinner
  }

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.background,
          },
          headerTintColor: COLORS.textPrimary,
          headerTitleStyle: {
            fontWeight: 'bold',
            color: COLORS.textPrimary,
          },
          contentStyle: {
            backgroundColor: COLORS.background,
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="log-donation" options={{ title: 'Log Donation', presentation: 'modal' }} />
        <Stack.Screen name="review-verify" options={{ title: 'Review & Verify', presentation: 'card' }} />
        <Stack.Screen name="shelf-audit" options={{ title: 'Shelf Audit Mode', presentation: 'modal' }} />
        <Stack.Screen name="item-detail" options={{ title: 'Item Details', presentation: 'modal' }} />
        <Stack.Screen name="packing-checklist" options={{ title: 'Packing Checklist', presentation: 'card' }} />
        <Stack.Screen name="expiring-soon" options={{ title: 'Expiring Soon', presentation: 'card' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign In', headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Sign Up', headerShown: false }} />
        <Stack.Screen name="pantry-selection" options={{ title: 'Join a Pantry', headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
