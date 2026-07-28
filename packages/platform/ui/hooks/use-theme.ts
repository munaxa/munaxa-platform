'use client';

import { useCallback, useEffect, useState } from 'react';

/** The two colour schemes every product theme ships. */
export type ColorScheme = 'light' | 'dark';

export interface UseThemeOptions {
  /**
   * localStorage key the preference is persisted under. Products own their own key so an
   * existing audience keeps its stored preference across releases.
   */
  storageKey: string;
  /**
   * Where the initial value comes from.
   *
   * - `storage` (default): read `storageKey`, falling back to {@link UseThemeOptions.fallback}.
   *   Use this when nothing applies the class before hydration.
   * - `document`: read the `dark` class already on `<html>`. Use this when the application runs
   *   a no-flash boot script that applies the class before React mounts — reading storage again
   *   would fight it.
   */
  source?: 'storage' | 'document';
  /** Scheme to assume when nothing is stored. Defaults to `light`. */
  fallback?: ColorScheme;
}

export interface UseThemeResult {
  /** The active colour scheme. `null` until the effect has run (server render / first paint). */
  scheme: ColorScheme | null;
  /** Switch to an explicit scheme, applying and persisting it. */
  setScheme: (next: ColorScheme) => void;
  /** Flip between light and dark. */
  toggle: () => void;
}

function apply(scheme: ColorScheme): void {
  document.documentElement.classList.toggle('dark', scheme === 'dark');
}

/**
 * Light/dark switching against the design system's `.dark` variant.
 *
 * The hook owns exactly three things — reading the initial preference, writing the `dark` class
 * onto `<html>`, and persisting the choice — so every product gets identical behaviour while
 * keeping its own storage key and its own toggle markup.
 */
export function useTheme({
  storageKey,
  source = 'storage',
  fallback = 'light',
}: UseThemeOptions): UseThemeResult {
  const [scheme, setSchemeState] = useState<ColorScheme | null>(null);

  useEffect(() => {
    if (source === 'document') {
      // A boot script has already applied the class; trust it and just mirror it into state.
      setSchemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      /* storage unavailable (private mode, blocked cookies) — fall back */
    }
    const initial: ColorScheme = stored === 'dark' || stored === 'light' ? stored : fallback;
    setSchemeState(initial);
    apply(initial);
  }, [storageKey, source, fallback]);

  const setScheme = useCallback(
    (next: ColorScheme) => {
      setSchemeState(next);
      apply(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* storage unavailable — the class is still applied for this session */
      }
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setScheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [setScheme]);

  return { scheme, setScheme, toggle };
}
