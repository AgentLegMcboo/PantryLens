import React from 'react';
import { View } from 'react-native';
import { TYPOGRAPHY } from '../../constants/theme';
import { Text } from './text';

export function PageHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-4">
      <View style={{ gap: 6, flex: 1, minWidth: 200 }}>
        {eyebrow ? <Text variant="micro" tone="soft" className="font-medium">{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={TYPOGRAPHY.pageTitle}>{title}</Text>
        {description ? <Text variant="label" tone="soft">{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}
