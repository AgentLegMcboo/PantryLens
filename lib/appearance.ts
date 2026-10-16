import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { colorScheme } from 'nativewind';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppAppearance = 'auto' | 'light' | 'dark';
type AppearanceState = {
  mode: AppAppearance;
  scheme: 'light' | 'dark';
  setMode: (mode: AppAppearance) => void;
};

function applyMode(mode: AppAppearance) {
  colorScheme.set(mode === 'auto' ? 'system' : mode);
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export const useAppAppearance = create<AppearanceState>()(persist((set) => ({
  mode: 'auto',
  scheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  setMode: mode => set({ mode, scheme: applyMode(mode) }),
}), {
  name: 'pantrylens-appearance',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: state => ({ mode: state.mode }),
  onRehydrateStorage: () => state => {
    if (state) useAppAppearance.setState({ scheme: applyMode(state.mode) });
  },
}));

Appearance.addChangeListener(({ colorScheme: scheme }) => {
  const mode = useAppAppearance.getState().mode;
  useAppAppearance.setState({ scheme: mode === 'auto' ? (scheme === 'dark' ? 'dark' : 'light') : mode });
});
