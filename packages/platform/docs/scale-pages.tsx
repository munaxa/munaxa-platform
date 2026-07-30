import { spacing, radius, elevation, motion, breakpoints } from '../tokens/index.js';
import { Page, Section } from './doc-kit.js';

/**
 * The structural scales: spacing, radius, elevation, motion and breakpoints.
 *
 * These are *not* brand-dependent, and that is the point worth making on these pages. A product
 * theme overrides branding only; rhythm, corner geometry, depth, timing and layout thresholds are
 * shared by all four brands. Switching the Brand control changes nothing here except the tint
 * inside a shadow — which is why four products can look like themselves and still feel like one
 * system.
 *
 * Every value is imported from `tokens/`, so these pages cannot drift from the scale they document.
 */

export function SpacingPage() {
  return (
    <Page
      title="Spacing"
      lead={
        <>
          One rhythm for every product. The scale is deliberately short — eleven steps, not a
          continuous range — because a layout that can pick any number is a layout nobody can keep
          consistent.
        </>
      }
    >
      <Section title="Scale">
        <div className="space-y-2">
          {Object.entries(spacing).map(([token, value]) => (
            <div key={token} className="flex items-center gap-4">
              <code className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{token}</code>
              <code className="w-20 shrink-0 font-mono text-xs">{value}</code>
              <span
                aria-hidden="true"
                className="h-4 rounded-sm bg-primary"
                style={{ width: value === '0' ? 1 : value }}
              />
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function RadiusPage() {
  return (
    <Page
      title="Radius"
      lead={
        <>
          Corner geometry. Components derive <code className="font-mono text-xs">sm</code>/
          <code className="font-mono text-xs">md</code>/
          <code className="font-mono text-xs">lg</code> from the application&rsquo;s{' '}
          <code className="font-mono text-xs">--radius</code>, so a product can set its overall
          softness in one place.
        </>
      }
    >
      <Section title="Scale">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(radius).map(([token, value]) => (
            <div key={token} className="space-y-2 text-center">
              <span
                aria-hidden="true"
                className="mx-auto block size-20 border-2 border-primary bg-accent"
                style={{ borderRadius: value }}
              />
              <code className="block font-mono text-xs">{token}</code>
              <code className="block font-mono text-[11px] text-muted-foreground">{value}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function ElevationPage() {
  return (
    <Page
      title="Elevation"
      lead={
        <>
          Depth is one geometry tinted by the active brand: each shadow is built from{' '}
          <code className="font-mono text-xs">--shadow-tint</code>, which the palette supplies. That
          is why a Work card&rsquo;s shadow reads plum and a School card&rsquo;s reads teal, without
          either shadow being defined twice. Switch the Brand control to see it.
        </>
      }
    >
      <Section title="Scale">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {Object.entries(elevation).map(([token, value]) => (
            <div key={token} className="space-y-2">
              <span
                aria-hidden="true"
                className="block h-20 rounded-xl bg-card"
                style={{ boxShadow: value }}
              />
              <code className="block font-mono text-xs">{token}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function MotionPage() {
  return (
    <Page
      title="Motion"
      lead={
        <>
          Four durations and three easings. Everything animated in the platform respects{' '}
          <code className="font-mono text-xs">prefers-reduced-motion</code> — an indefinitely moving
          interface is a genuine accessibility problem, not a stylistic preference.
        </>
      }
    >
      <Section title="Duration">
        <div className="space-y-2">
          {Object.entries(motion.duration).map(([token, value]) => (
            <div key={token} className="flex items-center gap-4">
              <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{token}</code>
              <code className="font-mono text-xs">{value}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Easing">
        <div className="space-y-2">
          {Object.entries(motion.easing).map(([token, value]) => (
            <div key={token} className="flex items-center gap-4">
              <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{token}</code>
              <code className="font-mono text-xs">{value}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function BreakpointsPage() {
  return (
    <Page
      title="Breakpoints"
      lead={
        <>
          The layout thresholds, mobile-first: a rule applies from its breakpoint upwards. Shared by
          every product, so a screen built in one behaves the same way in another.
        </>
      }
    >
      <Section title="Scale">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  Token
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  Min width
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  Prefix
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(breakpoints).map(([token, value]) => (
                <tr key={token} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{token}</td>
                  <td className="px-3 py-2 font-mono text-xs">{value}</td>
                  <td className="px-3 py-2">
                    <code className="font-mono text-xs text-muted-foreground">{token}:</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Page>
  );
}
