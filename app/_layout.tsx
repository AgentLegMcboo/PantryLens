// Compiled by NativeWind's Metro transform into the styles every `className`
// resolves against. It must be imported exactly once, at the app root.
import '../global.css';

import { Stack, useRouter, useSegments, useGlobalSearchParams, ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Required for react-native-gesture-handler to receive touches at all. Without
// it the box drag/resize handles in Review & Verify are inert on Android.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SpotlightHost } from '../components/spotlight';
import { COLORS, LIGHT_COLORS, DARK_COLORS } from '../constants/theme';
import { vars } from 'nativewind';
import { useAppAppearance } from '../lib/appearance';
import { AppBackground } from '../components/app-background';
import { usePantryStore } from '../lib/store';
import { loadFeedbackPrefs } from '../lib/feedback';
import { GrainOverlay } from '../components/motion';
import { Asset } from 'expo-asset';
import { BrandSplash } from '../components/brand-splash';
import { StackHeader } from '../components/app-header';
import { StatusBar, View } from 'react-native';

/** Dev only: replay onboarding on every launch, signed in or not. */
const REPLAY_INTRO_IN_DEV = false;

export default function RootLayout() {
  const scheme = useAppAppearance(state => state.scheme);
  const palette = scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const themeVariables = vars(Object.fromEntries(Object.entries(palette)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, hex]) => [`--color-${key}`, [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ')])));
  const initialize = usePantryStore(state => state.initialize);
  const isLoaded = usePantryStore(state => state.isLoaded);
  const session = usePantryStore(state => state.session);
  const pantryId = usePantryStore(state => state.settings.pantryId);
  // Lives in the store so completing the intro updates routing immediately.
  const onboarded = usePantryStore(state => state.onboarded);
  const addingPantry = usePantryStore(state => state.addingPantry);
  
  const segments = useSegments();
  const { replay } = useGlobalSearchParams<{ replay?: string }>();
  const router = useRouter();

  // Plays on every launch. Also covers the gap while the session and pantry
  // load, so the app never flashes a half-built dashboard.
  const [splashDone, setSplashDone] = useState(false);

  // Warmed in the background so the onboarding viewfinder and the auth
  // background are already in cache when their screens mount. Deliberately NOT
  // awaited before launch: it is 150KB served over HTTP by Metro in development,
  // and a nicety for a later screen must never hold the whole app shut.
  useEffect(() => {
    Asset.loadAsync([
      require('../assets/images/donation-scan.jpg'),
      require('../assets/images/pantry-bg.jpg'),
    ]).catch(() => {
      // A failed preload is not fatal — the image still loads on demand.
    });
  }, []);
  /**
   * What the splash is allowed to wait for.
   *
   * Only local, fast work: `onboarded` is one AsyncStorage read.
   * Pantry data is deliberately NOT here. Gating on `isLoaded` meant the
   * splash stayed up through a session read plus every Supabase round trip — a
   * measured ten seconds on a cold launch, for an animation lasting one.
   *
   * The routing effect below still waits on `isLoaded` before it decides
   * anything, so nothing can redirect early. The dashboard may show zeroes for a
   * beat while data lands, which is the ordinary trade and much the better one.
   */
  const ready = onboarded !== null;

  useEffect(() => {
    initialize();
    // Restore the volunteer's haptics/sound choices before any cue can fire.
    loadFeedbackPrefs();
  }, [initialize]);

  useEffect(() => {
    if (!isLoaded || onboarded === null) return;

    const onOnboarding = segments[0] === 'onboarding';
    if (onOnboarding && replay === '1') return;
    const inAuthGroup =
      segments[0] === '(auth)' ||
      segments[0] === 'login' ||
      segments[0] === 'sign-up' ||
      // Google's redirect back; see app/auth/callback.tsx.
      segments[0] === 'auth';

    // The intro only ever precedes sign-in, and only once. In development it
    // also plays for a signed-in volunteer on every launch, so it can be looked
    // at without signing out; finishing it goes straight to the pantry.
    const introForSignedIn = __DEV__ && REPLAY_INTRO_IN_DEV;
    if ((!session || introForSignedIn) && !onboarded) {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }
    if (onOnboarding && (onboarded || (session && !introForSignedIn))) {
      router.replace(session ? '/(tabs)' : '/login');
      return;
    }

    if (!session && !inAuthGroup) {
      // Redirect to login
      router.replace('/login');
    } else if (session && !pantryId && segments[0] !== 'pantry-selection') {
      // User is logged in but doesn't have a pantry assigned yet
      router.replace('/pantry-selection');
    } else if (
      session &&
      pantryId &&
      (inAuthGroup || (segments[0] === 'pantry-selection' && !addingPantry))
    ) {
      // Has a pantry: keep them out of the auth screens and out of setup, which
      // is only for someone who doesn't belong to a pantry yet.
      router.replace('/(tabs)');
    }
  }, [isLoaded, session, pantryId, segments, onboarded, addingPantry, replay]);

  return (
    <GestureHandlerRootView style={[{ flex: 1, backgroundColor: COLORS.background }, themeVariables]}>
    <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
    <AppBackground />
    <ThemeProvider value={{ ...(scheme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors), background: 'transparent', card: COLORS.cardSurface, text: COLORS.textPrimary, border: COLORS.borderSoft, primary: COLORS.primary } }}>
    <SafeAreaProvider>
      {ready ? (
      <Stack
        screenOptions={({ navigation }) => ({
          // Same bar as the tabs, so a pushed screen never feels like a
          // different application.
          header: ({ options }) => (
            <StackHeader
              title={String(options.title ?? '')}
              onBack={() => navigation.goBack()}
              modal={options.presentation === 'modal'}
            />
          ),
          // Solid, so a screen sliding in covers the one under it. Transparent
          // pages let the previous screen show through mid-transition and the
          // two overlapped. The tabs keep the shared warm background.
          contentStyle: {
            backgroundColor: COLORS.background,
          },
        })}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
        {/* Log Donation and Shelf Audit are the first step of a wizard that
            pushes on to Review & Verify, so they are cards, not modals.
            Presented as modals they broke the flow outright: on iOS a modal sits
            above the stack it was pushed from, so the review screen mounted and
            rendered underneath the camera sheet — the scan appeared to do
            nothing at all. Anything that pushes onward must stay in the stack. */}
        <Stack.Screen name="log-donation" options={{ title: 'Log Donation', headerShown: false }} />
        <Stack.Screen name="review-verify" options={{ title: 'Review & Verify' }} />
        <Stack.Screen name="shelf-audit" options={{ title: 'Check shelf inventory' }} />
        <Stack.Screen name="audit-review" options={{ title: 'Check the Count' }} />
        {/* Self-contained — these only ever go back, so a modal is right. */}
        <Stack.Screen name="bulk-intake" options={{ title: 'Bulk Donation', presentation: 'modal' }} />
        <Stack.Screen name="item-detail" options={{ title: 'Item Details', presentation: 'modal' }} />
        <Stack.Screen name="packing-checklist" options={{ title: 'Packing Checklist', presentation: 'card' }} />
        <Stack.Screen name="expiring-soon" options={{ title: 'Notifications', presentation: 'card' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports', presentation: 'card' }} />
        <Stack.Screen name="team" options={{ title: 'Team', presentation: 'card' }} />
        <Stack.Screen name="member" options={{ title: 'Member', presentation: 'card' }} />
        <Stack.Screen name="ready-boxes" options={{ title: 'Ready to go', presentation: 'card' }} />
        {/* Full-bleed camera, so no header and no cream background behind it. */}
        <Stack.Screen
          name="barcode-scan"
          options={{ headerShown: false, presentation: 'modal', contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="login" options={{ title: 'Log In', headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Sign Up', headerShown: false }} />
        <Stack.Screen name="pantry-selection" options={{ title: 'Join a Pantry', headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
      </Stack>
      ) : (
        // Brand-coloured hold rather than a white flash while state resolves.
        <View style={{ flex: 1, backgroundColor: COLORS.background }} />
      )}
      {/* First-visit tips, drawn above every screen and the tab bar. */}
      <SpotlightHost />
      {/* Sits above every screen. Non-interactive, so it never eats a tap. */}
      <GrainOverlay opacity={0.12} />
      {!splashDone && <BrandSplash hold={!ready} onDone={() => setSplashDone(true)} />}
    </SafeAreaProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
