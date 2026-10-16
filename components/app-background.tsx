import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAppAppearance } from '../lib/appearance';

/** Quiet, non-interactive artwork shared by every ordinary app screen. */
export function AppBackground() {
  const dark = useAppAppearance(s => s.scheme === 'dark');
  const canvas = dark ? '#141311' : '#F7F5F1';
  const end = dark ? '#191714' : '#F3F1EC';
  const warm = dark ? '#713923' : '#F6DCCF';
  const sage = dark ? '#3E5933' : '#E6EFD9';
  const sun = dark ? '#675024' : '#F1DFB9';
  return <Svg pointerEvents="none" accessible={false} width="100%" height="100%" style={StyleSheet.absoluteFill}>
    <Defs>
      <LinearGradient id="appCanvas" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={canvas} /><Stop offset="1" stopColor={end} /></LinearGradient>
      <RadialGradient id="appWarm"><Stop offset="0" stopColor={warm} stopOpacity="0.42" /><Stop offset="1" stopColor={warm} stopOpacity="0" /></RadialGradient>
      <RadialGradient id="appSage"><Stop offset="0" stopColor={sage} stopOpacity="0.28" /><Stop offset="1" stopColor={sage} stopOpacity="0" /></RadialGradient>
      <RadialGradient id="appSun"><Stop offset="0" stopColor={sun} stopOpacity="0.18" /><Stop offset="1" stopColor={sun} stopOpacity="0" /></RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#appCanvas)" />
    <Circle cx="2%" cy="3%" r="230" fill="url(#appWarm)" />
    <Circle cx="100%" cy="18%" r="250" fill="url(#appSage)" />
    <Circle cx="96%" cy="92%" r="270" fill="url(#appSun)" />
  </Svg>;
}
