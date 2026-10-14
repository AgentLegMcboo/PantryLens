import type { Tabs } from 'expo-router';
import * as React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { useAccessibilityStore } from '../lib/accessibility';
import { cueTap } from '../lib/feedback';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Bar height before the home-indicator inset is added. */
export const TAB_BAR_BODY = 64;
export const TAB_BAR_BODY_SENIOR = 74;
/** How far the pill sits inside each item, so it reads as a pill, not a cell. */
const PILL_INSET = 8;

/**
 * The bottom tab bar, with one rounded highlight that slides to the tab you
 * pick.
 *
 * The stock bar painted a separate square-ish background on whichever item was
 * active, so switching tabs was one block vanishing and another appearing. One
 * pill gliding between them says where you came from and where you went.
 *
 * Routes hidden with `href: null` (Settings) arrive with
 * `tabBarItemStyle: { display: 'none' }` — that's how expo-router hides them —
 * and are left out here too.
 */
export function SlidingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const seniorMode = useAccessibilityStore((s) => s.seniorMode);
  const barBodyHeight = seniorMode ? TAB_BAR_BODY_SENIOR : TAB_BAR_BODY;
  const [rowWidth, setRowWidth] = React.useState(0);

  const visible = state.routes.filter((route) => {
    const style = StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle);
    return style?.display !== 'none';
  });
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(0, visible.findIndex((r) => r.key === activeKey));
  const itemWidth = visible.length ? rowWidth / visible.length : 0;

  const x = useSharedValue(0);
  React.useEffect(() => {
    const target = activeIndex * itemWidth;
    x.value =
      reduceMotion || itemWidth === 0
        ? target
        : // Critically damped: it arrives and stops. A tab switch is the most
          // frequent thing anyone does here, so no overshoot to wait out.
          withSpring(target, { dampingRatio: 1, duration: 250 });
  }, [activeIndex, itemWidth, reduceMotion, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      style={{
        height: barBodyHeight + insets.bottom,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.borderSoft,
      }}
    >
      <View
        className="flex-1 flex-row"
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: PILL_INSET,
                width: itemWidth - PILL_INSET * 2,
                borderRadius: 999,
                backgroundColor: COLORS.surfaceContainer,
              },
              pill,
            ]}
          />
        )}

        {visible.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === activeKey;
          const color = focused
            ? COLORS.primary
            : seniorMode
              ? COLORS.textPrimary
              : COLORS.textSecondary;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              cueTap();
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              className="flex-1 items-center justify-center gap-0.5"
            >
              {options.tabBarIcon?.({ focused, color, size: seniorMode ? 28 : 24 })}
              <Animated.Text
                style={{
                  fontSize: seniorMode ? 15 : 12,
                  fontWeight: focused || seniorMode ? '700' : '600',
                  color,
                }}
                numberOfLines={1}
              >
                {label}
              </Animated.Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
