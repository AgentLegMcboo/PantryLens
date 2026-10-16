import * as React from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { useTabOverlayInset } from '../../lib/tab-overlay';

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
  const tabOverlayInset = useTabOverlayInset();
  React.useEffect(() => {
    if (!navigation || navigation.getState?.()?.type !== 'tab') return;
    let focusedKey = navigation.getState().routes[navigation.getState().index]?.key;
    const stopFocus = navigation.addListener('focus', () => {
      const state = navigation.getState();
      focusedKey = state.routes[state.index]?.key;
    });
    const stopBlur = navigation.addListener('blur', () => {
      const state = navigation.getState();
      // A pushed page (such as Notifications) leaves the selected tab intact.
      // Only reset when the user actually selects a different tab.
      if (state.routes[state.index]?.key !== focusedKey) {
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
    });
    return () => { stopFocus(); stopBlur(); };
  }, [navigation]);

  return (
    <ScrollView
      ref={scroll}
      className={cn('flex-1 bg-transparent', className)}
      contentContainerClassName={cn('px-gutter pt-gutter gap-gap', contentContainerClassName)}
      // Content scrolls under the floating glass; the last control clears it.
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[{ paddingBottom: 24 + (inTab ? tabOverlayInset : insets.bottom) }, props.contentContainerStyle]}
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
