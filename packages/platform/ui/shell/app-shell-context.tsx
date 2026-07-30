'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useIsMobile } from '../hooks/use-breakpoint.js';

export interface AppShellContextValue {
  /** Sidebar is showing the icon rail rather than the labelled panel. Desktop only. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  /** The navigation drawer is open. Narrow viewports only. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** True below `md`, where navigation moves from a rail into the drawer. */
  isMobile: boolean;
  /** Id of the main region, so the skip link and the workspace agree without a magic string. */
  mainId: string;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export interface AppShellProviderProps {
  children: ReactNode;
  /** Controlled collapsed state. Pair with `onCollapsedChange`. */
  collapsed?: boolean;
  /** Initial collapsed state when uncontrolled. */
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Controlled drawer state. Pair with `onDrawerOpenChange`. */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
}

/**
 * Owns the state the shell's parts share: whether the sidebar is collapsed, whether the drawer is
 * open, and which breakpoint the viewport is at.
 *
 * The provider holds state but deliberately **persists nothing**. Where a preference is stored —
 * `localStorage`, a cookie, a user record on the server — is an application decision, and a
 * platform that wrote to a storage key would either invent a name for itself or bake a product's
 * name into shared code. Pass `collapsed` and `onCollapsedChange` to own it; omit them and the
 * shell keeps the state for the session only.
 *
 * `isMobile` is derived here rather than in each part, so the rail, the drawer and the trigger can
 * never disagree about which one should be visible.
 */
export function AppShellProvider({
  children,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  drawerOpen: controlledDrawerOpen,
  onDrawerOpenChange,
}: AppShellProviderProps) {
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(defaultCollapsed);
  const [uncontrolledDrawerOpen, setUncontrolledDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const mainId = useId();

  const collapsed = controlledCollapsed ?? uncontrolledCollapsed;
  const drawerOpen = controlledDrawerOpen ?? uncontrolledDrawerOpen;

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (controlledCollapsed === undefined) setUncontrolledCollapsed(next);
      onCollapsedChange?.(next);
    },
    [controlledCollapsed, onCollapsedChange],
  );

  const setDrawerOpen = useCallback(
    (next: boolean) => {
      if (controlledDrawerOpen === undefined) setUncontrolledDrawerOpen(next);
      onDrawerOpenChange?.(next);
    },
    [controlledDrawerOpen, onDrawerOpenChange],
  );

  const toggleCollapsed = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  // Widening past the drawer breakpoint leaves an open drawer stranded over a visible rail, with
  // its focus trap still armed. Close it as soon as the rail takes over.
  useEffect(() => {
    if (!isMobile && drawerOpen) setDrawerOpen(false);
  }, [isMobile, drawerOpen, setDrawerOpen]);

  const value = useMemo<AppShellContextValue>(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      drawerOpen,
      setDrawerOpen,
      isMobile,
      mainId,
    }),
    [collapsed, setCollapsed, toggleCollapsed, drawerOpen, setDrawerOpen, isMobile, mainId],
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

/**
 * Read the surrounding shell.
 *
 * Throws outside a provider rather than returning null: every part that calls this is meaningless
 * on its own, and a silent no-op would show up as a sidebar toggle that does nothing.
 */
export function useAppShell(): AppShellContextValue {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('Shell components must be used within <AppShellProvider>');
  }
  return context;
}
