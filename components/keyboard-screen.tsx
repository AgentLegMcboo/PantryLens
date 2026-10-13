// Not from '@react-navigation/elements' directly: since SDK 56, Expo Router
// vendors React Navigation and no longer supports application code importing the
// external packages. The runtime API is identical — only the module specifier
// moved. It was always the more honest import anyway, since
// @react-navigation/elements was a transitive dependency this project never
// declared.
import { HeaderHeightContext, NavigationContext } from 'expo-router/react-navigation';
import React, { useContext, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
} from 'react-native';
import { cn } from '../lib/cn';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * `Screen`, for pages that contain a text field.
 *
 * It carries the same gutter, the same rhythm between blocks and the same cream
 * ground as components/ui/screen.tsx — a form should not be a differently
 * proportioned page just because it takes typing — and adds the three keyboard
 * behaviours that were missing app-wide:
 *
 *  - iOS does not move content for the keyboard on its own, so a field near the
 *    bottom (the weight entry, the expiration field, the password) ended up
 *    underneath it with no way to scroll to it.
 *  - Tapping a button while the keyboard is open used to be swallowed as a
 *    dismiss, so volunteers had to tap twice. `keyboardShouldPersistTaps` makes
 *    the first tap count.
 *  - Screens pushed inside the stack sit below a header, and the avoiding view
 *    has to know its height or it over-shifts by exactly that much.
 *
 * Android is left to its own `adjustResize` behaviour, which Expo enables by
 * default and which already handles this correctly.
 */
export function KeyboardScreen({
  children,
  className,
  contentContainerClassName,
  ...rest
}: ScrollViewProps & { children: React.ReactNode }) {
  // Null outside a navigator that renders a header (tab screens, modals with
  // headerShown: false), in which case there is nothing to offset by.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  // Same as Screen: a tab (Settings) opens at its top each time, reset while
  // it's out of view; a pushed form keeps its place.
  const scroll = useRef<ScrollView>(null);
  const navigation = useContext(NavigationContext);
  const inTab = navigation?.getState?.()?.type === 'tab';
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!navigation || navigation.getState?.()?.type !== 'tab') return;
    return navigation.addListener('blur', () => {
      scroll.current?.scrollTo({ y: 0, animated: false });
    });
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        ref={scroll}
        className={cn('flex-1 bg-canvas', className)}
        contentContainerClassName={cn(
          'px-gutter pt-gutter gap-gap',
          contentContainerClassName,
        )}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        {...rest}
        // A short tail; a pushed form also clears the home indicator.
        contentContainerStyle={[{ paddingBottom: 24 + (inTab ? 0 : insets.bottom) }, rest.contentContainerStyle]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
