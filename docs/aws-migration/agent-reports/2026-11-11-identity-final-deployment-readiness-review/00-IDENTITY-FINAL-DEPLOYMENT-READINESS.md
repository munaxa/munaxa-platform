# Final deployment-readiness review: first Identity non-production session (11 Nov 2026)

Scope: technical readiness assessment of the first Identity-only Testing session (runbook steps 8
to 23) in account `229251310592`, `eu-central-1`. This was done by documentation and read-only
inspection of the repository and GitHub Actions only.

**Not done:**

- no AWS or connector call;
- no workflow dispatch;
- no setting, secret, IAM, Terraform, DNS or infrastructure change;
- no merge.

**This report is not deployment authorization.**

Labels:

- **[V]** verified here, from the repository or GitHub run metadata, today;
- **[R]** from raw evidence already in the repository;
- **[O]** owner-provided evidence, not independently inspected here.

---

## 1. Executive summary

- **Infrastructure.** Every infrastructure check passed in the last raw preflight output available
  here (05:43 UTC). The owner reports the same result for the 07:01 rerun: 13 of 14 PASS, no ERROR.
- **P-12.** The only failing check is P-12. Its raw result stays **FAIL**. The 10 denials are the
  investigated, accepted provider fallback (RESOLVED — EXPECTED BEHAVIOUR), and the evidence
  available here establishes that the 07:01 run lists those same 10 events (section 5).
- **G-4.** Owner-provided evidence matches the expected configuration. Administrator bypass is
  enabled and recorded (section 6).
- **No new blockers.** The remaining unknowns cannot be proven before the session runs:
  - the session deployer's create path, because `up` has never run;
  - the secret version ids;
  - the signing key pair;
  - the bootstrap secret's partial ARN.

  Each has a documented stop condition in the first-session runbook.
- **One evidence limitation.** The raw 07:01 preflight output did not reach this review (section 8,
  L-1).

## 2. Final verdict

**READY FOR OWNER APPROVAL**

This is a technical readiness assessment only. It is not deployment authorization and does not
permit a workflow dispatch, ECS execution, migration, bootstrap or secret operation.

**Why the raw P-12 FAIL is an accepted exception and not an unresolved failure:**

1. **Explained.** All 10 events were investigated read-only against CloudTrail, IAM, the bucket
   policy and SCPs.
2. **Root cause.** Terraform AWS provider 6.67.0 asks S3 Control for bucket tags. The deployer roles
   have no Allow for `s3:ListTagsForResource`, so this is an implicit deny. The provider then falls
   back to `GetBucketTagging`, which succeeded in the same second for every event.
3. **No effect.** Every run succeeded. The post-apply plan showed no changes. No write was denied.
   Nothing is unmanaged.
4. **Accepted and documented.** The owner accepted the denials (D-1, 05:54 UTC). The documented
   decision is: no IAM, bucket policy or SCP change, and no suppression of the events.
5. **Same events.** The 07:01 run's 10 denials are the same 10 events (section 5.3).

## 3. Scope and evidence reviewed

| Evidence                                   | Where                                                                                                                                                                                                                                                         | Label |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Merged preflight (PR #80, `d9ecb2f`)       | [post-merge verification §13](../2026-11-10-identity-post-merge-preflight-verification/00-IDENTITY-POST-MERGE-PREFLIGHT-VERIFICATION.md), script [`preflight-readonly.sh`](../2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh) | [V]   |
| Raw preflight output, 11 Nov 05:43 UTC     | [`preflight-20261111T0543Z.txt`](../2026-11-11-identity-preflight-run-review/evidence/preflight-20261111T0543Z.txt) and its [review](../2026-11-11-identity-preflight-run-review/00-IDENTITY-PREFLIGHT-RUN-REVIEW.md)                                                 | [R]   |
| Owner-run preflight, 11 Nov 07:01–07:03 UTC | The owner's summary in the task: P-1 to P-11b PASS, P-12 FAIL, P-13 PASS, `OVERALL: FAIL (1 check(s) failed)`, exit 1, root. **Raw output not available to this review**                                                                                       | [O]   |
| S3 investigation                           | [`00-S3-LISTTAGS-DENIAL-INVESTIGATION.md`](../2026-11-11-s3-listtags-denial-investigation/00-S3-LISTTAGS-DENIAL-INVESTIGATION.md), [events](../2026-11-11-s3-listtags-denial-investigation/evidence/cloudtrail-s3-listtags-events.json)                           | [R]   |
| Readiness checklist                        | [`00-IDENTITY-READINESS-STATUS.md`](../2026-11-11-identity-readiness-status/00-IDENTITY-READINESS-STATUS.md) (sections 5 and 6 as corrected by PR #83)                                                                                                         | [R]   |
| G-4                                        | Owner's UI inspection and screenshots, as reported in the task. The screenshots did not reach this review. Claude's own read-only attempt: PR #84 (`2026-11-11-identity-g4-environment-verification`, not merged)                                                | [O]   |
| First-session procedure                    | [`00-IDENTITY-FIRST-SESSION-PREPARATION.md`](../2026-11-10-identity-first-session-preparation/00-IDENTITY-FIRST-SESSION-PREPARATION.md) and the [runbook](../2026-11-09-identity-config-a1-preparation/02-IDENTITY-ONLY-RUNBOOK.md)                               | [R]   |
| A1 plan, apply, post-apply                 | [`01-REAL-PLAN-AND-APPLY.md`](../2026-11-10-identity-config-a1-continuation/01-REAL-PLAN-AND-APPLY.md)                                                                                                                                                      | [R]   |
| GitHub Actions and PR state, today         | Workflow runs and jobs, open PRs, one job log (run `42928482147`)                                                                                                                                                                                            | [V]   |

**Checks made here [V]:**

- **Script.** The SHA256 on `main` (`f594ab8`) is `21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c`, the expected value. The script, its `supporting/` folder, `infra/` and `.github/` are byte-identical to `d9ecb2f`. Since `d9ecb2f`, only report files under `docs/aws-migration/agent-reports/` changed (PRs #82 and #83).
- **G-1.** No change under `infra/` or `.github/` since `67904bc`, the A1 inputs. PASS.
- **G-2.** No AWS Terraform run is waiting or in progress. The 3 latest runs (93, 94, 95) are pull-request runs whose Plan and Apply jobs were **skipped**: mocked tests only, no AWS credentials. PASS.
- **G-3.** The latest scheduled AWS Testing session run is `42928482147` (11 Nov 00:04 UTC, `down`, `success`). PASS.
- **G-5.** The only open PR is #84 (docs only). No PR touching `infra/` is open. PASS.

## 4. Consolidated readiness matrix

"Blocks?" means "blocks owner approval of the session".

| #   | Area                                            | Evidence                                                                                                                                                                                                                                                                                             | Result                     | Limitation                                                                                                   | Blocks? |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | AWS account and region guard                    | [R] Caller root in `229251310592`, region `eu-central-1`, account guard PASS. Root accepted only with `ALLOW_ROOT_READONLY=yes`. [O] same at 07:01                                                                                                                                                      | PASS                       | Root is accepted by owner decision (ACCESS-POLICY), not a least-privilege identity                           | No      |
| 2   | RDS configuration and stopped state             | [R] P-2: stopped, `db.t4g.micro`, not public, deletion protection, encrypted, single AZ, parameter group `munaxa-nonprod-pg16` in sync, master secret active, VPC `vpc-0824ebbff902d2980`. [O] P-2 PASS at 07:01                                                                                    | PASS                       | Starting the database in a session is not tested by the preflight                                            | No      |
| 3   | ECS cluster and task definitions                | [R] P-3: cluster ACTIVE, 0 running, 0 pending, 0 services; exactly the 4 Config A1 families, one ACTIVE revision each; expected digests. [O] PASS at 07:01                                                                                                                                              | PASS                       | —                                                                                                            | No      |
| 4   | Secret references and version pinning           | [R] P-4: Identity 6 references pinned to `ad02f18e…`; migrate `DATABASE_MIGRATION_URL` pinned to `a3cc6622…`; bootstrap and db-admin pins as expected. [O] PASS at 07:01                                                                                                                              | PASS                       | Proves references, not that the secret contents work (first proven at steps 8, 10, 11)                       | No      |
| 5   | KMS and secret metadata                         | [R] P-5: data key Enabled; both bundles present, encrypted with the data key, pinned versions `AWSCURRENT`. [O] PASS at 07:01                                                                                                                                                                         | PASS                       | Metadata only; no value read (by design)                                                                     | No      |
| 6   | Bootstrap secret cleanup                        | [R] P-6: no `munaxa-nonprod/identity-bootstrap`, including ones scheduled for deletion. [O] PASS at 07:01                                                                                                                                                                                            | PASS                       | —                                                                                                            | No      |
| 7   | Absence of running resources                    | [R] P-7: 0 services, tasks, load balancers, target groups, NAT gateways, Elastic IPs, instances and public ENIs. [O] PASS at 07:01                                                                                                                                                                       | PASS                       | —                                                                                                            | No      |
| 8   | Automatic database stop backstop                | [R] P-8: 11 of 11 schedules enabled; database stop at 21:00 UTC on `munaxa-nonprod-pg`. [V] scheduled `down` run green at 00:04 UTC. [O] PASS at 07:01                                                                                                                                                 | PASS                       | —                                                                                                            | No      |
| 9   | ACM certificate                                 | [R] P-9: ISSUED, `*.test.munaxa.com` and `operator-test.munaxa.com`, not in use, valid to 22 May 2027. [O] PASS at 07:01                                                                                                                                                                             | PASS                       | Attachment to the ALB is first proven at step 21                                                             | No      |
| 10  | ECR image integrity and expected digests        | [R] P-10: API and migrate digests tagged `5277d71`; P-3 confirms the digests in the task definitions. [O] PASS at 07:01                                                                                                                                                                               | PASS                       | Image pull is first proven at step 8 (`CannotPullContainerError` is a stop)                                  | No      |
| 11  | ECS and ELB service-linked roles                | [R] P-11: both exist (the session deployer cannot create them). [O] PASS at 07:01                                                                                                                                                                                                                     | PASS                       | —                                                                                                            | No      |
| 12  | Session roles: trust, path, duration, policies  | [R] P-11b: path, ARN, 3600 s, no boundary, trust, exact inline and attached sets; 30 + 1 + 4 + 2 statements equal the code. [O] PASS at 07:01                                                                                                                                                          | PASS (documents)           | **Compares documents only. Effective permissions are not exercised under root** (section 8, L-2)            | No      |
| 13  | CloudTrail denials                              | [R] 05:43: 10 `s3:ListTagsForResource` implicit denials, all investigated; us-east-1 0. [O] 07:01: P-12 FAIL, 10 denials                                                                                                                                                                                | **Raw FAIL; RESOLVED — EXPECTED BEHAVIOUR** | Raw 07:01 list not seen; identity of the 10 events established by deduction (section 5.3)       | No      |
| 14  | Network topology                                | [R] P-13: VPC, 5 subnets, internet gateway attached, S3 endpoint on the public table only, exact route tables and associations, active default route, exact Config A1 security groups, default group without rules. [O] PASS at 07:01                                                                  | PASS                       | Endpoint policy, NACLs and DNS attributes not compared (post-merge §13.9)                                    | No      |
| 15  | GitHub environment G-4                          | [O] Owner UI inspection (section 6). [V] Consistent run metadata (run `42928482147`)                                                                                                                                                                                                                  | PASS (owner-verified)      | Not independently inspected by Claude; administrator bypass enabled                                         | No      |
| 16  | Remaining deployment prerequisites              | [R] First-session preparation sections 3.3, 6, 9 and 10; G-1, G-2, G-3, G-5 [V] PASS today                                                                                                                                                                                                             | NOT VERIFIED (by nature)   | Four items are provable only in the session (section 8, L-3); each has a stop condition                      | No      |

## 5. P-12 investigation and exception treatment

### 5.1 Raw result

The raw result for both runs today is **P-12 FAIL** and `OVERALL: FAIL (1 check(s) failed)`, exit
status 1. It is not rewritten as PASS anywhere.

### 5.2 Investigation result

**RESOLVED — EXPECTED BEHAVIOUR** (investigation verdict EXPECTED — no permission change required).

- **The events.** 10 unique requests: 5 runs × 2 buckets (`school-files` and `docs-files`), all
  during plan or refresh steps.
- **Each event:**
  - provider `terraform-provider-aws/6.67.0`;
  - implicit deny;
  - a successful `GetBucketTagging` by the same session, on the same bucket, in the same second;
  - from a run that concluded `success`.
- **No explicit deny or SCP issue.** SCPs do not apply in the management account.
- **Decision:** no IAM, bucket policy or SCP change, and no suppression.

### 5.3 Do the 07:01 denials match the investigated signature?

The raw 07:01 output is not available here, so the S-1 to S-8 check of the readiness status
(section 6) was not run on it. The match is established by deduction, from evidence that does not
depend only on the owner's summary:

1. **Same window.** The script's P-12 window starts at `2026-11-10T06:00:00Z` by default
   (`SINCE=${PREFLIGHT_SINCE:-…}`, script line 44). The 05:43 raw output shows this window.
   - The corrected command (readiness status §5) sets no override.
   - The investigated 10 events (10 Nov 06:05 to 11 Nov 00:05) therefore fall inside the 07:01
     window too.
2. **CloudTrail is append-only.** Events inside the window cannot disappear, so the 07:01 run must
   list at least those 10 events.
3. **No new AWS-credentialed run.** No GitHub workflow with AWS credentials ran between 00:05 and
   07:03 UTC [V]:
   - The latest AWS Testing session run is `42928482147` at 00:04.
   - The AWS Terraform runs since then (93, 94, 95) are pull-request runs whose Plan and Apply jobs
     were skipped.
4. **Same count.** The owner reports exactly 10 denials at 07:01.
5. **Conclusion.** The 07:01 set equals the investigated set, and those 10 events meet S-1 to S-8
   (investigation evidence).

**Limitation L-1:** the conclusion depends on two owner-provided facts:

- the denial count of 10;
- no `PREFLIGHT_SINCE` override.

Neither has been checked against the raw output. Pasting the raw 07:01 output, or attaching it to
the record, closes this. That takes no AWS call.

### 5.4 Treatment going forward

- Every later run reports the raw result verbatim.
- An accepted line is recorded only when every denial meets S-1 to S-8 (readiness status §6).
- The session's `up` and `down` runs will add 2 such denials each.
- Any denial outside the signature is a stop condition.

## 6. G-4 verification

**G-4 verdict: VERIFIED — G-4 MATCHES EXPECTED CONFIGURATION**, on owner-provided evidence [O].

Claude did not inspect the settings. The screenshots did not reach this review. The values below are
the owner's observations as reported in the task. Claude's own attempt (PR #84) could not read the
settings and found only consistent run metadata.

| Setting                 | Expected                                         | Observed (owner)                                       | Result        |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------ | ------------- |
| Required reviewers      | None, by design                                  | Disabled                                               | PASS [O]      |
| Wait timer              | None                                             | Disabled                                               | PASS [O]      |
| Deployment branches     | `main` only                                      | Selected branches and tags, exactly `main`             | PASS [O]      |
| Administrator bypass    | Record the actual setting                        | **Enabled**                                            | Recorded [O]  |
| Environment secrets     | None                                             | None                                                   | PASS [O]      |
| `AWS_CI_ROLE_ARN`       | `…:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session`       | Environment-level variable, correct value  | PASS [O]; value also seen in run `42928482147` [V] |
| `AWS_DEPLOYER_ROLE_ARN` | `…:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session` | Environment-level variable, correct value  | PASS [O]; value also seen in run `42928482147` [V] |

Administrator bypass was not a failure condition in the agreed checklist. Its effect is assessed in
section 7.

## 7. Security assessment

- **Root for the preflight.**
  - Root was the owner's accepted read-only identity, under ACCESS-POLICY and the 10 Nov decision.
  - The script refuses root unless `ALLOW_ROOT_READONLY=yes`.
  - The script uses only a read-only operation allowlist, and its SHA256 was gated before running.
  - Risk: root can do anything if misused. Here it was used through a pinned, reviewed script.
  - Accepted by the owner; not a blocker.
- **Effective deployer permissions not exercised.**
  - The session deployer's create path (`up`) has never run (first-session F-3).
  - P-11b proves the documents equal the code, not that they are sufficient.
  - Mitigations:
    - `up` refuses any plan outside the 11 session addresses;
    - any `AccessDenied` at step 8 is a stop condition, followed by `down`;
    - nothing outside the plan is applied.
  - Residual risk: a failed first `up`, at a small cost. Not a blocker.
- **Raw P-12 FAIL.**
  - Accepted, documented exception (section 5).
  - Monitoring stays honest: the events are not suppressed.
- **Administrator bypass enabled.**
  - There are no required reviewers or wait timer, so bypass has little to bypass.
  - Whether it also lets an administrator get past the `main`-only branch rule is not established
    here.
  - Independent controls stop a non-`main` run from getting AWS access:
    - both session jobs require `github.ref == 'refs/heads/main'` (`aws-session.yml` lines 57 and 98);
    - the CI role's OIDC trust requires `ref = refs/heads/main` and the environment subject (G2 bootstrap readiness; phase 4 security verification).
  - Low risk. Recorded, not a blocker.
  - Turning bypass off is an owner choice and is not proposed here.
- **Approval process.**
  - Because the environment has no required reviewer (by design, for the unattended nightly
    `down`), GitHub does not hold an `up` dispatch.
  - Approval is therefore procedural:
    - the owner gives explicit written approval in the project;
    - the owner then dispatches `up` on `main` (first-session O-4);
    - nobody else dispatches.
  - This is adequate for a single-owner project, provided only the owner has write access to
    dispatch. Collaborator access was not checked here.
- **Secrets.**
  - Bootstrap credentials are entered only at hidden prompts.
  - No `--overrides` carries a secret.
  - The bootstrap secret is deleted at step 16, and P-6 confirms it is absent now.

## 8. Outstanding risks and limitations

| #   | Item                                                                                       | Severity | Blocks approval? | How to close                                                                                                     |
| --- | ------------------------------------------------------------------------------------------ | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| L-1 | Raw 07:01 preflight output not available to this review                                    | Low      | No               | Owner pastes or attaches the raw output (no AWS call). Optional: run the S-1 to S-7 checker (readiness status §6) with read authorization |
| L-2 | Effective session-deployer permissions untested (`up` never run)                           | Medium   | No               | Exercised by step 8. Stop on `AccessDenied`, then `down`                                                           |
| L-3 | Secret version ids, signing key pair and bootstrap partial ARN proven only in the session  | Medium   | No               | Steps 8, 10, 11, 13 and 19 have hard stop conditions (first-session §6 and §7 known risks)                         |
| L-4 | G-4 rests on owner evidence; screenshots not seen by Claude                                | Low      | No               | Optional: attach the screenshots to the record                                                                 |
| L-5 | Administrator bypass enabled                                                               | Low      | No               | Owner choice; independent `main` controls exist (section 7)                                                      |
| L-6 | Evidence recency                                                                           | Low      | No               | The preflight is from 07:01 UTC today. Re-run it (readiness status §5) if any AWS-credentialed workflow runs, any PR touching `infra/` merges, or the session starts on another day |
| L-7 | DNS (step 9) is a manual Cloudflare change                                                 | Low      | No               | Owner action O-5, prepared; record per session (DNS-H1)                                                          |

**Internal consistency [V]:**

- The 05:43 raw output, the investigation evidence, the owner's 07:01 summary, the G-4
  observations and today's GitHub run history agree.
- No contradiction was found.

**Documented prerequisites.** The first-session preparation documents:

- the session window (start by 15:30 UTC, finish by 18:30 UTC, 3 h hard stop);
- the cost limit (about US$0.20 expected, US$0.35 at the hard stop);
- the dispatch inputs;
- every step's commands, expected evidence and stop conditions;
- the owner actions O-3 to O-9.

No undocumented infrastructure, secret, configuration or application prerequisite was found.

## 9. Exact next steps

1. **Owner (optional, recommended):**
   - attach the raw 07:01 preflight output to the record (closes L-1);
   - attach the G-4 screenshots (closes L-4).
2. **Owner decision:** approve or decline the first Identity session in writing. Name the start
   time, which must be no later than 15:30 UTC on the session day, and accept the corrected readings
   of steps 8 and 17 (F-1, F-2) and the hard stop (first-session §3.3).
3. **If the session is on another day,** or anything listed in L-6 happens first:
   - re-run the preflight with readiness status §5;
   - re-check G-1 to G-5.
4. **Only after explicit approval:** the owner dispatches `aws-session.yml` `up` on `main` and
   follows first-session §10, steps 8 to 23.

## 10. Deployment authorization

**Deployment authorization has not been granted.** This report does not authorize:

- dispatching `aws-session.yml` `up`;
- starting the database;
- starting ECS tasks or services;
- running migrations or bootstrap;
- creating, reading or deleting secrets;
- changing DNS;
- any other session step.

Each of these needs the owner's explicit approval.

Nothing was changed for this report:

- no AWS or connector call;
- no setting, variable, secret or protection rule;
- no IAM, Terraform, DNS or infrastructure change;
- no workflow dispatched;
- nothing merged.

The only repository changes are this report and its README index line.
