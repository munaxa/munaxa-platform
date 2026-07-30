/**
 * A serialisable description of a query, with nothing product-specific in it.
 *
 * The shape is the contract, and it is deliberately plain data: a `FilterGroup` survives
 * `JSON.stringify`, so a saved view, a shareable URL and a server-side query all work on the same
 * value. Nothing here knows what a field *is* — a product declares its fields and the builder edits
 * a tree of references to them.
 */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

/** The operators the platform understands. A field may narrow this list. */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'notIn'
  | 'isEmpty'
  | 'isNotEmpty';

export interface FilterFieldOption {
  value: string;
  label: string;
}

export interface FilterField {
  id: string;
  label: string;
  type: FieldType;
  /** Required for `select`. */
  options?: FilterFieldOption[];
  /** Narrow the operators offered. Defaults to the sensible set for the type. */
  operators?: FilterOperator[];
  /** Hint shown under the value control. */
  hint?: string;
}

/**
 * One `field operator value` clause.
 *
 * `value` is `unknown` because it is whatever the field's type implies — a string, a number, an
 * ISO date, an array for `in`, a pair for `between`. Typing it more tightly would mean a generic
 * parameter threaded through every component here to describe something the product already knows.
 */
export interface FilterCondition {
  id: string;
  kind: 'condition';
  fieldId: string;
  operator: FilterOperator;
  value?: unknown;
  /** Second bound, for `between`. */
  valueTo?: unknown;
}

export interface FilterGroup {
  id: string;
  kind: 'group';
  combinator: 'and' | 'or';
  children: Array<FilterGroup | FilterCondition>;
  /** Invert the whole group. */
  negated?: boolean;
}

export type FilterNode = FilterGroup | FilterCondition;

/** Operators that take no value at all — the two the UI must not render an input for. */
export const VALUELESS_OPERATORS: FilterOperator[] = ['isEmpty', 'isNotEmpty'];

/** Operators taking a list rather than a single value. */
export const MULTI_VALUE_OPERATORS: FilterOperator[] = ['in', 'notIn'];

/** The default operator menu per field type. */
export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  text: ['contains', 'notContains', 'eq', 'ne', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  select: ['in', 'notIn', 'eq', 'ne', 'isEmpty', 'isNotEmpty'],
  boolean: ['eq'],
};

/** Default English operator labels. Overridable, like every other string in the platform. */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  ne: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  gt: 'is after',
  gte: 'is on or after',
  lt: 'is before',
  lte: 'is on or before',
  between: 'is between',
  in: 'is any of',
  notIn: 'is none of',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
};

export function operatorsFor(field: FilterField): FilterOperator[] {
  return field.operators ?? OPERATORS_BY_TYPE[field.type];
}

/**
 * Drop conditions that are not finished.
 *
 * A half-built clause — a field chosen but no value typed yet — must stay in the *editor* so the
 * user can finish it, and must never reach a query, where it would silently filter everything out.
 * Separating "what is being edited" from "what is applied" is what this does, and it is why the
 * builder is not simply wired straight to a request.
 */
export function pruneFilter(node: FilterNode): FilterNode | null {
  if (node.kind === 'condition') return isConditionComplete(node) ? node : null;
  const children = node.children
    .map((child) => pruneFilter(child))
    .filter((child): child is FilterNode => child !== null);
  return children.length === 0 ? null : { ...node, children };
}

export function isConditionComplete(condition: FilterCondition): boolean {
  if (VALUELESS_OPERATORS.includes(condition.operator)) return true;
  if (MULTI_VALUE_OPERATORS.includes(condition.operator)) {
    return Array.isArray(condition.value) && condition.value.length > 0;
  }
  const filled =
    condition.value !== undefined && condition.value !== '' && condition.value !== null;
  if (condition.operator !== 'between') return filled;
  return filled && condition.valueTo !== undefined && condition.valueTo !== '';
}

/** How many complete conditions a tree holds — what a product shows on an "Advanced" button. */
export function countConditions(node: FilterNode | null): number {
  if (!node) return 0;
  if (node.kind === 'condition') return isConditionComplete(node) ? 1 : 0;
  return node.children.reduce((total, child) => total + countConditions(child), 0);
}

/** An empty root group, for a builder starting from nothing. */
export function emptyFilter(combinator: 'and' | 'or' = 'and'): FilterGroup {
  return { id: 'root', kind: 'group', combinator, children: [] };
}
