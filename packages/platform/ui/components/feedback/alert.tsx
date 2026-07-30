import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.js';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from '../../../icons/index.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * Each tone pairs a low-alpha wash with the `-strong` text form of the same role. The plain status
 * colours are fills and sit near 2.2:1 on a light surface — readable behind text, not as text.
 */
const TONE: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: 'border-info/30 bg-info/10 text-foreground', icon: 'text-info-strong' },
  success: { box: 'border-success/30 bg-success/10 text-foreground', icon: 'text-success-strong' },
  warning: { box: 'border-warning/30 bg-warning/10 text-foreground', icon: 'text-warning-strong' },
  danger: {
    box: 'border-destructive/30 bg-destructive/10 text-foreground',
    icon: 'text-destructive',
  },
};

const DEFAULT_ICON: Record<AlertTone, ReactNode> = {
  info: <Info className="size-4" aria-hidden="true" />,
  success: <CheckCircle2 className="size-4" aria-hidden="true" />,
  warning: <TriangleAlert className="size-4" aria-hidden="true" />,
  danger: <AlertCircle className="size-4" aria-hidden="true" />,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
  /** Replace the tone's default glyph. Pass `null` for no icon. */
  icon?: ReactNode | null;
  /** Trailing controls — a dismiss button, a retry link. */
  actions?: ReactNode;
  /**
   * How assistive technology should treat it. `status` announces politely; `alert` interrupts and
   * is only right for something the user must act on now. Static page content needs neither, which
   * is the default — a role here would announce on every render.
   */
  live?: 'off' | 'status' | 'alert';
}

/**
 * A bordered message with a tone: informational, successful, cautionary or failed.
 *
 * The icon is decorative and the tone is never the only signal — the title and body carry the
 * meaning, so the message survives for anyone who cannot distinguish the colours.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = 'info', title, icon, actions, live = 'off', className, children, ...props },
  ref,
) {
  const glyph = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);
  return (
    <div
      ref={ref}
      {...(live === 'off' ? {} : { role: live === 'alert' ? 'alert' : 'status' })}
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', TONE[tone].box, className)}
      {...props}
    >
      {glyph ? <span className={cn('mt-0.5 shrink-0', TONE[tone].icon)}>{glyph}</span> : null}
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium leading-none">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-2">{actions}</div> : null}
    </div>
  );
});
