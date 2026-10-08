// Not from '@react-navigation/elements' directly: since SDK 56, Expo Router
// vendors React Navigation and no longer supports application code importing the
// external packages. The runtime API is identical — only the module specifier
// moved. It was always the more honest import anyway, since
// @react-navigation/elements was a transitive dependency this project never
// declared.
import { HeaderHeightContext } from 'expo-router/react-navigation';
import React, { useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
} from 'react-native';
import { cn } from '../lib/cn';
import { useWorkspaceLayout } from './workspace-layout';

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
  const { gutter } = useWorkspaceLayout();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        className={cn('flex-1 bg-canvas', className)}
        contentContainerClassName={cn(
          'w-full max-w-[1200px] self-center pb-12 gap-6',
          contentContainerClassName,
        )}
        contentContainerStyle={{paddingHorizontal:gutter,paddingTop:gutter}}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
