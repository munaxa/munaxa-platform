import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkflowCanvas, type WorkflowEdge, type WorkflowNode } from './workflow.js';
import { ApprovalFlow, type ApprovalStep } from './approval-flow.js';
import { Badge } from '../primitives/badge.js';
import { Button } from '../primitives/button.js';
import { Avatar, AvatarFallback, AvatarGroup } from '../data-display/avatar.js';
import { Container } from '../../layouts/container.js';
import { Stack } from '../../layouts/stack.js';
import { Section } from '../../layouts/page.js';

const meta = {
  title: 'Workspace/Flow Editors',
  parameters: {
    docs: {
      description: {
        component:
          '**Presentation only, and the boundary is hard.** These own layout, selection and keyboard ' +
          'interaction. They do not know what a step type means, cannot validate a workflow, will ' +
          'not add or delete a node, and have no idea how any of it executes. Applications own the ' +
          'definitions, the business rules and the engine.\n\n' +
          'That is not squeamishness about scope: a canvas that knew about “approval steps” would ' +
          '*be* an approval editor, and the next product’s process would need a fork of it.\n\n' +
          '**Two components, because there are two problems.** `WorkflowCanvas` is a graph. ' +
          '`ApprovalFlow` is an ordered chain — which is what an approval actually is, and forcing ' +
          'it through a node canvas would make “move finance before legal” a matter of dragging ' +
          'boxes and redrawing arrows.\n\n' +
          '**A diagram is not the content.** The only thing a workflow picture conveys is what leads ' +
          'to what — exactly what a picture cannot say. So the nodes are a real list, each described ' +
          'by its outgoing connections in text, and the SVG carrying the lines is `aria-hidden`.\n\n' +
          '**Keyboard:** one tab stop in, arrows move between steps, Shift with the arrows ' +
          'repositions the focused one, Enter selects. No drag-only path anywhere.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const INITIAL_NODES: WorkflowNode[] = [
  { id: 'submit', label: 'Request submitted', type: 'trigger', x: 200, y: 0 },
  {
    id: 'manager',
    label: 'Manager approval',
    type: 'approval',
    description: 'Line manager',
    x: 200,
    y: 120,
  },
  {
    id: 'finance',
    label: 'Finance review',
    type: 'approval',
    description: 'Over 5,000 JOD',
    x: 40,
    y: 260,
  },
  { id: 'notify', label: 'Notify requester', type: 'notify', x: 360, y: 260 },
  { id: 'reject', label: 'Rejected', type: 'terminal', tone: 'danger', x: 200, y: 400 },
  { id: 'done', label: 'Approved', type: 'terminal', tone: 'success', x: 40, y: 400 },
];

const EDGES: WorkflowEdge[] = [
  { id: '1', from: 'submit', to: 'manager' },
  { id: '2', from: 'manager', to: 'finance' },
  { id: '3', from: 'manager', to: 'notify' },
  { id: '4', from: 'manager', to: 'reject' },
  { id: '5', from: 'finance', to: 'done' },
];

/** The product supplies its own node types; the platform has never heard of them. */
const TYPE_LABEL: Record<string, string> = {
  trigger: 'Trigger',
  approval: 'Approval',
  notify: 'Notification',
  terminal: 'Outcome',
};

export const Workflow: Story = {
  render: function Workflow() {
    const [nodes, setNodes] = useState(INITIAL_NODES);
    const [selected, setSelected] = useState<string>();

    return (
      <Container width="wide" className="py-6">
        <Stack gap={4}>
          <Section
            title="Leave request workflow"
            description="Tab in, arrows to move between steps, Shift with the arrows to reposition one."
          >
            <WorkflowCanvas
              aria-label="Leave request workflow"
              nodes={nodes}
              edges={EDGES}
              {...(selected === undefined ? {} : { selectedId: selected })}
              onSelect={(node) => setSelected(node.id)}
              onNodeMove={(id, x, y) =>
                setNodes((current) =>
                  current.map((node) => (node.id === id ? { ...node, x, y } : node)),
                )
              }
              renderNode={(node) => (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{node.label}</span>
                    <Badge tone="muted">{TYPE_LABEL[node.type ?? ''] ?? node.type}</Badge>
                  </span>
                  {node.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {node.description}
                    </span>
                  ) : null}
                </>
              )}
            />
          </Section>
          <p className="font-mono text-xs text-muted-foreground">selected: {selected ?? '—'}</p>
        </Stack>
      </Container>
    );
  },
};

/** Read-only: no `onNodeMove`, so nothing can be repositioned, and the canvas still reads fully. */
export const WorkflowReadOnly: Story = {
  name: 'Workflow, read only',
  render: function WorkflowReadOnly() {
    return (
      <Container width="wide" className="py-6">
        <WorkflowCanvas aria-label="Leave request workflow" nodes={INITIAL_NODES} edges={EDGES} />
      </Container>
    );
  },
};

const CHAIN: ApprovalStep[] = [
  {
    id: '1',
    name: 'Line manager',
    mode: 'all',
    approvers: (
      <AvatarGroup>
        <Avatar size="sm">
          <AvatarFallback>NF</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    ),
  },
  {
    id: '2',
    name: 'Head of department',
    mode: 'any',
    approvers: (
      <AvatarGroup>
        <Avatar size="sm">
          <AvatarFallback>OK</AvatarFallback>
        </Avatar>
        <Avatar size="sm">
          <AvatarFallback>PN</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    ),
  },
  {
    id: '3',
    name: 'Finance',
    mode: 'all',
    condition: 'Only when the amount is over 5,000 JOD',
    approvers: (
      <AvatarGroup>
        <Avatar size="sm">
          <AvatarFallback>YA</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    ),
  },
];

/**
 * The designer. Steps reorder with a real handle — pointer or keyboard — and `onReorder` reports the
 * new order; the flow never applies it, so a rejected reorder is possible.
 */
export const ApprovalDesigner: Story = {
  render: function ApprovalDesigner() {
    const [steps, setSteps] = useState(CHAIN);
    return (
      <Container width="content" className="py-6">
        <Section
          title="Expense approval"
          description="Drag a handle or pick it up with Space and use the arrows."
        >
          <ApprovalFlow
            aria-label="Expense approval chain"
            steps={steps}
            onReorder={(ids) =>
              setSteps((current) =>
                ids
                  .map((id) => current.find((step) => step.id === id))
                  .filter((step): step is ApprovalStep => Boolean(step)),
              )
            }
            stepActions={(step) => (
              <Button variant="ghost" aria-label={`Edit ${step.name}`}>
                Edit
              </Button>
            )}
            footer={<Button variant="outline">Add step</Button>}
          />
        </Section>
      </Container>
    );
  },
};

/**
 * The same component in `readOnly`, with a `status` on each step — so the shape a designer built is
 * literally the shape a requester sees.
 */
export const ApprovalProgress: Story = {
  name: 'Approval progress',
  render: function ApprovalProgress() {
    return (
      <Container width="content" className="py-6">
        <ApprovalFlow
          readOnly
          aria-label="Expense approval progress"
          steps={[
            { ...CHAIN[0]!, status: 'approved' },
            { ...CHAIN[1]!, status: 'active' },
            { ...CHAIN[2]!, status: 'pending', meta: <span className="text-xs">Waiting</span> },
          ]}
        />
      </Container>
    );
  },
};

export const ApprovalRejected: Story = {
  name: 'Approval, rejected',
  render: function ApprovalRejected() {
    return (
      <Container width="content" className="py-6">
        <ApprovalFlow
          readOnly
          aria-label="Expense approval progress"
          steps={[
            { ...CHAIN[0]!, status: 'approved' },
            { ...CHAIN[1]!, status: 'rejected' },
            { ...CHAIN[2]!, status: 'skipped' },
          ]}
        />
      </Container>
    );
  },
};
