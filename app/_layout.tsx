import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { usePantryStore } from '../lib/store';

export default function RootLayout() {
  const loadStore = usePantryStore(state => state.loadStore);

  useEffect(() => {
    loadStore();
  }, []);

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
      </Stack>
    </SafeAreaProvider>
  );
}
