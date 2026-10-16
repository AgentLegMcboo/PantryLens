import AsyncStorage from '@react-native-async-storage/async-storage';
import { fw } from '../constants/theme';
import { create } from 'zustand';

const SENIOR_MODE_KEY = 'pantrylens.senior_mode.v1';

interface AccessibilityState {
  seniorMode: boolean;
  isLoaded: boolean;
  setSeniorMode: (enabled: boolean) => Promise<void>;
  toggleSeniorMode: () => Promise<void>;
}

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  seniorMode: false,
  isLoaded: false,
  setSeniorMode: async (enabled: boolean) => {
    set({ seniorMode: enabled });
    await AsyncStorage.setItem(SENIOR_MODE_KEY, enabled ? '1' : '0').catch(() => {});
  },
  toggleSeniorMode: async () => {
    const next = !get().seniorMode;
    await get().setSeniorMode(next);
  },
}));

// Hydrate from storage on launch
AsyncStorage.getItem(SENIOR_MODE_KEY)
  .then((val) => {
    if (val !== null) {
      useAccessibilityStore.setState({ seniorMode: val === '1', isLoaded: true });
    } else {
      useAccessibilityStore.setState({ isLoaded: true });
    }
  })
  .catch(() => {
    useAccessibilityStore.setState({ isLoaded: true });
  });

/**
 * Calculates typography and contrast adjustments for older adults when Senior Mode is active.
 *
 * Bumps font sizes by ~20%, bolds labels, and turns soft grey text into high-contrast charcoal
 * for effortless reading under warehouse fluorescent lighting or without reading glasses.
 */
export function getSeniorTextStyle(variant?: string | null, tone?: string | null) {
  let fontSize = 19;
  let lineHeight = 26;
  let fontWeight: '600' | '700' | '800' | undefined = '600';

  switch (variant) {
    case 'micro':
      fontSize = 15;
      lineHeight = 21;
      fontWeight = '600';
      break;
    case 'label':
      fontSize = 17;
      lineHeight = 23;
      fontWeight = '700';
      break;
    case 'body':
      fontSize = 19;
      lineHeight = 26;
      fontWeight = '600';
      break;
    case 'heading':
      fontSize = 22;
      lineHeight = 29;
      fontWeight = '700';
      break;
    case 'title':
      fontSize = 26;
      lineHeight = 33;
      fontWeight = '800';
      break;
    case 'headline':
      fontSize = 30;
      lineHeight = 37;
      fontWeight = '800';
      break;
    case 'display':
      fontSize = 35;
      lineHeight = 43;
      fontWeight = '800';
      break;
    default:
      fontSize = 19;
      lineHeight = 26;
      fontWeight = '600';
      break;
  }

  const style: Record<string, any> = {
    fontSize,
    lineHeight,
  };

  if (fontWeight) {
    style.fontWeight = fw(fontWeight);
  }

  // High contrast for senior eyes: soft grey becomes crisp charcoal. Default
  // text is left alone — it is already ink, and forcing a colour here
  // overrode white text set by className (the Build hero went black).
  if (tone === 'soft') {
    style.color = '#2B2420';
  }

  return style;
}
