import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessibilityStore } from '../../lib/accessibility';
import { AppHeader } from '../../components/app-header';
import { TabOverlayInsetContext } from '../../lib/tab-overlay';
import { SlidingTabBar, TAB_BAR_BODY, TAB_BAR_BODY_SENIOR } from '../../components/sliding-tab-bar';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);
  const barBodyHeight = seniorMode ? TAB_BAR_BODY_SENIOR : TAB_BAR_BODY;

  return (
    <TabOverlayInsetContext.Provider value={barBodyHeight + insets.bottom}>
    <View style={{ flex: 1 }}>
      <Tabs
        // Warm glass material with a persistent selected-tab highlight.
        tabBar={(props) => <SlidingTabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: seniorMode ? COLORS.textPrimary : COLORS.textSecondary,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: barBodyHeight + insets.bottom,
          },
          tabBarLabelStyle: {
            fontSize: seniorMode ? 15 : 12,
            fontWeight: seniorMode ? '700' : '600',
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
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="home-variant-outline"
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
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="format-list-bulleted"
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
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="package-variant-closed"
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
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="bullhorn-outline"
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


    </View>
    </TabOverlayInsetContext.Provider>
  );
}
