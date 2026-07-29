import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityPicker, type PickerOption } from './entity-picker.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

const OPTIONS: PickerOption[] = [
  { id: '1', label: 'Alpha', sublabel: 'A-001' },
  { id: '2', label: 'Beta', sublabel: 'B-002' },
  { id: '3', label: 'Gamma', sublabel: 'G-003' },
];

const loader = () => Promise.resolve(OPTIONS);

/** Render with the option list already resolved, so tests start from a settled component. */
async function setup(props: Partial<Parameters<typeof EntityPicker>[0]> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const view = render(<EntityPicker value="" onChange={onChange} load={loader} {...props} />);
  await waitFor(() =>
    expect(screen.getByRole('combobox')).not.toHaveAttribute('placeholder', 'Loading…'),
  );
  return { onChange, user, ...view };
}

describe('EntityPicker', () => {
  it('exposes combobox semantics', async () => {
    await setup();
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-controls');
  });

  it('opens the listbox on focus and marks itself expanded', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters on both label and sublabel', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('B-002');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Beta');
  });

  it('shows the empty-state label when nothing matches', async () => {
    const { user } = await setup({ noMatchesLabel: 'Nothing here.' });
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('zzzz');
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('moves the active option with the arrow keys and selects with Enter', async () => {
    const { user, onChange } = await setup();
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant'));
    const activeAfterDown = input.getAttribute('aria-activedescendant');
    expect(activeAfterDown).toContain('-opt-2');

    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toContain('-opt-1'));

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('clamps arrow navigation at both ends of the list', async () => {
    const { user } = await setup();
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toContain('-opt-1'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toContain('-opt-3'));
  });

  it('closes on Escape without selecting', async () => {
    const { user, onChange } = await setup();
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on click', async () => {
    const { user, onChange } = await setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Gamma/ }));
    expect(onChange).toHaveBeenCalledWith('3');
  });

  it('marks the current value as the selected option', async () => {
    const { user } = await setup({ value: '2' });
    await user.click(screen.getByRole('combobox'));
    const beta = await screen.findByRole('option', { name: /Beta/ });
    expect(beta).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to a plain id input when the list cannot be loaded', async () => {
    const onChange = vi.fn();
    render(
      <EntityPicker value="" onChange={onChange} load={() => Promise.reject(new Error('403'))} />,
    );
    const input = await screen.findByPlaceholderText('Paste ID');
    expect(input).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await userEvent.setup().type(input, 'abc');
    expect(onChange).toHaveBeenCalled();
  });

  it('has no accessibility violations when open', async () => {
    const { user, container } = await setup();
    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('listbox');
    await expectNoA11yViolations(container);
  });
});
