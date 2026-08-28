import * as React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * Every piece of text in the app, at one of six sizes.
 *
 * The app previously used 21 distinct font sizes, 145 of the declarations
 * crammed between 10px and 14px. That is the single biggest reason the screens
 * read as cluttered: with 21 steps there is no hierarchy, just noise. These six
 * are the whole scale, and `micro` is the floor — anything smaller is unreadable
 * at arm's length in a dim back room, which is the real working condition.
 */
const textVariants = cva('text-ink', {
  variants: {
    variant: {
      display: 'text-display font-bold tracking-tight',
      title: 'text-title font-bold tracking-tight',
      headline: 'text-headline font-bold tracking-tight',
      heading: 'text-heading font-semibold',
      body: 'text-body',
      label: 'text-label font-medium',
      micro: 'text-micro',
    },
    tone: {
      default: 'text-ink',
      soft: 'text-ink-soft',
      on: 'text-ink-on',
      brand: 'text-brand-dark',
      good: 'text-good',
      warn: 'text-warn',
      critical: 'text-critical',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
});

export type TextVariant = VariantProps<typeof textVariants>;

export function Text({
  className,
  variant,
  tone,
  ...props
}: TextProps & TextVariant) {
  return <RNText className={cn(textVariants({ variant, tone }), className)} {...props} />;
}
