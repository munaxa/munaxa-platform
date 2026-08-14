import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AppShellProvider } from './app-shell-context.js';
import { AppShell } from './app-shell.js';
import { Sidebar } from './sidebar.js';
import { SidebarNav, type NavigationGroup } from './navigation.js';

/**
 * Phase 8.16 — the rail is a landmark, and the brand is inside it.
 *
 * This element has had three shapes, each answering a different measurement:
 *
 * - `<aside>`: an **unnamed** `complementary`. With `Split`'s inspector also unnamed, a landmark
 *   list showed two entries nobody could tell apart — `landmark-unique`, fixed in Phase 8.12.
 * - `<div>`: no landmark at all. Right about the duplicate, and it left the brand lockup outside
 *   the landmark tree — `region` on **every route of Munaxa Docs, in both themes**, one node each,
 *   always the brand image. Invisible until Phase 8.16 because the component matrix disables
 *   page-structure rules and the application sweep filtered to critical and serious.
 * - `<nav aria-label>`: what it actually is — the workspace's navigation column, holding the brand,
 *   the primary navigation and a footer.
 *
 * Both directions are asserted, because the two defects pull opposite ways: the rail must be a
 * named landmark, *and* it must not reintroduce an anonymous one.
 */

const GROUPS: NavigationGroup[] = [
  {
    title: 'Work',
    items: [
      { href: '/', label: 'Home' },
      { href: '/documents', label: 'Documents' },
    ],
  },
];

/*
 * `useIsMobile` reads `matchMedia`, which happy-dom does not implement. The rail renders nothing on
 * mobile, so without this every assertion below would pass vacuously against an empty tree.
 */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

function Shell({ railLabel }: { railLabel?: string } = {}) {
  return (
    <AppShellProvider>
      <AppShell
        sidebar={
          <Sidebar
            brand={<img alt="Munaxa Docs" src="/brand.svg" />}
            {...(railLabel === undefined ? {} : { railLabel })}
          >
            <SidebarNav groups={GROUPS} label="Main" />
          </Sidebar>
        }
      >
        <p>Content</p>
      </AppShell>
    </AppShellProvider>
  );
}

describe('the navigation rail', () => {
  it('renders at all, so nothing below asserts against an empty tree', () => {
    render(<Shell />);
    expect(screen.getByAltText('Munaxa Docs')).toBeInTheDocument();
  });

  it('is a landmark, so the brand is not outside the landmark tree', () => {
    render(<Shell />);

    const rail = screen.getByRole('navigation', { name: 'Workspace' });
    expect(rail.tagName.toLowerCase()).toBe('nav');
    expect(
      rail.querySelector('img[alt="Munaxa Docs"]'),
      'the brand must sit inside a landmark — this is exactly what `region` reported',
    ).not.toBeNull();
  });

  it('still exposes the primary navigation by its own name', () => {
    render(<Shell />);
    const workspace = screen.getByRole('navigation', { name: 'Workspace' });
    const main = screen.getByRole('navigation', { name: 'Main' });
    expect(workspace.contains(main), 'the primary nav sits inside the rail').toBe(true);
    expect(workspace).not.toBe(main);
  });

  it('names the rail whatever the product needs it called', () => {
    render(<Shell railLabel="Espace de travail" />);
    expect(screen.getByRole('navigation', { name: 'Espace de travail' })).toBeInTheDocument();
  });

  it('adds no anonymous landmark, which is the defect the first shape had', () => {
    const { container } = render(<Shell />);
    const anonymous = [...container.querySelectorAll('nav, aside, [role="complementary"]')].filter(
      (el) => el.getAttribute('aria-label') === null && el.getAttribute('aria-labelledby') === null,
    );
    expect(
      anonymous.map((el) => el.tagName.toLowerCase()),
      'every landmark the rail contributes must be named',
    ).toStrictEqual([]);
  });
});
