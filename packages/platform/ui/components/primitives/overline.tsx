import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

export interface OverlineProps extends HTMLAttributes<HTMLElement> {
  /**
   * The element to render. An overline is usually a heading for the group below it — `h2`/`h3` in a
   * panel, so a screen reader can jump between sections — and `span` when it only labels a value.
   */
  as?: 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div';
  children: ReactNode;
}

/**
 * Small, spaced capitals that label the group beneath them — "APPROVAL PROGRESS", "METADATA",
 * "FOLDERS".
 *
 * The rail's group titles, a data grid's caps headings and a detail panel's section labels are all
 * the same piece of type, and each product was about to write the five classes again. This is that
 * type once, so a change to it lands everywhere.
 *
 * The muted foreground at full strength, never a fade of it: at 10.5px this is the smallest text on
 * most screens and has no contrast to spare (the 2.79:1 rail heading of Phase 8.2 was exactly a
 * fade). Letter-spacing is removed in right-to-left documents, because it pulls apart the joins
 * between Arabic letters, and `uppercase` has nothing to change in a script without case.
 */
export function Overline({ as: Element = 'span', className, children, ...props }: OverlineProps) {
  return (
    <Element
      className={cn(
        'text-[10.5px] leading-4 font-semibold tracking-[0.08em] text-muted-foreground uppercase',
        'rtl:tracking-normal',
        className,
      )}
      {...props}
    >
      {children}
    </Element>
  );
}
