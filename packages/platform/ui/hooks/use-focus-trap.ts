'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Elements that can receive focus, in DOM order — the ring the trap cycles through. */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
]
  .map((selector) => `${selector}:not([disabled]):not([tabindex="-1"])`)
  .join(',');

/** Focusable descendants of `container`, skipping anything hidden from assistive technology. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export interface UseFocusTrapOptions {
  /** Whether the trap is armed. Layers pass their own open state. */
  active: boolean;
  /** The element focus is confined to. */
  containerRef: RefObject<HTMLElement | null>;
  /** Called on Escape. Omit for a layer that cannot be dismissed that way. */
  onEscape?: (() => void) | undefined;
  /** Move focus into the container when the trap arms. Default true. */
  autoFocus?: boolean;
  /** Return focus to whatever had it when the trap arms. Default true. */
  restoreFocus?: boolean;
  /** Prevent the page behind from scrolling while active. Default true. */
  lockScroll?: boolean;
}

/**
 * Confine keyboard focus to a container while it is open, and hand it back on close.
 *
 * Every modal layer needs this and none of it is optional: `aria-modal` hides the rest of the page
 * from assistive technology but does nothing to the tab order, so without a trap Tab walks out of
 * the layer into content the user cannot see. Dialog and NavigationDrawer share this hook rather
 * than each carrying their own copy — a focus trap that exists twice is a focus trap that will
 * diverge.
 */
export function useFocusTrap({
  active,
  containerRef,
  onEscape,
  autoFocus = true,
  restoreFocus = true,
  lockScroll = true,
}: UseFocusTrapOptions): void {
  /*
   * Callers pass a fresh inline `onEscape` on every render. Depending on it directly would re-run
   * the effect each time, which re-focuses the container after every keystroke; excluding it from
   * the deps would capture the first one forever. A ref updated on each render is the only version
   * that is both current and stable.
   */
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) {
        // Nothing to move to; hold focus on the container rather than losing it to the page.
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    if (autoFocus) containerRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      if (restoreFocus) previouslyFocused?.focus?.();
    };
  }, [active, containerRef, autoFocus, restoreFocus, lockScroll]);
}
