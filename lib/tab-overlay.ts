import { create } from 'zustand';
import { createContext, useContext } from 'react';

/** Space needed to scroll the final control above our floating navigation. */
export const TabOverlayInsetContext = createContext(0);
export const useTabOverlayInset = () => useContext(TabOverlayInsetContext);

/**
 * Hides the floating tab bar while something needs the bottom of the screen,
 * like the drop tray when dragging an item onto a shelf.
 */
export const useTabBarHidden = create<{ hidden: boolean; setHidden: (hidden: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));
