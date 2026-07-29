import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Tactile and audible feedback.
 *
 * Both channels are off-by-default-able and remembered, because the real user
 * is a volunteer in a noisy back room who may well have the phone on silent.
 * Nothing here ever blocks or throws into the UI — feedback failing must never
 * take an action down with it.
 */

type Cue = 'tap' | 'success' | 'warn';

const SOURCES: Record<Cue, number> = {
  tap: require('../assets/sounds/tap.wav'),
  success: require('../assets/sounds/success.wav'),
  warn: require('../assets/sounds/warn.wav'),
};

const KEYS = { haptics: 'pantrylens.haptics', sound: 'pantrylens.sound' };

let hapticsEnabled = true;
// Sound is opt-in: a pantry back room is loud, and unexpected noise from a
// shared phone is worse than no noise at all.
let soundEnabled = false;

const players: Partial<Record<Cue, AudioPlayer>> = {};
let audioReady = false;

async function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  try {
    // Mixes with other audio and respects the ringer switch rather than
    // hijacking playback.
    await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false });
    for (const cue of Object.keys(SOURCES) as Cue[]) {
      const player = createAudioPlayer(SOURCES[cue]);
      player.volume = 0.35;
      players[cue] = player;
    }
  } catch {
    audioReady = false;
  }
}

/** Restores saved preferences. Call once at app start. */
export async function loadFeedbackPrefs() {
  try {
    const [h, s] = await AsyncStorage.multiGet([KEYS.haptics, KEYS.sound]);
    if (h[1] !== null) hapticsEnabled = h[1] === '1';
    if (s[1] !== null) soundEnabled = s[1] === '1';
  } catch {
    // Defaults are fine.
  }
  if (soundEnabled) ensureAudio();
}

export const getFeedbackPrefs = () => ({ hapticsEnabled, soundEnabled });

export async function setHapticsEnabled(next: boolean) {
  hapticsEnabled = next;
  await AsyncStorage.setItem(KEYS.haptics, next ? '1' : '0').catch(() => {});
  if (next) Haptics.selectionAsync().catch(() => {});
}

export async function setSoundEnabled(next: boolean) {
  soundEnabled = next;
  await AsyncStorage.setItem(KEYS.sound, next ? '1' : '0').catch(() => {});
  if (next) {
    await ensureAudio();
    play('tap'); // immediate confirmation of what they just turned on
  }
}

function play(cue: Cue) {
  if (!soundEnabled) return;
  const player = players[cue];
  if (!player) return;
  try {
    player.seekTo(0);
    player.play();
  } catch {
    // A dropped cue is not worth surfacing.
  }
}

function vibrate(style: Haptics.ImpactFeedbackStyle) {
  // Haptics are a no-op on web and would throw on some Android builds.
  if (!hapticsEnabled || Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
}

/** Light tick for ordinary taps: chips, steppers, list rows. */
export function cueTap() {
  vibrate(Haptics.ImpactFeedbackStyle.Light);
  play('tap');
}

/** Firmer tick for committing something: a primary button press. */
export function cuePress() {
  vibrate(Haptics.ImpactFeedbackStyle.Medium);
  play('tap');
}

/** Something was written: items added, lot saved, boxes built. */
export function cueSuccess() {
  if (hapticsEnabled && Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
  play('success');
}

/** Something needs a human: low confidence, damaged stock, a blocked action. */
export function cueWarn() {
  if (hapticsEnabled && Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
  play('warn');
}
