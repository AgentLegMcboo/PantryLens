import React, { createContext, useContext } from 'react';
import { useRouter, type Href } from 'expo-router';

// The development preview can keep navigation between real screens local.
// Production falls through to Expo Router for the same destinations.
export const NavigationOverride = createContext<((href: Href | null) => boolean) | null>(null);
export function useAppRouter() {
  const router = useRouter();
  const navigate = useContext(NavigationOverride);
  return {
    ...router,
    push: (href: Href) => { if (!navigate?.(href)) router.push(href); },
    replace: (href: Href) => { if (!navigate?.(href)) router.replace(href); },
    back: () => { if (!navigate?.(null)) router.back(); },
  };
}
