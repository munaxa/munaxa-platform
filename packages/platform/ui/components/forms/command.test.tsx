import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

/**
 * Phase 8.13 — the defect a separator in an *open* palette exposed.
 *
 * `CommandList` renders as `role="listbox"`, and ARIA lets a listbox own `option` and `group` and
 * nothing else. `cmdk` renders `CommandSeparator` as `role="separator"` directly inside it, so any
 * palette with a rule between two groups shipped an invalid listbox — `aria-required-children`,
 * which axe rates **critical**, and which entitles a screen reader to disregard options it cannot
 * account for.
 *
 * It went nine phases unnoticed for a reason worth naming: the matrix only measures the palette
 * while it is open, and until this phase no story put a separator in one. The component was public,
 * documented and exercised by nothing.
 */

function Palette() {
  return (
    <Command label="Commands">
      <CommandInput placeholder="Search…" />
      <CommandList>
        <CommandGroup heading="Documents">
          <CommandItem>New document</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Workspace">
          <CommandItem>Invite a colleague</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

describe('CommandSeparator', () => {
  it('does not put a separator inside the listbox, which ARIA forbids', () => {
    const { container } = render(<Palette />);

    const list = container.querySelector('[cmdk-list]');
    expect(list?.getAttribute('role'), 'the list is the listbox this is about').toBe('listbox');

    const separator = container.querySelector('[cmdk-separator]');
    expect(separator, 'the component must still render the rule').not.toBeNull();
    expect(
      separator?.getAttribute('aria-hidden'),
      'a listbox may own only `option` and `group`; a `separator` invalidates the whole list',
    ).toBe('true');
  });

  it('leaves a palette with a separator free of violations', async () => {
    const { container } = render(<Palette />);
    await expectNoA11yViolations(container);
  });
});
