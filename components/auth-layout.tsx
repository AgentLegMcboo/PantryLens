import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, RADII, SPACING } from '../constants/theme';
import { GoogleLogo } from './google-logo';
import { KeyboardScreen } from './keyboard-screen';

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
    <View style={styles.root}>
      {/* A pantry behind the glass: enough to say where you are, dimmed far
          enough that the form stays the only thing competing for attention. */}
      <Image source={require('../assets/images/pantry-bg.jpg')} style={styles.bg} blurRadius={5} />
      <LinearGradient
        colors={['rgba(251,246,238,0.55)', 'rgba(251,246,238,0.90)', COLORS.background]}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.brandBox}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="camera-iris" size={40} color={COLORS.textOnPrimary} />
          </View>
          <Text style={styles.brandTitle}>{title}</Text>
          {subtitle ? <Text style={styles.brandTagline}>{subtitle}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{cardTitle}</Text>
          {cardSubtitle ? <Text style={styles.cardSub}>{cardSubtitle}</Text> : null}

          <TouchableOpacity
            style={styles.googleBtn}
            onPress={onGooglePress}
            disabled={googleLoading || disabled}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.textPrimary} />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerBox}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {children}

          <View style={styles.footer}>{footer}</View>
        </View>
      </KeyboardScreen>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: SPACING.touch,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  primaryBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    minHeight: SPACING.touch,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginRight: SPACING.xs,
  },
  footerText: { color: COLORS.textSecondary, fontSize: 14 },
  devHint: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  footerLink: { color: COLORS.primaryLight, fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  bg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.55 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: SPACING.lg, justifyContent: 'center', flexGrow: 1 },
  brandBox: { alignItems: 'center', marginBottom: SPACING.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  brandTitle: { fontSize: 34, fontFamily: FONTS.serifSemi, color: COLORS.textPrimary },
  brandTagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.lg,
    // Lifts the form off the shelves behind it.
    shadowColor: '#2B2420',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  cardTitle: { fontSize: 21, fontFamily: FONTS.serifSemi, color: COLORS.textPrimary },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginBottom: SPACING.md, marginTop: 2 },
  googleBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    minHeight: SPACING.touch,
  },
  googleBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  dividerBox: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.lg },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.borderSoft },
  dividerText: { marginHorizontal: SPACING.md, color: COLORS.textSecondary, fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.lg },
});
