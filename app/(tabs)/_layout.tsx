import { Tabs, useSegments } from 'expo-router';
import { COLORS } from '../../constants/theme';
import { AppShell } from '../../components/app-shell';
import { useAppRouter } from '../../components/app-navigation';

export default function TabLayout() {
  const router = useAppRouter();
  const segments: string[] = useSegments();
  const active = segments[1] ?? 'index';
  return (
    <AppShell active={active} onSelect={id => router.push(id === 'index' ? '/(tabs)' : `/(tabs)/${id}` as any)}>
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: COLORS.background } }}>
        <Tabs.Screen name="index" options={{ title: 'Overview' }} />
        <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
        <Tabs.Screen name="build" options={{ title: 'Box planner' }} />
        <Tabs.Screen name="needs" options={{ title: 'Donation needs' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
      </Tabs>
    </AppShell>
  );
}
