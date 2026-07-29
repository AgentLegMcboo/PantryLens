import { HeaderHeightContext } from '@react-navigation/elements';
import React, { useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * The scrolling container every screen with a text field should use.
 *
 * Three things it fixes, all of which were missing app-wide:
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
  style,
  contentContainerStyle,
  ...rest
}: ScrollViewProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  // Null outside a navigator that renders a header (tab screens, modals with
  // headerShown: false), in which case there is nothing to offset by.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        style={style}
        contentContainerStyle={contentContainerStyle}
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
