# Changelog

All notable changes to `@axa/platform`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[Semantic Versioning](./VERSIONING.md).

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
