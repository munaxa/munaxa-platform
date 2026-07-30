import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowCanvas, type WorkflowEdge, type WorkflowNode } from './workflow.js';
import { ApprovalFlow, type ApprovalStep } from './approval-flow.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

const NODES: WorkflowNode[] = [
  { id: 'a', label: 'Submitted', x: 0, y: 0 },
  { id: 'b', label: 'Manager approval', x: 0, y: 120, description: 'Line manager' },
  { id: 'c', label: 'Finance review', x: 200, y: 240 },
  { id: 'd', label: 'Rejected', x: -200, y: 240, tone: 'danger' },
];

const EDGES: WorkflowEdge[] = [
  { id: '1', from: 'a', to: 'b' },
  { id: '2', from: 'b', to: 'c' },
  { id: '3', from: 'b', to: 'd' },
];

describe('WorkflowCanvas', () => {
  function Canvas(props: Partial<Parameters<typeof WorkflowCanvas>[0]> = {}) {
    return <WorkflowCanvas aria-label="Leave request" nodes={NODES} edges={EDGES} {...props} />;
  }

  const node = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-workflow-node$="-${id}"]`) as HTMLElement;

  it('is a list of named steps, not an opaque picture', () => {
    render(<Canvas />);
    const list = screen.getByRole('list', { name: 'Leave request' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('states every connection in text, because a drawn line says nothing', () => {
    const { container } = render(<Canvas />);
    // The only information a workflow diagram carries is what leads to what.
    expect(node(container, 'b')).toHaveAccessibleDescription(
      /Manager approval leads to Finance review, Rejected\./,
    );
    expect(node(container, 'c')).toHaveAccessibleDescription(
      /Finance review has no outgoing connections\./,
    );
  });

  it('hides the drawn edges from assistive technology', () => {
    const { container } = render(<Canvas />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The lines exist for sighted users; there are three of them.
    expect(container.querySelectorAll('svg path[marker-end]')).toHaveLength(3);
  });

  it('has one tab stop and moves focus between steps with the arrows', async () => {
    const user = userEvent.setup();
    const { container } = render(<Canvas />);
    expect(container.querySelectorAll('[data-workflow-node][tabindex="0"]')).toHaveLength(1);

    await user.tab();
    expect(node(container, 'a')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(node(container, 'b')).toHaveFocus());
    await user.keyboard('{End}');
    await waitFor(() => expect(node(container, 'd')).toHaveFocus());
    await user.keyboard('{Home}');
    await waitFor(() => expect(node(container, 'a')).toHaveFocus());
  });

  it('repositions the focused step with Shift and the arrows', async () => {
    const onNodeMove = vi.fn();
    const user = userEvent.setup();
    render(<Canvas onNodeMove={onNodeMove} />);
    await user.tab();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onNodeMove).toHaveBeenCalledWith('a', 16, 0);
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    // Clamped at zero rather than moving off the canvas.
    expect(onNodeMove).toHaveBeenLastCalledWith('a', 0, 0);
  });

  it('does not move anything when read-only', async () => {
    const user = userEvent.setup();
    const { container } = render(<Canvas />);
    await user.tab();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    // With no `onNodeMove` the Shift chord falls through to plain focus movement.
    await waitFor(() => expect(node(container, 'b')).toHaveFocus());
  });

  it('selects with Enter', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Canvas onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(NODES[0]);
  });

  it('draws whatever the product wants inside a node', () => {
    render(<Canvas renderNode={(step) => <span>Step: {step.label}</span>} />);
    expect(screen.getByText(/Step: Submitted/)).toBeInTheDocument();
  });

  it('ignores an edge pointing at a node that is not there', () => {
    const { container } = render(
      <Canvas edges={[...EDGES, { id: 'x', from: 'a', to: 'nowhere' }]} />,
    );
    // Three real edges, and no crash from the fourth.
    expect(container.querySelectorAll('svg path[marker-end]')).toHaveLength(3);
  });

  it('shows an empty state rather than a blank canvas', () => {
    render(<Canvas nodes={[]} edges={[]} />);
    expect(screen.getByText('No steps yet')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Canvas onNodeMove={() => {}} selectedId="b" />);
    await expectNoA11yViolations(container);
  });
});

describe('ApprovalFlow', () => {
  const STEPS: ApprovalStep[] = [
    { id: '1', name: 'Line manager', mode: 'all', approvers: 'Nadia Faris' },
    { id: '2', name: 'Head of department', mode: 'any', approvers: 'Omar Khalil, Petra Novak' },
    { id: '3', name: 'Finance', condition: 'Only over 5,000 JOD' },
  ];

  function Flow(props: Partial<Parameters<typeof ApprovalFlow>[0]> = {}) {
    return <ApprovalFlow aria-label="Approval chain" steps={STEPS} {...props} />;
  }

  it('is an ordered list whose steps announce their position', () => {
    render(<Flow />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAccessibleDescription('Step 1 of 3');
    expect(items[2]).toHaveAccessibleDescription('Step 3 of 3');
  });

  it('shows how many approvers a step needs', () => {
    render(<Flow />);
    expect(screen.getByText('All must approve')).toBeInTheDocument();
    expect(screen.getByText('Any one may approve')).toBeInTheDocument();
  });

  it('renders approvers and conditions as given, without interpreting them', () => {
    render(<Flow />);
    expect(screen.getByText('Nadia Faris')).toBeInTheDocument();
    expect(screen.getByText('Only over 5,000 JOD')).toBeInTheDocument();
  });

  it('offers no reorder handles until reordering is possible', () => {
    const { rerender } = render(<Flow />);
    expect(screen.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
    rerender(<Flow onReorder={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reorder Line manager' })).toBeInTheDocument();
  });

  it('is not reorderable in read-only mode even when a handler is supplied', () => {
    render(<Flow onReorder={() => {}} readOnly />);
    expect(screen.queryByRole('button', { name: /^Reorder/ })).not.toBeInTheDocument();
  });

  it('shows live status in read-only mode, in the description as well as the badge', () => {
    render(
      <Flow
        readOnly
        steps={[
          { ...STEPS[0]!, status: 'approved' },
          { ...STEPS[1]!, status: 'active' },
          { ...STEPS[2]!, status: 'pending' },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleDescription('Step 1 of 3, approved');
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders per-step actions and a footer', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(
      <Flow
        stepActions={(step) => (
          <button
            type="button"
            onClick={() => {
              onEdit(step.id);
            }}
          >
            Edit {step.name}
          </button>
        )}
        footer={<button type="button">Add step</button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit Finance' }));
    expect(onEdit).toHaveBeenCalledWith('3');
    expect(screen.getByRole('button', { name: 'Add step' })).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<Flow steps={[]} />);
    expect(screen.getByText('No approval steps')).toBeInTheDocument();
  });

  it('has no accessibility violations, as a designer and as a progress view', async () => {
    const { container, rerender } = render(<Flow onReorder={() => {}} />);
    await expectNoA11yViolations(container);
    rerender(<Flow readOnly steps={[{ ...STEPS[0]!, status: 'approved' }]} />);
    await expectNoA11yViolations(container);
  });
});
