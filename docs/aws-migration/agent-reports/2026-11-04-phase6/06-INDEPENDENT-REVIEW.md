# 06 Independent review, Phase 6 (Agent 7)

Date: 4 Nov 2026. Account 229251310592, eu-central-1. Code: munaxa-platform main `b6b4a0a92fec4fd770901a9d62dda8eefc0d2b24`,
bootstrap at `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (platform#38). Active in AWS: bootstrap at `1331ef8` (G2).

Labels: [V-repo], [V-gh], [V-aws] (none here), [E], [U], [O]. No AWS call, no AWS MCP tool, no aws CLI, no
GitHub write, no push. Terraform ran only offline through `evidence/tfx` (no credentials, HTTPS to 127.0.0.1:9,
Agent 2's filesystem mirror). **No AWS IAM simulation has run for any of this.**

Evidence (this folder): `evidence/tf-results.txt`, `evidence/policy-sizes.txt`, `evidence/eval/*`, worktrees
`wt-base`, `wt-p1`, `wt-p12`, `wt-a5all`, `wt-combo`, renders `render-{base,p12,a5all,combo}/rendered/*.json`.

## 0. Verdict

**NOT READY — BLOCKERS REMAIN**

The re-apply itself is safe, and no proposed patch has to be merged first. The blockers are three defects in
the material the owner would approve and run. Each takes minutes to fix. Once they are fixed, the owner can be
asked.

| # | Blocker | Evidence | Fix |
| --- | --- | --- | --- |
| BL-1 | The approval names no single SHA. The runbook pins `46dfbd9` "or the merge SHA of the patch PR". The owner simulation script only matches 46dfbd9. Rendered with p6-01+p6-02 it gives 1 mismatch (D30.1). With P1-P4 it gives 13 mismatches, 6 of them `allowed` to `explicitDeny`. With all patches it gives **14 mismatches**, so the script would exit 1 and the runbook says "stop". The register and runbook say only D30.1 changes. That is wrong for P4 | a2 `01-IAM-BOOTSTRAP-SECURITY.md:183`, `:294-298`; my `evidence/eval/summary-{p12,a5all,combo}.txt` (a3 evaluator on my own renders; base 332/332) | Ask for approval of one SHA. **Recommended: 46dfbd9 now**, because the expected list and the 332-call script were built and checked for it. The patches then follow in a second re-apply, with a regenerated script. If the lead instead merges the bootstrap patches first, regenerate the script for that SHA (the 14 flips, plus new cases for `NeverFromADeployerSession`, `TestingBackstop`, R11-R13) before asking |
| BL-2 | Runbook step 8 checks exit codes wrongly. `terraform plan -detailed-exitcode ... \| tail -3; echo "exit $?"` prints the exit code of `tail`, which is always 0. That is the same defect class (F2) Agent 3 corrected in the Phase 5 script | a2 `01-IAM-BOOTSTRAP-SECURITY.md:272` | `terraform plan -input=false -detailed-exitcode -no-color > ~/p6/replan.txt; echo "exit $?"; tail -3 ~/p6/replan.txt` (must be exit 0) |
| BL-3 | Step 9 runs `b2-owner-simulation.sh`, but the pinned clone (step 3) does not contain it. The script exists only in an untracked staging folder (`docs/aws-migration/agent-reports/2026-11-04-phase6/supporting/`, sha256 `b62dbbef...61002`, which I checked) | a2 `:289-296`; a3 `02-IAM-SIMULATION-EVIDENCE.md:176-181` | State exactly how the script reaches CloudShell (a commit on main with its URL, or Upload file), and add `sha256sum` = `b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002` as a stop condition before it runs |

## 1. Is the re-apply safe for root in CloudShell? Yes, with the stop rules as written

- **Plan content** [V-repo, E for the printed count]. Two separate offline harnesses (Agent 2 diff harness,
  Agent 4 state compare) give `19 to add, 6 to change (4 real), 0 to destroy, 1 move`. I read every
  resource that changes. It is all IAM: 4 real updates (nonprod boundary after the move, both deployer inline
  policies, `ci["nonprod"]` trust) and 2 displayed trust re-reads with identical content. `budget.tf`, `main.tf`
  and `providers.tf` are byte-identical between 1331ef8 and 46dfbd9 (`git diff` empty). So no budget, ECR,
  lifecycle, KMS key, alias, bucket or publisher change is possible from code. Any such change would be drift,
  and the runbook stops on it. I accept this.
- **Production**: `aws_iam_role_policy.deployer["prod"]` is narrowed and the prod deployer trust is re-rendered
  identically. `ci["prod"]` is untouched. No prod workload exists. The Docs bootstrap is a separate state.
  This root reads only `data.aws_iam_openid_connect_provider.github`, and the Docs roles and policies are not
  managed here [V-repo `iam.tf`, `main.tf`].
- **Strictly narrower than what is active** [V-repo `git show 1331ef8:infra/aws/bootstrap/iam.tf`]. The old
  boundary allowed prod secrets, every `rds!*` secret, every key, prod buckets and `iam:PassRole` on `*`. The
  new ones do not. `StackServices` (`ec2:*` and more on `*`) goes away. The `aws-nonprod-session` path drops
  from the full nonprod deployer to the session deployer. **One small widening is new**:
  `route53:AssociateVPCWithHostedZone`, `DisassociateVPCFromHostedZone` and `UpdateHostedZoneComment` on any
  hosted zone (`iam_allow.tf:337-341`) are absent from 1331ef8. Low impact, covered by R5.
- **Fail-closed windows**: apply ordering (inline narrowed before the attachments exist), session runs at OIDC
  until step 10, and B-1/N-1/CreateKey all fail closed. No step creates IAM users, keys or copied credentials.
- **Runbook mechanics I checked** [V-repo, E]. The expected list (`:209-238`) is in `LC_ALL=C` order and has 28
  lines (19 create, 6 update, 3 read). `init -reconfigure` cannot migrate state. Apply uses the saved plan only.
  The stop list covers budgets, ECR, KMS, bucket, publishers and `ci["prod"]`. One false stop is possible: the
  attribute jq at `:242-247` may flag provider-computed attributes. That is fail-safe and acceptable.
- **Timing**: tonight's scheduled `aws-session` run had not been created when I read the API (total 5 runs,
  latest 41747107325) [V-gh]. Step 0's 20:00-03:00 UTC exclusion matters.

## 2. Plan integrity and run evidence

- Run 41887322394: `head_sha 46dfbd920c6ee7ac940f0b7ca05656aca461f777`, workflow_dispatch on main, actor
  tam2om, success, created 18:27:21Z [V-gh, read by me]. The owner's 38-character SHA is this one with `bd`
  dropped. I accept Agent 4's 64 creates and four-way address match. I did not re-diff the 64 rows myself.
- I accept Agent 4's correction: that plan made only STS and state calls. It did not exercise any G3 create
  permission.

## 3. Proposed patches: applied and tested by me

All of them apply to b6b4a0a with `git apply`. p6-01 conflicts with P3 only in `tests/bootstrap.tftest.hcl`.
The combo patch differs from p6-01+p6-02 only in hunk position (diffed) [V-repo].

| Tree | bootstrap fmt / validate / test | stack fmt / validate / test |
| --- | --- | --- |
| base b6b4a0a | clean / Success / 9 passed | clean / Success / 14 passed |
| + p6-01 | clean / Success / 10 | 14 |
| + p6-01 + p6-02 | clean / Success / 11 | 14 |
| + P1-P4 | clean / Success / 10 | 17 |
| P1-P4 + combo | clean / Success / 12 | 17 |

Rendered policy sizes (minified) match Agent 2. In the combo, `-allow` is 5,682 of 6,144, the session inline
policy 9,182 of 10,240 and the nonprod boundary 3,000. With p6-01 alone the session inline policy would be
10,040, a margin of only 200 characters. My base render is identical to Agent 3's 11 documents.

- **p6-01: accept.** It adds no allow. ServiceLinkedRoles for ecs, elasticloadbalancing and rds only (the
  stack has no autoscaling or other service-linked role user, grep). The denies cover log and DB-file reads,
  exports, subscriptions and ECS Exec. R11 is fixed. Residual: the deny list is enumerative, so new CloudWatch
  Logs read actions would not be covered [E].
- **p6-02: accept.** It is a Deny only, in boundaries, and no deployer carries a boundary. AWS documents that
  SourceIdentity persists through chaining and cannot be changed [E]. ECS and Scheduler sessions set none [E].
  No simulation case covers it: add `simulate-custom-policy` on both boundaries with
  `aws:SourceIdentity=github-actions`, expected explicitDeny. It closes **only** the self-assumption path of
  R7 (see N-2).
- **P3: accept.** The allow sits in the nonprod boundary only and caps at two actions on nonprod ARNs. It is
  harmless without P2.
- **P4: accept, as one unit.** The bootstrap deny without the stack `admit_alb` change would break `up` once
  images exist. It invalidates 13 simulation cases (BL-1).
- P1, P2 and the a6 patches do not touch the bootstrap and are out of scope for this approval. I validated P2
  only through `terraform test`.

## 4. Findings missing from or understated in the register

| ID | Finding | Evidence | Status |
| --- | --- | --- | --- |
| N-1 | `secretsmanager:UpdateSecret` on `munaxa-<env>/*` can write secret **values** (SecretString). `NoSecretValuesNoUsersNoKeys` denies PutSecretValue but not UpdateSecret, so "values: never" holds for reads only. The same exposure exists in 1331ef8 | `iam_allow.tf:283-291`, `iam.tf:449-459` | Add to register (integrity, own env). There is no condition key, so accept or move value writes out of scope |
| N-2 | The full deployer can reach its own environment's data **without** self-assumption, so p6-02 does not close R7's data exposure. (a) `s3:PutBucketPolicy` on own buckets naming itself: a same-account resource policy grants object reads, with no identity deny. (b) `kms:PutKeyPolicy` on own-tagged keys granting itself Decrypt. (c) `rds:ModifyDBInstance` (master password, public access), snapshot restore. (d) `ecs:RunTask` with own roles (already noted) | `iam_allow.tf:393-404`, `:116-135`, `:253-266` | R7/R8 understate this. Follow-up patch: identity Deny of `s3:GetObject*` on `munaxa-<env>-*/*` in the guardrails (an explicit deny beats the bucket policy) and of `kms:Decrypt` outside `kms:ViaService`. Not a blocker: 1331ef8 is wider |
| N-3 | R7(a) says "an external account". In fact the trust can be `Principal: *` or the GitHub OIDC provider with any `sub`, which makes the role world-assumable with own-environment data rights | `iam_allow.tf:366-374` | Restate the severity. Recommend a free IAM Access Analyzer external-access analyzer (owner) |
| N-4 | The Route 53 VPC association grants are new versus the active policy (section 1) | as above | Low, R5 |
| N-5 | Citation errors: `variables.tf:87-99/101-112/114-118` are really lines 46-58, 60-71 and 73-77 (the file has 94 lines) | a2 `01:53`, `:46` | Correct the doc |

## 5. Phase 5 high and medium findings: closure check

- H-1, H-2, H-2b, H-3 and M-1: closed **in code** at 46dfbd9. I verified this by reading the code and by local
  evaluation (332/332). None is closed in AWS until the re-apply and the owner simulation. Agent 2 labels them
  correctly ("Active in AWS: No"). I reject any wording that calls them closed.
- B-1 (ViaAWSService for the RDS forward access session), N-1 (tag key), CreateKey's PutKeyPolicy lockout
  check, tag-on-create for KMS, ACM and Cloud Map, and service-linked role creation through the caller: the
  local evaluator cannot show any of these. They stay [U] until G3. They fail closed. RDS may be left tainted
  behind deletion protection. I accept them as R16.
- M-2 (cost backstop): still open. Agent 5's analysis is sound [V-gh run lag 3 h 12 min to 6 h 05 min]. P1/P2
  are for G3, not this approval.
- M-3 (logs): plans are clean. Apply stdout is still public (a6 B-7, patch). G3 must come first, not the
  bootstrap.
- M-4 / R15 (management account, no SCPs): open, owner decision.
- Repository protection: 0 approvals, a single identity (tam2om) for the owner and the agents, all repositories
  public [V-gh via a6]. That is the precondition of R9/R14. It is not a blocker for the re-apply, which narrows
  the unreviewed path.

## 6. False positives and corrections to other agents

- a2 `:295-298`: the claim that "no other case is affected" by the patches is false for P4 (13 cases) (BL-1).
- a5 §6 says only S04.1/S04.2 flip under P4. In fact SR081-SR083, SR092.2-SR095.1 and N82.1 flip as well.
- a4 `bootstrap-reapply-summary.txt` "CHANGE aws_s3_bucket_versioning.state" is an output-block parsing
  artifact. Confirmed: it shows output changes only.
- Phase 5 "2 budget artifacts" are harness-only (a2, a4). In a real plan they are a stop. I agree.

## 7. Not verified

Real IAM behaviour of anything here (no simulation). The printed count of 6 (deferred trust reads) [E]. Whether
`vars` in a job-level `env` sees environment variables (N-2, fail-closed) and whether `jobs.<id>.if` does not
(B-8) [E]. Rulesets and environments (not readable this phase). The 64-row G3 table (taken from Agent 4).
The SHA256SUMS files were not GPG-verified.

## 8. Summary

1. Verdict: NOT READY — BLOCKERS REMAIN, for three runbook and approval-material defects (BL-1 to BL-3), not for safety.
2. No patch must be merged before the re-apply. Re-applying 46dfbd9 is strictly narrower than 1331ef8, except for a small new Route 53 grant.
3. The plan of 19 add, 6 change (4 real), 0 destroy, 1 move is corroborated. Only IAM changes; no budget, ECR, KMS, bucket, Docs or prod workload change.
4. Run 41887322394 head is 46dfbd920c6e…f777 [V-gh].
5. I applied all patches and ran fmt/validate/test offline. Results: bootstrap 9/10/11/10/12, stack 14/14/14/17/17, all pass.
6. The owner script matches only 46dfbd9 (332/332 locally). The full patch set causes 14 mismatches.
7. The runbook prints the exit code of `tail`, not of `terraform plan` (step 8). The script is not in the pinned clone (step 9).
8. New: UpdateSecret writes values (N-1). Bucket-policy and key-policy self-grants bypass "no data reads" (N-2). R7 trusts can be world-wide (N-3).
9. p6-01, p6-02, P3 and P4 (as one unit) are accepted. p6-02 needs a SourceIdentity simulation case.
10. B-1, CreateKey, tag-on-create and SLR semantics stay [U] until G3. They fail closed.

Patches I propose (not written as files): runbook step 8 and step 9 corrections (BL-2, BL-3). A later guardrail
patch for N-2: Deny `s3:GetObject*` on own file-bucket objects, and Deny `kms:Decrypt` without `kms:ViaService`
rds/secretsmanager/s3. One simulation case for p6-02.

## 9. Re-review, 4 Nov 2026 (after the lead's runbook fixes)

What I reviewed: the lead's corrected copy
`/home/claude/munaxa-platform/docs/aws-migration/agent-reports/2026-11-04-phase6/01-IAM-BOOTSTRAP-SECURITY.md`.
That file is untracked in the clone and not yet on main. I diffed it against Agent 2's original
(`a2/01-IAM-BOOTSTRAP-SECURITY.md`). The diff has exactly 4 hunks, at lines 183, 272-273, 292-297 and 300-301.
Nothing else in section 6 changed [V-repo].

| Blocker | Lead fix | Check | Status |
| --- | --- | --- | --- |
| BL-1 | `PIN=46dfbd9...` is "the ONLY approved SHA". Lead decision: no bootstrap patch is merged before this re-apply | Line 183. The expected list, the 19/6/0 stop rule, the `7 files changed, 1295/136` check and the 332-call script (332/332 locally on my own base render) all belong to that SHA | **Closed** |
| BL-2 | Step 8 writes the post-apply plan to a file, then runs `echo "exit $?"` | Lines 272-273. `$?` is now terraform's own `-detailed-exitcode` (0 = no changes, 2 = changes); `tail` runs afterwards on the file | **Closed** |
| BL-3 | Step 9 fetches the script from main with `curl -fsSL` and checks its sha256 before running it | Lines 292-297. The staged `supporting/b2-owner-simulation.sh` hashes to `b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002`, which is Agent 3's script. `-f` makes curl fail on a 404, so if the reports PR is not yet merged step 9 fails closed | **Closed**, provided the reports PR is merged before the owner is asked (lead's stated precondition) [U until merge] |

I found no new defect in section 6 that affects safety. Remaining items, all non-blocking, to tidy before posting:

1. **Hash check is advisory only** (line 296). If the owner pastes lines 294-297 as one block, a failed
   `sha256sum -c` does not stop the `bash` line, and the script runs as root without a verified hash. Chain them:
   `... | sha256sum -c - && bash ~/p6/b2-owner-simulation.sh ~/p6/simulation.out; echo "exit $?"`. The risk is
   low: main is writable only by tam2om. The fix is one token.
2. **Stale text that contradicts BL-1.**
   - Lines 301-304 still end with "no other of its cases is affected by p6-01, p6-02, or Agent 5's P3 and P4".
     The new lead note before it says that is wrong (14 flips).
   - Section 8 item 1 (lines 374-375) still offers "46dfbd9 as is, or the merge SHA of a PR that adds p6-01, p6-02, P3 (and P4)".
   - `07-RESIDUAL-RISK-REGISTER.md:49` still says "If all are merged, re-apply once, at the merge SHA".
   - Delete or reword all three so that the approval material names 46dfbd9 only. The approval card itself must
     quote `46dfbd920c6ee7ac940f0b7ca05656aca461f777` and nothing else.
3. Everything else in sections 1 to 8 stands unchanged: N-1 to N-5, the [U] items, and the
   later-re-apply needs (regenerated script, SourceIdentity case, N-2 guardrail patch).

Re-review verdict: **READY FOR OWNER BOOTSTRAP APPROVAL**

The approval covers the root re-apply of `infra/aws/bootstrap` at `46dfbd920c6ee7ac940f0b7ca05656aca461f777`
only, with the corrected section 6. It is conditional on the reports PR being on main before the owner is asked,
so that the step 9 URL resolves. It does not cover G3, any patch, or a second re-apply.
