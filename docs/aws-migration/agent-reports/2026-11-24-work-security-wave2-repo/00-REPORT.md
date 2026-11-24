# Munaxa Work: CODEOWNERS and Wave 2 repository work (24 Nov 2026)

Owner request of 24 Nov 2026 06:38 UTC: review work#55 (CODEOWNERS) and its CI, then complete
the safe, repository-only Wave 2 tasks. Merge only when the required checks and reviews pass. Make
no AWS change, Terraform apply, image publication, secret operation, GitHub setting change or
deployment. Do not weaken the Grype gate, and do not extend the D-SSL exception to Work.

Labels: **[V]** verified, **[O]** owner action, **[B]** blocked, **[U]** not verified.

## 1. Outcome

- **[V] Done in the repositories:**
  - CODEOWNERS is merged and extended. It is now checked in CI, so a file that is renamed or moved
    cannot silently fall out of code-owner review.
  - **New finding NF-5 (High for Testing), fixed:** behind the load balancer, every signed-out
    visit to the Work admin was redirected to `https://localhost:3001/…` (section 5).
  - Wave 2 **R-4 (NF-3)** is fixed: the rate-limiter race that turned platform `main` CI red.
  - Wave 2 **R-2** is done: Work's admin production build is now checked in CI.
- **[B] Work is still NOT READY for AWS Testing.**
  - MW-001: Alpine has not published OpenSSL 3.5.10-r0. Every Work image fails the permanent
    Grype gate on 5 HIGH findings.
  - The gate and the D-SSL exception are unchanged. Work is not added to the exception, and the
    exception still expires at 2026-12-01T00:00:00Z.
- Nothing was applied, published or deployed. No secret and no GitHub setting was touched. AWS was
  not called; a live Control session runs in another thread today.

## 2. Pull requests

| PR | What | Required checks | Merged |
| -- | ---- | --------------- | ------ |
| [munaxa-work#55](https://github.com/munaxa/munaxa-work/pull/55) | CODEOWNERS for the Wave 1 gate files (owner's PR) | All 4 green (run 45335672401) | `b86fb23` |
| [munaxa-work#56](https://github.com/munaxa/munaxa-work/pull/56) | CODEOWNERS extended and validated in CI | All green (run 45342239662) | `d9037cf` |
| [munaxa-platform#172](https://github.com/munaxa/munaxa-platform/pull/172) | NF-3 rate-limit race fix (R-4) | All green, incl. Redis service tests | `5e58eb6` |
| [munaxa-work#57](https://github.com/munaxa/munaxa-work/pull/57) | Admin built-app check in CI (R-2) and NF-5 fix | All green (run 45346758173) | `0134407` |

On every Work PR, **Images (api, migrate, admin)** fails on the same 5 HIGH OpenSSL findings that
`main` shows: CVE-2026-124709, -107494, -121482, -84786 and -107493, all on `libssl3` and
`libcrypto3` 3.5.9-r1. That job is not a required check, the PRs do not touch images, and each PR
has one comment saying so. No review was required by the branch rules, and none was bypassed.

## 3. work#55: review findings

- **[V] Correct for what was agreed.** Every path exists on `main` and matches the Wave 1 owner
  action A-2 list (`docs/launch-readiness/2026-11-23-wave1/03-OWNER-ACTIONS.md`):
  - workflows
  - `.github/scripts`
  - the three MW-008 gates and the drift baseline
  - the MW-005 bootstrap scripts
- **Gaps found, all fixed in work#56:**
  - The file did not own itself, so a single PR could remove an owner and change a gate file at
    the same time.
  - Patterns were not anchored, and `/.github/workflows/*` does not cover nested files.
  - These were not covered:
    - both Dockerfiles, which hold the base image digest and the OpenSSL/zlib pins (MW-001)
    - `.npmrc` (registry configuration)
    - `deploy/` (runtime grants, RDS CA)
    - the MW-003 Testing-data target guard
    - `prisma/migrations/migration_lock.toml`
    - the tenant isolation, tenant resolution and entitlement guards
  - Nothing checked the file. GitHub silently ignores a pattern that matches nothing.
- **work#56 adds `scripts/check-codeowners.mjs` and 11 `node:test` cases.** The check fails when:
  - a rule is not anchored
  - a rule names no owner, or an owner is malformed
  - a pattern matches no tracked file
  - one of 19 required gate files has no owner under GitHub's last-match rule
  It runs inside the existing tooling-test step, so no workflow change was needed.
- **Caveat, [O]:** CODEOWNERS only takes effect once **"Require review from Code Owners"** is
  turned on for `main`, which is a setting this work may not change.
  - Every Munaxa PR is opened under the owner's own account, `tam2om`, and GitHub does not let an
    author approve their own PR.
  - So turning the setting on means each PR that touches an owned file needs a second account,
    or an owner bypass, to merge.
  - That is the owner's decision. Options: a second reviewer account, a ruleset bypass for the
    owner, or leaving the setting off and relying on CI plus this validator.

## 4. R-4 / NF-3: rate-limit race (platform#172)

- **Symptom:** platform `main` CI was red at `a57c54f` (run 45280523530). The Redis concurrency
  test admitted 9 requests out of a limit of 10.
- **Root cause:**
  - A request counted within the limit (say the 5th) could read the adaptive block that a later,
    over-the-limit request (the 11th) had just written, and was then refused.
  - The error was fail-closed: fewer requests admitted, never more.
- **Fix:**
  - The block is now stored as `{ until, windowStart, current }`, where `current` is the store's
    atomic count for that window.
  - The block does not refuse a request that is within the limit and was counted earlier in the
    same window. Everything counted after the violation is still refused, in any window.
  - Old blocks stored as a bare number are still read and apply to every request.
  - A malformed block is still a store failure, handled by the rule's `onStoreFailure` policy.
- **Evidence [V]:**
  - A new deterministic test forces the worst interleaving. It admits **0 of 10** before the fix,
    and **10 of 10** (with the 11th refused) after.
  - Package tests: 142 passed.
  - The Redis tests pass against a local `redis-server` on 10 of 10 repeats, and in CI.
  - tsc, eslint and prettier are clean.
- **[O]** A patch changeset is added; nothing is published. Identity runs `@munaxa/security`
  2.5.0. The over-refusal is fail-closed and only shows under concurrent bursts at the limit
  boundary, so a 2.5.1 release can wait for the next planned platform release.

## 5. R-2: admin built-app check (work#57)

- **Why it was needed:**
  - MW-007's one High defect was a relative `Location` that Next's middleware adapter refused, so
    every signed-out visit answered 500.
  - That defect only shows up in the production build. CI tested the middleware outside Next, and
    the defect was caught by hand.
- **What `tooling/smoke/admin-built-app.mjs` checks.** It uses Node built-ins only, starts
  `next start` on the built admin after `pnpm build`, and checks over HTTP that:
  - a signed-out visit gets a 307 to `/session/refresh` on the same origin, with the right
    `returnTo` and `no-store`
  - the marker cookie is set `HttpOnly; Secure; SameSite=Lax; Path=/`
  - a visit with the marker already set renders (no loop)
  - POST requests and the session pages are not redirected
  - `//evil.example/...` stays on the origin
  - there is no `x-powered-by` header
- **Tests:** 10 `node:test` cases run against stand-in servers, one per defect.
- **In CI:** it is a new step after Build in the required job, with a 3-minute timeout.
  It needs no network, Identity or database.
- **Evidence [V]:**
  - CI run 45346758173: the required job passes, including the new step.
  - Tooling tests: 119/119.

### NF-5: signed-out redirect to localhost (found by R-2, fixed in the same PR)

- **Defect:** under `next start`, `request.nextUrl` is always `http(s)://localhost:<port>`,
  whatever host the browser asked for.
  - The MW-007 middleware built its absolute `Location` from `nextUrl`, and Next sends it unchanged.
  - So behind the load balancer, every signed-out or lapsed visit to `work.test.munaxa.com` would
    have been sent to `https://localhost:3001/session/refresh`, and session refresh could never
    work in Testing.
  - The Wave 1 hand check used a `localhost` Host, so it could not see this.
- **Evidence [V]:**
  - The first CI run of the check (45344214262) failed with `Location leaves the origin:
    http://localhost:32993/…`.
  - Reproduced with Next 15.5.29, the admin's version, sending `Host: work.test.munaxa.com` and
    `X-Forwarded-Proto: https`.
  - A relative `Location` still answers 500 (`ERR_INVALID_URL`), the original MW-007 High, so it
    is not an option.
- **Fix:** `publicOrigin()` takes the request's `Host`, accepted only as `host[:port]` and only if
  it parses as a URL, with the scheme Next derived. Otherwise it falls back to `nextUrl`.
  - A forged `Host` only redirects that same client to the host it named, and the answer stays
    `no-store`.
  - 3 new middleware unit tests cover it.
  - The check gained `behind-load-balancer`. Against a real `next build`, the old middleware fails
    only that check and the fixed one passes it.
- Nothing is deployed. The fix reaches Testing with the first Work admin image, which still waits
  for MW-001.

## 6. NF-4: control#13 conflict

- **[V] Trial merge of control#13 (head `80e10f9`) with `main`:** the only conflict is in
  `Dockerfile`, in two hunks.
  - One is a comment, where both sides say the same thing.
  - The other is the `apk add` line, where the resolution is to take the PR's
    `libssl3/libcrypto3=3.5.10-r0` side.
- **Not pushed:**
  - The branch, `claude/project-thread-4sspd9`, belongs to another thread.
  - A Control session is live today.
  - The PR stays a draft until 3.5.10 exists anyway.
- It is resolved on R-1 day (Wave 2 plan, section 3), before the CI re-run.

## 7. Wave 2: what is left that is repository-only

| Item | State |
| ---- | ----- |
| R-1 OpenSSL bump PRs (work#35, identity#24, control#13, docs#182) | **[B]** waiting for Alpine 3.5.10-r0. The recheck at 09:07 UTC belongs to another thread. |
| R-2 built-app check | Done in work#57 `0134407`, plus the NF-5 fix |
| R-3 D-SSL exception removal | **[B]** only after every Testing image is rebuilt on 3.5.10 and scans clean |
| R-4 NF-3 | Done in platform#172 |
| R-5 work-api-only pin PR | **[B]** after Control issues Work's credential (owner-gated, Wave 2 section 9) |

No other repository-only Wave 2 item can be done safely before 3.5.10.

## 8. Owner approvals required

1. Decide how CODEOWNERS should be enforced. Turn on "Require review from Code Owners" only
   together with a way to approve PRs authored under `tam2om`: a second reviewer account or an
   owner bypass (section 3).
2. Wave 1 items still open:
   - the `image/*` tag ruleset
   - deleting the branches `claude/project-thread-vglde2-mw008-proof` and
     `claude/project-thread-vglde2-mw004b-proof`
   - signing the AWS connector in again as the read-only role
3. When Alpine publishes 3.5.10-r0, approve the bump merges and then image publication, in the
   order of Wave 2 plan section 3.
4. 1 Dec 2026: if 3.5.10 has not shipped, a new MW-001 decision is needed. No option is
   pre-selected, the exception is not extended, and Work is not added to it.
5. Optional: release `@munaxa/security` 2.5.1 (NF-3) with the next platform release.

## 9. Exact next actions

1. If the 09:07 UTC recheck finds 3.5.10-r0, re-run the CI of work#35, identity#24 and docs#182.
   Resolve control#13 as in section 6, then merge each once Images is green.
2. Then follow the Wave 2 plan P-1 to P-3 and the pin PR, each step owner-gated.
3. Until then, nothing else is safe to do in the repositories for Work's Testing path.
