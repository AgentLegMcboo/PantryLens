import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { COLORS } from '../../constants/theme';
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
  className,
}: {
  options: { value: T; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row gap-1 rounded-lg bg-subtle p-1', className)}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              cueTap();
              onChange(option.value);
            }}
            className={cn(
              'min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-md px-2',
              active && 'bg-card',
            )}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {option.icon ? (
              <MaterialCommunityIcons
                name={option.icon}
                size={16}
                color={active ? COLORS.primary : COLORS.textSecondary}
              />
            ) : null}
            <Text
              variant="label"
              tone={active ? 'brand' : 'soft'}
              className="shrink text-center font-semibold"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
