# Versioning policy

`@axa/platform` follows [Semantic Versioning 2.0.0](https://semver.org/). This document says
exactly what a version number promises, so a product can upgrade on the strength of the number
alone.

## What a version means

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — a breaking change to the public API. Something a product imports is removed, renamed,
  or changes shape or behaviour in a way that can break a correct call site. Never shipped without
  a migration entry (see [`MIGRATION.md`](./MIGRATION.md)).
- **MINOR** — a backward-compatible addition. A new component, a new optional prop, a new theme, a
  new token. Existing code keeps working untouched.
- **PATCH** — a backward-compatible fix. A bug, an accessibility correction, a visual defect, a
  performance improvement, with no API change.

`1.0.0` is the first stable release. Everything documented as public below is now under this
contract.

## What is public — and therefore covered

The contract applies to the **documented public surface only**:

| Covered | Entry point |
| --- | --- |
| Components, hooks, the date engine, layout primitives, the shell, patterns | `@axa/platform` |
| Typed design tokens | `@axa/platform/tokens` |
| The type scale | `@axa/platform/typography` |
| The typed theme registry | `@axa/platform/themes` |
| The icon set | `@axa/platform/icons` |
| Narrower JS entry points | `@axa/platform/{hooks,patterns,layouts,shell,date,charts}` |
| The **semantic** CSS custom properties (`--background`, `--primary`, `--foreground`, …) | `@axa/platform/css/*` |
| The 62-role theme contract, machine-checked in CI | `scripts/validate-contract.mjs` |

The **semantic** custom properties are the CSS contract. A product may build on `--primary`,
`--muted-foreground`, `--destructive` and their siblings; the theme-contract test guarantees every
theme defines all 62 roles in both colour schemes, so those names do not disappear under a minor.

## What is **not** public — and may change at any time

- Any deep import path other than the entry points above. `@axa/platform/ui/components/...` is an
  internal path; importing it is unsupported and may break in a patch.
- The **primitive** token values (the raw `--primitive-*` scale). Products consume semantic roles,
  not primitives; the primitive palette is an implementation detail of the themes.
- Internal helpers not re-exported from an entry point (`isRtlElement`, `forwardStep`, the parser
  internals, and anything similar).
- The DOM structure and class names a component renders. Style through the documented props and the
  semantic tokens, never by selecting the internal markup.
- Storybook, tests, tooling, and the `./source` entry point, which exists only for in-repo
  workspace builds.

If it is not in the table above, do not build on it.

## Deprecation

Public API is removed only across a major, and only after a deprecation period:

1. The API is marked `@deprecated` in a **minor**, with the replacement named in the JSDoc. It keeps
   working.
2. It is removed in the next **major**, with a [`MIGRATION.md`](./MIGRATION.md) entry describing the
   exact edit.

A product therefore always has at least one minor line of runway on a released version before an
API it uses can be removed.

## Peer dependencies

React and React-DOM are peer dependencies, pinned to `^19`. A React major is a platform major:
bumping the supported React range is a breaking change for consumers and ships that way.

## Pre-1.0 history

Versions `0.x` were the pre-stable build-out (Phases 1–10). They are not covered by this policy and
were never published to a registry. `1.0.0` is the baseline; migration entries begin at the first
`2.0.0`.
