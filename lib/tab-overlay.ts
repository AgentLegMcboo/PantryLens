import { createContext, useContext } from 'react';

/** Space needed to scroll the final control above our floating navigation. */
export const TabOverlayInsetContext = createContext(0);
export const useTabOverlayInset = () => useContext(TabOverlayInsetContext);
