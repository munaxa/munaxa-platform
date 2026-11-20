# 08. Work and School (assessment only; scope not expanded)

## 1. Work

**Status: CODE COMPLETE — NOT DEPLOYED.**

| Item | Evidence | State |
| --- | --- | --- |
| Images | api `39a89a6f…`, admin `c06bb7ef…`, migrate `ca8c02d9…` at `b490b25` [V ECR] | stale (main `eabcc47` has WK-01/WK-02) |
| Scan | api CRITICAL 1: CVE-2026-4738 (zlib, Alpine) [V] | rebuild needed (as identity#20 did) |
| Identity dependency | WK-01/WK-02 need identity#15; `2db6ed9` includes it [D] | met once Stage E has run |
| Infrastructure | services in the stack at desired 0; bundles empty [V] | needs its own custody and pins |
| Product gaps | admin is read-only; no file storage, notifications or scheduler [D] | product work |
| CI | `pnpm audit` will fail on its next PR (`effect`, file 02 §3) | one-line override |

**Backlog (priority order):**

1. W-1: add the `effect` override.
2. W-2: rebuild and release images from main (removes the CRITICAL CVE and brings WK-01/02).
3. W-3: Work bundle custody script (same pattern as Docs and Control).
4. W-4: tenant re-binding after the first Identity session.
5. W-5: config PR with pins.
6. W-6: product gaps.

## 2. School

**Status: NOT STARTED** on AWS.

| Item | State |
| --- | --- |
| Images | none; ECR repositories empty [V] |
| Auth | its own sign-in, not Identity [V code, 19 Nov] |
| CI | on PRs only; no image publication run [V] |
| Findings | SC-04 to SC-07 open [D 11 Nov audit] |
| CI audit | `effect` advisory applies |

**Backlog:**

1. S-1: `effect` override.
2. S-2: close SC-04 to SC-07.
3. S-3: image publication workflow and first release.
4. S-4: secrets design.
5. S-5: stack configuration and a Testing session.

Neither product is on the Docs-first critical path.
