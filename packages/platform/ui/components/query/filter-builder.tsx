'use client';

import { useCallback, useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { Plus, Trash2 } from '../../../icons/index.js';
import { Button } from '../primitives/button.js';
import { Input, Select } from '../forms/input.js';
import { Checkbox } from '../forms/checkbox.js';
import { MultiSelect } from '../forms/combobox.js';
import { DatePicker } from '../date/date-picker.js';
import {
  MULTI_VALUE_OPERATORS,
  OPERATOR_LABELS,
  VALUELESS_OPERATORS,
  operatorsFor,
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
} from './types.js';

export interface FilterBuilderLabels {
  addCondition?: string;
  addGroup?: string;
  remove?: string;
  removeGroup?: string;
  field?: string;
  operator?: string;
  value?: string;
  valueTo?: string;
  and?: string;
  or?: string;
  combinator?: string;
  empty?: string;
  group?: (index: number) => string;
  operatorLabels?: Partial<Record<FilterOperator, string>>;
  yes?: string;
  no?: string;
}

const DEFAULT_LABELS = {
  addCondition: 'Add condition',
  addGroup: 'Add group',
  remove: 'Remove condition',
  removeGroup: 'Remove group',
  field: 'Field',
  operator: 'Operator',
  value: 'Value',
  valueTo: 'and',
  and: 'AND',
  or: 'OR',
  combinator: 'Match',
  empty: 'No conditions yet',
  group: (index: number) => `Group ${index}`,
  yes: 'Yes',
  no: 'No',
} satisfies Partial<FilterBuilderLabels>;

export interface FilterBuilderProps {
  /** The fields a product exposes. Nothing here is built in. */
  fields: FilterField[];
  value: FilterGroup;
  onChange: (value: FilterGroup) => void;
  /** Cap nesting. Three levels is already more than most people can read. */
  maxDepth?: number;
  disabled?: boolean;
  labels?: FilterBuilderLabels;
  className?: string;
}

/**
 * A nested condition editor: groups of `field operator value` clauses joined by AND or OR.
 *
 * **Generic by construction.** It knows five field *types* and a list of operators, and not one
 * field name. A product declares `fields` and gets an editor; School filters students by grade and
 * Work filters timesheets by project through the same component with no branch for either. The
 * value it produces is plain JSON, so a saved view, a URL and a server-side query all speak it.
 *
 * **Each group is a `<fieldset>` with a `<legend>`.** Nesting is the thing that makes these
 * unusable with a screen reader: a stack of divs gives no indication where one group ends and the
 * next begins, and "OR" floating between two rows means nothing. A fieldset announces its legend on
 * entry, so the combinator is heard as the group is entered rather than guessed from layout.
 *
 * **The value controls are the platform's.** A date condition uses `DatePicker`, a multi-select uses
 * `MultiSelect` — so a filter on a date behaves exactly like a date field anywhere else in the
 * product, including the locale's field order and the calendar adapter.
 */
export function FilterBuilder({
  fields,
  value,
  onChange,
  maxDepth = 3,
  disabled = false,
  labels,
  className,
}: FilterBuilderProps) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const operatorLabel = useCallback(
    (operator: FilterOperator) => text.operatorLabels?.[operator] ?? OPERATOR_LABELS[operator],
    [text.operatorLabels],
  );

  return (
    <Group
      group={value}
      depth={0}
      index={1}
      maxDepth={maxDepth}
      fields={fields}
      disabled={disabled}
      text={text}
      operatorLabel={operatorLabel}
      onChange={onChange}
      className={className}
    />
  );
}

/** Ids are generated here so a new condition is stable across re-renders. */
let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function Group({
  group,
  depth,
  index,
  maxDepth,
  fields,
  disabled,
  text,
  operatorLabel,
  onChange,
  onRemove,
  className,
}: {
  group: FilterGroup;
  depth: number;
  index: number;
  maxDepth: number;
  fields: FilterField[];
  disabled: boolean;
  text: Required<Omit<FilterBuilderLabels, 'operatorLabels'>> & {
    operatorLabels?: Partial<Record<FilterOperator, string>>;
  };
  operatorLabel: (operator: FilterOperator) => string;
  onChange: (group: FilterGroup) => void;
  onRemove?: () => void;
  className?: string | undefined;
}) {
  const legendId = useId();

  const replaceChild = (childIndex: number, child: FilterNode | null) => {
    const children = [...group.children];
    if (child === null) children.splice(childIndex, 1);
    else children[childIndex] = child;
    onChange({ ...group, children });
  };

  const addCondition = () => {
    const field = fields[0];
    if (!field) return;
    onChange({
      ...group,
      children: [
        ...group.children,
        {
          id: nextId('cond'),
          kind: 'condition',
          fieldId: field.id,
          operator: operatorsFor(field)[0] as FilterOperator,
        },
      ],
    });
  };

  const addGroup = () => {
    onChange({
      ...group,
      children: [
        ...group.children,
        { id: nextId('group'), kind: 'group', combinator: 'and', children: [] },
      ],
    });
  };

  return (
    <fieldset
      className={cn(
        'min-w-0 rounded-xl border border-border p-3',
        depth > 0 && 'bg-muted/20',
        className,
      )}
    >
      {/*
        The legend carries the combinator, so entering the group announces "Match AND, group 2"
        rather than leaving the user to infer it from a word floating between two rows.
      */}
      <legend id={legendId} className="flex items-center gap-2 px-1 text-xs">
        <span className="sr-only">
          {depth > 0 ? `${text.group(index)}, ` : ''}
          {text.combinator}
        </span>
        <Select
          aria-label={`${text.combinator}${depth > 0 ? ` — ${text.group(index)}` : ''}`}
          value={group.combinator}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...group, combinator: event.target.value as 'and' | 'or' })
          }
          className="h-7 w-20 text-xs"
        >
          <option value="and">{text.and}</option>
          <option value="or">{text.or}</option>
        </Select>
        {onRemove ? (
          <Button
            variant="ghost"
            aria-label={text.removeGroup}
            disabled={disabled}
            onClick={onRemove}
            className="size-7 p-0"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </legend>

      <div className="flex flex-col gap-2">
        {group.children.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">{text.empty}</p>
        ) : (
          group.children.map((child, childIndex) =>
            child.kind === 'group' ? (
              <Group
                key={child.id}
                group={child}
                depth={depth + 1}
                index={childIndex + 1}
                maxDepth={maxDepth}
                fields={fields}
                disabled={disabled}
                text={text}
                operatorLabel={operatorLabel}
                onChange={(next) => replaceChild(childIndex, next)}
                onRemove={() => replaceChild(childIndex, null)}
              />
            ) : (
              <Condition
                key={child.id}
                condition={child}
                fields={fields}
                disabled={disabled}
                text={text}
                operatorLabel={operatorLabel}
                onChange={(next) => replaceChild(childIndex, next)}
                onRemove={() => replaceChild(childIndex, null)}
              />
            ),
          )
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={disabled} onClick={addCondition}>
            <Plus className="size-3.5" aria-hidden="true" />
            {text.addCondition}
          </Button>
          {depth + 1 < maxDepth ? (
            <Button variant="ghost" disabled={disabled} onClick={addGroup}>
              <Plus className="size-3.5" aria-hidden="true" />
              {text.addGroup}
            </Button>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}

function Condition({
  condition,
  fields,
  disabled,
  text,
  operatorLabel,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  fields: FilterField[];
  disabled: boolean;
  text: Required<Omit<FilterBuilderLabels, 'operatorLabels'>> & {
    operatorLabels?: Partial<Record<FilterOperator, string>>;
  };
  operatorLabel: (operator: FilterOperator) => string;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
}) {
  const field = fields.find((candidate) => candidate.id === condition.fieldId) ?? fields[0];
  if (!field) return null;

  const operators = operatorsFor(field);
  const needsValue = !VALUELESS_OPERATORS.includes(condition.operator);
  const isMulti = MULTI_VALUE_OPERATORS.includes(condition.operator);
  const label = `${field.label} ${operatorLabel(condition.operator)}`;

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-card p-2">
      <Select
        aria-label={text.field}
        value={condition.fieldId}
        disabled={disabled}
        onChange={(event) => {
          const next = fields.find((candidate) => candidate.id === event.target.value);
          if (!next) return;
          // Changing the field resets the operator and the value: an operator valid for a date is
          // usually meaningless for a select, and keeping a stale value produces a clause that
          // looks complete and filters nothing.
          onChange({
            ...condition,
            fieldId: next.id,
            operator: operatorsFor(next)[0] as FilterOperator,
            value: undefined,
            valueTo: undefined,
          });
        }}
        className="h-9 w-40"
      >
        {fields.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label={text.operator}
        value={condition.operator}
        disabled={disabled}
        onChange={(event) =>
          onChange({
            ...condition,
            operator: event.target.value as FilterOperator,
            valueTo: undefined,
          })
        }
        className="h-9 w-40"
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {operatorLabel(operator)}
          </option>
        ))}
      </Select>

      {needsValue ? (
        <div className="flex min-w-40 flex-1 flex-wrap items-center gap-2">
          <ValueControl
            field={field}
            condition={condition}
            disabled={disabled}
            multi={isMulti}
            label={`${label} — ${text.value}`}
            onChange={(next) => onChange({ ...condition, value: next })}
          />
          {condition.operator === 'between' ? (
            <>
              <span className="text-xs text-muted-foreground">{text.valueTo}</span>
              <ValueControl
                field={field}
                condition={{ ...condition, value: condition.valueTo }}
                disabled={disabled}
                multi={false}
                label={`${label} — ${text.valueTo}`}
                onChange={(next) => onChange({ ...condition, valueTo: next })}
              />
            </>
          ) : null}
        </div>
      ) : (
        <span className="flex-1" />
      )}

      <Button
        variant="ghost"
        aria-label={`${text.remove}: ${label}`}
        disabled={disabled}
        onClick={onRemove}
        className="size-9 p-0"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The right platform control for the field's type — never a bare text box standing in for one. */
function ValueControl({
  field,
  condition,
  disabled,
  multi,
  label,
  onChange,
}: {
  field: FilterField;
  condition: FilterCondition;
  disabled: boolean;
  multi: boolean;
  label: string;
  onChange: (value: unknown) => void;
}): ReactNode {
  const current = condition.value;

  if (field.type === 'boolean') {
    return (
      <Checkbox
        aria-label={label}
        checked={current === true}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (field.type === 'date') {
    return (
      <div className="w-40">
        <DatePicker
          aria-label={label}
          value={typeof current === 'string' ? current : ''}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    const options = field.options.map((option) => ({
      value: option.value,
      label: option.label,
    }));
    if (multi) {
      return (
        <div className="min-w-48 flex-1">
          <MultiSelect
            aria-label={label}
            options={options}
            value={Array.isArray(current) ? (current as string[]) : []}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
      );
    }
    return (
      <Select
        aria-label={label}
        value={typeof current === 'string' ? current : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-40"
      >
        <option value="" />
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Input
      aria-label={label}
      type={field.type === 'number' ? 'number' : 'text'}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      // Narrowed rather than stringified: `value` is `unknown`, and an object reaching a text
      // input would render "[object Object]" as though it were the user's own text.
      value={typeof current === 'string' || typeof current === 'number' ? current : ''}
      disabled={disabled}
      placeholder={field.hint}
      onChange={(event) =>
        onChange(field.type === 'number' ? event.target.valueAsNumber : event.target.value)
      }
      className="min-w-32 flex-1"
    />
  );
}
