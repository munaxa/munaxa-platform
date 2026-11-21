# 02. Identity readiness and the Stage E authorization package

**Status: CODE COMPLETE — NOT DEPLOYED. Stage E: READY FOR OWNER APPROVAL.** Stage E is **not authorized** by this task.

## 1. Why Identity comes first

Control's operator API accepts only an Identity ES256 access token (plus Cloudflare Access and the operator org/subject allowlist). The Docs credential (`mxc_<uuid>_<secret>`) can only be minted through that API. So no Docs licence exists until an operator can sign in to Identity in Testing [V: control `src/operator/*` guards, docs `LICENSING_MODE=CONTROL_PLANE` refusal in production mode].

## 2. What is already applied in AWS

| Gate | What | Evidence |
| --- | --- | --- |
| Stage C | Identity bundle version `80914756…` AWSCURRENT (MFA key ring, kid `mfa-nonprod-2026-11`) | [D] 2026-11-13 stage C report |
| Stage D | task definitions pinned to image `2db6ed9` (api `9a8c6ebd…`, migrate `5f3bdcce…`) | [D] run 43513076111 |
| G-1 to G-7 | #130 to #132 (L-A0 custody, config), D-B2 bootstrap (cleanup permissions), D-B3/D-PIN (18 Nov, run 44267788619), D-B5 alarm subscription confirmed, D-B4 dry run PASS (19 Nov 03:45) | [D] 2026-11-15 to 2026-11-18 reports |
| H-20 IAM | session-read policy v4 applied 19 Nov 11:28 (0/1/0) | [D] #141; [V] the gate passes on the live state after R at 21:05 |

## 3. What Stage E does (summary)

Stage E is the first Identity session in Testing. In order:

1. Gate pass (H-20, at the time it starts).
2. `up` with Identity only (ALB, listener, target group, `identity` service at desired 1, after db-admin and migrate tasks).
3. The operator secret (custody Option A: generated inside AWS by CloudFormation, never printed).
4. Health, sign-in route and probe checks.
5. `down` the same day, and the next R at 21:05 verifies cleanup.

The full runbook is in `2026-11-14-identity-stage-e-blockers-remediation/08-*` and `2026-11-15-identity-stage-e-owner-decisions/06-*` §5.2 and `03-*` §5. It is not repeated here.

## 4. One design point to know before Control

Under custody Option A, the operator password is never returned to anyone. To sign in to the Control operator portal later, the owner opens the secret in the AWS console (as root, MFA). That is an owner action at the Control session, not a Claude action, and it is listed in file 10 (A-7). The Identity MFA policy for the operator is off in Testing (decision D-E, 15 Nov).

## 5. Stage E authorization package (for the owner)

| Item | State |
| --- | --- |
| Prerequisites G-1 to G-7, H-20 | all applied and verified [D/V] |
| RDS master secret rotation | due 20 Nov 23:59:59 UTC; verified by the rotation thread about 00:30 UTC 21 Nov. **Recommend starting Stage E only after that check passes** |
| Cost | about US$0.08 an hour for Identity alone, plus the RDS hours; under US$2 for a half-day session [E] |
| Rollback | `down`; R at 21:05 is the backstop; the backstop at 21:00 stops RDS |
| What is needed | the owner's yes, with a session window (Amman time) |

Question for the owner: **"Start Identity Stage E in Testing in a window of your choice, after the 21 Nov rotation check?" Yes / No.**
