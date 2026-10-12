import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { implicitAuthClient, supabase } from './supabase';

// Lets the in-app browser hand control back to the app after the redirect.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Supabase sends the volunteer after Google approves them.
 *
 *  - Expo Go:      exp://192.168.x.x:8081/--/auth/callback   (host changes per network)
 *  - Dev/prod app: pantrylens://auth/callback
 *
 * IMPORTANT: this exact URL must be in Supabase → Authentication → URL
 * Configuration → Redirect URLs. If it isn't, Supabase silently falls back to
 * the Site URL — which is why sign-in was landing on localhost:3000.
 *
 * Google itself never sees this URL. Google redirects to Supabase's own
 * /auth/v1/callback, and Supabase redirects here, so nothing needs adding to
 * the Google Cloud console beyond the Supabase callback.
 *
 * The scheme is deliberately NOT passed to makeRedirectUri. expo-auth-session
 * picks the right base for wherever the app is running — forcing `pantrylens://`
 * would break Expo Go, which can only be reached over exp://. The native scheme
 * comes from app.json when this runs in a real build.
 */
export const oauthRedirectUri = makeRedirectUri({ path: 'auth/callback' });

export class OAuthCancelled extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'OAuthCancelled';
  }
}

/** Pulls params from either the query string or the fragment. */
function readCallbackParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  // Implicit-flow responses arrive in the fragment; merge them in so this works
  // regardless of which flow the project is configured for.
  if (parsed.hash.length > 1) {
    for (const [k, v] of new URLSearchParams(parsed.hash.slice(1))) params.set(k, v);
  }
  return params;
}

/**
 * Opens Google in a system browser sheet and turns the redirect into a session.
 * Resolves with the session, or throws OAuthCancelled if the user backed out.
 */
/**
 * Supabase will not redirect to a private LAN address — `exp://192.168.x.x`,
 * `10.x`, `172.16–31.x` — even when the exact URL is allow-listed; it falls back
 * to the Site URL instead, so the volunteer is dropped on a dead page. Loopback
 * (an emulator with `adb reverse`) and hostnames (`expo start --tunnel`) work.
 * Expo Go over plain LAN can't, so say so up front.
 */
function isPrivateLanRedirect(uri: string): boolean {
  const host = uri.match(/^exp:\/\/([^:/]+)/)?.[1] ?? '';
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export async function signInWithGoogle() {
  if (isPrivateLanRedirect(oauthRedirectUri)) {
    throw new Error(
      `Google sign-in can't return to ${oauthRedirectUri} — Supabase won't redirect to a LAN address. ` +
        'Start Expo with --tunnel, use the emulator, or sign in with email and password.',
    );
  }

  // Expo Go only: see implicitAuthClient in lib/supabase.ts for why.
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const client = inExpoGo ? implicitAuthClient : supabase;

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: oauthRedirectUri,
      // We open the browser ourselves so we can read the redirect back.
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return a Google sign-in URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectUri);

  if (result.type === 'cancel' || result.type === 'dismiss') throw new OAuthCancelled();
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in did not complete.');
  }

  const params = readCallbackParams(result.url);

  const errorDescription = params.get('error_description') ?? params.get('error');
  if (errorDescription) throw new Error(errorDescription);

  // PKCE (what this app uses): exchange the one-time code for a session.
  const code = params.get('code');
  if (code) {
    const { data: exchanged, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return exchanged.session;
  }

  // Implicit fallback, in case the project is switched off PKCE later.
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { data: set, error: setError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (setError) throw setError;
    return set.session;
  }

  throw new Error(
    'Google redirected back without a code. Check that the redirect URL is allow-listed in Supabase.',
  );
}
