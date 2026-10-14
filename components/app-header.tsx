import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import { Alert, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../constants/theme";
import { cueTap } from "../lib/feedback";
import { usePantryStore } from "../lib/store";
import { offlineQueue } from "../lib/offline-queue";
import { useAccessibilityStore } from "../lib/accessibility";
import { Sheet } from "./ui/sheet";
import { Text } from "./ui/text";
import { Tappable, PRESS_SCALE_ROW } from "./motion";

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

  // Same window the dashboard and the allocator use, so the badge can never
  // disagree with the screen it takes you to.
  const warningLimit = new Date();
  warningLimit.setDate(new Date().getDate() + settings.expirationWarningDays);
  const expiringCount = inventory.filter(
    (i) => !!i.expiration && new Date(i.expiration) <= warningLimit,
  ).length;

  const close = () => {
    setMenuOpen(false);
    setSwitchOpen(false);
  };

  const handleSignOut = () => {
    close();
    Alert.alert(
      "Sign out?",
      "You will need to sign in again to reach this pantry.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => signOut() },
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
                  "Sync Complete",
                  `Uploaded ${res.processed} offline change(s).`,
                );
              }
            });
          }}
          className="mx-gutter mt-2 flex-row items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
        >
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons
              name="cloud-sync-outline"
              size={18}
              color="#904C00"
            />
            <Text className="text-xs font-semibold text-amber-900">
              Offline: {pendingCount} change{pendingCount === 1 ? "" : "s"}{" "}
              waiting to sync
            </Text>
          </View>
          <Text className="text-xs font-bold text-amber-800">Sync now →</Text>
        </Tappable>
      )}

      <View className="flex-row items-center gap-2.5 px-gutter pb-0 pt-3">
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
          accessibilityLabel={`${settings.pantryName || "PantryLens"}, ${title}. Opens pantry menu.`}
          className="flex-1 flex-row items-center gap-2.5 py-1.5"
        >
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-brand">
            <Text variant="body" tone="on" className="font-bold text-base">
              {(settings.pantryName || "P").trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="soft" className="font-medium">
              {title}
            </Text>
            <Text
              variant="body"
              numberOfLines={1}
              className="font-bold text-base"
            >
              {settings.pantryName || "PantryLens"}
            </Text>
          </View>
        </Tappable>

        {/* Grouped and pushed right as one block, so the buttons sit on the
            right edge whatever the title beside them does. */}
        <View className="ml-auto flex-row items-center gap-2.5">
          <HeaderButton
            icon={
              seniorMode
                ? "format-font-size-decrease"
                : "format-font-size-increase"
            }
            label={
              seniorMode
                ? "Switch to standard font"
                : "Switch to large text for seniors"
            }
            onPress={() => {
              cueTap();
              toggleSeniorMode();
            }}
          />
          <HeaderButton
            icon="bell-outline"
            label="Expiring soon"
            badge={expiringCount}
            onPress={() => router.push("/expiring-soon")}
          />
          <HeaderButton
            icon="dots-vertical"
            label="More"
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </View>

      {/* A sheet rather than a floating popover: anchoring a menu under an icon
          means measuring the icon, and a bottom sheet is easier to hit with a
          thumb anyway. */}
      <Sheet
        visible={menuOpen}
        title={settings.pantryName || "Menu"}
        onClose={close}
      >
        {/* One child, so the sheet's own gap doesn't space the rows out. */}
        <View>
          <MenuRow
            icon="format-size"
            label={seniorMode ? "Senior Mode: Active" : "Senior Mode: Off"}
            hint="Large text and high contrast"
            onPress={() => {
              cueTap();
              toggleSeniorMode();
            }}
          />
          <MenuRow
            icon="chart-box-outline"
            label="Reports"
            hint="Given out, wasted, CSV export"
            onPress={() => {
              close();
              router.push("/reports");
            }}
          />
          <MenuRow
            icon="cog-outline"
            label="Pantry settings"
            hint="Box rules, thresholds, sound"
            onPress={() => {
              close();
              router.push("/(tabs)/settings");
            }}
          />
          <MenuRow
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
                  className="ml-[52px] flex-row items-center gap-3 py-2"
                >
                  <MaterialCommunityIcons
                    name={current ? "check-circle" : "circle-outline"}
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
          <MenuRow
            icon="plus-circle-outline"
            label="Add or create pantry"
            hint="Join with a code or start one"
            onPress={() => {
              close();
              setAddingPantry(true);
              router.push("/pantry-selection");
            }}
          />
          <MenuRow
            icon="account-multiple-outline"
            label="Team"
            hint="Members and their activity"
            onPress={() => {
              close();
              router.push("/team");
            }}
          />
          <MenuRow
            icon="logout"
            label="Sign out"
            tone="critical"
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
      className="h-12 w-12 items-center justify-center rounded-lg bg-card border border-hairline/70"
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={COLORS.textPrimary}
      />
      {!!badge && badge > 0 && (
        <View className="absolute -right-1 -top-1 min-w-[20px] items-center justify-center rounded-md bg-warn px-1.5 py-0.5">
          <Text variant="micro" tone="on" className="text-[11px] font-bold">
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Tappable>
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
  tone?: "critical";
  onPress?: () => void;
}) {
  const colour =
    tone === "critical" ? COLORS.statusCritical : COLORS.textPrimary;
  return (
    <Tappable
      scaleTo={PRESS_SCALE_ROW}
      disabled={!onPress}
      onPress={onPress}
      className="flex-row items-center gap-3 py-2"
      accessibilityRole={onPress ? "button" : undefined}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-lg ${
          tone === "critical" ? "bg-subtle" : "bg-secondary-tint"
        }`}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={tone === "critical" ? colour : COLORS.secondaryDark}
        />
      </View>
      <View className="flex-1">
        <Text
          variant="heading"
          style={{ color: colour }}
        >
          {label}
        </Text>
        {hint ? (
          <Text variant="label" tone="soft" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={COLORS.textSecondary}
        />
      ) : null}
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
