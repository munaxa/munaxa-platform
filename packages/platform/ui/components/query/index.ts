/**
 * Query building — one condition model, two surfaces.
 *
 * `FilterBuilder` is the editor: nested groups of `field operator value` clauses.
 * `SearchBuilder` is the bar a product actually puts above a grid — free text, the filter editor in
 * a popover, and removable chips for what is applied. It *composes* the builder rather than
 * inventing a query syntax, so there is one model to serialise, one to validate and one to learn.
 *
 * Both are generic. `FilterField[]` is the only product-specific input and it is plain data, so
 * School filtering students and Work filtering timesheets are the same components with different
 * fields — no branch for either, and nothing here to change when a third product arrives.
 *
 * The value is JSON: a `FilterGroup` survives `JSON.stringify`, which is what makes a saved view, a
 * shareable URL and a server-side query all speak the same thing.
 */
export {
  FilterBuilder,
  type FilterBuilderProps,
  type FilterBuilderLabels,
} from './filter-builder.js';
export {
  SearchBuilder,
  emptySearchQuery,
  defaultOperator,
  describeCondition,
  flattenFilterConditions,
  type SearchBuilderProps,
  type SearchBuilderLabels,
  type SearchQuery,
} from './search-builder.js';
export {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  VALUELESS_OPERATORS,
  MULTI_VALUE_OPERATORS,
  operatorsFor,
  pruneFilter,
  isConditionComplete,
  countConditions,
  emptyFilter,
  type FieldType,
  type FilterOperator,
  type FilterField,
  type FilterFieldOption,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
} from './types.js';
