import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
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
  const desktop = useWindowDimensions().width >= 760;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1,justifyContent:desktop?'center':'flex-end',alignItems:desktop?'center':'stretch',backgroundColor:'rgba(43,36,32,0.35)'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss dialog" onPress={onClose} style={{position:'absolute',top:0,bottom:0,left:0,right:0}} />
        <View
          accessibilityViewIsModal
          className={cn('max-h-[85%] rounded-t-lg bg-card', className)}
          style={{ paddingBottom: insets.bottom + 16, width: desktop ? 540 : '100%', borderRadius:desktop?20:undefined }}
        >
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
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-md bg-subtle"
            >
              <MaterialCommunityIcons name="close" size={18} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-gutter pb-4 gap-3"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
