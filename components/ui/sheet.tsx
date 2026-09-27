import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';

/**
 * A bottom sheet for detail that would otherwise crowd a screen.
 *
 * The screens are built so the headline answer and the one action are legible
 * in a glance; everything that supports them — the per-category maths, the
 * generated flyer text — lives in here. It is one tap away and it is titled, so
 * nothing is hidden, it just is not competing.
 *
 * Capped at 85% height so the page behind stays visible: a sheet you can see
 * past reads as a layer over the screen rather than as a new screen.
 *
 * Three things about how it is built, each of which was once a bug:
 *
 *  - THE BACKDROP IS A SIBLING, NOT A PARENT. The sheet used to sit inside the
 *    tap-to-dismiss Pressable, with a second empty Pressable around its body to
 *    swallow taps. Both are touch responders wrapped around the ScrollView, so
 *    whether a swipe scrolled depended on where it started: on a stepper or a
 *    switch it scrolled, on bare space the wrapper claimed the touch and nothing
 *    moved. Behind the sheet instead of around it, the backdrop only ever gets
 *    touches that land outside the sheet.
 *  - THE BOTTOM INSET SCROLLS WITH THE CONTENT. Safe-area padding on the outer
 *    container was a fixed strip under the list that nothing could scroll past,
 *    so the last controls could end up permanently underneath it or under
 *    whatever the system draws there. As content padding, the last item can
 *    always be scrolled clear.
 *  - IT KNOWS ABOUT THE KEYBOARD AND THE SYSTEM BARS. The sheet rises above the
 *    keyboard on iOS, and the first tap on a button while typing counts instead
 *    of only dismissing the keyboard. On Android, which is always edge-to-edge
 *    from SDK 55, the modal is told to span the full screen, so the safe-area
 *    insets and the modal's own window are measured from the same edges.
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  className,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.fill}>
        {/* Behind the sheet. Taps outside it close; taps inside never reach it. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          className="bg-black/40"
        />

        {/* box-none so the empty space above the sheet still passes taps through
            to the backdrop instead of silently absorbing them. */}
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}
        >
          {/* `shrink` lets the sheet give up height when the keyboard takes it,
              so its header never gets pushed off the top of the screen. */}
          <View className={cn('max-h-[85%] shrink rounded-t-lg bg-canvas', className)}>
            <View className="items-center pt-3">
              <View className="h-1 w-10 rounded-full bg-outline" />
            </View>

            <View className="flex-row items-start gap-3 px-gutter pb-3 pt-4">
              <View className="flex-1">
                <Text variant="title">{title}</Text>
                {subtitle ? (
                  <Text variant="label" tone="soft" className="mt-1">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityLabel="Close"
                className="h-9 w-9 items-center justify-center rounded-full bg-subtle"
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
              contentContainerClassName="px-gutter gap-3"
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
});
