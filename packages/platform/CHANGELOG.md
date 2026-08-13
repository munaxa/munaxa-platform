# Changelog

All notable changes to `@munaxa/platform`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[Semantic Versioning](./VERSIONING.md).

## [1.3.1] — 2026-08-13

Phase 8.7 extends keyboard verification from two hand-picked assertions to the whole discovered
matrix — 100 stories × 4 brands × 2 schemes — with each story's contract derived from the DOM it
renders rather than from its title. One product defect came out of it.

### Fixed

- **`DataGrid` answered keystrokes aimed at controls inside its cells.** The grid's handler sits on
  the `<table>`, so a keypress on a row's action button bubbles to it — and it responded: Enter
  activated the row while `preventDefault()` stopped the button's own menu from opening. The same
  action worked with a mouse, which is the definition of a keyboard-only defect. Space selected the
  row instead of pressing the button, and the arrows moved the grid instead of the caret in a cell's
  text field. Keys now belong to whatever holds focus; Escape stays the grid's, because that is how
  a person gets back out of a cell's control to the cell itself.

  Measured on the files browser: the row action menu opened on a click and not on Enter, in all four
  brands and both schemes.

## [1.3.0] — 2026-08-12

Product branding becomes part of the platform. School, Work and Docs had authored palettes but no
artwork, and each product repository had grown its own logo component pointing at its own copy of
the files — three implementations of one rule, none of which could be checked.

### Added

- **`@munaxa/platform/brand`** — the typed product-brand registry, `BrandProvider`, `ProductLogo`,
  `ProductSwitcher` and the `brandIcons` / `brandOpenGraphImage` / `brandManifest` metadata
  helpers. A product declares itself once and every logo below reads that: `ProductLogo` has no
  `src`, so no screen can render one product's mark inside another by accident.
- **Approved artwork for all three products** under `assets/{school,work,docs}/` — horizontal,
  stacked and wordmark lockups in both colour schemes, the symbol, the descriptor lockup, favicons,
  app icons and a share image. Provenance and the permitted transformations are recorded in
  [`assets/README.md`](./assets/README.md).
- **`scripts/sync-brand-assets.mjs`**, published with the package, so a product's `prebuild` copies
  the artwork it needs into its own `public/` rather than committing a snapshot that goes stale.
- **`scripts/import-brand-artwork.py`**, the pipeline that produced the assets. Offline tooling
  outside the Node build, checked in because the artwork is *generated*: it must be re-run when
  the approved exports change **and** when a canonical colour changes, or a product ships a mark
  and a `--primary` that are two different colours.
- **A corporate identity with artwork.** `corporateBrand` carries the M in the corporate navy plus
  a favicon and an app icon, which corporate surfaces did not have. Deliberately no lockup: every
  lockup in the approved artwork sets a product word beneath `munaxa.`, so a corporate one would
  have to be composed, and composing a lockup is redrawing the logo.

### Changed

- **The artwork is recoloured to the palettes, not the other way round.** The approved exports
  arrived in colours that no longer match what this package ships — School's teal read `#049FA2`
  against a canonical `#00CFC1`, and Docs' mark came in two different greens depending on which
  file you opened. A logo whose teal disagrees with the `--primary` beside it makes the product
  look broken, so the mark now takes the platform's value: coverage is recovered per pixel in
  linear light and the canonical colour is laid back down at the same coverage, leaving alpha,
  silhouette, spacing and aspect ratio untouched.

**No palette changed.** `#2B3A67`, `#00CFC1`, `#6E1E43` and `#6B8E62` are exactly what they were;
the colour authority runs one way, from the palette to the artwork.

## [1.2.0] — 2026-08-11

Phase 8.6 closes the 25 accessibility failures Phase 8.5's full-matrix coverage exposed. All three
failure families had one architectural cause: the palette generator modelled only **solid,
un-composed** surfaces, and the components compose them.

### Added

- `--success-foreground`, `--warning-foreground`, `--info-foreground`, completing the fill family
  beside `primary` and `destructive`. Before them a component wanting a label on `bg-warning` had no
  promised colour and `Gantt` borrowed `text-background` — white on amber, **2.14:1**.

### Fixed

- **`bestFg` could return a failing foreground.** It returned the better of white and ink, which is
  not the same as one that passes; Phase 8.5 found `#E53935` + white at 4.23:1 chosen that way. The
  fill-foreground helper now returns `null` rather than a failing colour, and the fill is darkened
  only as far as needed for one of the two to clear it.
- **A tint over another tint was not modelled.** `DataGrid` marks a selected row with
  `bg-primary/5` and a status `Badge` inside it paints `bg-<tone>/15` on top, so its label sits two
  translucent layers above the page. The one-layer model passed at 4.50:1 and shipped **4.48:1**.
  The generator now holds every `-strong` token against that composition too.
- **`-strong` was computed from the brand's raw input rather than the fill the palette ships.** Where
  a fill is darkened so a foreground can clear it, `Badge` tints the shipped value — leaving
  `--info-strong` at 4.48:1 on a badge in a selected row. Caught by the palette test, which covers
  compositions no story yet renders.
- **`Gantt` washed its own label.** A full-height `bg-background/30` progress overlay put two
  different backgrounds under one run of text, measuring **3.63:1** in dark against a `#607760` no
  token holds. The wash is now a bottom strip; it still shows progress and no longer sits behind
  anything that has to be read.

Measured after, in the browser: **768 of 768 combinations pass** — 96 stories × 4 brands × 2 schemes,
zero excluded. The palette suite grows from 41 assertions to **81**, now covering composed surfaces
and every fill/foreground pairing.

The status fills themselves are unchanged apart from `--info` (`#0284C7` → `#007CBF`), the minimum
needed for a foreground to clear it. An earlier attempt that required one foreground to clear both a
fill and its washed form drove every status colour to near-black (`--success` `#2E7D32` → `#004D00`);
that is a brand redesign rather than an accessibility fix, and the composition belongs to the
component.

## [1.1.0] — 2026-08-11

Phase 8.4 gives the platform a real-browser accessibility path and then uses it. Every defect below
was found by rendering a component in Storybook under Chromium — none was visible to the unit suite,
which runs under happy-dom with `color-contrast` necessarily disabled.

### Added

- `--destructive-strong`, completing the status family. `success`, `warning` and `info` each had an
  AA-safe text form; `destructive` did not, so components pairing danger text with a danger tint had
  to reuse the fill and measured below AA.
- `test/a11y/` — a Storybook-driven accessibility harness with `color-contrast` **enabled**, plus
  `pnpm test:a11y`. It proves it can fail before its silence means anything: a deliberately
  low-contrast element is injected into a rendered story and axe is required to report it.
- Story coverage for three states that no story reached, so the platform could not measure them:
  calendar week numbers, a `Field` with `optionalLabel`, and outside-month days.

### Fixed

- **The status `-strong` tokens repeated the Phase 8.3 defect.** That phase fixed `--primary-strong`
  to be chosen against the tint it ships on and left `success`, `warning` and `info` on the old
  white-only rule, because the product it measured renders only the default `Badge` tone. Rendering
  every tone here showed all three failing. The rule is now shared by the whole family.
- **`Command` group headings** used `text-muted-foreground/70` at 10px — the same construction
  `SidebarNav` used before 1.0.1. Measured 2.79:1 light and 4.04:1 dark. Phase 8.3 could only call
  this "likely" because no consuming product imports `Command`.
- **`Calendar` outside-month days** used a 40% fade and measured **1.71:1** light, 2.15:1 dark. They
  are selectable dates, so the inactive-control exemption does not apply. The worst ratio found in
  this sequence.
- **`Calendar` week numbers**, **`Autocomplete` option descriptions** and **`Field`'s optional
  label** each faded the muted token: 2.79:1, 2.68:1 and 2.79:1 light respectively.
- **`Alert` descriptions** re-muted `text-muted-foreground` on a tone tint, measuring 4.31:1 on the
  danger tone. The box already sets `text-foreground`; the title stays distinct by weight.
- **Danger text across `Badge`, `Tag`, `ErrorState`, `StatCard`, the menus and the form/date error
  messages** now uses `--destructive-strong` rather than the raw fill.

Measured after, in the browser: Command headings 4.97:1 / 6.89:1; calendar week numbers and
outside-month days 4.97:1 / 7.44:1; autocomplete descriptions 4.60:1 / 5.99:1; the optional label
4.97:1 / 7.44:1; `Badge` default 5.93:1 / 5.65:1 and danger 4.67:1 / 5.74:1. Zero `color-contrast`
violations across 12 stories × 4 brands × 2 schemes.

`SidebarNav`'s Phase 8.2 correction was re-verified rather than assumed: 4.97:1 light, 6.89:1 dark.

## [1.0.2] — 2026-08-11

### Fixed

- `--primary-strong` was chosen against the page and shipped on a brand tint. The palette generator
  picked the first ramp step clearing 4.5:1 against white, but nothing pairs that token with white:
  `Badge` is `bg-primary/15 text-primary-strong`, `Avatar` and `Tag` are `bg-primary/10`. A tint of
  the brand over the page is darker than the page, so a value that only just clears white cannot
  clear the surface it actually ships on. Measured in a consuming product: a badge at **4.31:1** and
  an avatar at **4.16:1**, both under the 4.5:1 WCAG AA asks of text that size, while the token
  measured a comfortable 5.07:1 against white.

  The rule in `scripts/generate-palettes.mjs` now holds each candidate against the surfaces the
  design system pairs it with — a 15% tint over the page and a 10% tint over `--muted` — in both
  schemes, and the palettes are regenerated from it. Four values move, one per brand:

  | Theme  | Scheme | From      | To        |
  | ------ | ------ | --------- | --------- |
  | Docs   | light  | `#56774d` | `#43613c` |
  | School | light  | `#007c71` | `#005f56` |
  | Group  | dark   | `#7e93c9` | `#9babd5` |
  | Work   | dark   | `#d27499` | `#de95b0` |

  Every value remains a step on the brand's own generated ramp, so the scales stay perceptually
  even and a regeneration reproduces them exactly. No component changed, and no new token was added.

### Added

- `themes/palette.test.ts`, asserting the property on the generated output rather than snapshotting
  hex values — a snapshot would fail on every legitimate brand change and pass on this defect.

## [1.0.1] — 2026-08-11

### Fixed

- `SidebarNav` painted its navigation group titles with a fade of the muted token
  (`text-muted-foreground/70`). At the 10px the heading already uses, that measured 2.79:1 against
  the sidebar in the light theme and 4.19:1 in the dark one — both under the 4.5:1 WCAG AA asks of
  text this size. The titles now use the muted token at full strength, the same one the rail's
  resting items already use, measuring 4.97:1 and 6.89:1 on those surfaces. Nothing else about the
  heading changes: font, size, tracking, case, padding and the collapsed rule are untouched.

## [1.0.0] — 2026-07-30

First stable release. The public API described in [`VERSIONING.md`](./VERSIONING.md) is now under
the semantic-versioning contract.

This release marks stability; it is behaviourally identical to the final `0.x` build. The changes
below are release engineering, not new surface — no components were added and no APIs were
redesigned.

### Added

- `sideEffects: ["**/*.css"]` in `package.json`, so bundlers tree-shake unused components while
  still preserving the theme CSS.
- Storybook coverage for the last uncovered public components — `Card`, `Drawer`, `EmptyState`,
  `ErrorState`, `Pagination`, `Spinner`, `Tabs`, `Timeline`, the toast system and `Tooltip` — so
  every public component now has a story. All stories inherit the global dark-mode, RTL and
  accessibility controls.
- `VERSIONING.md`, `MIGRATION.md` and this changelog.

### Removed

- `class-variance-authority` from dependencies. It was declared but never imported; `Button` and
  the other variant-bearing components use a plain typed record, not `cva`.

### Baseline

The `1.0.0` component, token, theme and API surface is the reference point for all future migration
entries. Everything shipped in Phases 1–10 — the token system, the four themes, the 62-role theme
contract, the layout primitives, the application shell, the date engine, `DataGrid`, the chart
wrappers, and the enterprise workspace components — is included and stable.
