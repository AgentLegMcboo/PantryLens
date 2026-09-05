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
  className,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body?: string;
  /** 'good' for "you're all clear", 'neutral' for "nothing here yet". */
  tone?: 'neutral' | 'good';
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const colour = tone === 'good' ? COLORS.statusGood : COLORS.textSecondary;

  return (
    <View className={cn('items-center px-8 py-16', className)}>
      {/* The disc is what keeps a lone glyph from reading as an error icon
          floating in white space. */}
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: tone === 'good' ? '#E8F0E6' : COLORS.surfaceContainer }}
      >
        <MaterialCommunityIcons name={icon} size={38} color={colour} />
      </View>

      <Text variant="title" className="mt-5 text-center">
        {title}
      </Text>

      {body ? (
        <Text variant="body" tone="soft" className="mt-2 text-center">
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" className="mt-5" onPress={onAction} />
      ) : null}
    </View>
  );
}
