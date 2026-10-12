import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * SecureStore rejects values over 2048 bytes. A Supabase session carrying a
 * Google ID token plus user_metadata (name, avatar URL) blows past that, so the
 * value is split across numbered keys and reassembled on read.
 *
 * Every method returns its promise — Supabase awaits these, and a fire-and-forget
 * write can lose the session on a fast app close.
 */
const CHUNK_SIZE = 1536;
const countKey = (key: string) => `${key}.chunks`;

async function clearChunks(key: string) {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const count = raw ? parseInt(raw, 10) : 0;
  const deletions: Promise<void>[] = [SecureStore.deleteItemAsync(countKey(key))];
  for (let i = 0; i < count; i++) deletions.push(SecureStore.deleteItemAsync(`${key}.${i}`));
  await Promise.all(deletions);
}

const ExpoSecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const raw = await SecureStore.getItemAsync(countKey(key));
    // No chunk header means either nothing stored, or a session written by an
    // older build that used a single key.
    if (!raw) return SecureStore.getItemAsync(key);

    const count = parseInt(raw, 10);
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    // A missing chunk means a torn write; treat the whole session as absent
    // rather than handing Supabase truncated JSON.
    if (parts.some((p) => p === null)) {
      await clearChunks(key);
      return null;
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key).catch(() => {}); // drop any legacy single-key value

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)));
    // Written last, so a crash mid-write leaves no header and reads as "no session".
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? AsyncStorage : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // The OAuth redirect is handled explicitly in lib/auth.ts, not by URL sniffing.
    detectSessionInUrl: false,
    // PKCE — the only safe OAuth flow for a public client that can keep no secret.
    // It returns ?code=... to be exchanged, NOT #access_token=... in the fragment.
    flowType: 'pkce',
  },
});

/**
 * A second, throwaway client used ONLY to start Google sign-in inside Expo Go.
 *
 * Expo Go on Android delivers the OAuth redirect twice — to the in-app browser
 * session and to the router as a deep link — and the browser session can pick
 * up a stale ?code= from an earlier attempt whose PKCE verifier has since been
 * replaced ("code challenge does not match previously saved code verifier").
 * With the implicit flow the redirect carries the tokens themselves, so a
 * duplicate or stale delivery cannot fail; lib/auth.ts hands them to the main
 * client with setSession. It keeps nothing of its own: no storage, no refresh.
 *
 * Real builds (pantrylens://) never use this — they stay on PKCE.
 */
export const implicitAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

