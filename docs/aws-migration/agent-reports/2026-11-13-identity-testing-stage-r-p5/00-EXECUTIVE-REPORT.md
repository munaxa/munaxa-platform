# 00. Executive report: Identity Testing Stage R and P-5 preparation

**Status (13 Nov 2026, about 15:30 UTC): P-5 PREPARED AND REVIEWED; STAGE R SPECIFIED BUT NOT RUN (AWS connector failed to connect, then asked for a new sign-in). Nothing deployed.**

Legend: **[V]** verified by Claude, **[W]** reported by a workflow run, **[L]** local or offline test, **[E]** expectation, **[U]** unverified, **[O]** owner action.

Source of truth: `2026-11-13-identity-cve-2026-4738-remediation/` (read in full). Nothing newer supersedes it (01).

## Results

| # | Item | Result |
| --- | --- | --- |
| 1 | Current state | platform `b2d93aa`, identity `2db6ed9` (CI green), control `1f58c90`, work `eabcc47`. Platform main CI red on one wall-clock test bound, unrelated (01) [V] |
| 2 | Stage R | **Not run.** The approved read-only identity (the AWS MCP connector) failed with HTTP 502; no other approved route exists (no CLI, no keys, no `asm-exec`). All 12 checks are specified with exact calls and pass criteria (02). GitHub-side evidence: the real scheduled plan of 08:48 UTC shows the state equals main plus the known docs-migrate delta, and the database was stopped [W] |
| 3 | Account and state identity | in code: account `229251310592` pinned by `allowed_account_ids`, region `eu-central-1`, backend `munaxa-shared-tfstate-229251310592` / `nonprod/stack.tfstate` [V]; the 08:48 run used the nonprod session deployer in that account [W]. Live read pending (R-1, R-2) |
| 4 | Image digests | PR #121 pins exactly api `9a8c6ebd…3c3b` and migrate `5f3bdcce…b874`, equal to run 43359947421's pushed digests [V][W]; ECR read pending (R-5; verified by the CVE thread at 03:40 today) (03) |
| 5 | MFA custody | procedure and reviewed script prepared (04); key never visible to Claude, logs, history, CI, reports or Git; only the kid `mfa-nonprod-2026-11` and version ids recorded. **Not executed** |
| 6 | P-5 PR | https://github.com/munaxa/munaxa-platform/pull/121, **draft**: images pinned, `identity_security_config = { mfa_primary_kid = "mfa-nonprod-2026-11", mfa_policy = "off" }`, declaration for the post-stage-C plan. **Merge blocker:** `secret_version_ids.identity` needs stage C's version id; enforced at apply by `check-plan-intent.sh` (05, 06) |
| 7 | CI | see 05 |
| 8 | Expected plan (NOT a real plan) | 4 task-definition replacements (identity, identity-migrate, identity-bootstrap, db-admin) + docs-migrate create + docs_db_admin policy update; "5 to add, 1 to change, 4 to destroy" [L][E] (06) |
| 9 | Security review | independent, 2 rounds. Round 1: 1 High, 1 Medium, 1 Low on the PR, all fixed. Round 2: PR APPROVE as draft (1 Low accepted); procedure: 2 Medium, 3 Low, all fixed. **No Critical, High or Medium open** (07) |

## New findings

- **S-1 (Medium, operational, pre-existing):** scheduled Testing `down` has failed at "Plan the switches" since 12 Nov (platform#105's docs-migrate delta). Its database stop still works. Stage D clears it (01).
- **db-admin depends on the identity bundle version** (found in review): declared now (06).

## Owner actions [O] (08)

1. Reconnect or retry the AWS MCP connector, then send a message: Stage R runs immediately.
2. Choose the stage C route: **M-1** (paste one reviewed script in CloudShell, recommended) or M-3 (Claude via the connector with an explicit exception to the no-`get-secret-value` rule).
3. Later, separately: approve stage C, then stage D, then stage E.
4. Outstanding setting (other thread): grant `@munaxa` package Read access to identity, work and control so identity#19, work#32 and control#9 can leave draft.

## Not performed (09)

No Terraform plan/apply/import/state change against AWS, no AWS call at all, no secret read or write, no MFA key, no IAM/OIDC/account, ECS, migration, session, DNS/Cloudflare/certificate, production, image, token or GitHub-settings change. P-5 not merged. No deployment authorization requested.

## Files

01 current state · 02 Stage R · 03 image digests · 04 MFA custody · 05 P-5 PR, diff, CI · 06 expected changes · 07 security review · 08 gates and owner actions · 09 not performed · `supporting/`: offline plan diff, rendered task-definition diff, Identity config harness output, `--enforce` test, stage C draft script and its stub test, the PR diff.
