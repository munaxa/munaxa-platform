# Dependency audit exceptions

CI runs `pnpm audit --audit-level high` (`.github/workflows/ci.yml`, "Dependency audit"). An
advisory listed here is ignored through `pnpm.auditConfig.ignoreGhsas` in the root `package.json`.
Each exception is temporary, approved by the owner, and must be removed as soon as a fixed version
can be installed.

| Advisory | Package | Why it is accepted for now | Approved | Remove when |
| --- | --- | --- | --- | --- |
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (high, ReDoS through single-branch repeated extglobs) | `picomatch` <=4.0.7 | No patched release exists (advisory: patched versions `<0.0.0`). Reached only through development tooling: `@storybook/addon-docs > unplugin > picomatch` and `@changesets/cli > @changesets/config > micromatch > picomatch`. Neither ships in a published package or a service image, and both match only repository-controlled glob patterns. | Owner, 18 Nov 2026 | A patched `picomatch` is published: update the lockfile (or add a `pnpm.overrides` entry), delete the `ignoreGhsas` entry and this row, and check that `pnpm audit --audit-level high` passes. |
