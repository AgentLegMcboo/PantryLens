import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { COLORS } from '../../constants/theme';
import { useOpaqueGlass } from '../../lib/glass-preferences';

function nativeGlassAvailable() {
  if (Platform.OS !== 'ios') return false;
  try { return isGlassEffectAPIAvailable() && isLiquidGlassAvailable(); }
  catch { return false; }
}

/** Decorative material only. Content and interaction stay in ordinary native views. */
export function GlassBackdrop({ radius = 28, material = 'regular' }: { radius?: number; material?: 'clear' | 'regular' }) {
  const opaque = useOpaqueGlass();
  const nativeGlass = !opaque && nativeGlassAvailable();

  return (
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      {nativeGlass ? (
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle={material} colorScheme="light" tintColor="rgba(245,234,223,0.10)" />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]} />}
      <View style={[StyleSheet.absoluteFill, {
        borderRadius: radius, borderWidth: 1,
        borderColor: nativeGlass ? 'rgba(205,180,152,0.35)' : COLORS.borderStrong,
        borderTopColor: nativeGlass ? 'rgba(255,255,255,0.65)' : COLORS.borderStrong,
      }]} />
    </View>
  );
}

export function GlassSurface({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.surface, style]}>
      <GlassBackdrop material="clear" />
    {children}
  </View>;
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 28,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
});
