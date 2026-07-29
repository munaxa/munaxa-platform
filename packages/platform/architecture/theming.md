# Theming

## The three layers

```
tokens/      STRUCTURE   spacing · radius · elevation · motion · borders · z-index · breakpoints
             Identical in every product. Never branches by theme or colour scheme.

themes/base/ CONTRACT    Declares WHICH semantic roles exist and binds them to Tailwind.
             Product-agnostic. Contains no colour value and no product name.

themes/<p>/  PALETTE     Answers the contract for one product, in light and dark.
             The only place a colour is written down.
```

The separation is the whole design. A component says `bg-primary`; it never learns which
product it is running in, and no component anywhere contains a per-product branch.

## The contract

`themes/base/base.css` declares the semantic roles inside a Tailwind v4 `@theme inline` block:

```css
@theme inline {
  --color-primary: var(--primary);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  /* … */
}
```

The left-hand side is the Tailwind namespace (which generates `bg-primary`, `text-primary`,
`border-primary`). The right-hand side is the semantic role a palette must supply.

**The role set is the contract.** It is not written down twice: CI derives it by reading the
`var(--…)` references out of that block. Add a role to `base.css` and every palette immediately
fails validation until it supplies one — which is the intended pressure.

Today the contract is **31 roles**: surfaces (`background`, `card`, `popover`), text
(`foreground`, `muted-foreground`, and the `-foreground` pair of every surface), interaction
(`primary`, `secondary`, `accent`, `ring`, `input`, `border`), status (`success`, `warning`,
`info`, `destructive`), the two neutral accents (`accent-warm`, `accent-cool`), the
five-step data-visualisation ramp (`chart-1` … `chart-5`), and the two brand tints
(`shadow-tint`, `glow-tint`).

### Role names describe roles

Never appearance, never brand. `--destructive`, not `--red`. `--accent-warm`, not `--coral`.
A name that describes a colour is a name that becomes a lie the first time the brand moves —
which is exactly what happened to `--coral` / `--aqua`, and why they were renamed.

Four variables are referenced by `base.css` but supplied by the **application**, not the theme:
`--radius`, `--font-display`, `--font-body`, `--font-mono`. They vary per app (a marketing site
and an admin console legitimately load different faces), not per brand, so a palette declaring
one is a validation failure.

## Palettes

A palette is a **complete** answer, not a diff:

```css
:root {
  --shadow-tint: 30 11 77;   /* brand tints for the shared elevation geometry (R G B) */
  --glow-tint: 0 117 149;
  --primary: oklch(0.52 0.105 223.128);
  /* … every one of the 31 roles … */
}
.dark {
  --primary: oklch(0.45 0.085 224.283);
  /* … only the roles that actually change … */
}
```

- **`:root` must supply every role.** A missing role is a control that renders unstyled in
  exactly one product — the bug class this file exists to make impossible.
- **`.dark` may override any subset.** A role it omits is inherited through the cascade, which
  is a palette saying "this value is the same in both schemes" without duplicating it.
- **Themes do not inherit from each other.** Partial-override theming is how a product ends up
  with one unstyled control six months after someone adds a role.
- **A palette may not invent a role**, and may not redefine a structural scale. Both are
  rejected by `scripts/validate-contract.mjs`.

## Elevation is shared, tint is not

Shadow *geometry* is a structural token — identical everywhere:

```css
--shadow-card: 0 24px 50px -30px rgb(var(--shadow-tint) / 0.25), …;
```

The *colour* comes from the palette's `--shadow-tint` / `--glow-tint`. One ramp, native-looking
in every brand, zero duplication. This is the pattern to copy whenever something is "mostly
shared, slightly branded": parameterise the brand part as a variable rather than forking the
whole value.

## Tokens have two mirrors

Every structural scale exists twice on purpose — typed (`tokens/<scale>/index.ts`) and as CSS
custom properties (`tokens/css/primitives.css`, prefixed `--axa-`). The typed side serves
TypeScript and design tooling; the CSS side serves consumers with no build step (print
stylesheets, HTML email, plain CSS).

Two mirrors means two chances to drift, so `scripts/validate-tokens.mjs` asserts they are
value-identical in both directions on every CI run. **Change both together, or change neither.**
A typed key with no CSS counterpart needs an entry in that script's `TS_ONLY` allowlist with a
reason — and the script checks the allowlist has not gone stale.

## Raw hexes

Exactly one place: `themes/<product>/brand.ts`, for surfaces that genuinely cannot read CSS
custom properties — HTML email, OG images, favicons, PDF output.

```ts
import { themes } from '@axa/platform/themes';
themes.school.brand.color.DEFAULT; // '#00CFC1'
themes.school.brand.neutral.ink; //   '#101828'
```

Anything rendered in a browser reads the contract. If you are reaching for `brand.ts` inside a
component, the component is wrong.

## Adding a product theme

```
themes/newproduct/
├── palette.css   copy an existing palette, replace every value
├── brand.ts      brand hexes, gradient stops, static neutral scale
└── index.css     @import '../base/base.css';  @import './palette.css';
```

Then one entry in `themes/index.ts` and one line in `package.json` `exports`. **No component
changes, ever.** If adding a theme requires touching a component, the contract has a hole —
fix the contract, not the component.

## Activating a theme in an application

```css
@import 'tailwindcss';
@import '@axa/platform/css/themes/school';

/* Tailwind v4 must scan the platform's sources to emit the classes its components use. */
@source '../../../../../platform/ui';

@layer base {
  :root {
    --radius: 0.5rem; /* the app's own radius base */
    /* --font-display / --font-body / --font-mono come from the app's font loader */
  }
}
```

One theme per application, chosen at build time. Light/dark switching *within* a theme is the
`.dark` class on `<html>`, driven by `useTheme` from `@axa/platform`.

## Verifying a theme

Render `<TokenReference />` on an internal page. It reads the live custom properties off the
document with `getComputedStyle`, so it cannot drift: every swatch is the value the app is
actually serving, in the scheme it is actually in.

## The brand exists twice

`--primary` is a **fill**; `--primary-strong` is the same brand at **text** weight.

A light, high-chroma brand is fine behind text and unusable as text: School's `#00CFC1` carries
dark text at 9.0:1, but *is* 1.96:1 against white. `--primary-strong` is the nearest step on the
brand ramp that clears 4.5:1 on the page background, computed per theme and per colour scheme by
`scripts/generate-palettes.mjs`. Use `bg-primary` for anything the eye reads *over*, and
`text-primary-strong` for anything the eye reads *directly*.

## The neutral ramp is shared, not themed

`--neutral-50 … --neutral-950` live in `themes/base/neutrals.css`, once, for every theme. Greyscale
is structure: every product renders the same surfaces, borders and text greys, and only the brand
hue changes between them. A palette that declares a `--neutral-*` role fails
`validate-contract.mjs` — that rule is what makes "a theme overrides branding only" a fact rather
than an aspiration.

## Palettes are generated

Hand-authoring eleven ramp steps by eye produces ramps that drift and foregrounds that fail
contrast. `scripts/generate-palettes.mjs` anchors the ramp exactly on the brand hex, spaces the
remaining steps evenly in OKLCH, and picks `--primary-foreground` and `--primary-strong` by
measured WCAG contrast. Re-run it rather than editing a step by hand.
