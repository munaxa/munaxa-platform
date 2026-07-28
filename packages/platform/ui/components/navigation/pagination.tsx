import { cn } from '../../lib/cn.js';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Accessible labels (override for i18n). */
  labels?: { nav?: string; previous?: string; next?: string; page?: string };
}

/**
 * Page navigator with accessible prev/next controls and a current-page indicator.
 * RTL-safe: built from logical layout; chevrons are textual and mirror with dir.
 */
export function Pagination({ page, pageCount, onPageChange, className, labels }: PaginationProps) {
  if (pageCount <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < pageCount;
  const btn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-border px-3 text-sm ' +
    'text-foreground transition-colors hover:bg-secondary/50 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50';

  return (
    <nav
      aria-label={labels?.nav ?? 'Pagination'}
      className={cn('flex items-center justify-between gap-2', className)}
    >
      <button
        type="button"
        className={btn}
        onClick={() => canPrev && onPageChange(page - 1)}
        disabled={!canPrev}
      >
        <span aria-hidden="true" className="rtl:hidden">
          ‹
        </span>
        <span aria-hidden="true" className="hidden rtl:inline">
          ›
        </span>
        <span className="ms-1">{labels?.previous ?? 'Previous'}</span>
      </button>
      <span className="text-sm text-muted-foreground" aria-current="page">
        {labels?.page ?? 'Page'} {page} / {pageCount}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => canNext && onPageChange(page + 1)}
        disabled={!canNext}
      >
        <span className="me-1">{labels?.next ?? 'Next'}</span>
        <span aria-hidden="true" className="rtl:hidden">
          ›
        </span>
        <span aria-hidden="true" className="hidden rtl:inline">
          ‹
        </span>
      </button>
    </nav>
  );
}
