# Dependency audit exceptions

CI runs `pnpm audit --audit-level high` (`.github/workflows/ci.yml`, "Dependency audit"). An
advisory listed here is ignored through `pnpm.auditConfig.ignoreGhsas` in the root `package.json`.
Each exception is temporary, approved by the owner, and must be removed as soon as a fixed version
can be installed.

| Advisory | Package | Why it is accepted for now | Approved | Remove when |
| --- | --- | --- | --- | --- |
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (high, ReDoS through single-branch repeated extglobs) | `picomatch` <=4.0.7 | No patched release exists (advisory: patched versions `<0.0.0`). Reached only through development and lint tooling. The two paths `pnpm audit` prints are `@storybook/addon-docs > unplugin > picomatch` and `@changesets/cli > @changesets/config > micromatch > picomatch`. `pnpm why picomatch -r` also shows Vite, Vitest, Jest (`expect`, `jest-util`), `@tailwindcss/vite` and `typescript-eslint`. One path is a runtime dependency of a published package: `@munaxa/config-eslint > typescript-eslint > … > tinyglobby > fdir > picomatch`. That package is an ESLint configuration, and every consumer lists it as a devDependency. No service image or runtime package has `picomatch` in its production tree. All of these match only repository-controlled glob patterns. *(Reach corrected 18 Nov 2026, report 2026-11-18-identity-post-d-b3-verification-next-gates file 08; the exception itself is unchanged.)* | Owner, 18 Nov 2026 | A patched `picomatch` is published: update the lockfile (or add a `pnpm.overrides` entry), delete the `ignoreGhsas` entry and this row, and check that `pnpm audit --audit-level high` passes. |
