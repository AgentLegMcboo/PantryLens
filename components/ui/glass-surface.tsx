import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../constants/theme';
import { useOpaqueGlass } from '../../lib/glass-preferences';
import { useAppAppearance } from '../../lib/appearance';

function nativeGlassAvailable() {
  if (Platform.OS !== 'ios') return false;
  try { return isGlassEffectAPIAvailable() && isLiquidGlassAvailable(); }
  catch { return false; }
}

/** Decorative material only. Content and interaction stay in ordinary native views. */
export function GlassBackdrop({ radius = 28, material = 'regular' }: { radius?: number; material?: 'clear' | 'regular' }) {
  const scheme = useAppAppearance(state => state.scheme);
  const opaque = useOpaqueGlass();
  const nativeGlass = !opaque && nativeGlassAvailable();

  return (
    <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      {nativeGlass ? (
        <GlassView style={StyleSheet.absoluteFill} glassEffectStyle={material} colorScheme={scheme}
          tintColor={scheme === 'dark' ? 'rgba(24,25,28,0.28)' : 'rgba(255,255,255,0.18)'} />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.cardSurface }]} />}
      {nativeGlass && <LinearGradient
        colors={scheme === 'dark'
          ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)']
          : ['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.18)']}
        locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, {
        borderRadius: radius, borderWidth: 1,
        borderColor: nativeGlass ? (scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.55)') : COLORS.borderStrong,
        borderTopColor: nativeGlass ? (scheme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.90)') : COLORS.borderStrong,
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
    shadowColor: '#000000',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});
