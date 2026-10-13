import * as React from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const scroll = React.useRef<ScrollView>(null);

  // A tab opens at its top every time you switch to it. The jump back is made
  // while the tab is out of view (blur), so it's never seen. Tabs only: coming
  // back from a pushed screen keeps your place. Inventory isn't a Screen — it
  // keeps its own scroll position on purpose.
  const navigation = React.useContext(NavigationContext);
  const inTab = navigation?.getState?.()?.type === 'tab';
  const insets = useSafeAreaInsets();
  React.useEffect(() => {
    if (!navigation || navigation.getState?.()?.type !== 'tab') return;
    return navigation.addListener('blur', () => {
      scroll.current?.scrollTo({ y: 0, animated: false });
    });
  }, [navigation]);

  return (
    <ScrollView
      ref={scroll}
      className={cn('flex-1 bg-canvas', className)}
      contentContainerClassName={cn('px-gutter pt-gutter gap-gap', contentContainerClassName)}
      // A short tail, not a screen's worth of empty cream. A tab already ends
      // above the tab bar; a pushed screen also clears the home indicator.
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[{ paddingBottom: 24 + (inTab ? 0 : insets.bottom) }, props.contentContainerStyle]}
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
