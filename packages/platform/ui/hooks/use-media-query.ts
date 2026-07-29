'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query.
 *
 * Server-safe: it reports `false` until the component has mounted, so markup rendered on the
 * server and markup rendered on the first client pass agree and React does not warn about a
 * hydration mismatch. Layout that must be correct in the very first paint belongs in CSS, not
 * here — this hook is for behaviour (which handler to attach, whether to render a drawer or a
 * rail), not for appearance.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
