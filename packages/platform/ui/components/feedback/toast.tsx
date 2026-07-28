'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from '../../lib/cn.js';

type Tone = 'default' | 'success' | 'error';
interface Toast {
  id: number;
  title?: string;
  description: string;
  tone: Tone;
}

interface ToastApi {
  toast: (t: { description: string; title?: string; tone?: Tone }) => void;
  success: (description: string, title?: string) => void;
  error: (description: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const toneClass: Record<Tone, string> = {
  default: 'border-border bg-card',
  success: 'border-accent-cool/40 bg-card',
  error: 'border-destructive/50 bg-card',
};
const dotClass: Record<Tone, string> = {
  default: 'bg-primary',
  success: 'bg-accent-cool',
  error: 'bg-destructive',
};

export interface ToastProviderProps {
  children: React.ReactNode;
  /**
   * Extra classes for the fixed toast viewport. Use it to place the viewport in the host
   * application's stacking context (the default is `z-toast`); everything else is fixed by
   * the design system so toasts look the same in every product.
   */
  viewportClassName?: string;
}

export function ToastProvider({ children, viewportClassName }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: { description: string; title?: string; tone?: Tone }) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, tone: 'default', ...t }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (description, title) =>
        push({ description, tone: 'success', ...(title ? { title } : {}) }),
      error: (description, title) =>
        push({ description, tone: 'error', ...(title ? { title } : {}) }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 top-4 z-toast flex flex-col items-center gap-2 px-4',
          viewportClassName,
        )}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3 shadow-card',
              toneClass[t.tone],
            )}
          >
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dotClass[t.tone])} />
            <div className="min-w-0 flex-1">
              {t.title ? <p className="text-sm font-medium">{t.title}</p> : null}
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>
            <button
              onClick={() => remove(t.id)}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
