import React from 'react';
import { Pressable, View, useWindowDimensions, type ViewProps } from 'react-native';
import { useAccessibilityStore } from '../../lib/accessibility';

/** Text and actions need separate lines on a phone or with enlarged text. */
export function useRoomyLayout(breakpoint = 520) {
  const { width, fontScale } = useWindowDimensions();
  const largeText = useAccessibilityStore(state => state.seniorMode);
  return width < breakpoint || fontScale > 1.15 || largeText;
}

export function ResponsiveRow({ children, style, ...props }: ViewProps) {
  const stacked = useRoomyLayout();
  return <View {...props} style={[style, { width: '100%', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', gap: 12, flexWrap: stacked ? 'nowrap' : 'wrap' }]}>
    {React.Children.map(children, child => {
      if (!stacked || !React.isValidElement<any>(child) || (child.type !== View && child.type !== Pressable)) return child;
      const sizing = { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' as const, alignSelf: 'stretch' as const, width: '100%' as const };
      const element = child as React.ReactElement<{ style?: any }>;
      const previous = element.props.style;
      return React.cloneElement(element, { style: typeof previous === 'function' ? (state: any) => [previous(state), sizing] : [previous, sizing] });
    })}
  </View>;
}
