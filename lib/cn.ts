import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class strings so a caller's className always wins over a component's
 * defaults. Without twMerge, `<Button className="bg-good">` would produce
 * "bg-brand bg-good" and which one applies is down to declaration order.
 *
 * Same helper shadcn/ui uses on the web; react-native-reusables keeps it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
