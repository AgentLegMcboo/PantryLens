import { useWindowDimensions } from 'react-native';

export const DESKTOP_BREAKPOINT = 1000;
export function useWorkspaceLayout() {
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP_BREAKPOINT;
  const workspaceWidth = width;
  return { desktop, wide: workspaceWidth >= 760, gutter: desktop ? 32 : 20, workspaceWidth };
}
