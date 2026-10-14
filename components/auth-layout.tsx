import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { COLORS } from "../constants/theme";
import { GoogleLogo } from "./google-logo";
import { KeyboardScreen } from "./keyboard-screen";
import { Button, Card, cardRing, Text } from "./ui";

/**
 * The pantry behind the glass.
 *
 * Log In, Sign Up, Join a Pantry and the intro each drew this same photograph
 * and this same three-stop scrim by hand, and had already drifted — the scrim
 * ended on the OLD cream (#FBF6EE) while the app's canvas had moved to white, so
 * every one of them had a faint horizontal seam near the bottom of the screen.
 * One copy, ending on the real canvas colour.
 */
export function AuthBackdrop({ blurRadius }: { blurRadius?: number } = {}) {
  return (
    <LinearGradient
      colors={[COLORS.cardSurface, COLORS.surfaceContainer, COLORS.background]}
      locations={[0, 0.45, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** The wordmark, at the size the entry screens use it. */
export function AuthBrand({
  icon = "camera-iris",
  title,
  subtitle,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="mb-8 items-center">
      <View className="mb-3 h-16 w-16 items-center justify-center rounded-2xl bg-brand">
        <MaterialCommunityIcons
          name={icon}
          size={34}
          color={COLORS.textOnPrimary}
        />
      </View>
      {/* The splash's wordmark (components/brand-splash.tsx): system sans at
          800 with tight tracking, so the front door matches the launch screen.

          lineHeight is NOT optional here. `Text` defaults to the `body` variant,
          which carries a 22px line box from the type scale — so a 32px glyph set
          without one gets its ascenders sheared off. Any custom fontSize on this
          component has to bring its own lineHeight. */}
      <Text
        style={{
          fontSize: 32,
          lineHeight: 40,
          fontWeight: "800",
          letterSpacing: -0.6,
          color: COLORS.textPrimary,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text variant="label" tone="soft" className="mt-1.5 px-4 text-center">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Shared chrome for Log In and Sign Up.
 *
 * These two screens had drifted apart — different backgrounds, different brand
 * blocks, one with a Google button and one without. Anything common lives here
 * now so they cannot diverge again; each screen only supplies its own fields.
 */
export function AuthLayout({
  title,
  subtitle,
  cardTitle,
  cardSubtitle,
  onGooglePress,
  googleLoading,
  disabled,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  cardTitle: string;
  cardSubtitle?: string;
  onGooglePress: () => void;
  googleLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <View className="flex-1 bg-canvas">
      <AuthBackdrop />

      <KeyboardScreen
        className="bg-transparent"
        contentContainerClassName="justify-center grow gap-0"
      >
        <AuthBrand title={title} subtitle={subtitle} />

        {/* A deeper shadow than an ordinary card: this one is lifted off a
            photograph rather than off the cream page. */}
        <Card
          className="gap-5"
          style={{ boxShadow: `${cardRing()}, 0 1px 20px 0 rgba(43, 36, 32, 0.15)` }}
        >
          <View>
            <Text variant="title">{cardTitle}</Text>
            {cardSubtitle ? (
              <Text variant="label" tone="soft" className="mt-1">
                {cardSubtitle}
              </Text>
            ) : null}
          </View>

          <Button
            label="Continue with Google"
            variant="secondary"
            block
            loading={googleLoading}
            disabled={disabled}
            icon={<GoogleLogo size={20} />}
            onPress={onGooglePress}
          />

          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-hairline" />
            <Text variant="micro" tone="soft">
              or
            </Text>
            <View className="h-px flex-1 bg-hairline" />
          </View>

          {children}

          <View className="flex-row items-center justify-center gap-1">
            {footer}
          </View>
        </Card>
      </KeyboardScreen>
    </View>
  );
}
