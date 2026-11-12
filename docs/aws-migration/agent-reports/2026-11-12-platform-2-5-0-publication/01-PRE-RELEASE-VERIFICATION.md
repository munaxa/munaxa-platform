# 01. Pre-release verification (before any dispatch)

All of these checks are **[V]**, read from munaxa-platform `main` at `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba`, unless tagged otherwise.

| Check | Result |
| --- | --- |
| #111 on main | `be7f12beb8a6e2b20b1bac806d87e6a599bdcf12` |
| #112 on main | `2bf78accdec843c22467f49a41627b58c7f64713` |
| #114 on main | `c40a6b165e9b0679bc2e544cf8f96576b6d3f13c` |
| #115 on main | `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba` (the head) |
| Release files unchanged since #111 | `git diff be7f12b ee9015f -- .github/workflows/release.yml scripts/release-packages.mjs scripts/verify-release.mjs .changeset/config.json package.json` is empty. `git show be7f12b:.github/workflows/release.yml` is byte-identical to main. |
| Version PR #112 | changes exactly 13 `package.json` versions (2.4.1 to 2.5.0) and 13 changelogs, and consumes 2 changesets. No package file changed after #112: `git diff 2bf78ac ee9015f -- packages tooling pnpm-lock.yaml` is empty. |
| `node scripts/release-packages.mjs --versions` | types, interfaces, crypto, config, cache, logging, audit, rbac, session, security, notifications, auth, conformance, each `@2.5.0` |
| `@munaxa/licensing` | `0.2.0`, and not in the list |
| Changelogs | each of the 13 begins `## 2.5.0`; licensing begins `## [0.2.0]` |
| Lifecycle hooks | none of the 13 has a `publish`, `pack` or `version` script; the root has none either |
| Trigger | `release.yml` runs on `workflow_dispatch` only |
| Dry-run job | `if: inputs.dry_run`, `permissions: contents: read`, runs `npm pack --dry-run` behind the "exactly 13 filters" regex |
| Publish job | `if: !inputs.dry_run`, `permissions: contents: read, packages: write`. It has a refusal step for any event or ref other than a main dispatch, a repeated guard on the Publish step, the 13-filter regex, and `--access restricted` |
| Other triggers | no workflow in any of the 7 local repositories listens for `registry_package`, `workflow_run` or `repository_dispatch`. Identity's ECR image workflow runs only on `image/**` tags, so publishing and merging cannot build an image. |
| CI on main `ee9015f` | Lint/Typecheck/Test/Build, façades and accessibility checks all succeeded |

**[L]** Local cross-check at `ee9015f`:
- `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm release:check` ran with the result "all checks passed".
- The 13 packages were packed with the release script's own filters. Their **content digests equal** the reviewed candidate (`2026-11-12-phase-c-d-preparation/supporting/platform-2.5.0-candidate-CONTENT-DIGESTS.txt`) 13/13.
- `@munaxa/security` `test/redis-server.test.ts` passed 4/4 against a real local Redis. The release workflow skips it because it has no Redis service.

No discrepancy was found, so no fix PR was needed.
