import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface StepperStep {
  /** Stable key. */
  key: string;
  /** Step title. */
  title: ReactNode;
  /** Optional one-line description under the title. */
  description?: ReactNode;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}

/**
 * Horizontal progress stepper for guided multi-step flows (e.g. the Close Academic Year wizard).
 * Steps before `current` render as complete, the active step is highlighted, later steps are muted.
 * RTL-safe via logical properties and flex ordering following document direction.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={cn('flex w-full items-start gap-2', className)} aria-label="Progress">
      {steps.map((step, i) => {
        const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming';
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  'h-0.5 flex-1',
                  i === 0 ? 'opacity-0' : state === 'upcoming' ? 'bg-border' : 'bg-accent-cool',
                )}
              />
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
                  state === 'complete' &&
                    'border-accent-cool/40 bg-accent-cool/15 text-accent-cool',
                  state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  state === 'upcoming' && 'border-border bg-card text-muted-foreground',
                )}
              >
                {state === 'complete' ? '✓' : i + 1}
              </span>
              <span
                className={cn(
                  'h-0.5 flex-1',
                  isLast ? 'opacity-0' : state === 'complete' ? 'bg-accent-cool' : 'bg-border',
                )}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  'text-xs font-medium',
                  state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {step.title}
              </span>
              {step.description ? (
                <span className="hidden text-[10px] text-muted-foreground sm:block">
                  {step.description}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
