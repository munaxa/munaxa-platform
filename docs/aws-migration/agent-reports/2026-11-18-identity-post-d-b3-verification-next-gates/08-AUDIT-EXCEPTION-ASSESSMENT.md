# 08. Review of the picomatch audit exception (PR #136)

**Status: VERIFIED. The exception is limited to the one advisory. One documentation inaccuracy
was corrected; the scope is unchanged.**

PR #136 was merged as `d4d1ff2` on 18 Nov at 08:49 UTC. It changed two things:

- the root `package.json` gained `"pnpm": {"auditConfig": {"ignoreGhsas": ["GHSA-fc5q-39xc-vjpf"]}}`;
- `docs/security-platform/AUDIT-EXCEPTIONS.md` records the reason, the approval (owner, 18 Nov) and the removal condition.

## 1. Checks (run locally on `main` `3453f13`)

`pnpm` 10.33.0, `pnpm install --frozen-lockfile --ignore-scripts`.

| Check | Result | Status |
| --- | --- | --- |
| Only one advisory is ignored | `ignoreGhsas` has exactly one entry, GHSA-fc5q-39xc-vjpf. There is no other `auditConfig` key, and no `ignoreCves` or `ignoreUnfixed` | VERIFIED |
| No other high or critical advisory is hidden | With the exception: `pnpm audit --audit-level high` exits **0**. It reports "2 moderate, 2 high (1 ignored)". The 2 high are both GHSA-fc5q-39xc-vjpf: two findings for two installed versions, `picomatch@2.3.2` and `@4.0.5` | VERIFIED |
| CI still fails on other high advisories | In a temporary copy with `ignoreGhsas: []`, the same command exits **1**, and the only high or critical advisory is GHSA-fc5q-39xc-vjpf. `ignoreGhsas` is an exact-ID list, so any other high or critical advisory still fails `pnpm audit --audit-level high` (ci.yml "Dependency audit"). The temporary change was reverted | VERIFIED |
| The remaining moderates | GHSA-3g3m-2fjr-6pw4 (`glob`) and GHSA-g3hv-75wg-m249 (`minimatch`), both via `@storybook/react-vite`. They are below the CI threshold and not part of the exception | Recorded |
| No patched release | `npm view picomatch versions`: the latest is **4.0.7**, which the advisory still covers (`<=4.0.7`) | VERIFIED 18 Nov |
| Owner approval and removal condition | Both are present in `AUDIT-EXCEPTIONS.md` | VERIFIED |

## 2. Is it confined to development tooling?

The **reach stated in `AUDIT-EXCEPTIONS.md` was incomplete**:

- **What it said.** The doc said "reached only through `@storybook/addon-docs > unplugin` and `@changesets/cli > … > micromatch`" and "neither ships in a published package".
- **What `pnpm why picomatch -r` shows.** Those two are only the shortest paths that `pnpm audit` prints. `picomatch` is also reached through Vite, Vitest, Jest's `expect` and `jest-util`, Tailwind's Vite plugin, and `typescript-eslint`.
- **The published package.** With `--prod`, one path stays: `@munaxa/config-eslint` (`tooling/config-eslint`, a **published** package) has `typescript-eslint` as a runtime dependency, which pulls in `tinyglobby > fdir > picomatch@4.0.5`.
- **Why it is still development tooling.**
  - `@munaxa/config-eslint` is an ESLint configuration.
  - Every consumer found lists it as a **devDependency**: munaxa-control, -docs, -school, -work, and -platform's own packages, checked in the local clones.
  - It runs only when lint runs, on globs written in the repositories.
  - No service image or runtime package (`@munaxa/auth`, `security` and so on) has `picomatch` in its production tree.

**Conclusion.** It stays confined to development and lint tooling, and the risk assessment of
#136 stands. The wording was corrected in `docs/security-platform/AUDIT-EXCEPTIONS.md` in this PR
(the table row only). The ignore list was not changed, and no dependency was upgraded or
overridden.

## 3. Recommendation: monitoring and removal

1. **Monitor.**
   - Each dependency or security PR, and at least weekly, should run `npm view picomatch version` and read the advisory page's "Patched versions".
   - CI already prints "(1 ignored)" on every run, which makes the exception visible.
   - The audit does not warn when an ignored advisory has become fixable, so this check is manual.
2. **Remove when a fix exists**, either as a fixed 4.x release or a 2.x backport. Order:
   1. update the lockfile (`pnpm update picomatch -r`); add a `pnpm.overrides` entry only if a parent pins an old range;
   2. delete the `ignoreGhsas` entry and the table row;
   3. run `pnpm audit --audit-level high` (it must exit 0 with "0 ignored"), and `pnpm lint`, `pnpm test`, `pnpm build` and Storybook, because picomatch drives Vite and Storybook globbing;
   4. open one PR, with the owner's yes.
3. **Time limit (recommended).** If no fix exists by 18 Dec 2026, re-review the exception with
   the owner rather than leave it open-ended.
4. **Do not** replace the exception with an override to an unreviewed fork, and do not broaden it.
