import * as React from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Text } from './text';

/**
 * The standard page body: one gutter, one rhythm between blocks.
 *
 * Screens were setting `padding: SPACING.md` (16) at the page edge and 8px
 * between cards, which is what made everything feel pressed against the glass
 * and against each other. 20px at the edge and 16px between is the whole fix.
 */
export function Screen({ className, contentContainerClassName, ...props }: ScrollViewProps & {
  contentContainerClassName?: string;
}) {
  return (
    <ScrollView
      className={cn('flex-1 bg-canvas', className)}
      contentContainerClassName={cn('px-gutter pt-gutter pb-24 gap-gap', contentContainerClassName)}
      showsVerticalScrollIndicator={false}
      {...props}
    />
  );
}

/** A labelled group. Replaces the ad-hoc `sectionHeader` styles. */
export function Section({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('gap-3', className)}>
      {title ? (
        <Text variant="label" tone="soft" className="font-semibold">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
