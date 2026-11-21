# 03. Owner CloudShell plan procedure, expected plan and rejection conditions (PLAN ONLY)

**Status: PREPARED, WAITING FOR THE OWNER RUN.** The procedure plans only. It applies nothing.

## 1. Expected plan

| Field | Expected |
| --- | --- |
| Summary line | `Plan: 0 to add, 1 to change, 0 to destroy.` |
| Changed resource | `aws_iam_policy.deployer_session_read["nonprod"]` only, action `update` (in place: no replace, no destroy) |
| Changed attribute | `policy` only |
| Policy delta | one added statement, nothing changed or removed: `GateSessionCleanup` Allow `states:DescribeExecution`, `states:ListExecutions` on `arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*` and `arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup` |
| Policy size after | 1,798 characters (limit 6,144) |
| Drift | none (`changed outside of Terraform` absent; `resource_drift` empty) |
| State | 70 resources, as after D-B2R |

**Not changed:**
- prod IAM or infrastructure;
- any other policy or role, including the workload boundary and the session-cleanup policy, which are checked live;
- schedules;
- state machine definitions;
- ECS, RDS, load balancers or networking;
- secrets or KMS.

The bootstrap root has no resource of those kinds except IAM, budgets and the state bucket and key, and the script refuses any address other than the one above.

**How the expected values were obtained:**
- The before-policy is the live session-read policy v3, read on 19 Nov at 09:05 UTC. It equals the D-B2R code.
- The after-policy is the real aws provider's rendering of `main` `0f06836`.
- Both are embedded, normalized, in the script.

## 2. The procedure

**Script.** `supporting/h20-iam-plan-owner-cloudshell.sh`, SHA-256 `abbddb1944d9aebc4298526e92faffcd9b6076116424b73b638b6191360d091d`.

**Owner steps** (about 5 minutes):

1. Sign in to the AWS console as root, and open **CloudShell** in **Europe (Frankfurt) eu-central-1**.
2. Download the script from `main` and check its SHA-256:
   ```bash
   curl -fsSLo h20-iam-plan-owner-cloudshell.sh https://raw.githubusercontent.com/munaxa/munaxa-platform/<report PR merge commit>/docs/aws-migration/agent-reports/2026-11-19-identity-h20-iam-bootstrap-plan/supporting/h20-iam-plan-owner-cloudshell.sh
   echo "abbddb1944d9aebc4298526e92faffcd9b6076116424b73b638b6191360d091d  h20-iam-plan-owner-cloudshell.sh" | sha256sum -c -
   ```
   Until this report PR is merged, use its branch head instead of the merge commit. The SHA-256 check is the same.
3. Run it:
   ```bash
   bash h20-iam-plan-owner-cloudshell.sh 0f06836c06b2c76ab62699489e67e040a867b360
   ```
4. Send the whole log `~/munaxa-h20-iam/h20-iam-plan.log` to the thread. Leave `~/munaxa-h20-iam` in place, because it holds the saved plan.

**What the script checks, in order** (each maps to a requirement of the owner's brief):

| # | Requirement | Script step |
| --- | --- | --- |
| 1 | Account and region | §1: region `eu-central-1`, account `229251310592`, caller root |
| 2 | Backend and state key | §1: the state object `s3://munaxa-shared-tfstate-229251310592/bootstrap/terraform.tfstate` is readable and no lock exists. §3: `backend.tf` names that bucket, key, KMS alias and lock file. §4: the initialised backend is `s3` with that bucket, key and region |
| 3 | Exact merged `main` SHA | §3: the argument must be `0f06836…`, it must be on `main`, and the four bootstrap files changed since D-B2R must match their reviewed blobs |
| 4 | Init on the approved backend | §4: `terraform init -reconfigure -lockfile=readonly`. A state migration stops the script. Provider `hashicorp/aws` 6.67.0 with its lock hash; Terraform 1.16.5 with HashiCorp's SHA-256 |
| 5 | `-var testing_session_cleanup=true` | §7 |
| 6 | Saved plan with `-out` | §7: `~/munaxa-h20-iam/h20-iam.tfplan` |
| 7 | JSON plan summary | §10: `~/munaxa-h20-iam/h20-iam-plan-summary.json`, with the Terraform version, counts per action, changed addresses and actions, the drift count and the policy delta. No attribute values. The full plan JSON is deleted because it contains the prior state |
| 8 | Addresses and actions, no sensitive values | §8 and §10. The policy delta names only actions and ARNs, which are not sensitive |
| 9 | Saved-plan SHA-256 | §10: `sha256sum` of the plan, the summary, `expected.json` and `norm.jq` |
| 10 | Exactly 0/1/0 on one resource | §7 summary line; §8 the one address, the action and the attribute; §9 before and after equal the reviewed code, and the delta is exactly `GateSessionCleanup` |
| 11 | Stop on anything unexpected | Every check calls `stop`. It also stops on live drift (§6), a non-zero `terraform test` (§4), a state count other than 70, a lock left behind, and a policy over 6,144 characters |

The last line of a good run is `H-20 IAM PLAN VERIFIED, NOT APPLIED <time>`.

**AWS writes.** None except Terraform's own lock object, which `terraform plan` creates and removes. No secret is read.

**Tested offline.** `supporting/test_h20_iam_owner_scripts.py` passes 19/19 (file 01 §4), against stubbed `aws` and `terraform` and the real Terraform zip checksum.

## 3. Rejection conditions (any one means STOP; nothing is applied, and nothing is re-planned to make it pass)

- Any `STOP:` line, or a last line that is not `H-20 IAM PLAN VERIFIED, NOT APPLIED`.
- A summary other than `0 to add, 1 to change, 0 to destroy`.
- Any address other than `aws_iam_policy.deployer_session_read["nonprod"]`. Any `["prod"]` address is refused, and so is any create, delete, replace, import, move or forget.
- Any changed attribute other than `policy`.
- A policy delta other than exactly the one `GateSessionCleanup` statement above. That includes:
  - another action, especially any `states:` write such as `StartExecution` or `StopExecution`;
  - another or wider resource, such as `*`, a prod ARN, or another state machine;
  - a changed or removed statement.
- Drift: any `changed outside of Terraform`, a `resource_drift` entry, or live IAM that differs from the D-B2R code.
- A `PIN` other than `0f06836…`, a changed bootstrap blob, another provider version or lock hash, or a Terraform binary checksum mismatch.
- A backend other than `s3://munaxa-shared-tfstate-229251310592/bootstrap/terraform.tfstate` (`eu-central-1`, KMS alias `munaxa-shared-tfstate`, lock file).
- An account other than `229251310592`, a non-root caller, or a region other than `eu-central-1`.
- A bootstrap state count other than 70, or a lock present before or after.

**On a STOP:**
1. Claude diagnoses the cause from the log.
2. A fix goes through a new reviewed PR and a new plan.
3. The guardrails are never weakened.

## 4. Claude's review of the owner's log (to be done when it arrives)

Claude checks the following and records each result in a dated addendum to this folder:

1. Account, caller and region; backend bucket, key and region; `PIN` = `0f06836…`; the four reviewed blobs; Terraform 1.16.5; provider 6.67.0.
2. `terraform test` shows 20 passed and 0 failed; the state holds 70 resources.
3. Live drift check: three `OK … equals the D-B2R code` lines.
4. Plan summary line: 0/1/0. No drift line.
5. Address and action: the one update, `policy` only.
6. Policy delta: exactly the `+ GateSessionCleanup …` line above; size 1,798.
7. The summary JSON shows `changes` = [that address, `update`], `resource_drift` 0, and counts with one `update` and the rest `no-op`.
8. The SHA-256 values: `expected.json` = `c6e6941e…d023`, `norm.jq` = `c8d3aacd…a9f3`, and the saved plan's SHA-256, which is recorded for the apply.
9. No lock is left behind; the last line is `PLAN VERIFIED, NOT APPLIED`.

Any deviation means the verdict is **REJECTED**. If everything matches, the verdict is **PLAN VERIFIED, READY FOR SEPARATE OWNER APPLY AUTHORIZATION**, with the plan SHA-256 stated.
