# 05. Identity: Stage D revalidation and the Stage E owner-approval checklist

**Status:**
- Stage D: VERIFIED COMPLETE.
- Stage E: READY FOR OWNER APPROVAL. **Not executed, not authorized.**

## 1. Revalidation [V unless marked]

| Check | Evidence | Result |
| --- | --- | --- |
| Image digests | tfvars api `9a8c6ebd…`, migrate `5f3bdcce…` (identity `2db6ed9`); ECR scan clean | match |
| Task definition | latest ACTIVE `identity` revision 2 uses `9a8c6ebd…` and the Valkey sidecar | match |
| MFA key ring | the task definition pins `MFA_ENCRYPTION_KEYS` to bundle version `80914756…` (stage C, kid `mfa-nonprod-2026-11`); `mfa_policy = "off"` for Testing (D-E) | match; no value read |
| Migration status | migrate has never run against Testing (log groups empty); it runs at S-4 of Stage E | expected |
| Health and sign-in coverage | the session probe (D-PIN, pinned to `2f6d443` / SHA-256 `7254a0ba…`) checks 28 assertions: health, sign-in route, JWT `aud`/`exp`, throwaway account [D] | ready |
| H-20 gate | session-read v4 applied 19 Nov 11:28 UTC; R `1a6aff64` passed the gate on live state [D/V] | passes |
| Cleanup | R daily 21:05 UTC and the backstop 21:00 UTC; D-B4 dry run passed 19 Nov 03:45 UTC [D] | ready |
| Stage E manifest (E-1 guard) | `envs/nonprod.stage-e-tasks.json` equals what Terraform renders (`stage-e-manifest.tftest.hcl` passes in CI on main) | ready |

**Ordering rule (new):** any config change to the db-admin task definition changes a family the E-1 guard checks. C-2 adds `control` to `db_bootstrap_products`, which adds `CONTROL_APP_URL` and `CONTROL_OWNER_URL` (file 06). After that change the guard refuses Stage E until the manifest is updated. So **run Stage E before C-2**, or update the manifest in the C-2 PR.

## 2. Stage E owner-approval checklist

Runbook: `2026-11-11-identity-final-operator-runbook/00-IDENTITY-FINAL-OPERATOR-RUNBOOK.md` (steps S-0 to S-14), with `2026-11-15-identity-stage-e-owner-decisions` file 03 §5 (C-8G) and file 06 §5.2 (active-session dry run).

### A. Before the owner says yes

| # | Check | Pass when |
| --- | --- | --- |
| P-1 | RDS rotation check (file 03 §4) | RotationSucceeded after 21:07 UTC 20 Nov |
| P-2 | ECS idle | 0 services, 0 tasks |
| P-3 | No ALB, NAT or EIP | none |
| P-4 | Last R execution | SUCCEEDED |
| P-5 | E-1 guard on live task definitions | db-admin, identity-migrate, identity-bootstrap, identity-probe and identity match the manifest |
| P-6 | H-20 gate | passes |
| P-7 | Budgets | Testing below US$50 |
| P-8 | No pending config PR touching db-admin | true (C-2 not merged before Stage E) |

### B. Steps and expected resources

| Step | What | Expected |
| --- | --- | --- |
| S-0 | Window opens; T0 recorded; wake-ups at T0 + 2:30 and T0 + 2:45 | 3-hour hard stop |
| S-1 | `up` (edge and services on) | **11 creates**: ALB, listeners, rules, target group, identity service and related resources |
| S-3 | db-admin task | exit 0 (roles and the identity database) |
| S-4 | identity-migrate task | exit 0 |
| S-5 | C-8G: create the operator secret inside AWS (custody Option A) | created, value never returned |
| S-5b | open the bootstrap window (60 minutes) | |
| S-6a/b/c | identity-bootstrap task | exit 0; organisation and operator created |
| S-6d | close the window | |
| S-7 | force a new deployment of `identity` | service steady |
| S-8 | listener check | HTTPS 443 only; operator and admin routes refused |
| S-9 | probe task | **28/28** |
| S-9b | disable the throwaway account | done |
| S-10 | count-only log scan | no secret patterns |
| S-11 | delete the one-run bootstrap secret | absent |
| S-12 | `down` | **11 deletes** |
| S-13 | verify | 0 services, 0 tasks, no ALB; DB stopped |
| S-14 | report | PR |

### C. Rollback and cleanup

- Any failure before S-12: stop and run `down`. If `down` fails, R (21:05 UTC) and the backstop (21:00 UTC) remove the session and stop the DB.
- A failed migrate leaves the database for a rerun; Stage E does not drop data.
- The operator secret stays, by design (Option A). Organisation and operator rows persist in the Testing database.

### D. Cost

- About **US$0.08 an hour** while up: ALB plus one Fargate task plus RDS t4g.micro [E].
- A 3-hour window costs **under US$0.30** [E].
- The cap is enforced by the hard stop, R and the backstop.

### E. Approval question

"Start Identity Stage E in Testing, in a window you choose (Amman time), after the 21 Nov rotation check passes?" Yes / No.
