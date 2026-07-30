'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn.js';

export interface ResizablePanelsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Leading pane — left in LTR, right in RTL. */
  start: ReactNode;
  /** Trailing pane, which takes the remaining space. */
  end: ReactNode;
  /** Percentage of the width given to the leading pane when uncontrolled. */
  defaultSize?: number;
  /** Controlled size, as a percentage. Pair with `onSizeChange`. */
  size?: number;
  onSizeChange?: (size: number) => void;
  minSize?: number;
  maxSize?: number;
  /** Accessible name for the separator — "Resize navigation", "Resize preview". */
  label: string;
  /** Percentage moved per arrow-key press. */
  step?: number;
  /** Below this breakpoint the panes stack and the separator is removed. */
  stackBelow?: 'sm' | 'md' | 'lg';
}

const STACK_BELOW = {
  sm: 'sm:flex-row',
  md: 'md:flex-row',
  lg: 'lg:flex-row',
} as const;

const SEPARATOR_SHOW = {
  sm: 'hidden sm:flex',
  md: 'hidden md:flex',
  lg: 'hidden lg:flex',
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Two panes with a draggable separator between them.
 *
 * The separator is a real `role="separator"` with `aria-valuenow`, and it is fully operable from
 * the keyboard: arrows resize by `step`, Home and End jump to the bounds, Enter toggles between
 * the minimum and the last size. That matters more than the drag — a pointer-only resize handle is
 * simply unusable for anyone who does not use a pointer, and it is the part most implementations
 * leave out.
 *
 * Direction-aware: in RTL, dragging and the arrow keys both follow the visual direction, because
 * `start` is on the right and "make the start pane bigger" means moving the separator left.
 *
 * Works controlled (`size` + `onSizeChange`) or uncontrolled (`defaultSize`), following the same
 * convention as the rest of the platform.
 */
export function ResizablePanels({
  start,
  end,
  defaultSize = 50,
  size,
  onSizeChange,
  minSize = 15,
  maxSize = 85,
  label,
  step = 5,
  stackBelow = 'md',
  className,
  ...props
}: ResizablePanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [uncontrolled, setUncontrolled] = useState(clamp(defaultSize, minSize, maxSize));
  const [dragging, setDragging] = useState(false);
  /** Size to restore when Enter un-collapses the pane. */
  const restoreRef = useRef(clamp(defaultSize, minSize, maxSize));
  const separatorId = useId();

  const current = size ?? uncontrolled;

  const commit = useCallback(
    (next: number) => {
      const clamped = clamp(next, minSize, maxSize);
      if (size === undefined) setUncontrolled(clamped);
      onSizeChange?.(clamped);
    },
    [maxSize, minSize, onSizeChange, size],
  );

  // Drag is tracked on the document: the pointer routinely leaves the 6px separator mid-gesture,
  // and listeners bound to the handle itself would drop the drag the moment it did.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const rtl = getComputedStyle(containerRef.current!).direction === 'rtl';
      const offset = rtl ? rect.right - event.clientX : event.clientX - rect.left;
      commit((offset / rect.width) * 100);
    };
    const stop = () => setDragging(false);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
    // Without this a drag across the panes selects their text instead of resizing.
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging, commit]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rtl =
      typeof document !== 'undefined' &&
      containerRef.current !== null &&
      getComputedStyle(containerRef.current).direction === 'rtl';

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        commit(current + (rtl ? step : -step));
        break;
      case 'ArrowRight':
        event.preventDefault();
        commit(current + (rtl ? -step : step));
        break;
      case 'Home':
        event.preventDefault();
        commit(minSize);
        break;
      case 'End':
        event.preventDefault();
        commit(maxSize);
        break;
      case 'Enter':
        event.preventDefault();
        if (current > minSize) {
          restoreRef.current = current;
          commit(minSize);
        } else {
          commit(restoreRef.current);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col', STACK_BELOW[stackBelow], className)}
      {...props}
    >
      <div className="min-w-0 shrink-0" style={{ flexBasis: `${current}%` }}>
        {start}
      </div>

      <div
        id={separatorId}
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(current)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          SEPARATOR_SHOW[stackBelow],
          'group relative w-1.5 shrink-0 cursor-col-resize touch-none items-stretch',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging && 'ring-2 ring-ring',
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto h-full w-px bg-border transition-colors group-hover:bg-primary-strong"
        />
      </div>

      <div className="min-w-0 flex-1">{end}</div>
    </div>
  );
}
