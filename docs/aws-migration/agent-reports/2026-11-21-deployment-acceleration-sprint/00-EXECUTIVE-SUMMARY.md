# Deployment acceleration sprint: executive summary (21 Nov 2026)

## FIRST TESTING DEPLOYMENT: BLOCKED

**The blocker is upstream and has a date.**
- Every product image fails the HIGH/CRITICAL gate on 5 HIGH CVEs in OpenSSL `3.5.9-r1` (D-SSL).
- OpenSSL releases the fix (3.5.10) on **1 Dec 2026**.
- No base image available today passes the gate. Alpine (every channel), Debian trixie, Wolfi and Node's bundled OpenSSL were all built or checked. Wolfi boots Identity perfectly and still has 7 HIGH (file 01).
- The gate stays fail-closed: no suppression, no threshold change, no exception.

**Scope.** Repository work only.
- No Terraform apply, no AWS read or write, no secret touched, nothing published, nothing started.
- Testing is idle, as verified this morning by the integration thread.

## Already complete before this sprint

- AWS foundation, the Testing platform (Config A1, stages C and D) and every cost safeguard (backstop, cleanup R, H-20 gate, scheduled `down`).
- **Identity is proven in Testing.** Stage E ran on 21 Nov (probe 28/28); the organisation and operator exist; cleanup was verified.
- RDS master secret rotation verified.
- Control and Docs Terraform, custody scripts and offline plans are on `main`.

## Completed in this sprint

| Item | Result |
| --- | --- |
| D-SSL attacked now | 3 probe runs. Real Wolfi and Alpine images of Identity built, migrated, booted in production mode, health-checked, unit-tested (59/59) and scanned. Upstream facts collected. Decision and the earliest path in file 01 |
| D-SSL bump PRs | Draft and pinned to `3.5.10-r0`, so release day is a CI re-run: identity#24, control#13 (also drops the `openssl` CLI), docs#182, work#35. School: patch ready (file 04) |
| Open PRs | All inspected; none mergeable (file 02). The package-token drafts identity#19, control#9 and work#32 were rebased and diagnosed: the owner's GitHub Packages grant has **not** been given (403 on a cold install) |
| W-3 Work custody | `scripts/aws/owner/work-testing-secrets.sh` plus 30 offline tests, on `main` with this PR |
| School SC-07 | Identity token sign-in implemented on the School API with an organisation-to-school binding protected by row-level security; tests 606 unit and 339 e2e pass; draft school#29, because merging needs `SCHOOL_LOCAL_AUTH=enabled` set on Render production first (owner yes) (file 04) |
| RDS restart stop | Enablement package prepared and off by default. It also fixes a bug in #152: the restart-stop alarm could not publish to its topic. Bootstrap 23/23 and stack 91/91 tests pass (file 06) |
| Owner pack | 13 ordered actions, each with where, command, inputs, expected result, verification, rollback and cost (file 05) |

## Shortest safe path

```
NOW (session 1, no images needed)            AFTER ALPINE 3.5.10-r0 (session 2)
1 Packages grant (optional)                  Claude: merge bump PRs, control#12, docs#181, docs#178
2 Cloudflare Access app (team domain, AUD)   7  publish Identity, Control, Docs images
3 Control bundles                            8  Apply 1 = C-1 (33 creates) + Identity pin (O-4)
4 Docs bootstrap (migrate repository)        9  Apply 2 = C-2 (0/3/0) + D-1 (Docs, services off)
5 Docs bundles + Resend decision             10 Control session, Docs credential issued
6 RDS restart stop (optional)                11 Docs credential installed + pin apply
                                             12 Docs session: migrate, first admin, health  <- FIRST CUSTOMER PRODUCT
                                             13 down + cleanup verified
```

- **Critical path:** OpenSSL 3.5.10, then Alpine package, then items 7 → 13.
- **Session 1 removes every non-image dependency now.** In session 2, the O-4 pin rides with C-1 and D-1 with C-2: two apply cycles instead of four.

## Files

| File | Content |
| --- | --- |
| [01-D-SSL-EVIDENCE.md](01-D-SSL-EVIDENCE.md) | Alternatives, tests, decision, release path |
| [02-PRS-AND-CI.md](02-PRS-AND-CI.md) | Every open PR, CI, package-token diagnosis |
| [03-IDENTITY-CONTROL-DOCS-READINESS.md](03-IDENTITY-CONTROL-DOCS-READINESS.md) | Product readiness and timing |
| [04-WORK-SCHOOL.md](04-WORK-SCHOOL.md) | W-3, Work path, School SC-07 |
| [05-OWNER-EXECUTION-PACK.md](05-OWNER-EXECUTION-PACK.md) | **The 13 owner actions** |
| [06-RDS-COST-AND-ROLLBACK.md](06-RDS-COST-AND-ROLLBACK.md) | Restart-stop package, cost, rollback |
| [supporting/](supporting/) | Probe copies and run ids; RDS enablement procedure and declaration |
