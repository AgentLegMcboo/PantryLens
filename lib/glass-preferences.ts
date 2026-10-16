import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Prefer an opaque surface until the device's accessibility settings are known. */
export function useOpaqueGlass() {
  const [opaque, setOpaque] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const queries = [
        window.matchMedia('(prefers-reduced-transparency: reduce)'),
        window.matchMedia('(prefers-contrast: more)'),
        window.matchMedia('(forced-colors: active)'),
      ];
      const update = () => setOpaque(queries.some(query => query.matches));
      update();
      queries.forEach(query => query.addEventListener('change', update));
      return () => queries.forEach(query => query.removeEventListener('change', update));
    }

    let active = true;
    const readPreference = Platform.OS === 'ios'
      ? AccessibilityInfo.isReduceTransparencyEnabled()
      : Platform.OS === 'android'
        ? AccessibilityInfo.isHighTextContrastEnabled()
        : Promise.resolve(true);
    readPreference.then(value => { if (active) setOpaque(value); }).catch(() => {});
    const listener = Platform.OS === 'ios'
      ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque)
      : Platform.OS === 'android'
        ? AccessibilityInfo.addEventListener('highTextContrastChanged', setOpaque)
        : null;
    return () => { active = false; listener?.remove(); };
  }, []);

  // Text size and transparency are independent preferences. Keep larger text
  // available with glass, but always honor the system's contrast/transparency setting.
  return opaque;
}
