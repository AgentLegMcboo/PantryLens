import * as React from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cuePress, cueTap } from '../../lib/feedback';

/**
 * One button, four intents.
 *
 * Built like a physical key: a solid face sitting on a darker lip along the
 * bottom edge, the same bottom-weighted language the cards use. Pressing it
 * drives the face down onto the lip — the lip shrinks and the whole thing
 * translates by exactly the amount it loses, so the top edge dips and the
 * bottom stays put. That is what makes it feel like it depresses rather than
 * merely tint-changes.
 *
 * Not full-width by default. A column of stacked full-bleed slabs was the
 * ugliest thing this app did — `block` is opt-in, for the single committing
 * action at the end of a flow.
 */
/** A shallow edge keeps the tactile press without the old heavy extrusion. */
const LIP = 2;
const LIP_COMPACT = 1;
const LIP_PRESSED = 1;

const buttonVariants = cva('min-w-0 max-w-full flex-row items-center justify-center gap-2 rounded-lg self-start', {
  variants: {
    variant: {
      primary: 'bg-brand',
      secondary: 'bg-card border-[1.5px] border-outline',
      critical: 'bg-critical',
      ghost: 'bg-transparent px-0',
      // Destructive, but not the loudest thing on the page. Sign-out and
      // "remove this item" are red because of what they do, not because they
      // are what the screen wants you to press.
      criticalGhost: 'bg-transparent px-0',
    },
    size: {
      // 48 keeps the accessibility floor for the actions that matter.
      default: 'min-h-[52px] px-6 py-3',
      compact: 'min-h-[48px] px-4 py-2',
    },
    block: { true: 'w-full self-auto', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'default', block: false },
});

const labelTone = {
  primary: 'on',
  secondary: 'default',
  critical: 'on',
  ghost: 'brand',
  criticalGhost: 'critical',
} as const;

/** The lip colour per variant. Null means the variant has no lip. */
const lipColor = {
  primary: COLORS.primaryDeep,
  critical: '#8E2A1F',
  secondary: COLORS.borderStrong,
  ghost: null,
  criticalGhost: null,
} as const;

export function Button({
  label,
  variant = 'primary',
  size,
  block,
  loading,
  disabled,
  icon,
  className,
  onPress,
  ...props
}: Omit<PressableProps, 'children' | 'style'> &
  VariantProps<typeof buttonVariants> & {
    label: string;
    loading?: boolean;
    icon?: React.ReactNode;
  }) {
  const inert = disabled || loading;
  const solid = variant === 'primary' || variant === 'critical';
  const lip = lipColor[variant ?? 'primary'];
  const lipDepth = size === 'compact' ? LIP_COMPACT : LIP;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={(e) => {
        solid ? cuePress() : cueTap();
        onPress?.(e);
      }}
      className={cn(buttonVariants({ variant, size, block }), inert && 'opacity-40', className)}
      style={({ pressed }) =>
        lip
          ? {
              borderBottomWidth: pressed ? LIP_PRESSED : lipDepth,
              borderBottomColor: lip,
              // Moves down by exactly what the lip loses, so the bottom edge
              // never shifts and only the face appears to sink.
              transform: [{ translateY: pressed ? lipDepth - LIP_PRESSED : 0 }],
            }
          : undefined
      }
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? COLORS.textOnAccent : solid ? '#FFFFFF' : COLORS.primaryDark} />
      ) : (
        <>
          {icon ? <View>{variant === 'primary' && React.isValidElement<{ color?: string }>(icon) ? React.cloneElement(icon, { color: COLORS.textOnAccent }) : icon}</View> : null}
          <Text
            variant={size === 'compact' ? 'label' : 'body'}
            tone={labelTone[variant ?? 'primary']}
            style={variant === 'primary' ? { color: COLORS.textOnAccent } : undefined}
            // Bold and slightly tracked, as in the reference. Not uppercased —
            // "CHECK" carries that well, "PHOTOGRAPH A DONATION" shouts.
            className="shrink text-center font-semibold"
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
