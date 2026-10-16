import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import { COLORS } from '../constants/theme';
import { useAppAppearance, type AppAppearance } from '../lib/appearance';
import { Tappable } from './motion';
import { Sheet } from './ui/sheet';
import { Row } from './ui/row';
import { GlassBackdrop } from './ui/glass-surface';

export function AppearanceControl() {
  const { mode, setMode } = useAppAppearance();
  const [open, setOpen] = useState(false);
  const choices: { mode: AppAppearance; label: string; icon: 'theme-light-dark' | 'white-balance-sunny' | 'weather-night'; hint: string }[] = [
    { mode: 'auto', label: 'Automatic', icon: 'theme-light-dark', hint: 'Follow your iPhone’s appearance' },
    { mode: 'light', label: 'Light', icon: 'white-balance-sunny', hint: 'Always use the light palette' },
    { mode: 'dark', label: 'Dark', icon: 'weather-night', hint: 'Always use the dark palette' },
  ];
  return <>
    <Tappable accessibilityRole="button" accessibilityLabel={`Appearance: ${mode}. Choose Light, Dark, or Automatic`} onPress={() => setOpen(true)} className="h-12 w-12 items-center justify-center rounded-full bg-transparent">
      <GlassBackdrop radius={24} material="clear" />
      <MaterialCommunityIcons name={choices.find(c => c.mode === mode)!.icon} size={22} color={COLORS.textPrimary} />
    </Tappable>
    <Sheet visible={open} onClose={() => setOpen(false)} title="Appearance">
      <View>{choices.map(choice => <Row key={choice.mode} icon={choice.icon} label={`${choice.label}${mode === choice.mode ? ' ✓' : ''}`} hint={choice.hint} onPress={() => { setMode(choice.mode); setOpen(false); }} />)}</View>
    </Sheet>
  </>;
}
