import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { View } from 'react-native';
import { COLORS } from '../constants/theme';
import { Text } from './ui';

/**
 * The PantryLens logo at header size: the camera-iris tile and the wordmark.
 *
 * One component so every screen that shows the logo shows the SAME logo — the
 * pantry setup screen had drifted to a house icon at a different size while
 * onboarding used the iris. The wordmark is the splash's (components/
 * brand-splash.tsx): system sans at 800 with tight tracking, scaled down.
 */
export function BrandMark() {
  return (
    <View className="flex-row items-center gap-2.5" accessibilityRole="header" accessibilityLabel="PantryLens">
      <View className="h-8 w-8 items-center justify-center rounded-md bg-brand">
        <MaterialCommunityIcons name="camera-iris" size={17} color={COLORS.textOnPrimary} />
      </View>
      <Text
        style={{
          fontSize: 19,
          lineHeight: 24,
          fontWeight: '800',
          letterSpacing: -0.4,
          color: COLORS.textPrimary,
        }}
      >
        PantryLens
      </Text>
    </View>
  );
}
