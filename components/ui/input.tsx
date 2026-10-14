import * as React from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { COLORS } from '../../constants/theme';
import { useAccessibilityStore } from '../../lib/accessibility';
import { cn } from '../../lib/cn';
import { Text } from './text';

/**
 * Every text field in the app.
 *
 * Seven screens each declared their own `input` style — 44px here, 48 there,
 * one border colour on the auth card and another on the item sheet — so the
 * same act of typing a word looked different depending which screen you were
 * standing on.
 *
 * Two things it does that none of those did:
 *
 *  - 48px tall, the same floor as a Button. A field a volunteer taps with a can
 *    in the other hand has no business being 44.
 *  - The edge lights up in the brand colour while it has focus. A form with no
 *    focus state is the single most common reason someone types into the wrong
 *    field on a phone.
 */
export function Input({
  label,
  hint,
  error,
  className,
  style,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & {
  label?: string;
  /** Sits under the field. Replaced by `error` when there is one. */
  hint?: string;
  error?: string | null;
}) {
  const [focused, setFocused] = React.useState(false);
  const seniorMode = useAccessibilityStore((state) => state.seniorMode);
  const message = error ?? hint;

  return (
    <View className="gap-2">
      {label ? (
        <Text variant="label" tone="soft" className="font-semibold">
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor={COLORS.textSecondary}
        maxFontSizeMultiplier={2.2}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          seniorMode ? { fontSize: 19, minHeight: 54 } : undefined,
          style,
        ]}
        className={cn(
          'min-h-[48px] rounded-md border-[1.5px] bg-card px-3.5 text-body text-ink',
          error ? 'border-critical' : focused ? 'border-brand' : 'border-outline',
          className,
        )}
        {...props}
      />

      {message ? (
        <Text variant="micro" tone={error ? 'critical' : 'soft'}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
