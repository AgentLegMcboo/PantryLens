import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React, { useCallback, useRef } from "react";
import { View } from "react-native";
import { Sheet } from "./ui/sheet";
import { Row } from "./ui/row";
import { Text } from "./ui/text";

type Entry = {
  label: string;
  hint?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  href: Href;
};
const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "YOUR PANTRY",
    entries: [
      { label: "Home", icon: "home-outline", href: "/(tabs)" },
      {
        label: "Inventory",
        hint: "Search, edit items, and manage storage places",
        icon: "clipboard-list-outline",
        href: "/(tabs)/inventory",
      },
      {
        label: "Boxes",
        hint: "Box contents, family sizes, and packing",
        icon: "cube-outline",
        href: "/(tabs)/build",
      },
      {
        label: "Needs",
        hint: "Priority shortages and donor lists",
        icon: "bullhorn-outline",
        href: "/(tabs)/needs",
      },
    ],
  },
  {
    title: "ADD & COUNT FOOD",
    entries: [
      {
        label: "Photo donation intake",
        hint: "Take photos, detect items, then review and verify",
        icon: "camera-outline",
        href: "/log-donation",
      },
      { label: "Scan a barcode", icon: "barcode-scan", href: "/barcode-scan" },
      {
        label: "Quick add & manual entry",
        hint: "Available from Inventory’s add controls",
        icon: "plus-circle-outline",
        href: "/(tabs)/inventory",
      },
      {
        label: "Check shelf inventory",
        hint: "Count a shelf and review differences",
        icon: "layers-outline",
        href: "/shelf-audit",
      },
      {
        label: "Bulk donation",
        hint: "Crates, pallets, and deliveries by weight",
        icon: "scale",
        href: "/bulk-intake",
      },
    ],
  },
  {
    title: "DISTRIBUTION & ACTIVITY",
    entries: [
      {
        label: "Notifications & expiry",
        icon: "bell-outline",
        href: "/expiring-soon",
      },
      {
        label: "Ready to go",
        icon: "package-variant-closed",
        href: "/(tabs)/build?section=ready",
      },
      {
        label: "Packing checklist",
        hint: "Start a plan in Boxes",
        icon: "format-list-checks",
        href: "/(tabs)/build",
      },
      {
        label: "Reports & activity",
        icon: "chart-box-outline",
        href: "/reports",
      },
    ],
  },
  {
    title: "PANTRY & ACCOUNT",
    entries: [
      {
        label: "Team",
        hint: "Members, roles, access, and activity",
        icon: "account-multiple-outline",
        href: "/team",
      },
      {
        label: "Settings",
        hint: "Box rules, thresholds, expiry, accessibility, and feedback",
        icon: "cog-outline",
        href: "/(tabs)/settings",
      },
      {
        label: "Introduction",
        hint: "Replay the three-step guide",
        icon: "information-outline",
        href: "/onboarding?replay=1",
      },
    ],
  },
];

export function AppMap({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pendingRoute = useRef<Href | null>(null);
  const navigateAfterDismiss = useCallback(() => {
    const route = pendingRoute.current;
    pendingRoute.current = null;
    if (route) router.push(route);
  }, [router]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={navigateAfterDismiss}
      title="Full app map"
      subtitle="Find a task or explore your pantry tools."
    >
      {GROUPS.map((group) => (
        <View key={group.title} style={{ gap: 6, marginBottom: 14 }}>
          <Text
            variant="micro"
            tone="soft"
            style={{ letterSpacing: 0.7, fontWeight: "700" }}
          >
            {group.title}
          </Text>
          <View className="rounded-lg border border-hairline bg-card px-3">
            {group.entries.map((entry) => (
              <Row
                key={entry.label}
                icon={entry.icon}
                label={entry.label}
                hint={entry.hint}
                onPress={() => {
                  pendingRoute.current = entry.href;
                  onClose();
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </Sheet>
  );
}
