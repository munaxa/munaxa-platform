# 01. Cross-repository security review and remediation

Scope: the `main` branches of munaxa-platform, -identity, -control, -docs, -work and -school, read
on 21 Nov 2026 from 11:35 UTC (platform `e7b0c0b`, identity `7615589`, control `7b607e0`, docs
`f1fca8f`, work `a93c642`, school `0011680`). Repository work only.

## 1. Findings and what was done

| # | Check | Result before | Action | Status |
| --- | --- | --- | --- | --- |
| S-1 | Third-party GitHub Actions pinned to a commit | platform: all pinned. `uses:` lines on moving tags (`@v3`, `@v4`, `@v6`): identity 3, control 7, docs 40, work 17, school 32 | Each pinned to the commit its tag resolved to on 21 Nov (`git ls-remote`), release in a comment. No version change. Same SHAs platform already uses where it uses the same action | IMPLEMENTED; merged in identity, work, school; open in control, docs (§2) |
| S-2 | `actions/checkout` persisting the job token in `.git/config` | checkouts without `persist-credentials: false`: identity 2, control 2, docs 12, work 5, school 8 | `persist-credentials: false` on every checkout. No workflow pushes; the later `git fetch`/`merge-base` steps read public repositories | IMPLEMENTED; same split |
| S-3 | Default `GITHUB_TOKEN` permissions | `ci.yml` in identity, docs, work and school had no top-level `permissions` (jobs without their own block got the repository default) | Top-level `permissions: contents: read`; jobs that need `packages: read` or `id-token: write` already declare it (checked job by job; the identity `verify` job reads packages with `PLATFORM_PACKAGES_TOKEN`, not `GITHUB_TOKEN`) | IMPLEMENTED; same split |
| S-4 | `pull_request_target` | none in any repository | none | VERIFIED |
| S-5 | Long-lived package token | `PLATFORM_PACKAGES_TOKEN` still used by identity, control, docs, work, school CI and publish workflows | Unchanged. Replacing it is drafts identity#19, control#9, work#32, which need the owner's GitHub Packages "Read" grant per package (OWNER ACTION REQUIRED, file 07) | BLOCKED (owner) |
| S-6 | Container base images pinned by digest | every `FROM` in all eight Dockerfiles is a digest, `scratch` or a stage | none | VERIFIED |
| S-7 | Non-root runtime | every final stage has a non-root `USER` (identity `identity`/`migrate`, control/docs `node`, work `work`/`admin`, school `nestjs`/`nextjs`/`migrate`, docs antivirus `101:102`) | none | VERIFIED |
| S-8 | Health checks | every product image has a `HEALTHCHECK`; the Docs antivirus image has none (ECS checks it over TCP) | none | VERIFIED |
| S-9 | Package managers in runtime images | npm, npx, corepack, yarn, pnpm removed in every runtime stage (20 Nov work); today's scans show no npm-tooling finding | none | VERIFIED (CI scans) |
| S-10 | Excess runtime package | Control installs the `openssl` CLI in its runtime image (Grype lists it with the D-SSL CVEs) | RECOMMENDED: drop it in the D-SSL pin PR (file 02 §2) | RECOMMENDED |
| S-11 | Image vulnerabilities | only D-SSL (5 OpenSSL CVEs × libssl3/libcrypto3) in every product image; nothing else at HIGH+ | file 02 | BLOCKED (upstream) |
| S-12 | Dependency audit in CI | `pnpm audit` runs in every product CI (identity, control, docs, work: 1 step; school 2); the `Lint · Typecheck · Test · Build` jobs that contain it are green today | none | VERIFIED (CI) |
| S-13 | Committed secrets | pattern search (AWS keys, PEM private keys, GitHub, Slack, Stripe, Resend prefixes) over all six `main` trees: only documented fakes and test fixtures (Docs SMTP test relay key in `__fixtures__` with a README, `AKIAOFFLINEOFFLINE00` offline example, `re_FAKEVALUE…` test value, log-filter test patterns) | none | VERIFIED |
| S-14 | Testing operator email | not in any file written today; the report names the operator only by its subject id, as earlier reports did | none | VERIFIED |
| S-15 | Stage E finding F-1 | C-8G `status` failed `secret-tags` on CloudFormation's `aws:` tags | fixed in platform#152, test added | IMPLEMENTED, TESTED |
| S-16 | School push CI and ruleset | School has no branch ruleset and no CI on `main` pushes (O-8) | none (ruleset changes are not authorised) | OWNER ACTION REQUIRED |

## 2. PRs

| PR | Head | Required checks | Result |
| --- | --- | --- | --- |
| [identity#23](https://github.com/munaxa/munaxa-identity/pull/23) | `1553deb` | `verify` success (run 44900958149) | **MERGED** squash `b08e887` |
| [work#34](https://github.com/munaxa/munaxa-work/pull/34) | `3a7bfed` | 4 of 4 success (run 44900060343) | **MERGED** squash `61c115b` |
| [school#27](https://github.com/munaxa/munaxa-school/pull/27) | `f8283b9` | no ruleset; JS/TS and security jobs success (run 44900062129) | **MERGED** squash `1e5977e` |
| [control#12](https://github.com/munaxa/munaxa-control/pull/12) | `09358d6` | `Format · Lint · Typecheck · Test · Build` success; **`Build the images` failure = D-SSL only** (run 44900055997) | OPEN, BLOCKED by D-SSL |
| [docs#181](https://github.com/munaxa/munaxa-docs/pull/181) | `c1adc48` | all required jobs success except **`Container images` failure = D-SSL only** (run 44900058536) | OPEN, BLOCKED by D-SSL |
| [identity#22](https://github.com/munaxa/munaxa-identity/pull/22) | probe | n/a | CLOSED unmerged (temporary probe) |

In identity, work and school the image job is **not** a required check, and its only failure is
D-SSL, which fails `main` the same way. Those PRs met every required check and the standing rule,
so they were merged. In control and docs the image job **is** required, so the PRs wait: the rule
says no bypass. They need no change; they go green with the D-SSL pin bump, or can be folded into
it.

No merge triggered a deployment: School's `deploy.yml`, `deploy-cloudflare.yml` and
`seed-environment.yml` are `workflow_dispatch` only (checked), and no run started on `1e5977e`.
Identity and Work `main` pushes started only their CI.

## 3. Previously merged security fixes, rechecked on `main`

- OpenSSL 3.5.9-r1 and zlib 1.4-r0 exact pins, tooling removal, verify and Grype scan in CI and
  before every push (identity#21, control#11, docs#180, work#33, school#26): present on every
  `main` [VERIFIED code]. The scan runs and fails closed today (D-SSL), which is the intended
  behaviour.
- `effect` override (GHSA-7589-6fvf-x4pw): present in all five product repositories, `pnpm audit`
  green [VERIFIED CI].
- Withdrawn digests (platform `infra/aws/stack/withdrawn-images.tf`): the offline Control harness
  was refused for using `a24c568`, which proves the guard works (file 04 §1).

## 4. Deliberately not changed

Branch protection and rulesets; package tokens and their grants; scanners and their thresholds;
any exception file; any workflow trigger; any version of an action (only pinned in place).
