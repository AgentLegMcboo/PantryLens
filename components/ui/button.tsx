import * as React from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { COLORS } from '../../constants/theme';
import { cn } from '../../lib/cn';
import { Text } from './text';
import { cuePress, cueTap } from '../../lib/feedback';

const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-md self-start py-3',
  {
    variants: {
      variant: {
        primary: 'bg-brand',
        secondary: 'bg-card border border-outline',
        critical: 'bg-critical',
        ghost: 'bg-transparent',
        criticalGhost: 'bg-transparent',
      },
      size: {
        default: 'min-h-[52px] px-5',
        compact: 'min-h-[48px] px-4',
      },
      block: { true: 'w-full self-auto', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'default', block: false },
  },
);
const labelTone = {
  primary: 'on', secondary: 'brand', critical: 'on', ghost: 'brand', criticalGhost: 'critical',
} as const;

/** Stable height, visible press feedback, and a label that survives loading. */
export function Button({
  label, variant = 'primary', size, block, loading, disabled, icon,
  className, onPress, style, ...props
}: Omit<PressableProps, 'children'> & VariantProps<typeof buttonVariants> & {
  label: string;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const inert = disabled || loading;
  const solid = variant === 'primary' || variant === 'critical';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      onPress={e => { solid ? cuePress() : cueTap(); onPress?.(e); }}
      className={cn(buttonVariants({ variant, size, block }), inert && 'opacity-40', className)}
      style={state => [
        { borderCurve: 'continuous', opacity: inert ? 0.4 : state.pressed ? 0.76 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={solid ? COLORS.textOnPrimary : COLORS.primaryDark} /> : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text variant={size === 'compact' ? 'label' : 'body'} tone={labelTone[variant ?? 'primary']}
            className="shrink text-center font-semibold">{label}</Text>
        </>
      )}
    </Pressable>
  );
}
