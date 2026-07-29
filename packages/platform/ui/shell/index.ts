/**
 * The application shell — the frame every product's screens sit inside.
 *
 * It is decomposed rather than monolithic: `AppShellProvider` owns the state the parts share, and
 * `AppShell`, `Sidebar`, `SidebarNav`, `TopBar`, `NavigationDrawer` and `SkipLink` each do one
 * thing. A product composes them, replaces any one of them, or uses the provider's state to build
 * its own — none of which is possible with a single 800-line component.
 *
 * The shell is product-agnostic by construction. It renders no logo, no search, no user menu and
 * no navigation data; it takes **already-resolved** navigation, because whether an item is visible
 * depends on permissions and feature flags, and those are business rules. It persists nothing,
 * because where a preference is stored is an application decision. And it imports no router: the
 * application supplies the link element through `renderLink`.
 *
 * ```tsx
 * <AppShellProvider collapsed={collapsed} onCollapsedChange={persist}>
 *   <AppShell
 *     skipLinkLabel="Skip to content"
 *     sidebar={<Sidebar brand={brand}><SidebarNav groups={groups} label="Main" renderLink={link} /></Sidebar>}
 *     drawer={<NavigationDrawer label="Navigation"><SidebarNav groups={groups} label="Main" renderLink={link} collapsed={false} /></NavigationDrawer>}
 *     topBar={<TopBar actions={<UserMenu />}><SidebarTrigger /></TopBar>}
 *   >
 *     {children}
 *   </AppShell>
 * </AppShellProvider>
 * ```
 */
export {
  AppShellProvider,
  useAppShell,
  type AppShellProviderProps,
  type AppShellContextValue,
} from './app-shell-context.js';
export { AppShell, SkipLink, type AppShellProps, type SkipLinkProps } from './app-shell.js';
export { Sidebar, type SidebarProps } from './sidebar.js';
export { NavigationDrawer, type NavigationDrawerProps } from './navigation-drawer.js';
export { TopBar, SidebarTrigger, type TopBarProps, type SidebarTriggerProps } from './top-bar.js';
export {
  SidebarNav,
  type SidebarNavProps,
  type NavigationItem,
  type NavigationGroup,
  type RenderNavigationLink,
} from './navigation.js';
