'use client';

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn.js';

/**
 * Live design-token reference. Renders the active theme's palette/scale by reading the *actual*
 * CSS custom properties off the running document (`getComputedStyle`) and by painting each swatch
 * with the real Tailwind token utility. Because it reflects the live theme, it can never drift
 * from the source of truth (themes/<product>/palette.css): change a token and the swatch + value
 * here change with it. Re-reads automatically when the `.dark`/`dir` attributes toggle.
 *
 * Use it as the on-brand reference when building new pages: copy the "Use as" class, never a hex.
 */

type SwatchKind = 'fill' | 'text' | 'line';
type Token = { varName: string; use: string; kind: SwatchKind; cls: string };
type Group = { title: string; tokens: Token[] };

const GROUPS: Group[] = [
  {
    title: 'Brand & accents',
    tokens: [
      { varName: '--primary', use: 'bg-primary · text-primary', kind: 'fill', cls: 'bg-primary' },
      { varName: '--accent', use: 'bg-accent', kind: 'fill', cls: 'bg-accent' },
      {
        varName: '--accent-warm',
        use: 'text-accent-warm · bg-accent-warm',
        kind: 'fill',
        cls: 'bg-accent-warm',
      },
      {
        varName: '--accent-cool',
        use: 'text-accent-cool · bg-accent-cool',
        kind: 'fill',
        cls: 'bg-accent-cool',
      },
      { varName: '--ring', use: 'ring-ring (focus)', kind: 'line', cls: 'ring-2 ring-ring' },
    ],
  },
  {
    title: 'Status / semantic',
    tokens: [
      { varName: '--success', use: 'bg-success · text-success', kind: 'fill', cls: 'bg-success' },
      { varName: '--warning', use: 'bg-warning · text-warning', kind: 'fill', cls: 'bg-warning' },
      { varName: '--info', use: 'bg-info · text-info', kind: 'fill', cls: 'bg-info' },
      {
        varName: '--destructive',
        use: 'bg-destructive (error)',
        kind: 'fill',
        cls: 'bg-destructive',
      },
    ],
  },
  {
    title: 'Surfaces',
    tokens: [
      { varName: '--background', use: 'bg-background', kind: 'fill', cls: 'bg-background' },
      { varName: '--card', use: 'bg-card', kind: 'fill', cls: 'bg-card' },
      { varName: '--secondary', use: 'bg-secondary', kind: 'fill', cls: 'bg-secondary' },
      { varName: '--muted', use: 'bg-muted', kind: 'fill', cls: 'bg-muted' },
    ],
  },
  {
    title: 'Text',
    tokens: [
      { varName: '--foreground', use: 'text-foreground', kind: 'text', cls: 'text-foreground' },
      {
        varName: '--muted-foreground',
        use: 'text-muted-foreground',
        kind: 'text',
        cls: 'text-muted-foreground',
      },
    ],
  },
  {
    title: 'Lines & inputs',
    tokens: [
      { varName: '--border', use: 'border-border', kind: 'line', cls: 'border-2 border-border' },
      { varName: '--input', use: 'border-input', kind: 'line', cls: 'border-2 border-input' },
    ],
  },
];

const SCALE: { label: string; varName: string }[] = [
  { label: 'Radius (base)', varName: '--radius' },
  { label: 'Display', varName: '--font-display' },
  { label: 'Body', varName: '--font-body' },
  { label: 'Arabic (RTL)', varName: '--font-arabic' },
  { label: 'Mono', varName: '--font-mono' },
];

/** Format a raw custom-property value for display (some tokens are bare HSL channels). */
function fmt(v: string): string {
  if (!v) return '—';
  if (/^#|rgb|hsl|var\(/.test(v) || v.includes(',') || v.includes('"') || /[a-z-]/i.test(v)) {
    // Already a color/font/length expression — show verbatim.
    return /^\d[\d.]*\s+\d/.test(v) ? `hsl(${v})` : v;
  }
  return v;
}

function Swatch({ token }: { token: Token }) {
  const base = 'h-10 w-10 shrink-0 rounded-md';
  if (token.kind === 'text') {
    return (
      <span
        className={cn(
          base,
          'grid place-items-center border border-border bg-card text-lg font-bold',
          token.cls,
        )}
        aria-hidden
      >
        Aa
      </span>
    );
  }
  if (token.kind === 'line') {
    return <span className={cn(base, 'bg-card', token.cls)} aria-hidden />;
  }
  return (
    <span className={cn(base, 'ring-1 ring-inset ring-foreground/10', token.cls)} aria-hidden />
  );
}

/** Flattened list of every token var the table reads — module-level so it is a stable
 * reference and the effect below needs no dependency-array exception. */
const TOKEN_VARS: string[] = [
  ...GROUPS.flatMap((g) => g.tokens.map((t) => t.varName)),
  ...SCALE.map((s) => s.varName),
];

function useLiveVars(): Record<string, string> {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const n of TOKEN_VARS) next[n] = cs.getPropertyValue(n).trim();
      setVals(next);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'dir', 'style'],
    });
    return () => obs.disconnect();
  }, []);
  return vals;
}

export function TokenReference() {
  const vals = useLiveVars();

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="mb-2 border-b border-border pb-1 text-sm font-semibold text-muted-foreground">
            {group.title}
          </h2>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-14 py-2 text-start font-medium">
                  Swatch
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  Token
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  Use as
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  Live value
                </th>
              </tr>
            </thead>
            <tbody>
              {group.tokens.map((token) => (
                <tr key={token.varName} className="border-b border-border/60">
                  <td className="py-2">
                    <Swatch token={token} />
                  </td>
                  <th scope="row" className="py-2 text-start font-normal">
                    <code className="font-mono text-xs">{token.varName}</code>
                  </th>
                  <td className="py-2">
                    <code className="font-mono text-xs text-primary">{token.use}</code>
                  </td>
                  <td className="py-2">
                    <code className="font-mono text-xs text-muted-foreground">
                      {fmt(vals[token.varName] ?? '')}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section>
        <h2 className="mb-2 border-b border-border pb-1 text-sm font-semibold text-muted-foreground">
          Radius &amp; type
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {SCALE.map((s) => (
            <div
              key={s.varName}
              className="flex justify-between gap-4 border-b border-border/60 py-1"
            >
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd>
                <code className="font-mono text-xs">{fmt(vals[s.varName] ?? '')}</code>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
