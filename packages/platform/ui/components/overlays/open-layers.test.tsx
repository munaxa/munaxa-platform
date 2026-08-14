import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Autocomplete } from '../forms/autocomplete.js';
import { Combobox, MultiSelect, type ComboboxOption } from '../forms/combobox.js';
import { NotificationMenu, OrganizationSwitcher } from '../../shell/menus.js';

/**
 * Phase 8.14 — the defects that only exist while a layer is open.
 *
 * The accessibility matrix runs axe on the canonical render, and exactly one story out of 106 was
 * opened before it. Opening the other 78 collapsed triggers found three shared components emitting
 * an ARIA container that owned the wrong kind of child — `aria-required-children`, which axe rates
 * **critical**, and which entitles a screen reader to disregard the items it cannot account for.
 *
 * All of them are the same mistake in different places: something that is neither an `option` nor a
 * `menuitem` sitting directly inside a `listbox` or a `menu`.
 *
 * Every assertion below runs against a layer this test has actually opened. None of them is guarded
 * by "if the layer rendered" — a check that skips itself when the thing it measures is absent is
 * how a suite reports green on nothing at all, which is the failure this whole phase is about.
 */

const OPTIONS: ComboboxOption[] = [
  { value: '1', label: 'Alpha' },
  { value: '2', label: 'Beta' },
];

const ORGS = [
  { id: 'a', name: 'Northgate Academy' },
  { id: 'b', name: 'Riverside School' },
];

const NOTIFICATIONS = [
  { id: '1', title: 'Enrolment approved', unread: true },
  { id: '2', title: 'Payment received' },
];

/** Children a `listbox` is not permitted to own. `cmdk` wraps its rows in a sizer element. */
function illegalListboxChildren(root: Element): string[] {
  const list = root.querySelector('[role="listbox"]');
  if (list === null) return ['NO LISTBOX RENDERED'];
  return [...list.children]
    .flatMap((child) => (child.hasAttribute('cmdk-list-sizer') ? [...child.children] : [child]))
    .filter((child) => {
      const role = child.getAttribute('role');
      return role !== 'option' && role !== 'group' && role !== 'presentation';
    })
    .map((child) => `${child.tagName.toLowerCase()}[role=${child.getAttribute('role') ?? 'none'}]`);
}

/** Children a `menu` is not permitted to own. */
function illegalMenuChildren(root: Element): string[] {
  const menu = root.querySelector('[role="menu"]');
  if (menu === null) return ['NO MENU RENDERED'];
  const allowed = ['menuitem', 'menuitemradio', 'menuitemcheckbox', 'group', 'separator'];
  return [...menu.children]
    .filter((child) => {
      const role = child.getAttribute('role');
      // A role-less label div is a `presentation`-equivalent leaf and is not an owned widget; what
      // breaks ownership is a role-less element that *contains* the items.
      if (role === null) return child.querySelector('[role^="menuitem"]') !== null;
      return !allowed.includes(role);
    })
    .map((child) => `${child.tagName.toLowerCase()}[role=${child.getAttribute('role') ?? 'none'}]`);
}

describe('Combobox and MultiSelect, while loading', () => {
  it('Combobox keeps the busy text out of the listbox', async () => {
    const user = userEvent.setup();
    render(
      <Combobox value="" onChange={() => {}} options={OPTIONS} loading aria-label="Organisation" />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());

    expect(
      illegalListboxChildren(document.body),
      'a listbox may own only `option` and `group`',
    ).toStrictEqual([]);
    expect(document.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('MultiSelect does the same', async () => {
    const user = userEvent.setup();
    render(
      <MultiSelect value={[]} onChange={() => {}} options={OPTIONS} loading aria-label="Tags" />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Tags' }));
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());

    expect(illegalListboxChildren(document.body)).toStrictEqual([]);
  });
});

describe('Autocomplete', () => {
  it('keeps the busy text out of the listbox', async () => {
    const user = userEvent.setup();
    render(
      <Autocomplete value="" onChange={() => {}} options={[]} loading aria-label="Search people" />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Search people' }));
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());

    expect(illegalListboxChildren(document.body)).toStrictEqual([]);
    expect(document.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('keeps the empty text out of the listbox too', async () => {
    const user = userEvent.setup();
    render(<Autocomplete value="" onChange={() => {}} options={[]} aria-label="Search people" />);
    await user.click(screen.getByRole('combobox', { name: 'Search people' }));
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());

    expect(illegalListboxChildren(document.body)).toStrictEqual([]);
  });
});

describe('the shell menus', () => {
  it('OrganizationSwitcher lets the menu own its items directly', async () => {
    const user = userEvent.setup();
    render(<OrganizationSwitcher organizations={ORGS} currentId="a" onSelect={() => {}} />);
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());

    expect(
      illegalMenuChildren(document.body),
      'a ScrollArea between the menu and its items makes the menu own a generic element',
    ).toStrictEqual([]);
    expect(
      document.querySelector('[role="menu"] [data-radix-scroll-area-viewport]'),
      'the scroll belongs on the menu itself',
    ).toBeNull();
    expect(
      document.querySelectorAll('[role="menuitemradio"]').length,
      'the organisations must still be there',
    ).toBe(ORGS.length);
  });

  it('NotificationMenu does the same', async () => {
    const user = userEvent.setup();
    render(<NotificationMenu notifications={NOTIFICATIONS} />);
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());

    expect(illegalMenuChildren(document.body)).toStrictEqual([]);
    expect(document.querySelector('[role="menu"] [data-radix-scroll-area-viewport]')).toBeNull();
    expect(document.querySelectorAll('[role="menuitem"]').length).toBe(NOTIFICATIONS.length);
  });
});
