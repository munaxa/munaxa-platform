'use client';

import {
  createContext,
  useContext,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn.js';

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
  variant: TabsVariant;
}

/**
 * `pill` (the default) is the segmented control: a muted track with the selected tab raised on a card.
 * `underline` is the page-level set: a rule under the row and a brand bar under the selected tab, for
 * the sections of one record where a segmented track would read as a filter.
 */
export type TabsVariant = 'pill' | 'underline';
const Ctx = createContext<TabsCtx | null>(null);

function useTabs(): TabsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Tabs subcomponents must be used within <Tabs>');
  return ctx;
}

/** Controlled tabs container. */
export function Tabs({
  value,
  onValueChange,
  variant = 'pill',
  className,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  variant?: TabsVariant;
  className?: string;
  children: ReactNode;
}) {
  const baseId = useId();
  return (
    <Ctx.Provider value={{ value, setValue: onValueChange, baseId, variant }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

/** Tab strip. Arrow keys move focus/selection (RTL-aware via document dir). */
export function TabsList({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  /** Names the set when the page has more than one, or when the tabs alone do not say what they divide. */
  'aria-label'?: string;
}) {
  const { variant } = useTabs();
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? [],
    );
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    e.preventDefault();
    const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
    const forward = e.key === 'ArrowRight' ? !rtl : rtl;
    const next = forward ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  return (
    <div
      ref={ref}
      role="tablist"
      {...(rest['aria-label'] === undefined ? {} : { 'aria-label': rest['aria-label'] })}
      onKeyDown={onKeyDown}
      className={cn(
        variant === 'underline'
          ? 'flex items-end gap-0.5 border-b border-border text-muted-foreground'
          : 'inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  disabled,
}: {
  value: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { value: active, setValue, baseId, variant } = useTabs();
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => setValue(value)}
      className={cn(
        'text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'underline'
          ? [
              // `-mb-px` so the selected bar sits on the list's rule rather than above it.
              '-mb-px h-[38px] border-b-2 px-3.5',
              selected
                ? 'border-primary font-semibold text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]
          : [
              'rounded-md px-3 py-1.5 font-medium',
              // The card surface, not the page: a theme whose page canvas is tinted (Docs) would
              // otherwise sink the selected tab into the track rather than raise it.
              selected
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const { value: active, baseId } = useTabs();
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}
