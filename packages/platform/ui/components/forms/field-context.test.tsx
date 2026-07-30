import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './field.js';
import { Input, Select } from './input.js';
import { Textarea } from './textarea.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('Field context', () => {
  it('links the label to a control that supplies no id', () => {
    render(
      <Field label="Full name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Full name')).toBe(screen.getByRole('textbox'));
  });

  it('still honours an explicit htmlFor and id', () => {
    render(
      <Field label="Email" htmlFor="email">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'email');
    expect(screen.getByLabelText('Email')).toBe(screen.getByRole('textbox'));
  });

  it('describes the control by its hint', () => {
    render(
      <Field label="Email" hint="We never share this.">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('We never share this.');
  });

  it('describes the control by its error and marks it invalid', () => {
    render(
      <Field label="Email" error="Email is required.">
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Email is required.');
  });

  it('replaces the hint with the error rather than announcing both', () => {
    render(
      <Field label="Email" hint="We never share this." error="Email is required.">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Email is required.');
  });

  it('combines a description with the hint', () => {
    render(
      <Field label="Notes" description="Visible to staff only." hint="Max 500 characters.">
        <Textarea />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'Visible to staff only. Max 500 characters.',
    );
  });

  it('propagates required, disabled and readOnly to the control', () => {
    const { rerender } = render(
      <Field label="Name" required>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toBeRequired();

    rerender(
      <Field label="Name" disabled>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();

    rerender(
      <Field label="Name" readOnly>
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
  });

  it('lets an explicit prop win over the field', () => {
    render(
      <Field label="Name" error="Bad">
        <Input aria-invalid={false} />
      </Field>,
    );
    // `aria-invalid="false"` is the explicit negation, not an absent attribute: the caller said
    // "this control is valid" and that overrides the field's error state.
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });

  it('concatenates the field description with one the caller supplies', () => {
    render(
      <div>
        <span id="extra">Also see the policy.</span>
        <Field label="Name" hint="Full legal name.">
          <Input aria-describedby="extra" />
        </Field>
      </div>,
    );
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'Full legal name. Also see the policy.',
    );
  });

  it('applies to Select and Textarea too', () => {
    render(
      <div>
        <Field label="Grade" error="Pick a grade.">
          <Select>
            <option>6</option>
          </Select>
        </Field>
        <Field label="Notes" hint="Optional.">
          <Textarea />
        </Field>
      </div>,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Optional.');
  });

  it('leaves a standalone control untouched', () => {
    render(<Input aria-label="Loose" />);
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('renders an optional marker when asked', () => {
    render(
      <Field label="Middle name" optionalLabel="optional">
        <Input />
      </Field>,
    );
    expect(screen.getByText(/optional/)).toBeInTheDocument();
  });

  it('has no accessibility violations in the invalid state', async () => {
    const { container } = render(
      <Field label="Email" required description="Work address." error="Email is required.">
        <Input />
      </Field>,
    );
    await expectNoA11yViolations(container);
  });
});
