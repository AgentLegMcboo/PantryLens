import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as React from "react";
import { Platform, Pressable, Switch, View } from "react-native";
import Animated from "react-native-reanimated";
import { COLORS, RULE_BELOW } from "../../constants/theme";
import { PRESS_SCALE_ROW, usePressScale } from "../motion";
import { cueTap } from "../../lib/feedback";
import { cn } from "../../lib/cn";
import { Text } from "./text";
import { useAppAppearance } from "../../lib/appearance";

/**
 * A labelled line with a control on the end.
 *
 * Settings, item metadata and the pantry menu were each drawing this by hand at
 * a different height with a different divider, which is why Settings read as a
 * spreadsheet: nine rows, no two the same. One row, 56px minimum, and the
 * divider belongs to the row above rather than being drawn around the group.
 *
 * It answers the press. This is the most-tapped control in the app and for a
 * long time it fired a haptic and did nothing visible — the finger got an
 * answer and the eye got none, which reads as a row that might not have
 * registered. The dip is slight on purpose: a row is a line in a list, not a
 * button, and a list that bounces when you brush it is worse than one that sits
 * still.
 */
export function Row({
  icon,
  leading: leadingContent,
  label,
  hint,
  right,
  onPress,
  selected,
  stackControl = false,
  tone,
  divider = true,
  className,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  leading?: React.ReactNode;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  /** Selection choices announce their checked state instead of a navigation button. */
  selected?: boolean;
  /** Put a wide control below its label rather than squeezing the text. */
  stackControl?: boolean;
  tone?: "critical";
  /** Hairline under the row. Turn it off on the last of a group. */
  divider?: boolean;
  className?: string;
}) {
  useAppAppearance((state) => state.scheme);
  const colour =
    tone === "critical" ? COLORS.statusCritical : COLORS.textPrimary;
  // The glyph is brand-tinted rather than ink, matching the dashboard's activity
  // rows — a disc of dark grey on cream reads as disabled.
  const glyphColour =
    tone === "critical" ? COLORS.statusCritical : COLORS.secondaryDark;

  const leading = leadingContent ?? (icon ? (
    <View
      className={cn(
        "h-10 w-10 items-center justify-center rounded-lg",
        tone === "critical" ? "bg-subtle" : "bg-secondary-tint",
      )}
    >
      <MaterialCommunityIcons name={icon} size={20} color={glyphColour} />
    </View>
  ) : null);
  const copy = (
    <View className="flex-1">
      <Text variant="body" className="font-semibold" style={{ color: colour }}>
        {label}
      </Text>
      {hint ? (
        <Text variant="label" tone="soft" className="mt-0.5">
          {hint}
        </Text>
      ) : null}
    </View>
  );
  const trailing =
    right ??
    (onPress ? (
      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={COLORS.textSecondary}
      />
    ) : null);
  const body = (
    <View
      className={cn(
        stackControl
          ? "min-h-[56px] gap-3 py-3"
          : "min-h-[56px] flex-row items-center gap-3 py-3",
        className,
      )}
      style={divider ? { ...RULE_BELOW } : undefined}
    >
      {stackControl ? (
        <>
          <View className="flex-row items-center gap-3">
            {leading}
            {copy}
          </View>
          <View className="self-start">{trailing}</View>
        </>
      ) : (
        <>
          {leading}
          {copy}
          {trailing}
        </>
      )}
    </View>
  );

  if (!onPress) return body;

  return (
    <PressableRow onPress={onPress} selected={selected}>
      {body}
    </PressableRow>
  );
}

/**
 * Separate component because it uses a hook, and `Row` returns early for the
 * many rows that are not tappable — a hook above that return would run for
 * every static row in the app, and one below it would break the rules.
 */
function PressableRow({
  onPress,
  children,
  selected,
}: {
  onPress: () => void;
  children: React.ReactNode;
  selected?: boolean;
}) {
  const press = usePressScale(PRESS_SCALE_ROW);

  return (
    <Pressable
      accessibilityRole={selected === undefined ? "button" : "radio"}
      accessibilityState={
        selected === undefined ? undefined : { checked: selected }
      }
      // 8px of slack around a 56px row. The target should be slightly bigger
      // than the thing you can see, never smaller.
      hitSlop={8}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        cueTap();
        onPress();
      }}
    >
      <Animated.View style={press.style}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * On/off switch in the brand's green.
 *
 * Left as the platform control on purpose — a toggle is one of the few things a
 * volunteer already knows how to read without being taught, and a bespoke one
 * would only be a worse version of it. Only the colours are ours.
 */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      accessibilityLabel={accessibilityLabel}
      onValueChange={(next) => {
        cueTap();
        onValueChange(next);
      }}
      trackColor={{ true: COLORS.secondary, false: COLORS.borderStrong }}
      thumbColor={Platform.OS === "android" ? COLORS.cardSurface : undefined}
      ios_backgroundColor={COLORS.borderStrong}
    />
  );
}
