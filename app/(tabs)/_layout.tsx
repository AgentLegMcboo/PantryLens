import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { COLORS } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePantryStore } from '../../lib/store';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Was hardcoded to "Grace Community Pantry", so every pantry in the world was
  // greeted by name — someone else's.
  const pantryName = usePantryStore(state => state.settings.pantryName);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primaryLight,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.cardSurface,
          borderTopColor: COLORS.borderSoft,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: COLORS.background,
          shadowColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: COLORS.borderSoft,
        },
        headerTitleStyle: {
          color: COLORS.textPrimary,
          fontSize: 18,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: pantryName || 'PantryLens',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          headerTitle: 'Pantry Inventory',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="build"
        options={{
          title: 'Build',
          headerTitle: 'Build Family Boxes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="needs"
        options={{
          title: 'Needs',
          headerTitle: 'Donation Requests',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="bullhorn-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Pantry Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
