import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { usePantryStore } from '../lib/store';
import { loadFeedbackPrefs } from '../lib/feedback';
import { GrainOverlay } from '../components/motion';
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
// Imported per weight, not from the package root — the root re-exports every
// Newsreader cut and Metro would bundle ~2.5MB of fonts we never load.
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { Newsreader_500Medium_Italic } from '@expo-google-fonts/newsreader/500Medium_Italic';
import { BrandSplash } from '../components/brand-splash';
import { View } from 'react-native';

export default function RootLayout() {
  const initialize = usePantryStore(state => state.initialize);
  const isLoaded = usePantryStore(state => state.isLoaded);
  const session = usePantryStore(state => state.session);
  const pantryId = usePantryStore(state => state.settings.pantryId);
  // Lives in the store so completing the intro updates routing immediately.
  const onboarded = usePantryStore(state => state.onboarded);
  
  const segments = useSegments();
  const router = useRouter();

  // Plays on every launch. Also covers the gap while the session and pantry
  // load, so the app never flashes a half-built dashboard.
  const [splashDone, setSplashDone] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  // Decoded behind the splash so the onboarding viewfinder and the auth
  // background are already in cache when their screens mount. Without this the
  // first onboarding panel visibly pops in a second late, because Metro serves
  // assets over HTTP in development.
  useEffect(() => {
    Asset.loadAsync([
      require('../assets/images/donation-scan.jpg'),
      require('../assets/images/pantry-bg.jpg'),
    ])
      .catch(() => {
        // A failed preload is not fatal — the image still loads on demand.
      })
      .finally(() => setAssetsReady(true));
  }, []);
  const [fontsLoaded] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Newsreader_500Medium_Italic,
  });
  // The splash holds until fonts are in, so serif headings never flash in sans.
  const ready = isLoaded && onboarded !== null && fontsLoaded && assetsReady;

  useEffect(() => {
    initialize();
    // Restore the volunteer's haptics/sound choices before any cue can fire.
    loadFeedbackPrefs();
  }, [initialize]);

  useEffect(() => {
    if (!isLoaded || onboarded === null) return;

    const onOnboarding = segments[0] === 'onboarding';
    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'login' || segments[0] === 'sign-up';

    // The intro only ever precedes sign-in, and only once.
    if (!session && !onboarded) {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }
    if (onOnboarding && (session || onboarded)) {
      router.replace(session ? '/(tabs)' : '/login');
      return;
    }

    if (!session && !inAuthGroup) {
      // Redirect to login
      router.replace('/login');
    } else if (session && !pantryId && segments[0] !== 'pantry-selection') {
      // User is logged in but doesn't have a pantry assigned yet
      router.replace('/pantry-selection');
    } else if (session && pantryId && (inAuthGroup || segments[0] === 'pantry-selection')) {
      // User is logged in and has a pantry, keep them out of auth screens
      router.replace('/(tabs)');
    }
  }, [isLoaded, session, pantryId, segments, onboarded]);

  return (
    <SafeAreaProvider>
      {ready ? (
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
        <Stack.Screen name="bulk-intake" options={{ title: 'Bulk Donation', presentation: 'modal' }} />
        <Stack.Screen name="review-verify" options={{ title: 'Review & Verify', presentation: 'card' }} />
        <Stack.Screen name="shelf-audit" options={{ title: 'Shelf Audit Mode', presentation: 'modal' }} />
        <Stack.Screen name="item-detail" options={{ title: 'Item Details', presentation: 'modal' }} />
        <Stack.Screen name="packing-checklist" options={{ title: 'Packing Checklist', presentation: 'card' }} />
        <Stack.Screen name="expiring-soon" options={{ title: 'Expiring Soon', presentation: 'card' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ title: 'Log In', headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Sign Up', headerShown: false }} />
        <Stack.Screen name="pantry-selection" options={{ title: 'Join a Pantry', headerShown: false }} />
      </Stack>
      ) : (
        // Brand-coloured hold rather than a white flash while state resolves.
        <View style={{ flex: 1, backgroundColor: COLORS.background }} />
      )}
      {/* Sits above every screen. Non-interactive, so it never eats a tap. */}
      <GrainOverlay opacity={0.45} />
      {!splashDone && <BrandSplash hold={!ready} onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
  );
}
