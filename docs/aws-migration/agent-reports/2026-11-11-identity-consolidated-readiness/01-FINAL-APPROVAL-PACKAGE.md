# Identity non-production: final approval package (11 Nov 2026)

Requested by the owner at 10:30 UTC, 11 Nov 2026 ("Fast-Track Final Preparation and Approval Package").

This package supersedes `00-IDENTITY-CONSOLIDATED-READINESS.md` in this folder where the two differ. It is the one document for ChatGPT's review and the owner's decisions.

**Nothing in this package is authorized or executed:**

- no PR was merged or closed;
- no Terraform plan or apply was run against AWS;
- no workflow was dispatched and no ECS task was run;
- no AWS resource or secret was created, read, changed or deleted, and no password was generated;
- no IAM, KMS, network, DNS, Cloudflare, production or GitHub App change was made.

Fixed inputs:

| Input | Value |
| --- | --- |
| Account and region | `229251310592`, `eu-central-1` |
| Environment | AWS non-production |
| Identity host | `id.test.munaxa.com` |
| Organisation | `munaxa-group` |
| Operator email | `admin.tamer@munaxa.com` (owner-confirmed, 10:30 UTC) |
| Custody | Option A |

**Labels:** **[R]** executed and recorded here; **[CI]** GitHub check run; **[M]** mocked or offline only (not AWS evidence); **[U]** unverified.

## 1. Executive readiness summary

**Preparation is complete. The package is ready for ChatGPT's review and the Stage A decision. It is not ready for a deployment.** The session (Stage D) can be requested only after three earlier stages:

- **Stage A:** the preparation PRs are merged.
- **Stage B:** the independent cleanup is built and proven (the owner's rule: no first session with an unbounded ALB cost).
- **Stage C:** the probe task definition is registered by a 1-create apply.

Each stage needs its own owner authorization (section 11).

What this round completed:

- **Owner inputs:**
  - the operator email is recorded in the runbook and the Option A review;
  - the persistent secret is never force-deleted (new recovery script C-8R).
- **Findings:**
  - X-1 is eliminated: one probe CI step, verified on the combined tree;
  - X-2 is fixed: no hard-coded task revision;
  - X-6 is corrected: every US$0.35 statement is marked conditional, and the unbounded ALB case is stated.
- **Supersession:** #87, #88 and #89 are marked superseded, in titles, bodies and report banners. They stay open.
- **Cleanup:** the option 3 implementation proposal is written (PR #90, proposal only).

## 2. PR status and exact merge sequence

State at 10:55 UTC. Base `main` `49c51f36fb53d1e450c9cf8af58a969897d00623` (unchanged today).

| PR | Purpose | Head | State | CI on head [CI] | Outstanding |
| --- | --- | --- | --- | --- | --- |
| [#91](https://github.com/munaxa/munaxa-platform/pull/91) | Option A custody, cost and security review (WS5) | `b9bc718` | open | Terraform, Lint/Test, Façades: success; Accessibility running | none |
| [#90](https://github.com/munaxa/munaxa-platform/pull/90) | Independent cleanup design and implementation proposal (WS3) | `380f0f0` | open | Terraform, Lint/Test, Façades: success; Accessibility running | none (proposal; building it is Stage B) |
| [#92](https://github.com/munaxa/munaxa-platform/pull/92) | Probe task definition, disabled by default (WS2) | `4c632ab` | open | all success, including Accessibility | none |
| [#93](https://github.com/munaxa/munaxa-platform/pull/93) | Probe and offline tests (WS1); X-1 fix | `8180537` | open | all success, including Accessibility | depends on #92 for its CI step |
| [#95](https://github.com/munaxa/munaxa-platform/pull/95) | Consolidated readiness and this package | see PR | open | Lint/Test success on `f54c6e4`; re-runs on this commit | none |
| [#94](https://github.com/munaxa/munaxa-platform/pull/94) | Final runbook, the #87/#88/#89 content, the single README index | `0beda40` | open | Terraform, Façades: success; Lint/Test and Accessibility running | waits for all of the above |
| [#87](https://github.com/munaxa/munaxa-platform/pull/87), [#88](https://github.com/munaxa/munaxa-platform/pull/88), [#89](https://github.com/munaxa/munaxa-platform/pull/89) | Superseded by #94 | `3b2e088`, `9e3cf41`, `d9d6865` | open, titled `[Superseded by #94]` | green earlier | not to be merged on their own; the owner closes them after #94 |

**Merge sequence (squash, each on the owner's word):**

1. #91
2. #90
3. #92 (#92 must precede #93)
4. #93. Its squash commit is the probe pin `C`.
5. #95
6. #94 (last, because its README rows link to every folder above)
7. Close #87, #88 and #89 after #94 is merged.

Merge-conflict check [R]: the latest heads merge cleanly onto `49c51f3` in the order #91, #90, #92, #93, #95, #94 (local `git merge` simulation, re-run on these exact heads, #95 at `c1a9811`; probe and loader tests 72/72 on the result).

After the merges, outside Stage A:

- the enable PR for the probe pin (Stage C);
- the cleanup build PR (Stage B).

## 3. Corrected technical findings

| ID | Finding | Status | Where |
| --- | --- | --- | --- |
| BL-1 | Probe not written | **Resolved in code.** 15 checks, 54 tests (#93). It has not run in AWS | #93 |
| BL-2 | HTTP to HTTPS not testable from a task | **Resolved.** It becomes a `DescribeListeners` configuration check (301 to 443) | runbook section 9 |
| BL-3 | Email and custody open | **Resolved.** Option A, `admin.tamer@munaxa.com` | #91, runbook I-6 |
| BL-4 | Probe would hold the database-owner URL | **Resolved.** Separate task definition with only 2 secrets and no task role | #92 |
| BL-5 | Merge order | **Replaced** by section 2 | #94 `01-PR-CONSISTENCY` |
| X-1 | Duplicate probe CI step | **Eliminated.** One `setup-node` and one `node --test` step on the combined tree (lines 89 and 94) [R] | #93 `8180537` |
| X-2 | Hard-coded `:1` revision | **Fixed.** Step 0-6 reads the ACTIVE revision back and records it as `PROBE_TD`; `RunTask` uses `PROBE_TD`; a change on session day is a stop | runbook 4.1, 4.2, 6 |
| X-6 | US$0.35 stated as a ceiling | **Fixed.** It is marked conditional in the runbook (section 15), #90 (sections 1 and 7), #91, and in banners on all five earlier reports that state it, plus three README rows. The unbounded case is stated explicitly | #94 `01-PR-CONSISTENCY` section 6 |
| N-1 | C-8 rolled back by **force-deleting the persistent secret** (and rows F-4 and F-5 of #91 did the same) | **Fixed** (owner rule): no force delete of `identity-operator` anywhere. New **C-8R** rotates it in place with `PutSecretValue` and creates the bootstrap secret in one call, only while no account exists | #91 `b9bc718` |
| N-2 | The runbook treated independent cleanup as optional | **Changed** (owner rule): I-7 is required before the first session, with new hard stop **H-20** (the schedule must be `ENABLED` before `up`). The schedule fires at T0 + 2 h 55 min | runbook I-7, 0-8, H-20 |
| X-3 | The pin exists only after #93 is merged | Procedure ready (runbook 3.2) | — |
| X-4 | Probe download from GitHub at run time | Fails closed (`FAIL probe-source download`, exit 3) | loader |
| X-5 | Image trusts the RDS CA (`NODE_EXTRA_CA_CERTS`) | Info only, no action | — |
| N-3 | The confirmed email is now in a **public** repository | Owner's instruction; recorded so it is a conscious choice | #91, #94 |

## 4. CI and test evidence

| Evidence | Result | Kind |
| --- | --- | --- |
| `node --test 'infra/aws/stack/**/*.test.mjs'` on the combined tree, Node 22.23.4 | **72 tests, 72 pass, 0 fail** (54 probe, 18 loader) | [R] |
| Option A offline harness (`option-a-c8-offline-harness.py`) on the updated draft | 6 C-8 cases and 4 C-8R cases, every case `leak=False`; "persistent delete anywhere: False"; output matches the committed file byte for byte | [R], [M] |
| `terraform fmt -check -recursive infra/aws` with Terraform 1.16.5 (checksum-verified download) on the combined tree | **pass** | [R] |
| `terraform init` / `validate` / `test` locally | **Not run:** the session's network proxy refuses `registry.terraform.io`, so providers cannot be installed. No test result is claimed | — |
| `terraform test` (stack, mocked provider) on #92 | 28 passed, 0 failed (#92 report); job "Format, validate, mocked plan tests" success | [CI], [M] |
| "Format, validate, mocked plan tests" on #90, #91, #92, #93, #94, #95 heads | success on all six | [CI] |
| "Lint · Typecheck · Test · Build" | success on #90, #91, #92, #93, #95 (`f54c6e4`); running on #94 (head `0beda40`) | [CI] |
| Accessibility (Storybook) | success on #92 and #93; running on the rest. No PR touches UI code | [CI] |
| Earlier #95 failure (`e097d89`) | `@munaxa/auth` timing test "spends comparable work on both paths" (7.18 vs < 5), in a package no PR touches. Passed on the next commit | [CI] |

## 5. Probe architecture and isolation review

Re-verified on the combined tree [R]:

| Requirement | Result |
| --- | --- |
| Disabled by default | `identity_probe_source` defaults to empty and is not in `envs/nonprod.tfvars`, so the count is 0 and merging changes no plan |
| Only operator email and password injected as secrets | `secrets` names exactly `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` from `munaxa-nonprod/identity-bootstrap` |
| No database-owner credentials | No `DIRECT_DATABASE_URL`, migrate or service bundle, or RDS master secret. As a second layer, the probe deletes the three database variable names from its environment unread |
| No task role and no new IAM | No `task_role_arn`. The execution role is `identity_bootstrap_execution[0]`, unchanged. No `aws_iam_*` resource in any PR |
| Pin | The loader takes the commit and SHA-256 from Terraform; both are format-validated twice. The download comes only from `raw.githubusercontent.com/munaxa/munaxa-platform/<C>/…`, with `redirect: 'error'` and a 256 KiB cap. Runbook 3.2 computes `H` twice and requires the blob at `C` to equal the reviewed blob (`4cdb018` today, SHA-256 `f7a15787…6b79`; not the pin) |
| Fails closed | Loader tests cover a refused checksum (never imported), download errors, a non-200 status, redirects, too-large, bad formats and an unsafe environment. Each prints one sanitised `FAIL probe-source <code>` and exits 3 |
| TLS never disabled | Node's default verification. The loader refuses `NODE_TLS_REJECT_UNAUTHORIZED` and `NODE_OPTIONS`; the probe refuses `NODE_TLS_REJECT_UNAUTHORIZED=0`. Tests include a wrong-name certificate and an untrusted CA |
| No exposure in logs | Allow-listed output lines only, plus a final guard that drops any line containing the email or password. Tests cover formatting, sanitisation and "main prints only allow-listed lines and no credential" |

The environment names and values agree between the task definition and the probe (`00-…READINESS.md` table C.1). `PROBE_ALB_DNS` is the only `RunTask` override.

## 6. Terraform plan expectations

These are offline and mocked only. **No live plan exists**, and none is claimed.

| Change | Expected | Basis |
| --- | --- | --- |
| Merging #92 | no plan change | default-off count [M] |
| Stage C enable PR | **1 create**: `aws_ecs_task_definition.identity_probe[0]`; no update, replacement or destroy | mocked plan 86 to 87 addresses (#92) [M] |
| Stage B, bootstrap root | **2 in-place updates**: workload boundary, deployer policy | proposal section 10 [U] |
| Stage B, stack | **3 creates, 1 update**: state machine, cleanup role, its policy; backstop role policy | proposal section 10 [U] |
| Session `up` / `down` | unchanged by the probe definition (`skip_destroy`); with Stage B, the ALB may be deleted out of band by the cleanup, and the next `down` or `up` reconciles it [U] | — |

## 7. Independent cleanup proposal (summary)

The full proposal is `2026-11-11-identity-independent-cleanup-design/01-CLEANUP-IMPLEMENTATION-PROPOSAL.md` (PR #90). **It is a proposal only.**

- **Mechanism.**
  - Before `up`, Claude arms a one-time EventBridge Scheduler schedule at T0 + 2 h 55 min (`ActionAfterCompletion = DELETE`).
  - The schedule starts the Step Functions Standard state machine `munaxa-nonprod-session-cleanup`.
  - The state machine has six steps, each catching errors and continuing:
    1. delete the bootstrap secret (exact name, delete by ARN);
    2. scale the 10 services to 0;
    3. stop all tasks in the cluster;
    4. delete the ALB found by name `munaxa-nonprod`;
    5. stop RDS (retry 5 min × 12);
    6. verify, ending `FAILED` with the names of anything left.
  - No Lambda and no custom code.
- **IAM.**
  - One new role, trusted by `states.amazonaws.com` (source account and ARN), with nonprod-only resources and an explicit `Deny` on `identity-operator`.
  - The existing backstop role gains `states:StartExecution` on that one state machine.
  - The boundary and the deployer policy gain matching statements (bootstrap, root apply).
- **Gate.** New hard stop H-20: `up` is not dispatched unless `GetSchedule` shows `ENABLED` with the exact target and time.
- **Verification.** Execution history (`SUCCEEDED` or `FAILED` naming the remainder), CloudTrail per action, the schedule removed, the next preflight, and the budget alert.
- **Cost.** Under US$0.01 a session; idle US$0.00 [U on prices].

## 8. Option A custody procedure

The scripts are in #91 `supporting/option-a-connector-scripts.DRAFT.py`. They are drafts and have not been run.

1. **C-8 (one connector call).**
   - `GetRandomPassword` (40 characters) inside AWS, screened against the Identity password rules.
   - `CreateSecret munaxa-nonprod/identity-operator` (persistent: email, password, organisation).
   - `CreateSecret munaxa-nonprod/identity-bootstrap` (email and password).
   - Both use `alias/munaxa-nonprod-data`.
   - The call returns names, ARNs and version ids only; errors are returned as codes only.
   - The email is set to `admin.tamer@munaxa.com` in the session copy only. The committed draft keeps a placeholder that aborts.
2. **C-8v.** A separate metadata-only check.
3. **C-8R (recovery only).** Used if the persistent secret exists without a bootstrap secret and no account exists yet. It rotates the persistent value in place and creates the bootstrap secret, in one call.
4. **No `GetSecretValue` by Claude, ever.** Only the ECS agent (the bootstrap execution role) reads the bootstrap secret.
5. **C-16, after the probe.**
   - Exact-name check, then `DeleteSecret` by **ARN** with `ForceDeleteWithoutRecovery`, for the bootstrap secret only.
   - Verify with `DescribeSecret` (not found) and `ListSecrets` with `IncludePlannedDeletion` (0 exact matches).
   - Confirm the persistent secret is still present.
6. **The persistent secret is kept for recovery and never force-deleted.** If it is ever retired, use a 30-day recovery window.
7. **C-24, after the session.** A CloudTrail count-only custody check.
8. **L-A0 (open, accepted with Option A).** The AWS connector's server-side audit log cannot be inspected. The generated value exists in the connector's sandbox memory between `GetRandomPassword` and `CreateSecret`. Whether any server-side log keeps request parameters is **not verified**, and is not claimed safe. L-A2: CloudTrail cannot tell Claude's root calls from the owner's root console calls by identity.

## 9. Session cost and failure scenarios

| Scenario | Cost | Basis |
| --- | --- | --- |
| Normal session, about 2 h, Claude's `down` | **about US$0.20 to 0.22** | US$0.09 to 0.10 an hour, list prices, not re-priced today [U] |
| Normal session reaching the 3 h hard stop | **about US$0.30 to 0.35** | conditional: Claude's session and the connector stay available |
| Claude lost after `up`, **Stage B built and the cleanup succeeds** at T0 + 2 h 55 min | **about US$0.30 to 0.35** | proposal section 9 |
| Claude lost, cleanup not built or fails, a scheduled `down` runs (possibly hours late) | **about US$1.00** | full cost to the 21:00 backstop, then the ALB until that `down` |
| Claude lost, cleanup not built or fails, **both scheduled `down` runs dropped** | **no fixed upper limit: about US$0.89 a day (about US$27 a month) for the ALB** until someone runs `down` | the backstop cannot delete the ALB |
| Bootstrap secret left behind | US$0.40 a month; the same password also sits in the persistent secret | #91 |
| Persistent operator secret (Option A) | about US$0.40 a month, ongoing | #91 |
| Probe and one-off tasks | under US$0.02 | runbook 15 |
| Stage B cleanup per session | under US$0.01 | proposal 9 [U] |

**US$0.35 is never a guarantee.** With Stage B built, it becomes the expected worst case for a lost session, as long as AWS Scheduler and Step Functions work and the cleanup's own `Verify` passes.

## 10. Remaining risks and limitations

- The probe has never run against the real ALB, certificate, Identity or Redis. Only the session shows those.
- No live Terraform plan exists. The 1-create and the Stage B counts are predictions from mocked plans.
- Terraform tests were not re-run locally (registry blocked). CI ran them on #92.
- L-A0 and L-A2 (connector audit; root attribution).
- No MFA, no password reset route (OA-3), root-only operation; not fit for production (#89 section F).
- The cleanup depends on AWS Scheduler and Step Functions, and on Claude arming the schedule correctly. H-20 makes a missing schedule block `up`.
- Out-of-band ALB deletion and Terraform reconciliation are reasoned, not tested [U].
- Prices were not re-verified today.
- The confirmed email is in a public repository (N-3).

## 11. Owner approvals required, in four separate stages

Each stage is a separate written authorization. None is given today, and none implies another.

### Stage A: merge the preparation PRs

- **A-1.** Merge, squash, in this order: **#91, #90, #92, #93, #95, #94**. Each merge needs green required checks.
- **A-2.** After #94 is merged, close #87, #88 and #89 as superseded.

This changes no AWS resource and no Terraform plan.

### Stage B: build the independent cleanup (PR #90 proposal section 11)

- **B-1.** Claude opens the cleanup build PR. The owner approves its merge.
- **B-2.** The **bootstrap** apply by root: boundary and deployer policy, 2 in-place updates. This is an IAM change.
- **B-3.** The **stack** plan and apply: 3 creates and 1 update (state machine and IAM role and policies).
- **B-4.** The read-only `SimulatePrincipalPolicy` checks and one dry run of the state machine with nothing running.

### Stage C: register the probe task definition

- **C-1.** Claude opens the enable PR (`identity_probe_source = { commit = C, sha256 = H }`, expected changes exactly 1 create). The owner approves its merge.
- **C-2.** The owner approves the `aws-terraform.yml` **plan**. Claude dispatches it and shows the plan is exactly 1 create.
- **C-3.** The owner approves the **apply** of that saved plan. Then come the post-apply "No changes" plan and the read-back of `PROBE_TD`.

### Stage D: the Identity non-production testing session and its secret operations

- **D-1.** A named date and start time, within the 3-hour limit and before 18:30 UTC.
- **D-2.** Arming the one-time cleanup schedule before `up`, with gate H-20.
- **D-3.** The session itself: `aws-session.yml up`, the one-off tasks as root (db-admin, migrate, bootstrap, probe), the listener check, the count-only log checks, `down` and the verification.
- **D-4.** The secret operations C-8 (and C-8R if needed), C-8v, C-16 and C-24, with the email `admin.tamer@munaxa.com`.
- **D-5.** Written acceptance of the residual risks: L-A0, L-A2, R-1 (the secret left if everything fails), and the conditional cost figures in section 9.

Order: **A, then B and C (either order, both after A), then D.** D cannot be requested until B-4 and C-3 have been recorded.
