'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Row windowing for a bounded, fixed-row-height grid.
 *
 * **Why this is fifty lines and not a dependency.** Virtualization is hard when rows can be any
 * height: you need measurement, a running offset cache and invalidation, and that is where a
 * library earns its place. An enterprise data grid does not have variable row heights — every row
 * is one line — and for a fixed height the maths is exact arithmetic with nothing to measure and
 * nothing to cache. Taking a dependency to divide by a constant would be a worse trade than
 * owning it.
 *
 * **Virtualization needs a bounded viewport.** There is nothing to window if the container grows
 * to fit its content, which is why the grid ties this to its `height` prop rather than offering a
 * `virtualized` boolean that would silently do nothing without one.
 */

export interface VirtualRowsOptions {
  /** The scrolling element. */
  containerRef: RefObject<HTMLElement | null>;
  rowCount: number;
  rowHeight: number;
  /**
   * Rows rendered beyond each edge of the viewport.
   *
   * Not just a scroll-smoothness tweak: find-in-page, Ctrl+F and a screen reader's virtual cursor
   * only see rendered rows, and an overscan of zero means the row *just* off screen does not exist
   * for any of them.
   */
  overscan?: number;
  /** Turn windowing off — everything renders and the maths is skipped. */
  enabled?: boolean;
}

export interface VirtualRows {
  /** First rendered row index, inclusive. */
  start: number;
  /** Last rendered row index, exclusive. */
  end: number;
  /** Spacer height above the rendered window. */
  paddingTop: number;
  /** Spacer height below it. */
  paddingBottom: number;
  /** Bring a row index into view, accounting for rows that are not rendered yet. */
  scrollToRow: (index: number) => void;
}

export function useVirtualRows({
  containerRef,
  rowCount,
  rowHeight,
  overscan = 8,
  enabled = true,
}: VirtualRowsOptions): VirtualRows {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const read = () => {
      setScrollTop(container.scrollTop);
      setViewport(container.clientHeight);
    };
    read();

    const onScroll = () => {
      // Coalesced to one read per frame: a scroll event fires far more often than the browser
      // paints, and re-rendering the window on every one of them is the classic jank source.
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        read();
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    // The viewport changes without a scroll — a sidebar collapsing, a window resize, a font load.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => read());
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [containerRef, enabled]);

  const scrollToRow = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;
      const top = index * rowHeight;
      const bottom = top + rowHeight;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (bottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = bottom - container.clientHeight;
      }
    },
    [containerRef, rowHeight],
  );

  if (!enabled || rowCount === 0) {
    return { start: 0, end: rowCount, paddingTop: 0, paddingBottom: 0, scrollToRow };
  }

  // A viewport of zero means the container has not been measured yet — on the first paint, and on
  // the server. Rendering an empty window there would flash a blank grid and would hand a
  // screen reader nothing at all, so fall back to a sensible first screenful.
  const visibleRows = viewport > 0 ? Math.ceil(viewport / rowHeight) : overscan * 2;

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(rowCount, start + visibleRows + overscan * 2);

  return {
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (rowCount - end) * rowHeight),
    scrollToRow,
  };
}
