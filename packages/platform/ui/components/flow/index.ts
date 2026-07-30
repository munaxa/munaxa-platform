/**
 * Flow editors — the two shapes a process takes.
 *
 * `WorkflowCanvas` is a graph: steps anywhere, connected however the product needs.
 * `ApprovalFlow` is an ordered chain, which is what an approval actually is.
 *
 * Both are presentation only. They own layout, selection and keyboard interaction, and nothing
 * else: what a step type means, when a condition is met, whether a chain is valid, and how any of
 * it executes belong to the application. A canvas that knew about approval steps would be an
 * approval editor, and the next product's process would need a fork of it.
 */
export {
  WorkflowCanvas,
  type WorkflowCanvasProps,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowLabels,
} from './workflow.js';
export {
  ApprovalFlow,
  type ApprovalFlowProps,
  type ApprovalStep,
  type ApprovalStatus,
  type ApprovalMode,
  type ApprovalFlowLabels,
} from './approval-flow.js';
