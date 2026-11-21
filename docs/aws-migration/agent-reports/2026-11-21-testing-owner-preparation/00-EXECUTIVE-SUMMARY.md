# 00. Executive summary: Testing owner preparation and deployment readiness

**Date:** 21 Nov 2026 (owner brief 19:07 UTC, thread "Prepare owner steps for Docs Testing").
Continues [2026-11-21-testing-readiness](../2026-11-21-testing-readiness/) (platform#155, `6633c4e`).
**Scope:** repository work, offline tests and offline Terraform only.

## Status in one line

**Everything that can be prepared before OpenSSL 3.5.10 is prepared and tested. The first Docs
Testing deployment is still BLOCKED on D-SSL** (Alpine v3.24 and edge still ship OpenSSL 3.5.9-r1 at
19:09 UTC). The owner can do the three AWS console tasks now (Identity Center, Docs bootstrap plan,
secret bundles); everything after them waits for the Alpine fix.

| Category | What happened |
| --- | --- |
| **Repository work completed** | IC-1 regression tests (5 new, every IAM write against every privileged role, boundary and the GitHub OIDC provider); Identity Center README gains the matching simulator check C2; the Docs bootstrap owner plan script moves to `scripts/aws/owner/` (byte-identical, same SHA-256 `1dc70ce4…3845`) with a new end-to-end offline test harness (19 tests) in CI; this report |
| **Offline tests completed** | Identity Center 18/18 (13 before); custody 64 + 27 sub-tests; Docs bootstrap script 19/19 (new; includes a check of the real constants against munaxa-docs); stack Terraform 93/93; bootstrap 23/23; service module 17/17; connector 143/143; session cleanup OK; `terraform fmt` clean (file 05) |
| **Offline Terraform plans** | Apply 1 = **33 create + 4 Identity task-definition replacements, 0 destroy**; Apply 2 = **42 create + 3 task-definition replacements, 0 destroy**; Docs credential pin = 2 replacements; Docs session `up` = 28 create. The full Apply 1 change set (tfvars, manifest, E-1 fixtures, withdrawn digests, tests, declaration) was built with placeholder digests and passes 95 Terraform + 143 connector tests (file 06) |
| **Live AWS operations** | **None.** No AWS call of any kind (the connector is signed out and nothing needed it) |
| **Owner actions pending** | File 07: Identity Center (O-IAM-1..6), Docs bootstrap plan as root, Control and Docs bundles; later the Session 2 approvals |
| **Deployment** | **Not started.** No image built for publication, published or pushed; no apply, session, DNS, secret or GitHub-setting change |
| **PRs merged** | This report's PR only. All 12 other open PRs were re-checked live; none is eligible (file 04) |

## Plain-language owner questions (yes/no)

Unchanged from the previous report, now with more tests behind them:

1. **Set up IAM Identity Center** with the three permission sets from `infra/aws/identity-center/`
   (about 30 minutes in the console, no cost; root keeps working)? Recommended: **yes**.
2. **Run the Docs bootstrap plan script as root in CloudShell** (plan only; it stops on anything
   other than the reviewed 2-add, 3-change delta) and send Claude the log? Recommended: **yes**.
   Applying it is a separate yes after Claude checks the log.
3. **Fill the Control and Docs secret bundles** with the reviewed scripts (Docs mail stays a
   placeholder)? Recommended: **yes**, after question 1 (or as root now).

## Files

| File | Content |
| --- | --- |
| [01-IAM-IDENTITY-CENTER-STATUS.md](01-IAM-IDENTITY-CENTER-STATUS.md) | Policy review, IC-1 regression coverage, owner steps O-IAM-1..6 |
| [02-DOCS-BOOTSTRAP-STATUS.md](02-DOCS-BOOTSTRAP-STATUS.md) | Script review, new harness, constants re-verified, owner command |
| [03-SECRETS-READINESS.md](03-SECRETS-READINESS.md) | Custody scripts, hashes, owner commands, Resend, version-id reporting, Docs credential |
| [04-OPENSSL-STATUS.md](04-OPENSSL-STATUS.md) | Alpine check 19:09 UTC, bump PRs, the procedure when 3.5.10 lands |
| [05-PR-AND-CI-STATUS.md](05-PR-AND-CI-STATUS.md) | Every open PR, checks, why nothing else merged; every test command and result |
| [06-DOCS-TESTING-DEPLOYMENT-READINESS.md](06-DOCS-TESTING-DEPLOYMENT-READINESS.md) | Fresh Apply 1 / Apply 2 plans, the Apply 1 change set, Stages 1-7 runbook |
| [07-OWNER-ACTIONS.md](07-OWNER-ACTIONS.md) | Owner actions in order with exact steps |
| [08-REMAINING-BLOCKERS.md](08-REMAINING-BLOCKERS.md) | Blockers, risks, rollback |
| `supporting/` | Offline plan test and output, Apply 1 change template (placeholders), IC-1 mutation evidence, OpenSSL reading |
