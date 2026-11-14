# Identity Stage E blockers: remediation (executive report)

Date: 14 Nov 2026. Branch `claude/project-thread-edtxfe` on munaxa-platform, from `origin/main`
68fa6f9. Follows report 2026-11-14-identity-stage-d-correction-and-stage-e-readiness (PR #129,
unmerged), which found Stage E NOT READY.

## Conclusion

**STAGE E REPOSITORY PREPARATION COMPLETE — READY FOR OWNER REVIEW** (this PR's own conclusion)

**Independent owner review (files 10 to 13): PR #130 INDEPENDENT REVIEW PASSED — READY FOR OWNER
MERGE DECISION.** The review found 0 Critical, 3 High and 6 Medium findings the PR's own reviews
had missed; all High and Medium findings the repository can fix are fixed with regression tests.
L-A0 is **not** accepted: it is an unresolved owner decision (D-LA0) that blocks C-8 and C-8R, not
the merge (file 11).

Every blocker that the repository can close is closed, reviewed and tested offline. Stage E is still not
runnable. What remains is owner approvals and owner-approved applies outside the repository
(file 08): the cleanup's two applies and its dry run, the probe pin PR and its apply, a check of
what the connector records, and the Stage E approval itself.

## What was not done

No AWS connector call, no AWS CLI call, no Terraform plan against a backend, no apply, no workflow
dispatch, no RDS start or stop, no ECS service or task, no migration, bootstrap or db-admin run,
no secret created, read, changed or deleted, no IAM, KMS, network, DNS, certificate, budget or
schedule change, no image publication, no repository-settings change, no merge (PR #129 included),
and Stage E was not started. Every test ran offline, with AWS credentials removed and mocked
providers.

## Blockers

| Blocker | Status | Evidence |
| --- | --- | --- |
| **BE-1** task definition `:1` | **Resolved in repository.** Revision-free manifest of the five Stage E families; E-1 guard discovers the latest ACTIVE revision, validates it against the manifest (images, secrets, environment names, shape fields, commands by exact value or SHA-256, volumes) and runs only that revision by full ARN, once, with an allow-listed override; runbooks corrected | file 01; `test_task_guard.py` 38, `stage-e-manifest.tftest.hcl`, revision lint |
| **BE-2** independent cleanup | **Built, off by default, not applied.** Step Functions (four independent branches, list-based discovery, safety checks, retries, two alarms, dry run); H-20 gate, arm and disarm; Terraform changes prepared (bootstrap 2 updates and 2 creates; stack 8 creates and 1 update) | file 02; 30 simulator tests, 18 H-20 tests, 5 + 2 Terraform runs |
| **BE-3** pinned probe and MFA checks | **Built, not pinned, not run.** 15 checks + 13 throwaway-mode checks (origin, refresh reuse, MFA enrolment, TOTP, replay, recovery codes and their single use, invalid code, disable, lockout); the throwaway account is created by a separate container, so the probe never holds the database URL | file 03; 73 probe tests, 41 loader tests, Terraform runs |
| **BE-4** operator sign-in | **Decision record, recommendation: skip operator sign-in, one throwaway account per run, disabled afterwards** | file 04 (owner decision D-BE4) |
| **BE-8** connector scripts | **Resolved in repository.** C-8, C-8R, C-8v, C-16, C-24 pass the sandbox rules, fail closed, are idempotent and never return a value | file 05; 56 fake-AWS tests |

## Reviews

Two independent reviewers (correctness, security) found **no Critical, 1 High and 8 Medium**. All nine
are fixed in 6fc37c4. Of the 7 Low findings, 3 were fixed and 4 are accepted with reasons. The High
finding was the probe's account creation, which lost the RDS CA bundle and could never have
worked. A third reviewer checked the fixes. It found two new High defects, both fixed in 8f28a61:
the hand-off volume is root-owned on Fargate, and the cleanup's secret ARN pattern used `?`,
which Step Functions does not treat as a wildcard (file 06).

## Files

| File | Content |
| --- | --- |
| 01 | BE-1: manifest, E-1 guard, how to select a revision |
| 02 | BE-2: cleanup design, permissions, alarms, tests, prepared Terraform, H-20 |
| 03 | BE-3: probe checks, throwaway account, pin and run procedure |
| 04 | BE-4: operator sign-in decision record |
| 05 | BE-8: sandbox rules and the Option A scripts |
| 06 | Review findings, fixes and accepted Lows |
| 07 | Test commands and results |
| 08 | Remaining blockers and owner decisions |
| 09 | Validation evidence (SHAs, commands, scans) |
| 10 | Independent owner review: conclusion, status, findings by severity |
| 11 | L-A0 connector credential leakage review (unresolved, D-LA0) |
| 12 | Terraform and IAM review (counts, IAM properties, accepted Lows) |
| 13 | Review fixes, regression tests, accepted Lows, exact test results |
