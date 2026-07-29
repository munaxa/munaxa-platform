import { forwardRef, useId, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Container, type ContainerWidth } from './container.js';
import { Stack } from './stack.js';
import type { Space } from './scales.js';

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  width?: ContainerWidth;
  /** Vertical rhythm between the page's sections. */
  gap?: Space;
  /** Remove the container — for a page that manages its own measure, such as a full-bleed grid. */
  flush?: boolean;
}

/**
 * The frame every screen sits in: one measure, one vertical rhythm.
 *
 * The rhythm is the reason this exists. Pages hand-assembled from `space-y-*` drift — one screen
 * uses 4, the next uses 6, and the application stops feeling like one product. Setting it here
 * means changing it is one edit rather than a hundred.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { width = 'wide', gap = 6, flush = false, className, children, ...props },
  ref,
) {
  const content = (
    <Stack gap={gap} className={flush ? className : undefined}>
      {children}
    </Stack>
  );
  if (flush) {
    return (
      <div ref={ref} {...props}>
        {content}
      </div>
    );
  }
  return (
    <Container ref={ref} width={width} className={cn('py-6', className)} {...props}>
      {content}
    </Container>
  );
});

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  /** Supporting line under the title. */
  description?: ReactNode;
  /** Breadcrumb, back-link or anything else that belongs above the title. */
  above?: ReactNode;
  /** Primary and secondary actions, aligned to the end of the row. */
  actions?: ReactNode;
  /** Heading level. Use `h1` once per screen; nested pages may need `h2`. */
  level?: 'h1' | 'h2';
}

/**
 * The title block at the top of a screen.
 *
 * Sixty-one screens in the school admin app repeat the same `<h1 className="font-display
 * text-2xl font-semibold">`; this is that markup, once, with the actions row and the description
 * that usually accompany it. The heading level is a prop rather than fixed at `h1`, because a
 * screen must have exactly one and nested layouts sometimes need `h2` — an accessible heading
 * outline cannot be enforced by a component that hardcodes its level.
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, description, above, actions, level = 'h1', className, ...props },
  ref,
) {
  const Heading = level as ElementType;
  return (
    <header ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
      {above}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading className="font-display text-2xl font-semibold">{title}</Heading>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
});

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Section heading. When given, the section is labelled by it for assistive technology. */
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  gap?: Space;
}

/**
 * A titled region within a page.
 *
 * When a title is supplied the section is exposed as a labelled `region` landmark, so screen-reader
 * users can jump between the parts of a long screen instead of walking through all of it. A section
 * without a title is a plain grouping element and claims no landmark — an unlabelled region is
 * noise in the landmark list.
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, description, actions, gap = 3, className, children, ...props },
  ref,
) {
  // Derived from useId, not from the title: a ReactNode title stringifies to "[object Object]",
  // and two sections that happen to share a title would collide on the same id.
  const generatedId = useId();
  const headingId = title ? generatedId : undefined;
  return (
    <section
      ref={ref}
      {...(headingId ? { 'aria-labelledby': headingId, role: 'region' } : {})}
      className={cn('flex flex-col', className)}
      {...props}
    >
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            {title ? (
              <h2 id={headingId} className="font-display text-lg font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <Stack gap={gap}>{children}</Stack>
    </section>
  );
});
