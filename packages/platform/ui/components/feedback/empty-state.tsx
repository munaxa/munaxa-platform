import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/**
 * Empty-state pattern (Munaxa DS "Empty States"): a centered, muted message with an
 * optional supporting description and a primary action. Works inline (including inside
 * a table cell with colSpan) or as a card body. Keep copy contextual to the state
 * (first-use vs no-results vs permission).
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
