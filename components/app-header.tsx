import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { windowEndISO } from '../lib/expiry';
import { cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { offlineQueue } from '../lib/offline-queue';
import { useAccessibilityStore } from '../lib/accessibility';
import { PRESS_SCALE_ROW, Tappable } from './motion';
import { Row } from './ui/row';
import { Sheet } from './ui/sheet';
import { Text } from './ui/text';

/**
 * The app's top bar.
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);
  const toggleSeniorMode = useAccessibilityStore(
    (state) => state.toggleSeniorMode,
  );

  const {
    settings,
    inventory,
    signOut,
    pantries,
    switchPantry,
    setAddingPantry,
  } = usePantryStore();
  const [switchOpen, setSwitchOpen] = useState(false);

  useEffect(() => {
    return offlineQueue.subscribe((count) => setPendingCount(count));
  }, []);

  // Same ISO window the Expiring Soon screen and dashboard use, so the badge
  // never disagrees with the screen it opens.
  const warningStr = windowEndISO(settings.expirationWarningDays);
  const expiringCount = inventory.filter(
    (i) => i.count > 0 && !!i.expiration && i.expiration <= warningStr,
  ).length;

  const close = () => {
    setMenuOpen(false);
    setSwitchOpen(false);
  };

  const handleSignOut = () => {
    close();
    Alert.alert(
      'Sign out?',
      'You will need to sign in again to reach this pantry.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  return (
    <View style={{ paddingTop: insets.top }} className="bg-canvas">
      {pendingCount > 0 && (
        <Tappable
          scaleTo={PRESS_SCALE_ROW}
          onPress={() => {
            offlineQueue.processQueue().then((res) => {
              if (res.processed > 0) {
                Alert.alert(
                  'Sync Complete',
                  `Uploaded ${res.processed} offline change(s).`,
                );
              }
            });
          }}
          accessibilityRole="button"
          className="mx-gutter mt-2 min-h-[48px] flex-row items-center justify-between rounded-lg border border-outline bg-subtle px-3.5 py-2.5"
        >
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="cloud-sync-outline" size={20} color={COLORS.statusWarning} />
            <Text variant="micro" className="font-semibold">
              Offline: {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync
            </Text>
          </View>
          <Text variant="micro" tone="brand" className="font-bold">
            Sync now →
          </Text>
        </Tappable>
      )}

      <View className="flex-row items-center gap-2 px-gutter pb-0 pt-3">
        {/* The pantry as a pill rather than a bare title: the initial gives it
            an identity you recognise at a glance, and the whole thing is the
            tap target for switching or signing out — which is what a volunteer
            who belongs to two pantries reaches for. */}
        <Tappable
          scaleTo={PRESS_SCALE_ROW}
          onPress={() => {
            cueTap();
            setMenuOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${settings.pantryName || 'PantryLens'}, ${title}. Opens pantry menu.`}
          className="min-h-[48px] flex-1 flex-row items-center gap-2.5 py-1"
        >
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-brand">
            <Text variant="body" tone="on" className="font-bold">
              {(settings.pantryName || 'P').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="soft" className="font-semibold">
              {title}
            </Text>
            <Text variant="body" numberOfLines={1} className="font-bold">
              {settings.pantryName || 'PantryLens'}
            </Text>
          </View>
        </Tappable>

        {/* Grouped and pushed right as one block, so the buttons sit on the
            right edge whatever the title beside them does. */}
        <View className="ml-auto flex-row items-center gap-2.5">
          {/* Explicit "Aa" text-size toggle so older volunteers immediately recognize
              what it does and whether Large Text Mode is currently active. */}
          <Tappable
            accessibilityRole="button"
            accessibilityState={{ selected: seniorMode }}
            accessibilityLabel={
              seniorMode
                ? 'Large text mode is on. Tap for standard text size.'
                : 'Turn on large text and high contrast mode'
            }
            onPress={() => {
              cueTap();
              toggleSeniorMode();
            }}
            className={`h-12 flex-row items-center justify-center gap-1 rounded-lg border px-3 ${
              seniorMode ? 'border-brand bg-brand' : 'border-hairline bg-card'
            }`}
          >
            <Text
              variant="label"
              tone={seniorMode ? 'on' : 'default'}
              className="font-extrabold"
            >
              Aa
            </Text>
            <MaterialCommunityIcons
              name={seniorMode ? 'check' : 'plus'}
              size={15}
              color={seniorMode ? COLORS.textOnPrimary : COLORS.primary}
            />
          </Tappable>

          <HeaderButton
            icon="bell-outline"
            label="Expiring soon"
            badge={expiringCount}
            onPress={() => router.push('/expiring-soon')}
          />
          <HeaderButton
            icon="dots-vertical"
            label="More options"
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      <Sheet
        visible={menuOpen}
        onClose={close}
        title={settings.pantryName || 'Pantry Menu'}
      >
        <View>
          <Row
            icon="format-size"
            label={seniorMode ? 'Large Text Mode: ON' : 'Large Text Mode: OFF'}
            hint="Large text and high contrast"
            onPress={() => {
              cueTap();
              toggleSeniorMode();
            }}
          />
          <Row
            icon="chart-box-outline"
            label="Reports & Activity"
            hint="Given out, wasted, CSV export"
            onPress={() => {
              close();
              router.push('/reports');
            }}
          />
          <Row
            icon="cog-outline"
            label="Pantry settings"
            hint="Box rules, thresholds, sound"
            onPress={() => {
              close();
              router.push('/(tabs)/settings');
            }}
          />
          <Row
            icon="account-multiple-outline"
            label="Team"
            hint="Members and their activity"
            onPress={() => {
              close();
              router.push('/team');
            }}
          />
          <Row
            icon="swap-horizontal"
            label="Switch pantry"
            hint={
              pantries.length > 1
                ? `${pantries.length} pantries`
                : "You're in one pantry"
            }
            onPress={
              pantries.length > 1
                ? () => {
                    cueTap();
                    setSwitchOpen((open) => !open);
                  }
                : undefined
            }
          />
          {/* The list opens in place under the row, so switching is two taps
              and never leaves the menu for a separate screen. */}
          {switchOpen &&
            pantries.map((p) => {
              const current = p.id === settings.pantryId;
              return (
                <Tappable
                  scaleTo={PRESS_SCALE_ROW}
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  onPress={() => {
                    cueTap();
                    close();
                    switchPantry(p.id);
                  }}
                  className="ml-[52px] min-h-[48px] flex-row items-center gap-3 py-2.5"
                >
                  <MaterialCommunityIcons
                    name={current ? 'check-circle' : 'circle-outline'}
                    size={20}
                    color={current ? COLORS.primary : COLORS.borderStrong}
                  />
                  <View className="flex-1">
                    <Text
                      variant="heading"
                      className={current ? "font-bold" : "font-semibold"}
                    >
                      {p.name}
                    </Text>
                    <Text variant="label" tone="soft" className="capitalize">
                      {p.role}
                    </Text>
                  </View>
                </Tappable>
              );
            })}
          <Row
            icon="plus-circle-outline"
            label="Add or create pantry"
            hint="Join with a code or start one"
            onPress={() => {
              close();
              setAddingPantry(true);
              router.push('/pantry-selection');
            }}
          />
          <Row
            icon="logout"
            label="Sign out"
            tone="critical"
            divider={false}
            onPress={handleSignOut}
          />
        </View>
      </Sheet>
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
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} items` : label}
      onPress={() => {
        cueTap();
        onPress();
      }}
      className="h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-card"
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={COLORS.textPrimary}
      />
      {!!badge && badge > 0 && (
        <View className="absolute -right-1 -top-1 min-w-[20px] items-center justify-center rounded-md bg-warn px-1.5 py-0.5">
          <Text variant="micro" tone="on" className="font-bold">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Tappable>
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
  modal,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  /** Presented as a sheet — on iOS that already starts below the status bar. */
  modal?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      // An iOS sheet sits below the status bar already; adding the inset again
      // left a tall empty band above the title.
      style={{ paddingTop: modal && Platform.OS === "ios" ? 8 : insets.top }}
      className="bg-canvas"
    >
      <View className="flex-row items-center gap-2.5 px-gutter pb-0 pt-3">
        <Tappable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            cueTap();
            onBack();
          }}
          className="h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-card"
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={26}
            color={COLORS.textPrimary}
          />
        </Tappable>

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
