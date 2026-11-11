# Identity non-production: final approval package (11 Nov 2026)

Requested by the owner at 10:30 UTC, 11 Nov 2026 ("Fast-Track Final Preparation and Approval Package"). **Revised for the owner's "Final Pre-Merge Corrections" of 11:18 UTC:** the email is removed from public files, #94 is reconciled, and the cleanup timing and cost model is revised (revision 2).

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
| Operator email | `IDENTITY_OPERATOR_EMAIL`: owner-confirmed 10:30 UTC; authorized for the operator account only, not for publication (11:18 UTC). The value is kept only in the project's private runtime input |
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
  - the operator email is confirmed and is referred to as `IDENTITY_OPERATOR_EMAIL`. Its value is in the project's private runtime input only, not in any public file or PR description (11:18 UTC correction; history: section 12);
  - the persistent secret is never force-deleted (new recovery script C-8R).
- **Findings:**
  - X-1 is eliminated: one probe CI step, verified on the combined tree;
  - X-2 is fixed: no hard-coded task revision;
  - X-6 is corrected: every US$0.35 statement is marked conditional, and the unbounded ALB case is stated.
- **Supersession:** #87, #88 and #89 are marked superseded, in titles, bodies and report banners. They stay open.
- **Cleanup:** the option 3 implementation proposal, revision 2, is written (PR #90, proposal only). It fires at the hard stop, runs the ALB deletion in parallel with the database stop, is capped at 15 min, retries at H + 30 min and daily, and alarms on failure (section 7).

## 2. PR status and exact merge sequence

State at 11:40 UTC. Base `main` `49c51f36fb53d1e450c9cf8af58a969897d00623` (unchanged today). CI results are in section 4.

| PR | Purpose | Head | State | Outstanding |
| --- | --- | --- | --- | --- |
| [#91](https://github.com/munaxa/munaxa-platform/pull/91) | Option A custody, cost and security review (WS5) | `61db092` | open | none |
| [#90](https://github.com/munaxa/munaxa-platform/pull/90) | Independent cleanup design and implementation proposal revision 2 (WS3) | `38b0036` | open | none (proposal; building it is Stage B) |
| [#92](https://github.com/munaxa/munaxa-platform/pull/92) | Probe task definition, disabled by default (WS2) | `4c632ab` | open | none |
| [#93](https://github.com/munaxa/munaxa-platform/pull/93) | Probe and offline tests (WS1); X-1 fix | `8180537` | open | depends on #92 for its CI step |
| [#95](https://github.com/munaxa/munaxa-platform/pull/95) | Consolidated readiness and this package | this commit | open | none |
| [#94](https://github.com/munaxa/munaxa-platform/pull/94) | Final runbook, the #87/#88/#89 content, the single README index | `f988663` | open | waits for all of the above |
| [#87](https://github.com/munaxa/munaxa-platform/pull/87), [#88](https://github.com/munaxa/munaxa-platform/pull/88), [#89](https://github.com/munaxa/munaxa-platform/pull/89) | Superseded by #94 | `3b2e088`, `9e3cf41`, `d9d6865` | open, titled `[Superseded by #94]` | never merged; closed only after #94 is merged |

**Merge sequence (squash, each on the owner's word):**

1. #91
2. #90
3. #92 (#92 must precede #93)
4. #93. Its squash commit is the probe pin `C`.
5. #95
6. #94 (last, because its README rows link to every folder above)
7. Close #87, #88 and #89 after #94 is merged.

Merge-conflict check [R]: the heads above merge cleanly onto `49c51f3` in the order #91, #90, #92, #93, #95, #94 (local `git merge` simulation at 11:40 UTC; probe and loader tests 72/72 on the result).

After the merges, outside Stage A:

- the enable PR for the probe pin (Stage C);
- the cleanup build PR (Stage B).

## 3. Corrected technical findings

| ID | Finding | Status | Where |
| --- | --- | --- | --- |
| BL-1 | Probe not written | **Resolved in code.** 15 checks, 54 tests (#93). It has not run in AWS | #93 |
| BL-2 | HTTP to HTTPS not testable from a task | **Resolved.** It becomes a `DescribeListeners` configuration check (301 to 443) | runbook section 9 |
| BL-3 | Email and custody open | **Resolved.** Option A; email confirmed (`IDENTITY_OPERATOR_EMAIL`, private) | #91, runbook I-6 |
| BL-4 | Probe would hold the database-owner URL | **Resolved.** Separate task definition with only 2 secrets and no task role | #92 |
| BL-5 | Merge order | **Replaced** by section 2 | #94 `01-PR-CONSISTENCY` |
| X-1 | Duplicate probe CI step | **Eliminated.** One `setup-node` and one `node --test` step on the combined tree (lines 89 and 94) [R] | #93 `8180537` |
| X-2 | Hard-coded `:1` revision | **Fixed.** Step 0-6 reads the ACTIVE revision back and records it as `PROBE_TD`; `RunTask` uses `PROBE_TD`; a change on session day is a stop | runbook 4.1, 4.2, 6 |
| X-6 | US$0.35 stated as a ceiling | **Fixed.** It is marked conditional in the runbook (section 15), #90 (sections 1 and 7), #91, and in banners on all five earlier reports that state it, plus three README rows. The unbounded case is stated explicitly | #94 `01-PR-CONSISTENCY` section 6 |
| N-1 | C-8 rolled back by **force-deleting the persistent secret** (and rows F-4 and F-5 of #91 did the same) | **Fixed** (owner rule): no force delete of `identity-operator` anywhere. New **C-8R** rotates it in place with `PutSecretValue` and creates the bootstrap secret in one call, only while no account exists | #91 `b9bc718` |
| N-2 | The runbook treated independent cleanup as optional | **Changed** (owner rule): I-7 is required before the first session, with hard stop **H-20** (the full cleanup gate before `up`) | runbook I-7, 0-8, H-20 |
| N-4 | Cleanup revision 1 fired at T0 + 2 h 55 min, ran RDS retries for up to 60 min in sequence before the ALB, and had no maximum duration or failure report | **Fixed in revision 2** (owner, 11:18 UTC): P at the hard stop H, S at H + 30 min, R daily at 21:05 UTC; four parallel branches (the ALB never waits for RDS); RDS retries at most 10 min; execution at most 15 min; alarm email on failure; cost recalculated (section 9) | #90 `38b0036` |
| X-3 | The pin exists only after #93 is merged | Procedure ready (runbook 3.2) | — |
| X-4 | Probe download from GitHub at run time | Fails closed (`FAIL probe-source download`, exit 3) | loader |
| X-5 | Image trusts the RDS CA (`NODE_EXTRA_CA_CERTS`) | Info only, no action | — |
| N-3 | The confirmed email was written into public files on 11 Nov | **Removed from every branch head and PR description** (owner, 11:18 UTC). It remains in three earlier commits of the PR branches (section 12) | #91 `61db092`, #94 `f988663`, #95 (this commit) |

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
| Stage B, bootstrap root | **2 in-place updates**: workload boundary, deployer policy | revision 2, section 12 [U] |
| Stage B, stack | **7 creates, 1 update**: state machine, cleanup role and its policy, daily schedule R, SNS topic and its policy, failure alarm; backstop role policy update. Plus 1 SNS email subscription by root, outside Terraform | revision 2, section 12 [U] |
| Session `up` / `down` | unchanged by the probe definition (`skip_destroy`); with Stage B, the ALB may be deleted out of band by the cleanup, and the next `down` or `up` reconciles it [U] | — |

## 7. Independent cleanup proposal (summary)

The full proposal is `2026-11-11-identity-independent-cleanup-design/01-CLEANUP-IMPLEMENTATION-PROPOSAL.md` (PR #90). **It is a proposal only.**

- **Revision 2 (owner corrections, 11:18 UTC).**
- **Hard stop H** = T0 + 3 h or 18:30 UTC, whichever is earlier. Claude dispatches `down` by H − 15 min.
- **Schedules.**
  - **P at H.** At the hard stop, AWS itself starts the Step Functions Standard state machine `munaxa-nonprod-session-cleanup`.
  - **S at H + 30 min.** A retry, armed by Claude before `up`.
  - **R daily at 21:05 UTC.** A recurring run in Terraform, after the unchanged 21:00 backstop.
- **Execution.**
  - Four parallel branches, each catching its own errors:
    - delete the bootstrap secret (exact name, delete by ARN);
    - delete the ALB found by the name `munaxa-nonprod` and confirm it is gone;
    - scale the 10 services to 0 and stop all tasks;
    - stop RDS, retrying every 60 s, at most 10 times.
  - **The ALB never waits for RDS.**
  - Verify ends `SUCCEEDED`, or `FAILED` with what remains.
  - **Maximum execution: 15 min.** The ALB is normally gone by H + 2 min, and at the latest by H + 4 min.
- **If RDS is still running after the deadline:** the execution fails with an alarm email, then S, the 21:00 backstop and R try again. That adds about US$0.019 an hour.
- **Reporting.** Per-branch results in the execution history. A CloudWatch alarm on failed or timed-out executions emails the owner; root subscribes the owner at Stage B, and no address is in the repository.
- **IAM.**
  - One new role, trusted by `states.amazonaws.com` (source account and ARN), with nonprod-only resources and an explicit `Deny` on `identity-operator`.
  - The existing backstop role gains `states:StartExecution` on that one state machine.
  - The boundary and the deployer policy gain matching statements (bootstrap, root apply).
- **Gate H-20 (before `up`).** All of these must hold, or `up` is not dispatched:
  - P and S are `ENABLED` with the exact times, target and role;
  - R is `ENABLED`;
  - the state machine is `ACTIVE`;
  - the last R execution ended `SUCCEEDED`;
  - the alarm is `OK` and the subscription is confirmed.
- **Verification.** Execution history (`SUCCEEDED` or `FAILED` naming the remainder), CloudTrail per action, the schedule removed, the next preflight, and the budget alert.
- **Can the ALB stay indefinitely?** Not while one of P, S or R works. If the mechanism is persistently broken, yes: about US$0.89 a day, with a daily alarm email, and H-20 blocks the next `up`. **No design enforces a guaranteed ceiling.**
- **Cost of the mechanism.** Under US$0.01 a run, about US$0.10 a month for the alarm, and the daily R inside the free tier [U on prices].

## 8. Option A custody procedure

The scripts are in #91 `supporting/option-a-connector-scripts.DRAFT.py`. They are drafts and have not been run.

1. **C-8 (one connector call).**
   - `GetRandomPassword` (40 characters) inside AWS, screened against the Identity password rules.
   - `CreateSecret munaxa-nonprod/identity-operator` (persistent: email, password, organisation).
   - `CreateSecret munaxa-nonprod/identity-bootstrap` (email and password).
   - Both use `alias/munaxa-nonprod-data`.
   - The call returns names, ARNs and version ids only; errors are returned as codes only.
   - The email (`IDENTITY_OPERATOR_EMAIL`) is set from the private runtime input in the session copy only. The committed draft keeps the placeholder `<IDENTITY_OPERATOR_EMAIL>`, which aborts.
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
| Normal session, about 2 h, Claude's `down` | **about US$0.20** | US$0.09 to 0.10 an hour, list prices, not re-priced today [U] |
| Normal session to the hard stop (`down` by H − 15 min, finished by about H − 5 min) | **about US$0.26 to 0.30** | conditional: Claude's session and the connector stay available |
| Claude lost; cleanup P at H succeeds (ALB gone by H + 2 min, database stopping by H + 5 min) | **about US$0.31**, up to about US$0.35 with the ALB's fourth partial hour | #90 revision 2, section 9 |
| Claude lost; P fails; retry S at H + 30 min succeeds | **about US$0.33 to 0.40** | same |
| Claude lost; P and S fail; the daily run R at 21:05 UTC succeeds | **about US$0.09 to 0.10 for each hour from T0 to 21:05 UTC**: about US$0.50 to 0.56 for a 15:30 start, about US$0.82 to 0.91 for a 12:00 start | same |
| RDS alone still running after a cleanup | adds about US$0.019 an hour, normally until the 21:00 backstop the same day | same, section 4 |
| Cleanup mechanism persistently broken (or not built) and both scheduled `down` runs dropped | **no fixed upper limit: about US$0.89 a day (about US$27 a month) for the ALB**, with a daily alarm email when the cleanup is built | the backstop cannot delete the ALB |
| Cleanup not built, Claude lost, a scheduled `down` runs | about US$1.00 | why Stage B is required first |
| Bootstrap secret left behind | US$0.40 a month; the same password also sits in the persistent secret | #91 |
| Persistent operator secret (Option A) | about US$0.40 a month, ongoing | #91 |
| Probe and one-off tasks | under US$0.02 | runbook 15 |
| Stage B cleanup per session | under US$0.01 | proposal 9 [U] |

**US$0.35 is never a guarantee, and no design here enforces a ceiling.** With Stage B built, about US$0.35 is the expected cost of a lost session when the run at the hard stop succeeds. The bound weakens step by step if it fails, and disappears only if the mechanism is persistently broken.

## 10. Remaining risks and limitations

- The probe has never run against the real ALB, certificate, Identity or Redis. Only the session shows those.
- No live Terraform plan exists. The 1-create and the Stage B counts are predictions from mocked plans.
- Terraform tests were not re-run locally (registry blocked). CI ran them on #92.
- L-A0 and L-A2 (connector audit; root attribution).
- No MFA, no password reset route (OA-3), root-only operation; not fit for production (#89 section F).
- The cleanup depends on AWS Scheduler and Step Functions, and on Claude arming the schedule correctly. H-20 makes a missing schedule block `up`.
- Out-of-band ALB deletion and Terraform reconciliation are reasoned, not tested [U].
- Prices were not re-verified today.
- The confirmed email remains in the history of three PR branches until the owner chooses an option in section 12.

## 11. Owner approvals required, in four separate stages

Each stage is a separate written authorization. None is given today, and none implies another.

### Stage A: merge the preparation PRs

- **A-1.** Merge, squash, in this order: **#91, #90, #92, #93, #95, #94**. Each merge needs green required checks.
- **A-2.** After #94 is merged, close #87, #88 and #89 as superseded. They are never merged.

**Stage A authorizes merges only.** It authorizes no AWS change of any kind: no Terraform plan or apply, no workflow dispatch, no ECS task, no secret operation, and no IAM, KMS, network, DNS, Cloudflare or production change. No PR in the sequence changes a Terraform plan.

### Stage B: build the independent cleanup (PR #90 revision 2, section 13)

- **B-1.** Claude opens the cleanup build PR. The owner approves its merge.
- **B-2.** The **bootstrap** apply by root: boundary and deployer policy, 2 in-place updates. This is an IAM change.
- **B-3.** The **stack** plan and apply: 7 creates and 1 update (state machine, IAM role and policies, daily schedule, alarm, topic). Root then creates the SNS email subscription from the private runtime input, and the owner clicks AWS's confirmation link.
- **B-4.** The read-only `SimulatePrincipalPolicy` checks and one dry run of the state machine with nothing running.

### Stage C: register the probe task definition

- **C-1.** Claude opens the enable PR (`identity_probe_source = { commit = C, sha256 = H }`, expected changes exactly 1 create). The owner approves its merge.
- **C-2.** The owner approves the `aws-terraform.yml` **plan**. Claude dispatches it and shows the plan is exactly 1 create.
- **C-3.** The owner approves the **apply** of that saved plan. Then come the post-apply "No changes" plan and the read-back of `PROBE_TD`.

### Stage D: the Identity non-production testing session and its secret operations

- **D-1.** A named date and start time, within the 3-hour limit and before 18:30 UTC.
- **D-2.** Arming the one-time cleanup schedules P (at H) and S (at H + 30 min) before `up`, with gate H-20.
- **D-3.** The session itself: `aws-session.yml up`, the one-off tasks as root (db-admin, migrate, bootstrap, probe), the listener check, the count-only log checks, `down` and the verification.
- **D-4.** The secret operations C-8 (and C-8R if needed), C-8v, C-16 and C-24, with the confirmed `IDENTITY_OPERATOR_EMAIL` from the private runtime input.
- **D-5.** Written acceptance of the residual risks: L-A0, L-A2, R-1 (the secret left if everything fails), and the conditional cost figures in section 9.

Order: **A, then B and C (either order, both after A), then D.** D cannot be requested until B-4 and C-3 have been recorded.

## 12. The operator email in commit history (owner decision, not part of Stage A)

The literal address is gone from every **branch head** and every **PR description**. A check of all nine PR heads (#87 to #95) at 11:40 UTC found 0 matches [R]. It is still present in **three earlier commits**, which stay public on GitHub:

| PR | Commit that added it | Later commit that removed it |
| --- | --- | --- |
| #91 | `b9bc718` (report and draft-script comment) | `61db092` |
| #94 | `d8f061e` (runbook I-6) | `f988663` |
| #95 | `c1a9811` (this package) | this commit |

These commits stay reachable through the PRs' "Commits" tabs and by SHA, even after a squash merge. **A squash merge alone does not remove them.** It keeps the address off `main`, but the PR branches and their pull-request refs keep the old commits.

Options, for the owner to choose; none has been done:

1. **Accept.** Squash-merge as planned (the address never reaches `main`), and delete the three head branches after merging. The old commits stay reachable through the PRs' history and by SHA.
2. **Rewrite the three branches and force-push**, so their history no longer contains the address. This needs the owner's explicit approval, because it rewrites history on shared branches. GitHub still keeps the old commits reachable by SHA, and through the PRs' "force-pushed" timeline entries, for an unspecified time.
3. **Option 2, then ask GitHub Support** to remove the cached views and unreachable commits for those PRs. That is the only route that removes them from GitHub itself. It is an owner action, through GitHub's support form.

Rotating the address itself is not needed for security, because the operator account does not exist yet. Whether the address keeps receiving unwanted mail is the owner's judgement.
