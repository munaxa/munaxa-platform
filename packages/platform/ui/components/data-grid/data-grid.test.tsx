import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, renderHook, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataGrid, type DataGridProps } from './data-grid.js';
import { useDataGrid } from './use-data-grid.js';
import type { ColumnDef, DataGridState } from './types.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

interface Person {
  id: string;
  name: string;
  department: string;
  salary: number;
  active: boolean;
}

const PEOPLE: Person[] = [
  { id: '1', name: 'Amina Haddad', department: 'Science', salary: 1200, active: true },
  { id: '2', name: 'Émile Rousseau', department: 'Arts', salary: 900, active: false },
  { id: '3', name: 'Zoë Baker', department: 'Science', salary: 1500, active: true },
  { id: '4', name: 'callum ford', department: 'Sport', salary: 800, active: true },
];

const COLUMNS: ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', value: (row) => row.name, sortable: true, rowHeader: true },
  { id: 'department', header: 'Department', value: (row) => row.department, sortable: true },
  {
    id: 'salary',
    header: 'Salary',
    value: (row) => row.salary,
    sortable: true,
    align: 'end',
    resizable: true,
    cell: (row) => `${row.salary} JOD`,
  },
  { id: 'active', header: 'Active', value: (row) => row.active, defaultHidden: true },
];

function Grid(props: Partial<DataGridProps<Person>> = {}) {
  return (
    <DataGrid
      aria-label="People"
      rows={PEOPLE}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.name}
      {...props}
    />
  );
}

describe('useDataGrid', () => {
  const options = { rows: PEOPLE, columns: COLUMNS, getRowId: (row: Person) => row.id };

  it('sorts strings with a collator, not by code point', () => {
    const { result } = renderHook(() => useDataGrid<Person>(options));
    act(() => result.current.toggleSort('name'));
    // Code-point order would put "Zoë" before "callum" and "Émile" last; a collator does not.
    expect(result.current.rows.map((row) => row.name)).toEqual([
      'Amina Haddad',
      'callum ford',
      'Émile Rousseau',
      'Zoë Baker',
    ]);
  });

  it('sorts numbers numerically', () => {
    const { result } = renderHook(() => useDataGrid<Person>(options));
    act(() => result.current.toggleSort('salary'));
    expect(result.current.rows.map((row) => row.salary)).toEqual([800, 900, 1200, 1500]);
  });

  it('cycles ascending, descending, then off', () => {
    const { result } = renderHook(() => useDataGrid<Person>(options));
    act(() => result.current.toggleSort('salary'));
    expect(result.current.state.sort).toEqual({ columnId: 'salary', direction: 'asc' });
    act(() => result.current.toggleSort('salary'));
    expect(result.current.state.sort).toEqual({ columnId: 'salary', direction: 'desc' });
    act(() => result.current.toggleSort('salary'));
    // The third press restores the original order rather than making it unreachable.
    expect(result.current.state.sort).toBeNull();
    expect(result.current.rows.map((row) => row.id)).toEqual(['1', '2', '3', '4']);
  });

  it('searches across every searchable column, ignoring case and accents', () => {
    const { result } = renderHook(() => useDataGrid<Person>(options));
    act(() => result.current.setState({ search: 'emile' }));
    expect(result.current.rows).toHaveLength(1);
    act(() => result.current.setState({ search: 'science' }));
    expect(result.current.rows).toHaveLength(2);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [...PEOPLE];
    const { result } = renderHook(() => useDataGrid<Person>({ ...options, rows }));
    act(() => result.current.toggleSort('salary'));
    expect(rows).toEqual(PEOPLE);
  });

  it('pages, and returns to page one when the search narrows', () => {
    const { result } = renderHook(() =>
      useDataGrid<Person>({ ...options, defaultState: { pageSize: 2 } }),
    );
    expect(result.current.pageCount).toBe(2);
    expect(result.current.rows).toHaveLength(2);
    act(() => result.current.setState({ page: 2 }));
    expect(result.current.rows.map((row) => row.id)).toEqual(['3', '4']);
  });

  it('seeds hidden columns from defaultHidden and lets them be turned back on', () => {
    const { result } = renderHook(() => useDataGrid<Person>(options));
    expect(result.current.visibleColumns.map((column) => column.id)).not.toContain('active');
    act(() => result.current.toggleColumn('active', true));
    expect(result.current.visibleColumns.map((column) => column.id)).toContain('active');
  });

  it('does nothing locally in server mode, and reports the state instead', () => {
    const onStateChange = vi.fn();
    const { result } = renderHook(() =>
      useDataGrid<Person>({ ...options, mode: 'server', rowCount: 5000, onStateChange }),
    );
    act(() => result.current.toggleSort('salary'));
    const reported = onStateChange.mock.calls.at(-1)?.[0] as DataGridState;
    expect(reported.sort).toEqual({ columnId: 'salary', direction: 'asc' });
    // The rows are untouched — the server will send the sorted page.
    expect(result.current.rows.map((row) => row.id)).toEqual(['1', '2', '3', '4']);
    expect(result.current.filteredCount).toBe(5000);
  });

  it('sorts empty values last in both directions', () => {
    const sparse: Person[] = [
      { ...PEOPLE[0]!, id: 'a', department: '' },
      { ...PEOPLE[1]!, id: 'b', department: 'Arts' },
    ];
    const { result } = renderHook(() => useDataGrid<Person>({ ...options, rows: sparse }));
    act(() => result.current.toggleSort('department'));
    expect(result.current.rows.map((row) => row.id)).toEqual(['b', 'a']);
    act(() => result.current.toggleSort('department'));
    expect(result.current.rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});

describe('DataGrid', () => {
  it('is a grid whose counts describe the dataset, not the DOM', () => {
    render(<Grid />);
    const grid = screen.getByRole('grid', { name: 'People' });
    // Four rows plus the header row.
    expect(grid).toHaveAttribute('aria-rowcount', '5');
    expect(grid).toHaveAttribute('aria-colcount', '3');
  });

  it('renders a row header so a cell is announced with the row it belongs to', () => {
    render(<Grid />);
    expect(screen.getByRole('rowheader', { name: 'Amina Haddad' })).toBeInTheDocument();
  });

  it('renders the cell, not the sort value', () => {
    render(<Grid />);
    expect(screen.getByRole('gridcell', { name: '1200 JOD' })).toBeInTheDocument();
  });

  it('sorts from the column header and reports it through aria-sort', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.click(screen.getByRole('button', { name: /Salary/ }));
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /Salary/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      ),
    );
    const first = screen.getAllByRole('row')[1];
    expect(within(first as HTMLElement).getByRole('rowheader')).toHaveTextContent('callum ford');
  });

  it('filters from the toolbar search', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'science');
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(2));
    expect(screen.getByRole('status')).toHaveTextContent('2 rows');
  });

  it('shows the empty state when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'zzzz');
    expect(await screen.findByText('Nothing to show')).toBeInTheDocument();
  });

  it('clamps cells to one line, unless the column says it holds a block', () => {
    const { rerender } = render(<Grid />);
    const science = () => screen.getAllByRole('gridcell', { name: 'Science' })[0] as HTMLElement;
    expect(science()).toHaveClass('truncate');

    // An identity cell — a name over a secondary line — cannot render inside `truncate`.
    rerender(
      <Grid
        columns={COLUMNS.map((column) =>
          column.id === 'department' ? { ...column, multiline: true } : column,
        )}
      />,
    );
    expect(science()).not.toHaveClass('truncate');
    expect(science()).toHaveClass('overflow-hidden');
  });

  it('hides and restores a column from the column menu', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    expect(screen.getByRole('columnheader', { name: /Department/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Department' }));
    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: /Department/ })).not.toBeInTheDocument(),
    );
    // A column hidden by default is offered in the menu, unchecked.
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Active' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  describe('selection', () => {
    function SelectableGrid(props: Partial<DataGridProps<Person>> = {}) {
      const [ids, setIds] = useState<string[]>([]);
      return (
        <Grid selectionMode="multiple" selectedIds={ids} onSelectionChange={setIds} {...props} />
      );
    }

    it('selects a row from its checkbox and marks the row selected', async () => {
      const user = userEvent.setup();
      render(<SelectableGrid />);
      await user.click(screen.getByRole('checkbox', { name: 'Select Amina Haddad' }));
      await waitFor(() =>
        expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'true'),
      );
    });

    it('reports a partial selection as mixed, not as unchecked', async () => {
      const user = userEvent.setup();
      render(<SelectableGrid />);
      await user.click(screen.getByRole('checkbox', { name: 'Select Amina Haddad' }));
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute(
          'aria-checked',
          'mixed',
        ),
      );
    });

    it('selects and clears every row on the page from the header checkbox', async () => {
      const user = userEvent.setup();
      render(<SelectableGrid />);
      const all = screen.getByRole('checkbox', { name: 'Select all rows' });
      await user.click(all);
      await waitFor(() => expect(screen.getAllByRole('row', { selected: true })).toHaveLength(4));
      await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
      await waitFor(() => expect(screen.queryAllByRole('row', { selected: true })).toHaveLength(0));
    });

    it('keeps a single-select grid to one row', async () => {
      const user = userEvent.setup();
      render(<SelectableGrid selectionMode="single" />);
      await user.click(screen.getByRole('checkbox', { name: 'Select Amina Haddad' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select Zoë Baker' }));
      await waitFor(() => expect(screen.getAllByRole('row', { selected: true })).toHaveLength(1));
    });
  });

  describe('keyboard', () => {
    it('has one tab stop, and the arrows move a cell from there', async () => {
      const user = userEvent.setup();
      render(<Grid searchable={false} columnMenu={false} />);
      const tabbable = screen
        .getAllByRole('columnheader')
        .concat(screen.getAllByRole('gridcell'))
        .filter((cell) => cell.getAttribute('tabindex') === '0');
      expect(tabbable).toHaveLength(1);

      await user.tab();
      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      await waitFor(() =>
        expect(screen.getByRole('columnheader', { name: /Department/ })).toHaveFocus(),
      );
      await user.keyboard('{ArrowDown}');
      // Two people are in Science, so the cell is found through its own row rather than by name.
      const firstRow = screen.getAllByRole('row')[1] as HTMLElement;
      await waitFor(() =>
        expect(within(firstRow).getByRole('gridcell', { name: 'Science' })).toHaveFocus(),
      );
    });

    it('moves to the ends of a row and of the grid', async () => {
      const user = userEvent.setup();
      render(<Grid searchable={false} columnMenu={false} />);
      await user.tab();
      await user.keyboard('{End}');
      await waitFor(() =>
        expect(screen.getByRole('columnheader', { name: /Salary/ })).toHaveFocus(),
      );
      await user.keyboard('{Control>}{End}{/Control}');
      await waitFor(() => expect(screen.getByRole('gridcell', { name: '800 JOD' })).toHaveFocus());
      await user.keyboard('{Control>}{Home}{/Control}');
      await waitFor(() => expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveFocus());
    });

    it('selects the focused row with Space', async () => {
      const onSelectionChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Grid
          searchable={false}
          columnMenu={false}
          selectionMode="multiple"
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
        />,
      );
      await user.tab();
      await user.keyboard('{ArrowDown} ');
      expect(onSelectionChange).toHaveBeenCalledWith(['1']);
    });

    it('activates the row with Enter when the cell holds no control', async () => {
      const onRowActivate = vi.fn();
      const user = userEvent.setup();
      render(<Grid searchable={false} columnMenu={false} onRowActivate={onRowActivate} />);
      await user.tab();
      await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
      await waitFor(() => expect(onRowActivate).toHaveBeenCalledWith(PEOPLE[0]));
    });

    it('enters a cell control with Enter and leaves it with Escape', async () => {
      const user = userEvent.setup();
      render(<Grid searchable={false} columnMenu={false} />);
      await user.tab();
      const header = screen.getByRole('columnheader', { name: /Name/ });
      await user.keyboard('{Enter}');
      await waitFor(() => expect(screen.getByRole('button', { name: /Name/ })).toHaveFocus());
      await user.keyboard('{Escape}');
      await waitFor(() => expect(header).toHaveFocus());
    });

    /*
     * Phase 8.7. The grid's handler sits on the table, so a keystroke aimed at a control *inside* a
     * cell bubbles to it, and the grid used to answer: Enter on a row's action button activated the
     * row while `preventDefault` stopped the button's own menu from ever opening. The action worked
     * for a mouse and not for a keyboard. Measured on `workspace-files--browser`, in all four
     * brands and both schemes.
     */
    const ACTION: ColumnDef<Person> = {
      id: 'actions',
      header: 'Actions',
      value: () => '',
      cell: (row) => (
        <button type="button" data-testid={`act-${row.id}`}>
          Actions for {row.name}
        </button>
      ),
    };

    it('leaves Enter to the control inside a body cell rather than activating the row', async () => {
      const onRowActivate = vi.fn();
      const onAction = vi.fn();
      const user = userEvent.setup();
      render(
        <Grid
          searchable={false}
          columnMenu={false}
          onRowActivate={onRowActivate}
          columns={[
            ...COLUMNS.filter((column) => column.id !== 'active'),
            {
              ...ACTION,
              cell: (row) => <button type="button" onClick={onAction}>{`Act ${row.id}`}</button>,
            },
          ]}
        />,
      );
      const action = screen.getByRole('button', { name: 'Act 1' });
      action.focus();
      await user.keyboard('{Enter}');

      expect(onAction, "the button's own Enter must reach the button").toHaveBeenCalledTimes(1);
      expect(onRowActivate, 'the grid must not activate the row underneath').not.toHaveBeenCalled();
    });

    // Space is covered by the same one-line guard, and this asserts the behaviour it protects. It
    // is not a falsification proof: it passes with the guard reverted too, because reaching this
    // state through happy-dom leaves the grid's own row focus where Space finds nothing to select.
    // The Enter test above is the one that fails without the fix.
    it('leaves Space to the control inside a body cell rather than selecting the row', async () => {
      const onSelectionChange = vi.fn();
      const onAction = vi.fn();
      const user = userEvent.setup();
      render(
        <Grid
          searchable={false}
          columnMenu={false}
          selectedIds={[]}
          onSelectionChange={onSelectionChange}
          columns={[
            ...COLUMNS.filter((column) => column.id !== 'active'),
            {
              ...ACTION,
              cell: (row) => <button type="button" onClick={onAction}>{`Act ${row.id}`}</button>,
            },
          ]}
        />,
      );
      // Into a body row first: with the grid's own focus still on the header there is no row to
      // select, and the assertion would pass whether or not the guard exists.
      await user.tab();
      await user.keyboard('{ArrowDown}');
      screen.getByRole('button', { name: 'Act 1' }).focus();
      await user.keyboard(' ');

      expect(onAction, "the button's own Space must reach the button").toHaveBeenCalledTimes(1);
      expect(onSelectionChange, 'the grid must not select the row').not.toHaveBeenCalled();
    });

    it('resizes a column with the arrow keys', async () => {
      const user = userEvent.setup();
      const onStateChange = vi.fn();
      render(<Grid onStateChange={onStateChange} />);
      const resizer = screen.getByRole('separator', { name: 'Resize Salary' });
      resizer.focus();
      await user.keyboard('{ArrowRight}');
      const last = onStateChange.mock.calls.at(-1)?.[0] as DataGridState;
      expect(last.columnWidths.salary).toBeGreaterThan(0);
    });
  });

  describe('virtualization', () => {
    const many: Person[] = Array.from({ length: 5000 }, (_, index) => ({
      id: String(index),
      name: `Person ${index}`,
      department: index % 2 === 0 ? 'Science' : 'Arts',
      salary: 800 + index,
      active: true,
    }));

    it('renders a window, not five thousand rows, while still reporting the total', () => {
      render(<Grid rows={many} paginated={false} height={400} rowHeight={40} searchable={false} />);
      const rendered = screen.getAllByRole('rowheader');
      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.length).toBeLessThan(200);
      expect(screen.getByRole('grid', { name: 'People' })).toHaveAttribute('aria-rowcount', '5001');
      expect(screen.getByRole('status')).toHaveTextContent('5000 rows');
    });

    it('numbers rows by their place in the dataset, not in the window', () => {
      render(<Grid rows={many} paginated={false} height={400} rowHeight={40} />);
      // Header is row 1, so the dataset's first row is row 2.
      expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-rowindex', '2');
    });

    it('numbers rows across pages', () => {
      render(<Grid rows={many} defaultState={{ page: 3, pageSize: 25 }} />);
      expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-rowindex', '52');
    });

    it('renders every row when no height bounds it', () => {
      render(<Grid rows={many.slice(0, 60)} paginated={false} />);
      expect(screen.getAllByRole('rowheader')).toHaveLength(60);
    });
  });

  it('renders a controlled state and reports every change back', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [state, setState] = useState<DataGridState>({
        sort: { columnId: 'salary', direction: 'desc' },
        search: '',
        page: 1,
        pageSize: 25,
        hiddenColumns: [],
        columnWidths: {},
      });
      return <Grid state={state} onStateChange={setState} />;
    }
    render(<Controlled />);
    expect(screen.getAllByRole('rowheader')[0]).toHaveTextContent('Zoë Baker');
    await user.click(screen.getByRole('button', { name: /Name/ }));
    await waitFor(() => expect(screen.getAllByRole('rowheader')[0]).toHaveTextContent('Amina'));
  });

  it('shows skeleton rows and marks the grid busy while loading', () => {
    render(<Grid loading />);
    const grid = screen.getByRole('grid', { name: 'People' });
    expect(grid).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading rows…');
  });

  it('renders inline actions in their own column', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <Grid
        rowActions={(row) => (
          <button
            type="button"
            onClick={() => {
              onEdit(row.id);
            }}
          >
            Edit {row.name}
          </button>
        )}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit Amina Haddad' }));
    expect(onEdit).toHaveBeenCalledWith('1');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Grid selectionMode="multiple" selectedIds={['1']} onSelectionChange={() => {}} />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations when virtualized', async () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      name: `Person ${index}`,
      department: 'Science',
      salary: index,
      active: true,
    }));
    const { container } = render(<Grid rows={many} paginated={false} height={300} />);
    await expectNoA11yViolations(container);
  });
});
