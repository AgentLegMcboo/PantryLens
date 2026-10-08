import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { Text } from './ui';
import { AppHeader } from './app-header';
import { useWorkspaceLayout } from './workspace-layout';
import { cueTap } from '../lib/feedback';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export const MAIN_NAV: { id: string; label: string; mobile: string; icon: IconName; activeIcon: IconName }[] = [
  { id: 'index', label: 'Home', mobile: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { id: 'inventory', label: 'Inventory', mobile: 'Inventory', icon: 'archive-outline', activeIcon: 'archive' },
  { id: 'build', label: 'Build boxes', mobile: 'Boxes', icon: 'package-variant-closed', activeIcon: 'package-variant-closed' },
  { id: 'needs', label: 'Donation needs', mobile: 'Needs', icon: 'heart-outline', activeIcon: 'heart' },
];

export function AppShell({ active, onSelect, children, preview = false }: {
  active: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
  preview?: boolean;
}) {
  const { desktop, gutter } = useWorkspaceLayout();
  const insets = useSafeAreaInsets();
  const title = MAIN_NAV.find(n => n.id === active)?.label ?? (active === 'settings' ? 'Settings' : 'Pantry');
  const nav = (mobile: boolean) => MAIN_NAV.map(n => {
    const selected = active === n.id;
    return (
      <Pressable key={n.id} accessibilityRole="tab" accessibilityLabel={n.label} accessibilityState={{ selected }}
        onPress={() => { cueTap(); onSelect(n.id); }}
        style={({ pressed }) => ({ flex: 1, minHeight: mobile ? 52 : 48, flexDirection: mobile ? 'column' : 'row',
          alignItems: 'center', justifyContent: 'center', gap: mobile ? 3 : 9, opacity: pressed ? 0.6 : 1,
          borderBottomWidth: mobile ? 0 : 2, borderBottomColor: selected ? COLORS.primary : 'transparent',
          backgroundColor: !mobile && selected ? COLORS.primaryTint : 'transparent' })}>
        <MaterialCommunityIcons name={selected ? n.activeIcon : n.icon} size={mobile ? 23 : 19} color={selected ? COLORS.primary : COLORS.textSecondary} />
        <Text variant={mobile ? 'micro' : 'label'} tone={selected ? 'brand' : 'soft'} className={selected ? 'font-semibold' : 'font-medium'}>{mobile ? n.mobile : n.label}</Text>
      </Pressable>
    );
  });
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <AppHeader title={title} preview={preview} />
      {desktop && <View style={{ backgroundColor: COLORS.cardSurface, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft }}>
        <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: gutter, flexDirection: 'row' }}>{nav(false)}</View>
      </View>}
      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      {!desktop && <View style={{ flexDirection: 'row', paddingTop: 7, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: COLORS.cardSurface, borderTopWidth: 1, borderTopColor: COLORS.borderSoft }}>{nav(true)}</View>}
    </View>
  );
}
