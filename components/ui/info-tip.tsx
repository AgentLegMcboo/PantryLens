import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cueTap } from '../../lib/feedback';
import { Text } from './text';

/**
 * A label with an ⓘ that reveals its explanation only when tapped.
 *
 * Screens had a sentence of small print under almost every heading; most
 * people never need it twice. The label stays short and bold, and the
 * sentence is one tap away for whoever wonders. Tapping again (or the bubble)
 * closes it.
 */
export function InfoLabel({
  label,
  tip,
  variant = 'label',
  right,
}: {
  label: string;
  tip: string;
  variant?: 'label' | 'body';
  /** Anything that sits at the end of the label row, like a control. */
  right?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = () => {
    cueTap();
    setOpen(o => !o);
  };
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Text variant={variant} className="font-bold">
          {label}
        </Text>
        <Pressable
          onPress={toggle}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={open ? `Hide: ${tip}` : `About ${label}`}
          accessibilityState={{ expanded: open }}
        >
          <MaterialCommunityIcons
            name={open ? 'information' : 'information-outline'}
            size={17}
            color={open ? COLORS.primary : COLORS.textSecondary}
          />
        </Pressable>
        <View className="flex-1" />
        {right}
      </View>
      {open && (
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel="Close">
          <View className="self-start rounded-md px-3 py-2" style={{ backgroundColor: COLORS.textPrimary, maxWidth: 320 }}>
            <Text variant="micro" style={{ color: COLORS.textOnPrimary }}>
              {tip}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
