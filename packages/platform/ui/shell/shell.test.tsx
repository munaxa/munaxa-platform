import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type ComponentProps, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShellProvider, useAppShell } from './app-shell-context.js';
import { AppShell, SkipLink } from './app-shell.js';
import { Sidebar } from './sidebar.js';
import { NavigationDrawer } from './navigation-drawer.js';
import { TopBar, SidebarTrigger } from './top-bar.js';
import { SidebarNav, type NavigationGroup } from './navigation.js';
import { expectNoA11yViolations } from '../../test/setup.js';

/**
 * `useIsMobile` reads `matchMedia`, which happy-dom does not implement.
 *
 * The stub keeps its listeners and re-evaluates them on `setViewport`, because `useMediaQuery`
 * subscribes once and updates only on a `change` event — a stub that swallowed listeners would
 * make every "viewport changed" test silently untestable.
 */
const listeners = new Set<{ query: string; notify: () => void }>();
let isMobileViewport = false;

function matches(query: string): boolean {
  // `useIsMobile` is `!useBreakpoint('md')`, so a min-width query matches when we are not mobile.
  return query.includes('min-width') ? !isMobileViewport : false;
}

function setViewport(mobile: boolean) {
  isMobileViewport = mobile;
  for (const listener of listeners) listener.notify();
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => {
    const handlers = new Set<() => void>();
    const entry = { query, notify: () => handlers.forEach((h) => h()) };
    return {
      get matches() {
        return matches(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, handler: () => void) => {
        handlers.add(handler);
        listeners.add(entry);
      },
      removeEventListener: (_: string, handler: () => void) => {
        handlers.delete(handler);
        if (handlers.size === 0) listeners.delete(entry);
      },
      dispatchEvent: () => false,
    };
  },
});

const GROUPS: NavigationGroup[] = [
  { items: [{ href: '/', label: 'Dashboard', active: true }] },
  {
    title: 'People',
    items: [
      { href: '/students', label: 'Students' },
      { href: '/staff', label: 'Staff', badge: '3' },
      { href: '/archive', label: 'Archive', disabled: true },
    ],
  },
];

type ShellProps = Omit<ComponentProps<typeof AppShellProvider>, 'children'> & {
  children?: ReactNode;
};

function Shell({ children, ...providerProps }: ShellProps) {
  return (
    <AppShellProvider {...providerProps}>
      <AppShell
        skipLinkLabel="Skip to content"
        sidebar={
          <Sidebar brand={<span>Brand</span>} footer={<span>Session</span>}>
            <SidebarNav groups={GROUPS} label="Main" />
          </Sidebar>
        }
        drawer={
          <NavigationDrawer label="Navigation" brand={<span>Brand</span>}>
            <SidebarNav groups={GROUPS} label="Main" collapsed={false} />
          </NavigationDrawer>
        }
        topBar={
          <TopBar actions={<button type="button">Account</button>}>
            <SidebarTrigger />
          </TopBar>
        }
      >
        {children ?? <p>Page content</p>}
      </AppShell>
    </AppShellProvider>
  );
}

beforeEach(() => setViewport(false));

describe('AppShellProvider', () => {
  it('throws when a shell part is used outside it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<SkipLink label="Skip" />)).toThrow(/within <AppShellProvider>/);
    spy.mockRestore();
  });

  it('keeps collapsed state for the session when uncontrolled', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const toggle = screen.getByRole('button', { name: 'Collapse navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('honours a controlled collapsed value and reports changes instead of self-updating', async () => {
    const onCollapsedChange = vi.fn();
    const user = userEvent.setup();
    render(<Shell collapsed={false} onCollapsedChange={onCollapsedChange} />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    // Controlled: it does not move until the owner passes a new value.
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeInTheDocument();
  });

  it('persists nothing itself', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('starts collapsed when told to', () => {
    render(<Shell defaultCollapsed />);
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument();
  });
});

describe('AppShell frame', () => {
  it('exposes banner, navigation and main landmarks', () => {
    render(<Shell />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Page content');
  });

  it('points the skip link at the main region', () => {
    render(<Shell />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    const main = screen.getByRole('main');
    expect(link.getAttribute('href')).toBe(`#${main.id}`);
  });

  it('makes the skip link the first thing a keyboard user reaches', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  });

  it('gives the content column min-w-0 so wide content scrolls', () => {
    const { container } = render(<Shell />);
    expect(container.querySelector('.min-w-0')).toBeInTheDocument();
  });
});

describe('Sidebar and SidebarNav', () => {
  it('renders resolved navigation and marks the active item', () => {
    render(<Shell />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Students' })).not.toHaveAttribute('aria-current');
  });

  it('renders group titles and item badges', () => {
    render(<Shell />);
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('keeps every link named when collapsed to the icon rail', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    // The visible label is gone but the accessible name must survive.
    expect(screen.getByRole('link', { name: 'Students' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('title', 'Students');
  });

  it('hides the footer when collapsed', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    expect(screen.getByText('Session')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(screen.queryByText('Session')).not.toBeInTheDocument();
  });

  it('uses the supplied link element instead of importing a router', () => {
    render(
      <AppShellProvider>
        <SidebarNav
          groups={GROUPS}
          label="Main"
          renderLink={({ href, children, ...rest }) => (
            <a href={href} data-custom-link="yes" {...rest}>
              {children}
            </a>
          )}
        />
      </AppShellProvider>,
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'data-custom-link',
      'yes',
    );
  });

  it('renders no rail at all below the drawer breakpoint', () => {
    setViewport(true);
    render(<Shell />);
    // Only the trigger is present; the navigation itself lives in the closed drawer.
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });
});

describe('NavigationDrawer', () => {
  beforeEach(() => setViewport(true));

  it('is closed until the trigger is used', () => {
    render(<Shell />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a labelled modal dialog', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('advertises what the trigger controls', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await screen.findByRole('dialog');
  });

  it('closes on Escape, on the close button and on the scrim', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const open = () => user.click(screen.getByRole('button', { name: 'Open navigation' }));

    await open();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await open();
    await user.click(await screen.findByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await open();
    const dialog = await screen.findByRole('dialog');
    await user.click(dialog.previousElementSibling as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('traps focus and locks the page behind it', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('dialog');

    expect(document.body.style.overflow).toBe('hidden');

    await user.tab();
    const first = document.activeElement;
    // Walk past the last control; focus must come back inside rather than escaping to the page.
    for (let i = 0; i < 8; i += 1) await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(first).not.toBeNull();
  });

  it('restores focus to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes itself when the viewport widens past the drawer breakpoint', async () => {
    const user = userEvent.setup();

    function DrawerProbe() {
      const { drawerOpen, setDrawerOpen } = useAppShell();
      return (
        <button type="button" onClick={() => setDrawerOpen(true)}>
          drawer:{String(drawerOpen)}
        </button>
      );
    }

    render(
      <AppShellProvider>
        <DrawerProbe />
      </AppShellProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'drawer:false' }));
    expect(screen.getByRole('button', { name: 'drawer:true' })).toBeInTheDocument();

    // An open drawer left over a visible rail keeps its focus trap armed over content the user
    // can already reach, so widening past the breakpoint must close it.
    setViewport(false);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'drawer:false' })).toBeInTheDocument(),
    );
  });
});

describe('accessibility', () => {
  it('the desktop shell has no violations', async () => {
    setViewport(false);
    const { container } = render(<Shell />);
    await expectNoA11yViolations(container);
  });

  it('the open drawer has no violations', async () => {
    setViewport(true);
    const user = userEvent.setup();
    const { baseElement } = render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('dialog');
    await expectNoA11yViolations(baseElement);
  });

  it('the collapsed rail has no violations', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const { container } = render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    await expectNoA11yViolations(container);
  });
});
