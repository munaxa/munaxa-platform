'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * Presentation helpers for the documentation pages.
 *
 * These are docs furniture, not platform components: they live outside `ui/`, are excluded from
 * the build, and are never exported from the package. A swatch that needs to print its own hex is
 * a documentation concern; putting it in `ui/` would add public API for a problem no product has.
 */

/**
 * Re-read live CSS custom properties whenever the brand, scheme or direction changes.
 *
 * `scope` matters more than it looks. A theme page pins its brand on a nested container, so the
 * values that page must report live on *that* element, not on `<html>` — reading the root there
 * would print the toolbar's brand beside a swatch painted in the pinned one, which is worse than
 * printing nothing. Callers inside a pinned scope pass a ref to an element within it; everything
 * else falls back to the document root, which is where the toolbar applies the brand.
 */
export function useLiveVars(
  names: readonly string[],
  scope?: RefObject<HTMLElement | null>,
): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  const key = names.join(',');

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(scope?.current ?? document.documentElement);
      const next: Record<string, string> = {};
      for (const name of key.split(',')) next[name] = style.getPropertyValue(name).trim();
      setValues(next);
    };
    read();

    // The toolbar swaps `data-brand` / `class` / `dir` on <html>; without observing them the
    // printed values would silently belong to whichever brand happened to load first.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'dir', 'data-brand'],
    });
    return () => observer.disconnect();
    // Keyed on the joined names: callers build the array inline, so a fresh identity every render
    // would re-subscribe (and re-set state) on every render.
  }, [key, scope]);

  return values;
}

/** `#6E1E43` → `110, 30, 67`. Returns null for anything that is not a plain hex. */
export function hexToRgb(hex: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const body = match[1];
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  const int = Number.parseInt(full, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

export function Page({
  title,
  lead,
  children,
}: {
  title: string;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{lead}</p>
      </header>
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A fixed colour from the brand book — the value is known, so it is stated, not measured. */
export function StaticSwatch({ name, hex }: { name: string; hex: string }) {
  const rgb = hexToRgb(hex);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <span
        aria-hidden="true"
        className="size-10 shrink-0 rounded-md border border-border"
        style={{ background: hex }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{name}</span>
        <span className="block font-mono text-xs text-muted-foreground">{hex.toUpperCase()}</span>
        {rgb ? (
          <span className="block font-mono text-[11px] text-muted-foreground">rgb({rgb})</span>
        ) : null}
      </span>
    </div>
  );
}

export interface TokenRow {
  /** The semantic custom property, e.g. `--primary`. */
  variable: string;
  /** Tailwind utilities a product should reach for. */
  utilities: string;
  /** What the token is *for* — the part a hex can never tell you. */
  purpose: string;
  /** How to paint the swatch: as a fill, as text, or as a line. */
  kind?: 'fill' | 'text' | 'line';
}

/**
 * A semantic token, measured live off the running document.
 *
 * The value column is read rather than written down, so it always shows the *active* brand and
 * scheme. That is the whole point of the page: the same row reads `#00CFC1` under School and
 * `#6E1E43` under Work without the table knowing either brand exists.
 */
export function TokenTable({ rows }: { rows: readonly TokenRow[] }) {
  // Measured from the table itself, so a pinned theme page reports its own brand.
  const scope = useRef<HTMLDivElement>(null);
  const values = useLiveVars(
    rows.map((r) => r.variable),
    scope,
  );

  return (
    <div ref={scope} className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Swatch
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Token
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Value
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Utilities
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const value = values[row.variable] ?? '';
            const rgb = hexToRgb(value);
            return (
              <tr key={row.variable} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <span
                    aria-hidden="true"
                    className="block size-9 rounded-md border border-border"
                    style={
                      row.kind === 'line'
                        ? { borderColor: `var(${row.variable})`, borderWidth: 3 }
                        : { background: `var(${row.variable})` }
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <code className="font-mono text-xs">var({row.variable})</code>
                </td>
                <td className="px-3 py-2">
                  <span className="block font-mono text-xs">{value || '—'}</span>
                  {rgb ? (
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      rgb({rgb})
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <code className="font-mono text-xs text-muted-foreground">{row.utilities}</code>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.purpose}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
