import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar } from './calendar.js';
import { DatePicker, DateRangePicker } from './date-picker.js';
import { TimePicker, DateTimePicker } from './time-picker.js';
import { TokenInput } from '../forms/token-input.js';
import { Field } from '../forms/field.js';
import { LocaleProvider, type DateRange } from '../../date/index.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

describe('TokenInput', () => {
  function Harness({
    value: initial,
    onChange,
    ...props
  }: Partial<Parameters<typeof TokenInput>[0]> = {}) {
    const [value, setValue] = useState<string[]>(initial ?? []);
    return (
      <TokenInput
        aria-label="Recipients"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('commits on Enter and on the delimiter', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Recipients' });
    await user.type(input, 'alpha{Enter}');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    await user.type(input, 'beta,');
    await waitFor(() => expect(screen.getByText('beta')).toBeInTheDocument());
    expect(input).toHaveValue('');
  });

  it('removes the last token with Backspace on an empty field', async () => {
    const user = userEvent.setup();
    render(<Harness value={['alpha', 'beta']} />);
    await user.click(screen.getByRole('textbox', { name: 'Recipients' }));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(screen.queryByText('beta')).not.toBeInTheDocument());
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('removes a token from its own button, by keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness value={['alpha']} onChange={onChange} />);
    screen.getByRole('button', { name: 'Remove alpha' }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('splits a pasted list into separate tokens', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Recipients' });
    await user.click(input);
    await user.paste('alpha, beta, gamma');
    await waitFor(() => expect(screen.getByText('gamma')).toBeInTheDocument());
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('announces a rejection rather than silently dropping it', async () => {
    const user = userEvent.setup();
    render(<Harness value={['alpha']} />);
    await user.type(screen.getByRole('textbox', { name: 'Recipients' }), 'alpha{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('alpha is already in the list.');
    // Still one token, not two.
    expect(screen.getAllByText('alpha')).toHaveLength(1);
  });

  it('applies validate, using its return value as the token', async () => {
    const user = userEvent.setup();
    render(<Harness validate={(token) => (token.includes('@') ? token.toLowerCase() : null)} />);
    const input = screen.getByRole('textbox', { name: 'Recipients' });
    await user.type(input, 'NOPE{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('NOPE is not valid.');
    await user.clear(input);
    await user.type(input, 'A@B.COM{Enter}');
    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
  });

  it('stops at maxTokens', async () => {
    const user = userEvent.setup();
    render(<Harness value={['alpha']} maxTokens={1} />);
    await user.type(screen.getByRole('textbox', { name: 'Recipients' }), 'beta{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('the list is full');
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('commits the half-typed token on blur instead of discarding it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: 'Recipients' }), 'alpha');
    await user.tab();
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness value={['alpha', 'beta']} />);
    await expectNoA11yViolations(container);
  });
});

describe('Calendar', () => {
  function Harness({
    value: initial = '2026-04-15',
    onChange,
    ...props
  }: Partial<Extract<Parameters<typeof Calendar>[0], { mode?: 'single' }>> = {}) {
    const [value, setValue] = useState(initial);
    return (
      <Calendar
        aria-label="Choose a date"
        locale="en-GB"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  /**
   * Days are found by their accessible name, which is the full date — "Wednesday, 15 April 2026".
   * The `\b` anchor keeps `5 April` from also matching `15 April`.
   */
  const day = (label: string) => screen.getByRole('button', { name: new RegExp(`\\b${label}$`) });

  it('renders the month of the selected date, six weeks deep', () => {
    render(<Harness />);
    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(7); // one heading row plus six weeks
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
  });

  it('marks the selected day and names it in full', () => {
    render(<Harness />);
    const selected = day('15 April 2026');
    expect(selected.closest('td')).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAccessibleName(/Wednesday, 15 April 2026/);
  });

  it('selects on click, reporting the wire format', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(day('20 April 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-04-20');
  });

  it('moves a day at a time with the arrows and selects with Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness autoFocus onChange={onChange} />);
    await waitFor(() => expect(day('15 April 2026')).toHaveFocus());
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(day('16 April 2026')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(day('23 April 2026')).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-04-23');
  });

  it('pages a month with PageDown and a year with Shift+PageDown', async () => {
    const user = userEvent.setup();
    render(<Harness autoFocus />);
    await waitFor(() => expect(day('15 April 2026')).toHaveFocus());
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(screen.getByText('May 2026')).toBeInTheDocument());
    await user.keyboard('{Shift>}{PageDown}{/Shift}');
    await waitFor(() => expect(screen.getByText('May 2027')).toBeInTheDocument());
  });

  it('moves to the ends of the displayed week with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness autoFocus weekStartsOn={1} />);
    await waitFor(() => expect(day('15 April 2026')).toHaveFocus());
    await user.keyboard('{Home}');
    await waitFor(() => expect(day('13 April 2026')).toHaveFocus()); // the Monday
    await user.keyboard('{End}');
    await waitFor(() => expect(day('19 April 2026')).toHaveFocus()); // the Sunday
  });

  it('keeps exactly one tab stop in the grid', () => {
    render(<Harness />);
    const tabbable = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('honours min, max and a per-date veto', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Harness
        min="2026-04-10"
        max="2026-04-20"
        isDateDisabled={(iso) => iso === '2026-04-17'}
        onChange={onChange}
      />,
    );
    expect(day('5 April 2026')).toHaveAttribute('aria-disabled', 'true');
    expect(day('17 April 2026')).toHaveAttribute('aria-disabled', 'true');
    await user.click(day('17 April 2026'));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(day('12 April 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-04-12');
  });

  it('starts the week where the caller says, without changing the dates', () => {
    const { rerender } = render(<Harness weekStartsOn={1} />);
    const headers = () =>
      screen.getAllByRole('columnheader').map((cell) => cell.getAttribute('abbr'));
    expect(headers()[0]).toBe('Monday');
    rerender(<Harness weekStartsOn={6} />);
    expect(headers()[0]).toBe('Saturday');
    expect(day('15 April 2026')).toBeInTheDocument();
  });

  it('takes its locale and week start from a LocaleProvider', () => {
    render(
      <LocaleProvider locale="en-US">
        <Calendar aria-label="Dates" value="2026-04-15" onChange={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('abbr', 'Sunday');
  });

  it('follows the writing direction for the horizontal arrows', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="ar-JO" direction="rtl">
        <Calendar
          autoFocus
          aria-label="Dates"
          locale="en-GB"
          value="2026-04-15"
          onChange={() => {}}
        />
      </LocaleProvider>,
    );
    await waitFor(() => expect(day('15 April 2026')).toHaveFocus());
    // In a right-to-left grid the days run leftwards, so ArrowLeft is forwards.
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(day('16 April 2026')).toHaveFocus());
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness showWeekNumbers />);
    await expectNoA11yViolations(container);
  });

  describe('range mode', () => {
    function RangeHarness({ onChange }: { onChange?: (value: DateRange) => void } = {}) {
      const [value, setValue] = useState<DateRange>({ start: null, end: null });
      return (
        <Calendar
          aria-label="Choose dates"
          locale="en-GB"
          mode="range"
          defaultMonth="2026-04-01"
          value={value}
          onChange={(next) => {
            setValue(next);
            onChange?.(next);
          }}
        />
      );
    }

    it('takes two clicks, reporting the half-made range in between', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<RangeHarness onChange={onChange} />);
      await user.click(day('10 April 2026'));
      expect(onChange).toHaveBeenLastCalledWith({ start: '2026-04-10', end: null });
      await user.click(day('20 April 2026'));
      expect(onChange).toHaveBeenLastCalledWith({ start: '2026-04-10', end: '2026-04-20' });
    });

    it('swaps the ends when the second date is earlier', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<RangeHarness onChange={onChange} />);
      await user.click(day('20 April 2026'));
      await user.click(day('10 April 2026'));
      expect(onChange).toHaveBeenLastCalledWith({ start: '2026-04-10', end: '2026-04-20' });
    });

    it('names the two ends of the range', async () => {
      const user = userEvent.setup();
      render(<RangeHarness />);
      await user.click(day('10 April 2026'));
      await user.click(day('20 April 2026'));
      expect(day('10 April 2026, Start of range')).toBeInTheDocument();
      expect(day('20 April 2026, End of range')).toBeInTheDocument();
    });

    it('shows two months when asked, sharing one keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <Calendar
          autoFocus
          aria-label="Dates"
          locale="en-GB"
          mode="range"
          numberOfMonths={2}
          defaultMonth="2026-04-01"
          value={{ start: '2026-04-30', end: null }}
          onChange={() => {}}
        />,
      );
      expect(screen.getByText('April 2026')).toBeInTheDocument();
      expect(screen.getByText('May 2026')).toBeInTheDocument();

      // 30 April is rendered twice — once in its own month and once as a borrowed leading day of
      // May — so each pane is queried separately rather than by name across the whole grid.
      const [april, may] = screen.getAllByRole('grid');
      const inApril = within(april as HTMLElement);
      const inMay = within(may as HTMLElement);

      await waitFor(() =>
        expect(
          inApril.getByRole('button', { name: /\b30 April 2026, Start of range$/ }),
        ).toHaveFocus(),
      );
      await user.keyboard('{ArrowRight}');
      // Focus crosses into the second pane without the caller doing anything.
      await waitFor(() =>
        expect(inMay.getByRole('button', { name: /\b1 May 2026$/ })).toHaveFocus(),
      );
    });
  });
});

describe('DatePicker', () => {
  function Harness({
    value: initial = '',
    onChange,
    ...props
  }: Partial<Parameters<typeof DatePicker>[0]> = {}) {
    const [value, setValue] = useState(initial);
    return (
      <DatePicker
        aria-label="Start date"
        locale="en-GB"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('shows the value in the locale field order and hints the same order', () => {
    render(<Harness value="2026-04-03" />);
    const input = screen.getByRole('textbox', { name: 'Start date' });
    expect(input).toHaveValue('03/04/2026');
    expect(input).toHaveAttribute('placeholder', 'dd/mm/yyyy');
  });

  it('accepts a typed date and reports it in the wire format', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Start date' });
    await user.type(input, '3/4/2026{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-04-03');
  });

  it('parses in the caller locale, not a hard-coded one', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness locale="en-US" onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Start date' }), '3/4/2026{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-03-04');
  });

  it('keeps what was typed, and flags it, until it parses', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Start date' });
    await user.type(input, '31/2/2026');
    // The text is not rewritten mid-edit — that is what makes a typo correctable.
    expect(input).toHaveValue('31/2/2026');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid date.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the calendar from the button and selects from it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness value="2026-04-15" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    const dialog = await screen.findByRole('dialog', { name: 'Calendar' });
    await user.click(within(dialog).getByRole('button', { name: new RegExp('\\b20 April 2026$') }));
    expect(onChange).toHaveBeenCalledWith('2026-04-20');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the calendar with Alt+ArrowDown from the field', async () => {
    const user = userEvent.setup();
    render(<Harness value="2026-04-15" />);
    await user.click(screen.getByRole('textbox', { name: 'Start date' }));
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(await screen.findByRole('dialog', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('inherits label, description and validity from Field', () => {
    render(
      <Field label="Enrolled on" error="Required." required>
        <DatePicker value="" onChange={() => {}} />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Enrolled on' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required.');
  });

  it('carries required onto the field, so a form still enforces it', () => {
    // The prop exists so a native `<Input required>` migrated onto the picker keeps its browser
    // validation. It reaches the same text input the user types into.
    render(<DatePicker value="" onChange={() => {}} required aria-label="Enrolled on" />);
    expect(screen.getByRole('textbox', { name: 'Enrolled on' })).toBeRequired();
  });

  it('does not open when read-only, and stays readable', async () => {
    const user = userEvent.setup();
    render(<Harness value="2026-04-15" readOnly />);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Start date' })).toHaveValue('15/04/2026');
  });

  it('has no accessibility violations, closed or open', async () => {
    const user = userEvent.setup();
    const { container, baseElement } = render(<Harness value="2026-04-15" />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    await screen.findByRole('dialog', { name: 'Calendar' });
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('DateRangePicker', () => {
  function Harness({ onChange }: { onChange?: (value: DateRange) => void } = {}) {
    const [value, setValue] = useState<DateRange>({ start: '2026-04-10', end: '2026-04-20' });
    return (
      <DateRangePicker
        locale="en-GB"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('shows both ends as separately named fields', () => {
    render(<Harness />);
    expect(screen.getByRole('textbox', { name: 'Start date' })).toHaveValue('10/04/2026');
    expect(screen.getByRole('textbox', { name: 'End date' })).toHaveValue('20/04/2026');
  });

  it('accepts a typed end date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const end = screen.getByRole('textbox', { name: 'End date' });
    await user.clear(end);
    await user.type(end, '25/04/2026');
    await user.tab();
    expect(onChange).toHaveBeenCalledWith({ start: '2026-04-10', end: '2026-04-25' });
  });

  it('opens one two-month calendar and stays open until both ends are chosen', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Choose date' }));
    const dialog = await screen.findByRole('dialog', { name: 'Calendar' });
    expect(within(dialog).getAllByRole('grid')).toHaveLength(2);

    await user.click(within(dialog).getByRole('button', { name: new RegExp('\\b12 April 2026$') }));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-04-12', end: null });
    expect(screen.getByRole('dialog', { name: 'Calendar' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: new RegExp('\\b18 April 2026$') }));
    expect(onChange).toHaveBeenLastCalledWith({ start: '2026-04-12', end: '2026-04-18' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('TimePicker', () => {
  function Harness({
    value: initial = '',
    onChange,
    ...props
  }: Partial<Parameters<typeof TimePicker>[0]> = {}) {
    const [value, setValue] = useState(initial);
    return (
      <TimePicker
        aria-label="Starts at"
        locale="en-GB"
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('displays in the locale clock and stores 24-hour', () => {
    const { rerender } = render(<Harness value="21:05" hourCycle="h23" />);
    expect(screen.getByRole('textbox', { name: 'Starts at' })).toHaveValue('21:05');
    rerender(<Harness value="21:05" hourCycle="h12" locale="en-US" />);
    expect(screen.getByRole('textbox', { name: 'Starts at' })).toHaveValue('9:05 PM');
  });

  it('accepts a loosely typed time', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness locale="en-US" onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Starts at' }), '9 pm{Enter}');
    expect(onChange).toHaveBeenCalledWith('21:00');
  });

  it('flags a time that cannot be read instead of discarding it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Starts at' });
    await user.type(input, '25:99');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid time.');
  });

  it('offers a list on the chosen step', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness hourCycle="h23" step={60} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Choose time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Times' });
    expect(within(dialog).getAllByRole('option')).toHaveLength(24);
    await user.click(within(dialog).getByRole('option', { name: '09:00' }));
    expect(onChange).toHaveBeenCalledWith('09:00');
  });

  it('has no accessibility violations when the list is open', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Harness value="09:00" hourCycle="h23" step={60} />);
    await user.click(screen.getByRole('button', { name: 'Choose time' }));
    await screen.findByRole('dialog', { name: 'Times' });
    await expectNoA11yViolations(baseElement, { radixOverlay: true });
  });
});

describe('DateTimePicker', () => {
  function Harness({ onChange }: { onChange?: (value: string) => void } = {}) {
    const [value, setValue] = useState('2026-04-15T09:30');
    return (
      <DateTimePicker
        locale="en-GB"
        hourCycle="h23"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('splits the value across two separately named controls', () => {
    render(<Harness />);
    expect(screen.getByRole('textbox', { name: 'Date' })).toHaveValue('15/04/2026');
    expect(screen.getByRole('textbox', { name: 'Time' })).toHaveValue('09:30');
  });

  it('rejoins them when either half changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const time = screen.getByRole('textbox', { name: 'Time' });
    await user.clear(time);
    await user.type(time, '14:00{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-04-15T14:00');
  });

  it('holds a time chosen before a date rather than emitting a broken value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const date = screen.getByRole('textbox', { name: 'Date' });
    await user.clear(date);
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith('');
    // The time is still on screen — it was kept, not thrown away.
    expect(screen.getByRole('textbox', { name: 'Time' })).toHaveValue('09:30');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});
