import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion,
  useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useAppAppearance } from '../lib/appearance';
import { SPRING_NOTIFICATION } from '../lib/motion-physics';
import { PRESS_SCALE_ROW, Tappable } from './motion';
import { Text } from './ui/text';

/** A root-level banner: only the bubble intercepts touches, never the screen. */
export function TopNotificationBubble({ visible, message, detail, onClose, onPress, onDismiss }: {
  visible: boolean;
  message: string;
  detail: string;
  onClose: () => void;
  onPress: () => void;
  onDismiss?: () => void;
}) {
  useAppAppearance(state => state.scheme);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const height = useSharedValue(180);
  const measured = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const pendingDismiss = useRef(false);
  const content = useRef({ message, detail });
  if (visible) content.current = { message, detail };

  const finishClose = useCallback(() => {
    if (visibleRef.current) return;
    measured.current = false;
    setMounted(false);
  }, []);

  useEffect(() => {
    if (!mounted && pendingDismiss.current) {
      pendingDismiss.current = false;
      dismissRef.current?.();
    }
  }, [mounted]);

  const enter = () => {
    progress.value = reduceMotion
      ? withTiming(1, { duration: 200, reduceMotion: ReduceMotion.Never })
      : withSpring(1, SPRING_NOTIFICATION);
  };

  useEffect(() => {
    if (visible) {
      pendingDismiss.current = true;
      setMounted(true);
      if (measured.current) enter();
    } else if (mounted) {
      progress.value = withTiming(0, {
        duration: 150, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never,
      }, finished => { if (finished) runOnJS(finishClose)(); });
    }
    // The transition follows visibility; content updates don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion]);

  const animation = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, progress.value)),
    transform: reduceMotion ? [] : [{ translateY: -(height.value + insets.top + 8) * (1 - progress.value) }],
  }));

  if (!mounted) return null;
  return (
    <View testID="top-notification-host" pointerEvents="box-none" style={{
      position: 'absolute', top: insets.top + 8, left: 16, right: 16,
      alignItems: 'center', zIndex: 100, elevation: 20,
    }}>
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        onLayout={event => {
          if (event.nativeEvent.layout.height <= 0) return;
          height.value = event.nativeEvent.layout.height;
          if (!measured.current && visibleRef.current) {
            measured.current = true;
            enter();
          }
        }}
        style={[{
          width: '100%', maxWidth: 600, padding: 12, borderRadius: 24,
          backgroundColor: COLORS.cardSurface, borderWidth: 1, borderColor: COLORS.borderSoft,
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)', flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        }, animation]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Tappable
          scaleTo={PRESS_SCALE_ROW}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`From your team. ${content.current.message}. ${content.current.detail}. See needs.`}
          style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="bullhorn-outline" size={22} color={COLORS.textOnAccent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="micro" tone="soft" className="font-semibold">From your team</Text>
            <Text variant="body" className="font-semibold" numberOfLines={3}>{content.current.message}</Text>
            <Text variant="micro" tone="soft" numberOfLines={2}>{content.current.detail}</Text>
            <Text variant="label" tone="brand" className="font-bold">See needs</Text>
          </View>
        </Tappable>
        <Tappable onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss notification"
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 }}>
          <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
        </Tappable>
      </Animated.View>
    </View>
  );
}
