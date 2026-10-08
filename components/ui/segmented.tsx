import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';
import { usePressScale } from '../motion';
import { cueTap } from '../../lib/feedback';
import { cn } from '../../lib/cn';
import { Text } from './text';

/**
 * One question, two or three answers, all visible at once.
 *
 * Distinct from `Chip`, which filters a list and can be multi-select — this is
 * an either/or where seeing the road not taken is the point (join a pantry OR
 * start one; 14 OR 21 OR 30 days). The unselected options stay legible rather
 * than fading out, because they are the alternative, not disabled state.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: { value: T; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }[];
  value: T;
  onChange: (next: T) => void;
  /**
   * Shows the answer without offering to change it — for a setting somebody is
   * allowed to see but not to set. Deliberately not dimmed: the chosen option
   * is still information, and greying it out would make a live setting look
   * broken.
   */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('flex-row gap-1 rounded-lg bg-subtle p-1', className)}>
      {options.map(option => (
        <Tab
          key={String(option.value)}
          option={option}
          active={option.value === value}
          disabled={disabled}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

/**
 * One tab, as its own component so it can hold the press hook.
 *
 * The dip matters more here than on a row: the unselected tabs stay fully
 * legible by design, so without a press response there is no moment between
 * touching an option and the selection jumping to it.
 */
function Tab<T extends string | number>({
  option,
  active,
  disabled,
  onPress,
}: {
  option: { value: T; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap };
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const press = usePressScale(0.96);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => {
        if (!active && !disabled) press.onPressIn();
      }}
      onPressOut={press.onPressOut}
      onPress={() => {
        if (active) return;
        cueTap();
        onPress();
      }}
      className="min-h-[44px] flex-1"
    >
      <Animated.View
        style={press.style}
        className={cn(
          'min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-md px-2',
          // The lip again, so the selected tab reads as raised out of the
          // trough rather than merely tinted.
          active && 'border-b-[3px] border-brand-deep bg-brand',
        )}
      >
        {option.icon ? (
          <MaterialCommunityIcons
            name={option.icon}
            size={16}
            color={active ? COLORS.textOnPrimary : COLORS.textSecondary}
          />
        ) : null}
        <Text variant="label" tone={active ? 'on' : 'soft'} numberOfLines={1} className="font-bold">
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
