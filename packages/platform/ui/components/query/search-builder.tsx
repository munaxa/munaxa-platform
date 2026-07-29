'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { Filter, Search } from '../../../icons/index.js';
import { Button } from '../primitives/button.js';
import { Tag } from '../primitives/tag.js';
import { Input } from '../forms/input.js';
import { Popover, PopoverContent, PopoverTrigger } from '../overlays/popover.js';
import { FilterBuilder, type FilterBuilderLabels } from './filter-builder.js';
import {
  OPERATOR_LABELS,
  countConditions,
  emptyFilter,
  operatorsFor,
  pruneFilter,
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
} from './types.js';

export interface SearchQuery {
  /** Free text. What it searches is the product's decision. */
  text: string;
  /** Structured conditions. `null` when nothing is applied. */
  filter: FilterGroup | null;
}

export interface SearchBuilderLabels extends FilterBuilderLabels {
  search?: string;
  searchPlaceholder?: string;
  filters?: string;
  filtersWithCount?: (count: number) => string;
  apply?: string;
  clear?: string;
  clearAll?: string;
  removeCondition?: (description: string) => string;
  appliedFilters?: string;
}

const DEFAULT_LABELS = {
  search: 'Search',
  searchPlaceholder: 'Search…',
  filters: 'Filters',
  filtersWithCount: (count: number) => `Filters (${count})`,
  apply: 'Apply',
  clear: 'Clear',
  clearAll: 'Clear all filters',
  removeCondition: (description: string) => `Remove ${description}`,
  appliedFilters: 'Applied filters',
} satisfies Partial<SearchBuilderLabels>;

export interface SearchBuilderProps {
  fields: FilterField[];
  value: SearchQuery;
  onChange: (value: SearchQuery) => void;
  /** Saved views, an export button — whatever sits beside the search box. */
  actions?: ReactNode;
  /** Debounce on the free-text field, in milliseconds. */
  searchDebounce?: number;
  disabled?: boolean;
  labels?: SearchBuilderLabels;
  className?: string;
}

/**
 * A search bar with structured filters behind it.
 *
 * **It composes `FilterBuilder` rather than reinventing a query language.** The obvious design for a
 * "search builder" is a text box that parses `status:active grade:>9` — and that is a parser, an
 * autocomplete grammar, an error-reporting story and a syntax users have to learn, all to express
 * what a condition editor expresses without any of it. So the text box stays a text box, the
 * structure lives in a popover, and what is applied shows as removable chips. One model, two
 * surfaces.
 *
 * **Editing and applying are separate.** The popover edits a draft; only complete conditions reach
 * `onChange`, via `pruneFilter`. A half-typed clause — a field chosen with no value yet — must stay
 * visible so the user can finish it, and must never reach a query, where it would silently filter
 * everything away.
 *
 * **Generic.** `fields` is the only product-specific input, and it is data. School searching students
 * and Work searching timesheets are the same component with different `fields`.
 */
export function SearchBuilder({
  fields,
  value,
  onChange,
  actions,
  searchDebounce = 250,
  disabled = false,
  labels,
  className,
}: SearchBuilderProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = useState(false);
  /** The popover's working copy. Nothing here is applied until Apply is pressed. */
  const [draft, setDraft] = useState<FilterGroup>(value.filter ?? emptyFilter());
  const [typed, setTyped] = useState(value.text);

  /**
   * Per-instance, not module-level.
   *
   * A shared timer would mean two search bars on one page cancelling each other's debounce — the
   * second one typed in would be the only one that ever reported.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const applied = useMemo(() => flattenConditions(value.filter, fields), [value.filter, fields]);
  const count = countConditions(value.filter);

  function apply() {
    const pruned = pruneFilter(draft);
    onChange({
      ...value,
      filter: pruned && pruned.kind === 'group' ? pruned : null,
    });
    setOpen(false);
  }

  /** Remove one applied condition by id, collapsing any group left empty. */
  function removeCondition(id: string) {
    const next = withoutCondition(value.filter, id);
    setDraft(next ?? emptyFilter());
    onChange({ ...value, filter: next });
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-2 my-auto size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={text.search}
            placeholder={text.searchPlaceholder}
            value={typed}
            disabled={disabled}
            className="ps-8"
            onChange={(event) => {
              const next = event.target.value;
              setTyped(next);
              // Debounced here rather than in the product: every search box in every product would
              // otherwise pick its own delay, and a few of them would pick none.
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => onChange({ ...value, text: next }), searchDebounce);
            }}
          />
        </div>

        <Popover
          open={open}
          onOpenChange={(next) => {
            // Opening starts from what is applied, so the popover never shows a stale draft from a
            // previous session of editing.
            if (next) setDraft(value.filter ?? emptyFilter());
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" disabled={disabled}>
              <Filter className="size-4" aria-hidden="true" />
              {count > 0 ? text.filtersWithCount(count) : text.filters}
            </Button>
          </PopoverTrigger>
          <PopoverContent aria-label={text.filters} align="start" className="w-[min(36rem,90vw)]">
            <div className="flex flex-col gap-3">
              <FilterBuilder
                fields={fields}
                value={draft}
                onChange={setDraft}
                {...(labels === undefined ? {} : { labels })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(emptyFilter())}>
                  {text.clear}
                </Button>
                <Button onClick={apply}>{text.apply}</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {actions}
      </div>

      {applied.length > 0 ? (
        <div
          role="group"
          aria-label={text.appliedFilters}
          className="flex flex-wrap items-center gap-1.5"
        >
          {applied.map(({ condition, field }) => {
            const description = describe(condition, field, text.operatorLabels);
            return (
              <Tag
                key={condition.id}
                size="sm"
                {...(disabled ? {} : { onRemove: () => removeCondition(condition.id) })}
                removeLabel={text.removeCondition(description)}
              >
                {description}
              </Tag>
            );
          })}
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setDraft(emptyFilter());
              onChange({ ...value, filter: null });
            }}
          >
            {text.clearAll}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface AppliedCondition {
  condition: FilterCondition;
  field: FilterField | undefined;
}

/** Every complete condition in the tree, flat, for the chip row. */
function flattenConditions(node: FilterNode | null, fields?: FilterField[]): AppliedCondition[] {
  if (!node) return [];
  if (node.kind === 'condition') {
    return [{ condition: node, field: fields?.find((field) => field.id === node.fieldId) }];
  }
  return node.children.flatMap((child) => flattenConditions(child, fields));
}

/** Human-readable summary of one clause, for a chip and for its remove control's name. */
function describe(
  condition: FilterCondition,
  field: FilterField | undefined,
  operatorLabels: Partial<Record<FilterOperator, string>> | undefined,
): string {
  const name = field?.label ?? condition.fieldId;
  const operator = operatorLabels?.[condition.operator] ?? OPERATOR_LABELS[condition.operator];
  const value = Array.isArray(condition.value)
    ? condition.value.map(scalar).filter(Boolean).join(', ')
    : scalar(condition.value);
  const to = scalar(condition.valueTo);
  return `${name} ${operator}${value ? ` ${value}${to ? ` – ${to}` : ''}` : ''}`.trim();
}

/**
 * Render a value only when it is something a person can read.
 *
 * `FilterCondition.value` is `unknown` by design, so anything could be in there. Stringifying
 * blindly puts "[object Object]" on a chip and, worse, into the accessible name of its remove
 * button — so a value that is not a scalar contributes nothing rather than nonsense.
 */
function scalar(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Drop one condition, then drop any group it leaves empty. */
function withoutCondition(node: FilterNode | null, id: string): FilterGroup | null {
  if (!node || node.kind === 'condition') return null;
  const children = node.children
    .filter((child) => !(child.kind === 'condition' && child.id === id))
    .map((child) => (child.kind === 'group' ? withoutCondition(child, id) : child))
    .filter((child): child is FilterNode => child !== null);
  return children.length === 0 ? null : { ...node, children };
}

/** Exported so a product can render the same summary outside the bar. */
export { describe as describeCondition, flattenConditions as flattenFilterConditions };

/** A starting query with nothing applied. */
export function emptySearchQuery(): SearchQuery {
  return { text: '', filter: null };
}

/** The first operator a field offers — what a product needs when seeding a condition itself. */
export function defaultOperator(field: FilterField): FilterOperator {
  return operatorsFor(field)[0] as FilterOperator;
}
