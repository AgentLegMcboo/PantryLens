import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cueTap } from '../../lib/feedback';
import { cn } from '../../lib/cn';
import { Text } from './text';

/**
 * A labelled line with a control on the end.
 *
 * Settings, item metadata and the pantry menu were each drawing this by hand at
 * a different height with a different divider, which is why Settings read as a
 * spreadsheet: nine rows, no two the same. One row, 56px minimum, and the
 * divider belongs to the row above rather than being drawn around the group.
 */
export function Row({
  icon,
  label,
  hint,
  right,
  onPress,
  tone,
  divider = true,
  className,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  tone?: 'critical';
  /** Hairline under the row. Turn it off on the last of a group. */
  divider?: boolean;
  className?: string;
}) {
  const colour = tone === 'critical' ? COLORS.statusCritical : COLORS.textPrimary;
  // The glyph is brand-tinted rather than ink, matching the dashboard's activity
  // rows — a disc of dark grey on cream reads as disabled.
  const glyphColour = tone === 'critical' ? COLORS.statusCritical : COLORS.primaryLight;

  const body = (
    <View
      className={cn(
        'min-h-[56px] flex-row items-center gap-3 py-2',
        divider && 'border-b border-hairline',
        className,
      )}
    >
      {icon ? (
        <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
          <MaterialCommunityIcons name={icon} size={18} color={glyphColour} />
        </View>
      ) : null}

      <View className="flex-1">
        <Text variant="body" className="font-semibold" style={{ color: colour }}>
          {label}
        </Text>
        {hint ? (
          <Text variant="micro" tone="soft" className="mt-0.5">
            {hint}
          </Text>
        ) : null}
      </View>

      {right ??
        (onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
        ) : null)}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        cueTap();
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
}

/**
 * On/off switch in the brand's green.
 *
 * Left as the platform control on purpose — a toggle is one of the few things a
 * volunteer already knows how to read without being taught, and a bespoke one
 * would only be a worse version of it. Only the colours are ours.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      accessibilityLabel={accessibilityLabel}
      onValueChange={next => {
        cueTap();
        onValueChange(next);
      }}
      trackColor={{ true: COLORS.secondary, false: COLORS.borderStrong }}
      thumbColor={Platform.OS === 'android' ? COLORS.cardSurface : undefined}
      ios_backgroundColor={COLORS.borderStrong}
    />
  );
}
