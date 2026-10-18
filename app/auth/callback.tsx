import { useAppAppearance } from '../../lib/appearance';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { log } from '../../lib/log';
import { usePantryStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';

/**
 * Where Google sign-in lands.
 *
 * On Android the redirect back from Supabase is delivered twice: once to the
 * in-app browser session in lib/auth.ts, which exchanges the code, and once to
 * the router as a deep link to this path. Without a screen here that second
 * delivery showed "Unmatched Route" on top of a sign-in that had worked.
 *
 * This waits a moment for the first delivery to finish. If no session appears
 * (the browser sheet was closed before it could), it exchanges the code itself.
 * The root layout treats this as an auth screen, so once a session exists it
 * routes onward on its own.
 */
export default function AuthCallback() {
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const session = usePantryStore(state => state.session);

  useEffect(() => {
    if (session) return;
    const timer = setTimeout(async () => {
      if (usePantryStore.getState().session) return;
      if (typeof code === 'string' && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return;
        log.warn('auth', 'callback code exchange failed', error.message);
      }
      router.replace('/login');
    }, 4000);
    return () => clearTimeout(timer);
  }, [code, router, session]);

  return (
    <View className="flex-1 items-center justify-center bg-transparent">
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}
