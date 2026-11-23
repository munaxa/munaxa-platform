# 02. Apply 2 result and what comes next

Labels: **[V]** verified. Times are UTC, 23 Nov 2026.

## 1. Y-4 and Y-5: Apply 2 [V]

| Step | Evidence |
| --- | --- |
| Y-4 approval | Owner decision card, 16:43. #163 merged as `8b1b187` after CI passed |
| Plan | [Run 45223092225](https://github.com/munaxa/munaxa-platform/actions/runs/45223092225), action `apply`, 17:01: `MODE: --enforce`, **42 to add, 0 to change, 3 to replace, 0 to destroy**, and "The plan matches the declared changes exactly (45 resource action(s))". The replacements are `db_admin[0]` and the Control api and migrate task definitions. Claude checked the plan before the apply gate |
| Y-5 approval | Owner decision card, 17:04. The owner then approved the apply gate |
| Apply | Same run, apply job: "Applied the saved plan of commit 8b1b1872d08a2129939c622247de45094b583a75" |

## 2. Post-apply read-only check (MunaxaReadOnly, about 17:08) [V]

| Family | Revision | Image(s) |
| --- | --- | --- |
| `munaxa-nonprod-db-admin` | 3 | postgres `5983db9a…` (now identity + control) |
| `…-control-api` / `-control-migrate` | 2 / 2 | `6c79f98e…` / `0ae0db81…` |
| `…-docs-api` | 1 | docs api `febeaca7…` + redis sidecar `c6eabf74…` |
| `…-docs-web` | 1 | `28e22b96…` |
| `…-docs-scanner` | 1 | antivirus `801c77e1…` |
| `…-docs-migrate` | 1 | `4d00650b…` |
| `…-docs-db-admin` | 1 | postgres `5983db9a…` |
| `…-docs-provision` | 1 | docs api `febeaca7…` + redis |

ECS services: 0. Running tasks: 0. RDS `munaxa-nonprod-pg`: `stopped`. Load balancers: 0.
**Nothing is running.**

## 3. State after this thread

Done:

- O-IAM-6 (read-only connector).
- Y-1 (images published, ECR cross-checked).
- Y-2 and Y-3 (Apply 1 applied and verified).
- Y-4 and Y-5 (Apply 2 applied and verified).

Remaining (file 06 of 22 Nov, runbook file 05 steps 13 to 25):

| # | What | Needs |
| --- | --- | --- |
| 13 | `OPERATOR_CIDRS` on the `aws-nonprod-session` environment | Owner |
| Y-6 | Control session `up`, with a hard stop the same day before 21:00 UTC, then operator DNS, Identity MFA, and the Docs Control Plane credential issued and stored | Owner yes, then owner steps |
| Y-7 | Pin the new docs-api bundle version: PR, then plan (2 replacements), then apply | Owner yes |
| Y-8 | Docs session up, migrate, provision, verify, down | Owner yes |

The deadline is 2026-12-01T00:00:00Z. After it, E-1 refuses a Testing `up` with these digests.

Between applies, the scheduled `aws-session.yml` `down` runs plan against `main` and, as recorded
in file 00, fail without applying while a pin is merged but not applied. That window is now closed:
Apply 2 is applied, so `main` and the live state agree.
