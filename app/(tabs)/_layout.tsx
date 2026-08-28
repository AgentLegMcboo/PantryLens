import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePantryStore } from '../../lib/store';
import { AppHeader } from '../../components/app-header';

/** Bar height before the home-indicator inset is added. */
const TAB_BAR_BODY = 50;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Was hardcoded to "Grace Community Pantry", so every pantry in the world was
  // greeted by name — someone else's.
  const pantryName = usePantryStore(state => state.settings.pantryName);

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primaryLight,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          // Same cream as every screen — a near-white bar under a cream page drew
          // a hard horizontal seam. Separation comes from the shadow instead.
          backgroundColor: COLORS.background,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          // iOS casts a genuine upward shadow from a negative offset. Android
          // ignores it — `elevation` only ever casts downward — so the gradient
          // below is what actually does the work there.
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.07,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
          elevation: 0,
          height: TAB_BAR_BODY + insets.bottom,
          // Sits lower and tighter. The full safe-area inset was being used as
          // padding, which floated the icons well above the home indicator and
          // made the bar look twice as tall as it needed to be — a slim margin
          // clears the indicator without wasting the space above it.
          paddingBottom: insets.bottom > 0 ? insets.bottom - 10 : 6,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -2,
        },
        tabBarIconStyle: { marginTop: 2 },
        // Every tab gets the same custom bar: pantry name, an expiry bell, and
        // an overflow holding settings and sign-out.
        header: ({ options }) => <AppHeader title={String(options.title ?? '')} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="build"
        options={{
          title: 'Build',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="needs"
        options={{
          title: 'Needs',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bullhorn-outline" size={size} color={color} />
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
          bottom: TAB_BAR_BODY + insets.bottom,
          height: 10,
        }}
      />
    </View>
  );
}
