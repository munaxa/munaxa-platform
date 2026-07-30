# Migration guide

How to move a product across a **major** version of `@axa/platform`. Each major that ships a
breaking change gets a section here, describing every break and the exact edit that resolves it.
The [versioning policy](./VERSIONING.md) defines what counts as breaking.

## How to read a migration entry

Every entry lists, per change:

- **What changed** and why it could not be additive.
- **Before → after** — the concrete call-site edit.
- **Codemod**, where a mechanical rewrite is possible.

Work top-down: apply the entries in order, run `pnpm typecheck` after each, and the type errors will
point you at the remaining call sites. The platform's own strictness (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`) means a break almost always surfaces as a compile error rather than a
runtime surprise.

## Upgrading within 1.x

Nothing to do. Every `1.x` release is backward compatible by policy — new minors add components,
props, tokens and themes without changing what exists, and patches only fix. Upgrade freely and read
[`CHANGELOG.md`](./CHANGELOG.md) for what you gained.

If a `1.x` upgrade breaks a correct call site, that is a **bug in the release**, not an intended
migration — report it, and it will be fixed in a patch.

## 0.x → 1.0.0

`1.0.0` is the first stable release and introduces **no** breaking change over the final `0.x`
build. A product already on `0.x` via the workspace protocol needs no code changes; the version
number simply now carries the stability guarantee described in [`VERSIONING.md`](./VERSIONING.md).

The one packaging change in `1.0.0` is internal and invisible to call sites:

- `sideEffects` is now declared (`["**/*.css"]`), so bundlers tree-shake unused components. If your
  app somehow depended on a component's module running for its side effect — it never should — that
  is the only behaviour that could change. None exists in this package.

## Future majors

No `2.0.0` is planned. Per the engagement's closing direction, the platform now evolves only when a
real product requirement justifies it. When a breaking change does become necessary, it will:

1. Be preceded by a `@deprecated` marker in a `1.x` minor, naming the replacement.
2. Ship in `2.0.0` with a full entry in this file.

Until then, this section is intentionally empty.
