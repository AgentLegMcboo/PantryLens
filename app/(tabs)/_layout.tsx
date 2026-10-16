import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { COLORS, fw } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibilityStore } from '../../lib/accessibility';
import { AppHeader } from '../../components/app-header';
import { SlidingTabBar, TAB_BAR_BODY, TAB_BAR_BODY_SENIOR } from '../../components/sliding-tab-bar';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);
  const barBodyHeight = seniorMode ? TAB_BAR_BODY_SENIOR : TAB_BAR_BODY;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        // One rounded highlight that slides between tabs; see sliding-tab-bar.tsx.
        tabBar={(props) => <SlidingTabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: seniorMode ? COLORS.textPrimary : COLORS.textSecondary,
          tabBarStyle: {
            // Same cream as every screen — a near-white bar under a cream page drew
            // a hard horizontal seam. Separation comes from the shadow instead.
            backgroundColor: COLORS.background,
            borderTopColor: COLORS.borderSoft,
            borderTopWidth: 1,
            // iOS casts a genuine upward shadow from a negative offset. Android
            // ignores it — `elevation` only ever casts downward — so the gradient
            // below is what actually does the work there.
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.07,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -3 },
            elevation: 0,
            height: barBodyHeight + insets.bottom,
            // Sits lower and tighter. The full safe-area inset was being used as
            // padding, which floated the icons well above the home indicator and
            // made the bar look twice as tall as it needed to be — a slim margin
            // clears the indicator without wasting the space above it.
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: seniorMode ? 15 : 12,
            fontWeight: fw(seniorMode ? '700' : '600'),
            marginTop: 2,
          },
          tabBarIconStyle: { marginTop: 0 },
          // Every tab gets the same custom bar: pantry name, an expiry bell, and
          // an overflow holding settings and sign-out.
          header: ({ options }) => <AppHeader title={String(options.title ?? '')} />,
          // A tab you aren't looking at doesn't re-render. Without this, the
          // hidden tabs kept redrawing on every store change — Inventory with
          // every row it had mounted — and the whole app lagged.
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? "home-variant" : "home-variant-outline"}
                size={seniorMode ? 28 : size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? "clipboard-list" : "clipboard-list-outline"}
                size={seniorMode ? 28 : size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="build"
          options={{
            title: 'Build',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? "cube" : "cube-outline"}
                size={seniorMode ? 28 : size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="needs"
          options={{
            title: 'Needs',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? "bullhorn" : "bullhorn-outline"}
                size={seniorMode ? 28 : size}
                color={color}
              />
            ),
          }}
        />
        {/* Still routable, no longer a tab. It was taking a fifth of the bar for
          something a volunteer opens once a month. */}
        <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      </Tabs>

      {/* The shadow the raised bar casts UP onto the content behind it.
          Drawn here rather than inside the bar because tabBarBackground is
          clipped to the bar's own bounds — anything painted there necessarily
          falls downward, which is the opposite of what a raised surface does.
          Sitting outside the navigator, it lands on the page above the bar. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(107,74,47,0)', 'rgba(107,74,47,0.09)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: barBodyHeight + insets.bottom,
          height: 10,
        }}
      />
    </View>
  );
}
