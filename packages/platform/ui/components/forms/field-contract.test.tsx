import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Field } from './field.js';
import { Input, Select } from './input.js';
import { Textarea } from './textarea.js';
import { Switch } from './switch.js';
import { Checkbox } from './checkbox.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

/**
 * Phase 8.15 — the labelling contract, asked of every control that can sit in a `Field`.
 *
 * `Field` renders `<label htmlFor={controlId}>` and publishes `controlId` through context. `Input`
 * and `Textarea` consumed it; `Switch` and `Checkbox` did not. So the obvious composition —
 *
 *     <Field label="Value"><Switch checked={…} onCheckedChange={…} /></Field>
 *
 * — rendered a label pointing at nothing and a `role="switch"` with no accessible name at all.
 * axe reports `button-name` at **critical**, and Munaxa Docs shipped **twelve** of them on
 * `/admin/settings`, in both themes, on a route no accessibility check had ever visited.
 *
 * The asymmetry was the defect, not any single control. Two of four honoured the contract, so the
 * correct-looking call site silently produced an unusable control — and the one product that
 * noticed worked around it by wiring `id`/`htmlFor` by hand in its own `SwitchField`, which is a
 * host-side patch for a platform gap.
 *
 * This test is written as a table on purpose: a control added later that ignores the context fails
 * here rather than in somebody's product.
 */

const CONTROLS = [
  { name: 'Input', node: <Input /> },
  { name: 'Select', node: <Select /> },
  { name: 'Textarea', node: <Textarea /> },
  { name: 'Switch', node: <Switch checked={false} onCheckedChange={() => {}} /> },
  { name: 'Checkbox', node: <Checkbox /> },
] as const;

describe('every control inside a Field', () => {
  it.each(CONTROLS)('$name takes the id the label points at', ({ node }) => {
    const { container } = render(<Field label="Retention period">{node}</Field>);

    const label = container.querySelector('label');
    const target = label?.getAttribute('for');
    expect(target, 'Field must render a label with an htmlFor').toBeTruthy();

    const control = container.querySelector(`#${CSS.escape(target as string)}`);
    expect(
      control,
      'the label points at an element that does not exist, so the control has no accessible name',
    ).not.toBeNull();
  });

  it.each(CONTROLS)('$name is reachable by its label text', ({ node }) => {
    render(<Field label="Retention period">{node}</Field>);
    // The strongest form of the assertion: the accessibility tree, not the DOM attribute.
    expect(screen.getByLabelText('Retention period')).toBeInTheDocument();
  });

  it('a switch in a field has no violations, which is what shipped broken', async () => {
    const { container } = render(
      <Field label="Reindex on save">
        <Switch checked onCheckedChange={() => {}} />
      </Field>,
    );
    expect(screen.getByRole('switch')).toHaveAccessibleName('Reindex on save');
    await expectNoA11yViolations(container);
  });

  it('still carries the field description to the control', () => {
    render(
      <Field label="Reindex on save" hint="Runs in the background.">
        <Switch checked={false} onCheckedChange={() => {}} />
      </Field>,
    );
    const control = screen.getByRole('switch');
    expect(
      control.getAttribute('aria-describedby'),
      'the hint must reach the control',
    ).toBeTruthy();
  });

  it('leaves a standalone control alone, so nothing outside a Field changed', () => {
    render(<Switch checked={false} onCheckedChange={() => {}} aria-label="Standalone" />);
    const control = screen.getByRole('switch');
    expect(control.getAttribute('id'), 'no Field, no generated id').toBeNull();
    expect(control).toHaveAccessibleName('Standalone');
  });
});
