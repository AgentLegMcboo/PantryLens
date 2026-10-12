import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { Text } from './ui/text';

/**
 * The app's top bar.
 *
 * Replaces the stock navigation header, which was a bold centred title on a
 * hairline and nothing else. Three things live here now:
 *
 *  - WHERE YOU ARE. The pantry name, with the screen name above it — a
 *    volunteer may belong to more than one pantry and needs to know which
 *    they are writing to.
 *  - WHAT NEEDS YOU. The bell counts stock about to expire; that is the only
 *    genuinely time-sensitive thing this app knows, so it is the only thing
 *    allowed to wear a badge.
 *  - EVERYTHING ELSE. Settings and sign-out behind an overflow, which is what
 *    freed a fifth of the tab bar for the four things a volunteer actually
 *    does.
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const { settings, inventory, signOut } = usePantryStore();

  // Same window the dashboard and the allocator use, so the badge can never
  // disagree with the screen it takes you to.
  const warningLimit = new Date();
  warningLimit.setDate(new Date().getDate() + settings.expirationWarningDays);
  const expiringCount = inventory.filter(
    (i) => !!i.expiration && new Date(i.expiration) <= warningLimit,
  ).length;

  const close = () => setMenuOpen(false);

  const handleSignOut = () => {
    close();
    Alert.alert('Sign out?', 'You will need to sign in again to reach this pantry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={{ paddingTop: insets.top }} className="bg-canvas">
      <View className="flex-row items-center gap-2.5 px-gutter pb-0 pt-3">
        {/* The pantry as a pill rather than a bare title: the initial gives it
            an identity you recognise at a glance, and the whole thing is the
            tap target for switching or signing out — which is what a volunteer
            who belongs to two pantries reaches for. */}
        <Pressable
          onPress={() => {
            cueTap();
            setMenuOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${settings.pantryName || 'PantryLens'}, ${title}. Opens pantry menu.`}
          className="mr-auto flex-1 flex-row items-center gap-2.5 py-1.5"
        >
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-brand">
            <Text variant="body" tone="on" className="font-bold text-base">
              {(settings.pantryName || 'P').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="soft" className="font-medium">
              {title}
            </Text>
            <Text variant="body" numberOfLines={1} className="font-bold text-base">
              {settings.pantryName || 'PantryLens'}
            </Text>
          </View>
        </Pressable>

        <HeaderButton
          icon="bell-outline"
          label="Expiring soon"
          badge={expiringCount}
          onPress={() => router.push('/expiring-soon')}
        />
        <HeaderButton icon="dots-vertical" label="More" onPress={() => setMenuOpen(true)} />
      </View>

      {/* A sheet rather than a floating popover: anchoring a menu under an icon
          means measuring the icon, and a bottom sheet is easier to hit with a
          thumb anyway. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={close}>
          <Pressable className="rounded-t-xl bg-canvas px-gutter pb-10 pt-4" onPress={() => {}}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-md bg-hairline" />

            <MenuRow
              icon="swap-horizontal"
              label="Switch food bank"
              hint={`Currently at ${settings.pantryName || 'this pantry'}`}
              onPress={() => {
                close();
                router.push('/pantry-selection');
              }}
            />
            <MenuRow
              icon="chart-box-outline"
              label="Reports"
              hint="Food given out, food wasted, and CSV export"
              onPress={() => {
                close();
                router.push('/reports');
              }}
            />
            <MenuRow
              icon="cog-outline"
              label="Pantry settings"
              hint="Box rules, thresholds, feel & sound"
              onPress={() => {
                close();
                router.push('/(tabs)/settings');
              }}
            />
            <MenuRow
              icon="account-multiple-outline"
              label={settings.pantryName || 'This pantry'}
              hint={`You are signed in as ${settings.userRole}`}
            />
            <MenuRow icon="logout" label="Sign out" tone="critical" onPress={handleSignOut} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
      onPress={() => {
        cueTap();
        onPress();
      }}
      className="h-12 w-12 items-center justify-center rounded-lg bg-card border border-hairline/70"
    >
      <MaterialCommunityIcons name={icon} size={22} color={COLORS.textPrimary} />
      {!!badge && badge > 0 && (
        <View className="absolute -right-1 -top-1 min-w-[20px] items-center justify-center rounded-md bg-warn px-1.5 py-0.5">
          <Text variant="micro" tone="on" className="text-[11px] font-bold">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function MenuRow({
  icon,
  label,
  hint,
  tone,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  hint?: string;
  tone?: 'critical';
  onPress?: () => void;
}) {
  const colour = tone === 'critical' ? COLORS.statusCritical : COLORS.textPrimary;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center gap-3 py-3.5"
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-subtle">
        <MaterialCommunityIcons name={icon} size={20} color={colour} />
      </View>
      <View className="flex-1">
        <Text variant="body" style={{ color: colour }} className="font-semibold text-base">
          {label}
        </Text>
        {hint ? (
          <Text variant="micro" tone="soft" className="mt-0.5 text-xs">
            {hint}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
      ) : null}
    </Pressable>
  );
}

/**
 * The same bar for pushed screens.
 *
 * Log Donation, Review & Verify and the rest were still on the stock navigation
 * header — a small centred title on a hairline — so walking into them from a
 * tab felt like leaving the app. This shares the type, the height and the
 * circular control of AppHeader; only the left slot differs, carrying a back
 * button instead of the pantry name.
 */
export function StackHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top }} className="bg-canvas">
      <View className="flex-row items-center gap-2.5 px-gutter pb-0 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            cueTap();
            onBack();
          }}
          className="h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-card"
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color={COLORS.textPrimary} />
        </Pressable>

        <Text
          variant="headline"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          className="flex-1"
        >
          {title}
        </Text>

        {right}
      </View>
    </View>
  );
}
