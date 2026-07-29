import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox, MultiSelect, type ComboboxOption } from './combobox.js';
import { Autocomplete } from './autocomplete.js';
import { Field } from './field.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

const OPTIONS: ComboboxOption[] = [
  { value: '1', label: 'Alpha', description: 'A-001', group: 'Active' },
  { value: '2', label: 'Beta', description: 'B-002', group: 'Active' },
  { value: '3', label: 'Gamma', description: 'G-003', group: 'Archived' },
  { value: '4', label: 'Delta', disabled: true, group: 'Archived' },
];

describe('Combobox', () => {
  // `value` is pulled out of the spread: leaving it in would re-apply the initial prop on every
  // render and make the harness permanently controlled, so nothing the component did would show.
  function Harness({
    value: initial,
    onChange,
    ...props
  }: Partial<Parameters<typeof Combobox>[0]> = {}) {
    const [value, setValue] = useState(initial ?? '');
    return (
      <Combobox
        options={OPTIONS}
        aria-label="Organisation"
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('is a closed combobox showing the placeholder', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Organisation' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Select…');
  });

  it('opens on click and lists the options under their groups', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    expect(await screen.findByRole('option', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('option', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('filters as the user types, matching description as well as label', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.keyboard('B-002');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByRole('option')).toHaveTextContent('Beta');
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness labels={{ empty: 'Nothing here.' }} />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.keyboard('zzzz');
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });

  it('selects with Enter and closes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await screen.findByRole('option', { name: /Alpha/ });
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('1'));
  });

  it('selects on click and shows the label on the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.click(await screen.findByRole('option', { name: /Gamma/ }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveTextContent('Gamma'),
    );
  });

  it('closes on Escape without selecting', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await screen.findByRole('option', { name: /Alpha/ });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the selection when clearable', async () => {
    const user = userEvent.setup();
    render(<Harness value="1" clearable />);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveTextContent('Select…'),
    );
  });

  it('hands filtering to the caller when onSearch is given', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearch={onSearch} searchDebounce={0} />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await user.keyboard('gam');
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('gam'));
    // Local filtering is off, so every option is still rendered.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('shows a loading state instead of the list', async () => {
    const user = userEvent.setup();
    render(<Harness loading labels={{ loading: 'Fetching…' }} />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    expect(await screen.findByText('Fetching…')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('does not open when disabled, and stays in the tab order when read-only', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness disabled />);
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toBeDisabled();

    rerender(<Harness readOnly />);
    const trigger = screen.getByRole('combobox', { name: 'Organisation' });
    expect(trigger).not.toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('inherits label, description and validity from Field', () => {
    render(
      <Field label="Organisation" error="Pick one." required>
        <Combobox options={OPTIONS} value="" onChange={() => {}} />
      </Field>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Organisation' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAccessibleDescription('Pick one.');
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Organisation' }));
    await screen.findByRole('option', { name: /Alpha/ });
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('MultiSelect', () => {
  function Harness({
    value: initial,
    onChange,
    ...props
  }: Partial<Parameters<typeof MultiSelect>[0]> = {}) {
    const [value, setValue] = useState<string[]>(initial ?? []);
    return (
      <MultiSelect
        options={OPTIONS}
        aria-label="Departments"
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('accumulates selections and keeps the panel open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Departments' }));
    await user.click(await screen.findByRole('option', { name: /Alpha/ }));
    // Choosing several things one dismissal at a time is the usual complaint; the panel stays.
    expect(screen.getByRole('option', { name: /Beta/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Beta/ }));
    await waitFor(() => expect(screen.getAllByText(/Alpha|Beta/).length).toBeGreaterThan(1));
  });

  it('deselects an already-selected option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness value={['1']} onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Departments' }));
    await user.click(await screen.findByRole('option', { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('removes a selection from its token, by keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness value={['1']} onChange={onChange} />);
    const remove = screen.getByRole('button', { name: 'Remove Alpha' });
    remove.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('stops adding at maxSelected but still allows removal', async () => {
    const user = userEvent.setup();
    render(<Harness value={['1']} maxSelected={1} />);
    await user.click(screen.getByRole('combobox', { name: 'Departments' }));
    expect(await screen.findByRole('option', { name: /Beta/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: /Alpha/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Harness value={['1']} />);
    await user.click(screen.getByRole('combobox', { name: 'Departments' }));
    await screen.findByRole('option', { name: /Alpha/ });
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('Autocomplete', () => {
  function Harness({
    value: initial,
    onChange,
    ...props
  }: Partial<Parameters<typeof Autocomplete>[0]> = {}) {
    const [value, setValue] = useState(initial ?? '');
    return (
      <Autocomplete
        options={OPTIONS}
        aria-label="Search"
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('is the search box itself — focus opens the list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Search' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.click(input);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps focus on the input while the arrows move the active option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: 'Search' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    // Focus must not move into the list, or typing would break.
    expect(input).toHaveFocus();
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toContain('-opt-2'));
  });

  it('reports raw text as the value when custom values are allowed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness allowCustomValue onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Search' }));
    await user.keyboard('abc');
    expect(onChange).toHaveBeenLastCalledWith('abc');
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Search' }));
    await screen.findByRole('listbox');
    await expectNoA11yViolations(container);
  });
});
