# Changelog

All notable changes to `@munaxa/platform`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[Semantic Versioning](./VERSIONING.md).

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
