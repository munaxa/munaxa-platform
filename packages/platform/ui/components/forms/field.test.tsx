import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './field.js';
import { Input } from './input.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Field', () => {
  it('associates its label with the control via htmlFor', () => {
    render(
      <Field label="Full name" htmlFor="name">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText('Full name')).toBe(screen.getByRole('textbox'));
  });

  it('renders a hint when there is no error', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share this.">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByText('We never share this.')).toBeInTheDocument();
  });

  it('replaces the hint with the error and announces it assertively', () => {
    render(
      <Field label="Email" htmlFor="email" hint="We never share this." error="Email is required.">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Email is required.');
    expect(screen.queryByText('We never share this.')).not.toBeInTheDocument();
  });

  it('marks the required indicator as decorative so it is not read as "star"', () => {
    render(
      <Field label="Name" htmlFor="n" required>
        <Input id="n" />
      </Field>,
    );
    // The marker is aria-hidden, so the control's *accessible name* stays "Name" even though the
    // label's text content reads "Name *". Requiredness is conveyed by the control's `required`
    // attribute, not by a glyph a screen reader would announce as "star".
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Name');
    const marker = document.querySelector('label span[aria-hidden="true"]');
    expect(marker?.textContent).toContain('*');
  });

  it('merges className onto the wrapper', () => {
    const { container } = render(
      <Field label="X" htmlFor="x" className="col-span-2">
        <Input id="x" />
      </Field>,
    );
    expect(container.firstElementChild?.className).toContain('col-span-2');
  });

  it('has no accessibility violations in its error state', async () => {
    const { container } = render(
      <Field label="Email" htmlFor="email" required error="Email is required.">
        <Input id="email" aria-invalid="true" aria-describedby="email-error" />
      </Field>,
    );
    await expectNoA11yViolations(container);
  });
});
