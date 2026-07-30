import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from './filter-builder.js';
import { SearchBuilder, emptySearchQuery, type SearchQuery } from './search-builder.js';
import {
  countConditions,
  emptyFilter,
  isConditionComplete,
  operatorsFor,
  pruneFilter,
  type FilterField,
  type FilterGroup,
} from './types.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

const FIELDS: FilterField[] = [
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'grade', label: 'Grade', type: 'number' },
  { id: 'enrolled', label: 'Enrolled on', type: 'date' },
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'left', label: 'Left' },
    ],
  },
  { id: 'boarder', label: 'Boarder', type: 'boolean' },
];

describe('the filter model', () => {
  it('offers operators appropriate to each field type, and nothing else', () => {
    expect(operatorsFor(FIELDS[0]!)).toContain('contains');
    expect(operatorsFor(FIELDS[0]!)).not.toContain('between');
    expect(operatorsFor(FIELDS[1]!)).toContain('between');
    expect(operatorsFor(FIELDS[4]!)).toEqual(['eq']);
  });

  it('lets a field narrow the list', () => {
    expect(operatorsFor({ id: 'x', label: 'X', type: 'text', operators: ['eq'] })).toEqual(['eq']);
  });

  it('knows when a condition is finished', () => {
    const base = { id: '1', kind: 'condition' as const, fieldId: 'name' };
    expect(isConditionComplete({ ...base, operator: 'contains' })).toBe(false);
    expect(isConditionComplete({ ...base, operator: 'contains', value: 'a' })).toBe(true);
    // Valueless operators are complete on their own.
    expect(isConditionComplete({ ...base, operator: 'isEmpty' })).toBe(true);
    // `between` needs both bounds.
    expect(isConditionComplete({ ...base, operator: 'between', value: 1 })).toBe(false);
    expect(isConditionComplete({ ...base, operator: 'between', value: 1, valueTo: 5 })).toBe(true);
    // A list operator needs a non-empty list.
    expect(isConditionComplete({ ...base, operator: 'in', value: [] })).toBe(false);
    expect(isConditionComplete({ ...base, operator: 'in', value: ['a'] })).toBe(true);
  });

  it('prunes half-built conditions so they never reach a query', () => {
    const tree: FilterGroup = {
      id: 'root',
      kind: 'group',
      combinator: 'and',
      children: [
        { id: 'a', kind: 'condition', fieldId: 'name', operator: 'contains', value: 'ali' },
        { id: 'b', kind: 'condition', fieldId: 'grade', operator: 'eq' },
      ],
    };
    const pruned = pruneFilter(tree) as FilterGroup;
    expect(pruned.children).toHaveLength(1);
    expect(countConditions(pruned)).toBe(1);
  });

  it('collapses a group left with nothing in it', () => {
    const tree: FilterGroup = {
      id: 'root',
      kind: 'group',
      combinator: 'and',
      children: [
        { id: 'g', kind: 'group', combinator: 'or', children: [] },
        {
          id: 'h',
          kind: 'group',
          combinator: 'or',
          children: [{ id: 'i', kind: 'condition', fieldId: 'grade', operator: 'eq' }],
        },
      ],
    };
    expect(pruneFilter(tree)).toBeNull();
  });

  it('survives JSON, which is what a saved view and a URL need', () => {
    const tree: FilterGroup = {
      id: 'root',
      kind: 'group',
      combinator: 'or',
      children: [
        { id: 'a', kind: 'condition', fieldId: 'status', operator: 'in', value: ['active'] },
      ],
    };
    expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
  });
});

describe('FilterBuilder', () => {
  function Harness({ initial }: { initial?: FilterGroup } = {}) {
    const [value, setValue] = useState<FilterGroup>(initial ?? emptyFilter());
    return (
      <>
        <FilterBuilder fields={FIELDS} value={value} onChange={setValue} />
        <output data-testid="value">{JSON.stringify(value)}</output>
      </>
    );
  }

  const value = () => JSON.parse(screen.getByTestId('value').textContent ?? '{}') as FilterGroup;

  it('starts empty and says so', () => {
    render(<Harness />);
    expect(screen.getByText('No conditions yet')).toBeInTheDocument();
  });

  it('is a fieldset whose legend carries the combinator', () => {
    render(<Harness />);
    // A group announces how its children combine on entry, rather than leaving the user to infer
    // it from a word between two rows.
    expect(screen.getByRole('group', { name: /Match/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Match/ })).toHaveValue('and');
  });

  it('switches the combinator', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByRole('combobox', { name: /Match/ }), 'or');
    await waitFor(() => expect(value().combinator).toBe('or'));
  });

  it('adds a condition seeded with the first field and its first operator', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await waitFor(() => expect(value().children).toHaveLength(1));
    expect(screen.getByRole('combobox', { name: 'Field' })).toHaveValue('name');
    expect(screen.getByRole('combobox', { name: 'Operator' })).toHaveValue('contains');
  });

  it('renders the right control for each field type', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    const field = screen.getByRole('combobox', { name: 'Field' });

    // Text → a text box.
    expect(screen.getByRole('textbox', { name: /Name contains/ })).toBeInTheDocument();

    // Date → the platform's DatePicker, so it behaves like every other date field.
    await user.selectOptions(field, 'enrolled');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Choose date' })).toBeInTheDocument(),
    );

    // Boolean → a checkbox.
    await user.selectOptions(field, 'boarder');
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument());

    // Select with a list operator → MultiSelect.
    await user.selectOptions(field, 'status');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Status is any of/ })).toBeInTheDocument(),
    );
  });

  it('resets the operator and the value when the field changes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.type(screen.getByRole('textbox', { name: /Name contains/ }), 'ali');
    await waitFor(() => expect(value().children[0]).toMatchObject({ value: 'ali' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Field' }), 'grade');
    // A stale value would produce a clause that looks complete and filters nothing.
    await waitFor(() => expect(value().children[0]).toMatchObject({ fieldId: 'grade' }));
    expect((value().children[0] as { value?: unknown }).value).toBeUndefined();
  });

  it('renders no value control for a valueless operator', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operator' }), 'isEmpty');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Name/ })).not.toBeInTheDocument(),
    );
    // And it is nonetheless a complete condition.
    expect(countConditions(value())).toBe(1);
  });

  it('shows a second bound for between', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Field' }), 'grade');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Operator' }), 'between');
    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: /Grade is between — and/ }),
      ).toBeInTheDocument(),
    );
  });

  it('nests a group, and names it so it can be told apart', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await waitFor(() => expect(screen.getAllByRole('group')).toHaveLength(2));
    expect(screen.getByRole('combobox', { name: /Group 1/ })).toBeInTheDocument();
  });

  it('stops nesting at maxDepth', async () => {
    const user = userEvent.setup();
    function Capped() {
      const [value, setValue] = useState<FilterGroup>(emptyFilter());
      return <FilterBuilder fields={FIELDS} value={value} onChange={setValue} maxDepth={2} />;
    }
    render(<Capped />);
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    // The nested group offers conditions but not another group.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Add condition' })).toHaveLength(2),
    );
    expect(screen.getAllByRole('button', { name: 'Add group' })).toHaveLength(1);
  });

  it('removes a condition by a name that says which one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.click(screen.getByRole('button', { name: 'Remove condition: Name contains' }));
    await waitFor(() => expect(value().children).toHaveLength(0));
  });

  it('has no accessibility violations, nested', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await expectNoA11yViolations(container);
  });
});

describe('SearchBuilder', () => {
  function Harness({ onChange }: { onChange?: (value: SearchQuery) => void } = {}) {
    const [value, setValue] = useState<SearchQuery>(emptySearchQuery());
    return (
      <SearchBuilder
        fields={FIELDS}
        value={value}
        searchDebounce={0}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    );
  }

  it('reports the free text, debounced', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'ali');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'ali' })),
    );
  });

  it('opens the filter editor in a popover', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('button', { name: 'Add condition' })).toBeInTheDocument();
  });

  it('applies only complete conditions, and counts them on the button', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });

    // Two conditions, one of them left unfinished.
    await user.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Name contains/ }), 'ali');
    await user.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument(),
    );
    const last = onChange.mock.calls.at(-1)?.[0] as SearchQuery;
    expect(countConditions(last.filter)).toBe(1);
  });

  it('shows what is applied as removable chips', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    await user.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Name contains/ }), 'ali');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    // The chip names the field, not its id — the fields list reaches the summary.
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Applied filters' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Name contains ali')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Name contains ali' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Applied filters' })).not.toBeInTheDocument(),
    );
  });

  it('does not apply a draft that was abandoned', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    let dialog = await screen.findByRole('dialog', { name: 'Filters' });
    await user.click(within(dialog).getByRole('button', { name: 'Add condition' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Name contains/ }), 'ali');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();

    // Reopening starts from what is applied, not from the abandoned draft.
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByText('No conditions yet')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});
