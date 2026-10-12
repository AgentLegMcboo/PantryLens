import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { Text } from './text';

/**
 * Nothing to show, said kindly.
 *
 * Every list in the app had its own version of this and they disagreed about
 * everything — one shouted "No Expiring Items Found!" in green, another said
 * nothing at all. An empty list is usually good news or a dead end, and which
 * one it is should be legible at a glance: `tone` picks the icon colour, and the
 * body is written as a next step rather than a status.
 */
export function EmptyState({
  icon,
  title,
  body,
  tone = 'neutral',
  actionLabel,
  onAction,
  actionVariant = 'secondary',
  children,
  className,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body?: string;
  /** 'good' for "you're all clear", 'neutral' for "nothing here yet". */
  tone?: 'neutral' | 'good';
  actionLabel?: string;
  onAction?: () => void;
  /** 'primary' when the action is the one obvious next step, not merely an escape. */
  actionVariant?: 'primary' | 'secondary';
  /** Anything that explains the empty space better than a sentence, like a short how-it-works. */
  children?: React.ReactNode;
  className?: string;
}) {
  const colour = tone === 'good' ? COLORS.statusGood : COLORS.textSecondary;

  return (
    <View className={cn('items-center px-8 py-16', className)}>
      {/* The disc is what keeps a lone glyph from reading as an error icon
          floating in white space. */}
      <View
        className="h-20 w-20 items-center justify-center rounded-2xl"
        style={{ backgroundColor: tone === 'good' ? '#E8F0E6' : COLORS.surfaceContainer }}
      >
        <MaterialCommunityIcons name={icon} size={38} color={colour} />
      </View>

      <Text variant="title" className="mt-5 text-center">
        {title}
      </Text>

      {body ? (
        // Capped width, so a sentence wraps into a readable block instead of
        // one long line on a wide screen.
        <Text variant="body" tone="soft" className="mt-2 max-w-[320px] text-center">
          {body}
        </Text>
      ) : null}

      {children}

      {actionLabel && onAction ? (
        // self-center matters: Button is `self-start` by default, which beats
        // this container's items-center. Without it, every empty state's button
        // sat against the left edge, on six screens.
        <Button
          label={actionLabel}
          variant={actionVariant}
          className="mt-6 self-center"
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}
