# 10 Independent review of Phase 7 (Agent 7)

Date: 5 Nov 2026. Reviewer: Agent 7 (authored none of the changes).
Scope: munaxa-platform PR #43 at head `744c67ce58782b7cec0616d5d801aca821bd83fa` (base main `7cd448d`; AWS runs bootstrap `46dfbd9`), the draft Phase 7 reports 01 to 08 and supporting files, and the merged product PRs identity#6 (`5277d71`), work#29 (`b490b25`), school#24 (`9671bcb`).

Rules kept: no AWS call of any kind, no GitHub write (GitHub read only through `mcp__github__*` read tools), CanteenHub, Render and Supabase out of scope. Labels: [V-repo] repository, [V-gh] GitHub read, [V-aws] earlier owner-pasted AWS output, [V-doc] Service Authorization Reference JSON (local copy fetched by Agent 2 at 06:52 UTC, `/tmp/claude-0/phase7/a2/sar/`), [L] local test or local evaluation, [E] inference, [U] unverified, [O] owner action.

**Local policy evaluation is not an AWS IAM simulation.** Nothing below proves AWS behaviour; simulation revision 3 must still run in AWS after the second re-apply.

Working copies: my own detached worktree `/tmp/claude-0/phase7/a7/wt` at 744c67c; render harness `/tmp/claude-0/phase7/a7/render` (744c67c) and `/tmp/claude-0/phase7/a7/render46` (46dfbd9); evaluator `/tmp/claude-0/phase7/a7/eval`; fake `aws` `/tmp/claude-0/phase7/a7/fakeaws`; G3 mock `/tmp/claude-0/phase7/a7/g3mock`; test copy `/tmp/claude-0/phase7/a7/tftest`.

## 1. Verdict and gates

No Blocker and no High finding. Three Medium findings are process or verification items that fail closed; they are conditions of the approval, not reasons to refuse it.

| Gate | Status |
| --- | --- |
| D-2 (residual risks) | **Met in documentation.** 01 has R1 to R20, descriptions verbatim (script diff, 20 of 20 identical), decisions exactly the owner's table, nothing extended, nothing called eliminated. R9 and R10 are closed in code only; they count as closed after the re-apply plus revision 3 pass [L, V-repo]. |
| D-3 (patches, simulation, review, second re-apply) | **Met, with condition M-1.** Patches are in PR #43, simulation revision 3 regenerated, this review done, runbook 08 prepared. The Phase 7 reports and the revision 3 script are not yet committed anywhere (untracked in the lead's clone). |
| IAM simulation (rev3) | **Locally verified, AWS pending.** sha256 `12cd2ca7...e22b` matches; my independent evaluator plus SAR resource-type rule gives 481/481 end to end through the real script with a fake `aws` [L]. The AWS run is [U] until after the re-apply. |
| Bootstrap runbook (08) | **Ready once PIN is filled.** Checks, stop conditions and rollback are correct; expected plan 0/5/0 independently reproduced [L]. |
| D-4 (backstop separate, G3 at 64) | **Code met; gate open.** Backstop off by default and in `nonprod.tfvars`; G3 stays 64. Backstop apply and its verification, and P4 verification, remain before the first session [L, O]. |
| D-5 (repo and tag protection, identity) | **Not met (owner actions).** 05's plan and JSON are correct and honest; nothing is applied, and the shared `tam2om` identity is unresolved. Does not block the bootstrap re-apply. |
| G3 baseline | **Preserved.** My mocked G3 plan at 744c67c: `64 to add, 0 to change, 0 to destroy`, addresses identical to run 41977870108 [L]. Real plan still [U]. |
| Products | **Not ready for a first session** (06 B-1 to B-5, B-7 to B-9 stand). The three merged product PRs only remove triggers and filters; none can publish, deploy or migrate on merge [V-gh]. Does not block the re-apply. |

## 2. Checks I ran myself

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive infra/aws` | exit 0 [L] |
| `terraform validate` bootstrap, stack | Success, Success [L] |
| `terraform test` bootstrap | 12 passed, 0 failed [L] |
| `terraform test` stack | 24 passed, 0 failed [L] |
| Offline render of all bootstrap policies at 744c67c and at 46dfbd9 (real provider, overrides, no endpoint) | Rendered; 68 managed resources in each [L] |
| Policy diff 46dfbd9 to 744c67c | Exactly 5 documents differ: `deployer_allow` nonprod and prod, `workload_boundary` nonprod and prod, `deployer_session` inline. Unchanged: deployer inline (both), `-allow-tagged` (both), `deployer-read`, `session-read`, every trust policy. No `resource`, `data`, `moved`, `count` or `for_each` line changed in the bootstrap diff. So the expected re-apply plan `0 to add, 5 to change, 0 to destroy` (policy only) is confirmed independently [L, V-repo] |
| Minified policy sizes | session inline 9,468 of 10,240; `-allow` nonprod 5,701 and prod 5,634 of 6,144; boundaries 3,000 and 2,743. Same as 02 [L] |
| Bootstrap tree at 744c67c | `b83d107719c5bfc4e2891cc15ab121509aae84aa`; `git diff --stat 46dfbd9 744c67c -- infra/aws/bootstrap` = 4 files, 225 insertions, 67 deletions, as in 08 [V-repo] |
| Simulation script sha256 | `12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b` (matches) [V-repo] |
| My own evaluator (written from scratch, string semantics) on all 481 cases | 480/481. The one difference is SR083.2, see §3.3 [L] |
| SAR resource-type and context-key check of all 481 cases (my own script) | Only SR083.2 names an ARN that is not a resource type of its action (intended canary). 14 rev2 read cases use `*` on actions with resource types; all passed in AWS run 2. Every non-global context key is a key of its service; context types used: string, stringList, boolean [V-doc, L] |
| Revision 3 end to end with my fake `aws` (my evaluator plus the SAR rule) | exit 0, `RESULT total=481 expected_match=481 ... complete=yes`, twice, identical output (deterministic). 499 AWS calls: sts 1, kms describe-key 1, iam list-attached 3, list-role-policies 4, get-policy 4, get-policy-version 4, get-role-policy 1, simulate-principal 431, simulate-custom 50. All read-only [L] |
| Preflight | 46dfbd9 policies: exit 2 (no NeverFromADeployerSession). Session policy without SessionNeverNetworkPlacement: exit 2. TestingBackstop added to prod boundary: exit 2. A mutated expected value with `STOP_ON_MISMATCH=1`: exit 1 after 1 call, `complete=no` [L] |
| `stop-database.sh` with Agent 3's `run-cases.sh` | 22 passed, 0 failed; `bash -n` and shellcheck clean [L] |
| Placement jq on Agent 4's 12 synthetic plans | 8 bad rejected, 4 good accepted (create, update, replace, down) [L] |
| Mocked G3 plan at 744c67c with `envs/nonprod.tfvars` (copy of the g3mock harness, not modified) | `64 to add, 0 to change, 0 to destroy`; `diff` against `fresh-plan-run-41977870108-addresses.txt` and against `supporting/g3-mocked-plan-e78aa92-addresses.txt`: identical. No `from_alb`, no backstop address [L] |
| PR #43 head on GitHub | `744c67c...`, open, `mergeable_state` clean [V-gh] |
| Product merge commits | identity `5277d719`, work `b490b257`, school `9671bcb1`: each removes only `push: tags: image/**` from a GHCR workflow and/or `paths-ignore` from `ci.yml`, plus comments and a runbook line [V-gh]. Remaining push triggers in those repos: Identity `ci.yml` on push to main (tests), ECR publish on `image/**` tag push only (behind `image-release`); School ECR publish is dispatch only [V-repo, local clones] |

## 3. Review of each claimed closure

### 3.1 IAM privilege boundaries (item 1)

- **Per-environment boundaries intact.** Both boundaries keep OwnSecrets, OwnKeys, OwnFileBuckets, ScheduledTasks, PassOwnRoles by own name, ThisRegionOnly, NeverTheOtherEnvironment, NeverMunaxaDocsProduction, MunaxaDocsImagesPullOnly. The deployer guardrails (NeverTheOtherEnvironmentByName/ByTag, NeverCreateForTheOtherEnvironment, ProtectStateKeyAndBucket, NeverSharedAliases, NeverMunaxaDocsOrBootstrap, NoSecretValuesNoUsersNoKeys) are byte-identical to 46dfbd9 (rendered `deployer_*` documents equal) and still flow into the session deployer through `source_policy_documents` [L].
- **No cross-environment access.** RT03/RT05/BK37/TB07/TB09 and the rev2 N-cases hold under my evaluator [L].
- **Session deployer narrower than the full deployer.** It gained only denies (SessionNeverSecurityGroupRules, SessionNeverNetworkPlacement, rule tags), lost four allows, and its Cloud Map create was narrowed to `service/*`. No new allow in the session policy [V-repo].
- **R9 and R10.** R9: no SG-rule allow remains and all seven rule actions are explicitly denied; placement denied in IAM where IAM can (ELB Set*, ENI modify, SG create/delete) and in the plan check where it cannot (ECS network configuration, ALB create). R10: NoLogOrDatabaseData in both `-allow` policies; the session has no logs data or RDS log-file allow. See L-1 for the enumerative list.
- **R11 to R13.** Closed in code as claimed (SD, SL, AC cases agree with my evaluator) [L].
- **New allows, looked at hard:**
  - `TestingBackstop` (nonprod boundary): raises the ceiling of every nonprod stack role to `rds:StopDBInstance` on `db:munaxa-nonprod-*` and `ecs:UpdateService` on `service/munaxa-nonprod/*`. A boundary grants nothing alone; only the backstop role's inline policy uses it. Every other nonprod role's inline policy is written by reviewed stack code, and the full nonprod deployer already holds both actions directly. No escalation, but the ceiling is wider than needed (L-2) [V-repo, E].
  - `iam:ListRoleTags` on own roles: a read, scoped like the rest of ManageOwnRoles. No escalation [V-repo].
  - `ServiceLinkedRoles` narrowing: the stack's resource types need only ECS, ELB and RDS service-linked roles (no autoscaling, no other SLR user in the resource list) [V-repo].
- **NeverFromADeployerSession (Deny `*` when `aws:SourceIdentity` present).** It can break only a stack-role session that carries a source identity. Stack roles are assumed by `ecs-tasks.amazonaws.com` (task and execution roles, `modules/service`, `ops.tf`, `docs.tf`) and `scheduler.amazonaws.com` (`services.tf`, `backstop.tf`). Service principals do not set a source identity, and a source identity propagates only through role chaining, not through `iam:PassRole` to a service [E, STS documentation semantics]. Terraform itself runs as the deployer, which has no boundary (SI20/SI21). First real proof is the first task start and the first backstop run (L-6). Removal is blocked because `iam:DeleteRolePermissionsBoundary` is denied and `PutRolePermissionsBoundary` admits only the own boundary [V-repo].
- **State bucket and KMS protections** unchanged (rendered deployer documents identical; D22/D23/N01-N14 agree) [L].

### 3.2 Residual-risk acceptance, 01 (item 2)

R1 to R20 present; the "Original description" column equals the Phase 6 register column word for word (my script compared all 20 cells) [L]. The decision column matches the owner's table; R11, R12, R13, R16, R17 are stated as not accepted; every acceptance says "accepted does not mean eliminated". R4 is worded "accepted for G3" exactly as the owner said; see I-3 for the scope gap this leaves after G3.

### 3.3 Simulation revision 3 (item 3)

- **Expected values.** I checked all 481 cases mechanically with my own evaluator and by hand reasoned the 13 changed cases and every SI, TB, NP, RT and BK case (89 cases; listing in `/tmp/claude-0/phase7/a7/eval/rows.json`). Deciding statements agree with 02's table (examples: D30.1 NoLogOrDatabaseData; SR081.1/.2, SR083.1, SR092.2, SR093.2, SR094.1/.2, SR095.1, S04.1/.2, N82.1 SessionNeverSecurityGroupRules; SR082.1 SessionNeverGroupTags; TB03-TB06 implicit; TB07/TB09 NeverTheOtherEnvironment; TB13 ThisRegionOnly; TB14 NeverFromADeployerSession; NP01-NP08 SessionNeverNetworkPlacement; NP10-NP16 OwnNames/OwnTagged/Ec2CreateSecurityGroup; RT06 NeverMunaxaDocsOrBootstrap; BK22 implicit without boundary; BK29 implicit for a wrong PassedToService) [L].
- **SR083.2 (`implicitDeny`) is right despite the new `Resource: "*"` deny.** My string evaluator says explicitDeny; the AWS simulator does not apply any statement, deny or allow, to an ARN that is not a resource type of the action. Run 1 proved it for denies too: N71.1 and N74.1 expected explicitDeny from `NeverCreateForTheOtherEnvironment` (Action `*`, Resource `*`) on an inapplicable ARN and got implicitDeny [V-aws, `2026-11-05-bootstrap-reapply/02` §1, §4]. With that rule applied my evaluator gives 481/481 [L].
- **SAR**, **preflight**, **exit codes**, **determinism**, **sha256**, **read-only**: all confirmed (§2).
- **Still [U]:** whether the simulator accepts `aws:SourceIdentity` and `acm:Export` as context entries (a refusal is an API error and fails visibly, not silently).

### 3.4 Session shutdown, P1 plus fixes (item 4)

- `database` job: runs for `down` and for every scheduled run, own concurrency group, 45 min timeout, fails closed through `stop-database.sh` [V-repo].
- `session` job final step: `always() && steps.deployer.outcome == 'success' && exists && (down || (up && !success()))`. Covers a failed, refused or cancelled `up` and every `down`; skips only a successful `up` [V-repo, E]. A refused `up` never starts the database (start step is after the plan check).
- Stop script: 22/22 cases; fails red on every unknown state, waits through transitional states, green on not found [L].
- Residual timing limits (cancel grace period, 30 min wait versus the one-hour credential) are documented by Agent 3 (F-5) and covered by the AWS backstop once applied; see L-5.

### 3.5 Scheduler permissions, P2/P3 (item 5)

- Role trust `scheduler.amazonaws.com` with `aws:SourceAccount`; inline policy only `rds:StopDBInstance` on the instance ARN and `ecs:UpdateService` on the cluster's services with `ecs:cluster`; nonprod boundary [V-repo].
- **Inert until applied twice over:** nothing is created while `session_backstop_schedule = ""` (G3 mock has no backstop address), and the boundary allow exists only after the second re-apply [L, V-repo]. The full nonprod deployer can create it (BK20-BK34); the session deployer can only read it (BK01-BK12) [L].
- Input key casing of the universal targets is [U] (Agent 3 says so); the D-4 verification run catches it before any session (L-7).

### 3.6 Network ingress, P4 plus placement jq (item 6)

- **False negatives.** For every created or updated `aws_ecs_service`, groups must equal exactly the module's own group id, public IP on, subnets non-empty and all public; for `aws_lb`, groups exactly the ALB group, internet-facing, public subnets only. Unknown ids fail closed. Replacements (`["delete","create"]` and `["create","delete"]`) are covered by `index("create")` (index 0 is truthy in jq). Everything else outside the seven session types is refused by the type filter, including every SG rule, task definition and SG [V-repo, L].
- **False positives on the first `up`.** In a session plan the groups and public subnets are persistent and already in state, so `planned_values` carries their ids, and the ECS service and ALB placement attributes come from those known ids and literals (`internal = false`, `assign_public_ip = true`). The newly created ALB in `up` therefore has known `security_groups` and `subnets` [E]. The address mapping `module.X[0].aws_ecs_service.this[0]` to `module.X[0].aws_security_group.this` matches the module (the SG has no count) [V-repo]. The only real-plan risk is that the provider's JSON layout differs from Agent 4's synthetic plans, which would refuse `up` visibly (fail closed) [U].
- **Precondition for `up`:** a service module (its SG and the persistent `from_alb` rule) exists only once its image is set, so images must be applied through the reviewed `aws-terraform.yml` path before any `up`. A session with a new image would be refused by both the type filter and IAM. This is 06 B-7 and is correct; it is not a defect of PR #43 [V-repo].
- `elasticloadbalancing:SetSecurityGroups` is denied to the session: Terraform's ALB create passes groups in `CreateLoadBalancer` and should not call SetSecurityGroups for an ALB [E]; if it does, `up` fails visibly (L-4).

### 3.7 Apply log exposure (item 7)

`aws-terraform.yml` plan and apply and `aws-session.yml` plan and apply all send stdout to a file, print only `Warning:` headings, delete the file, and keep `set -euo pipefail`; errors stay on stderr. The session job now masks the AccessKeyId too. The database job keeps credentials in shell variables only. Error diagnostics can still quote ids and ARNs (Agent 4 F-4, accepted Info) [V-repo]. The removed `paths:` filter only affects the `static` job (`if: github.event_name == 'pull_request'`, no credentials); `plan` and `apply` stay dispatch-on-main only [V-repo].

### 3.8 GitHub protection plan, 05 and rulesets JSON (item 8)

- JSON shapes match the REST API: ruleset `target`, `enforcement`, `conditions.ref_name.include/exclude`, `bypass_actors` (`RepositoryRole` id 5, modes `always`/`pull_request`), rules `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` with all five required parameters, `required_status_checks` with `strict_required_status_checks_policy` and `do_not_enforce_on_create`, tag rule `update` with `update_allows_fetch_and_merge`; environment PUT `wait_timer`, `prevent_self_review`, `reviewers[{type,id}]`, `deployment_branch_policy` [V-repo; API shape from my knowledge, E].
- It does not lock the owner out: Phase A has no approvals and the owner stays admin; Phase B keeps an admin pull-request bypass as break-glass [V-repo].
- It does not misrepresent review: it says plainly that Phase A is not independent review and that approvals mean nothing while agents act as `tam2om` [V-repo].
- Machine-user recommendation is sound and puts no credential in a session.
- Small points: L-8.

### 3.9 G3 plan integrity, 07 (item 9)

Confirmed independently (§2). `git diff e78aa92 744c67c -- infra/aws/stack infra/aws/modules` is empty, as 07 says [V-repo].

### 3.10 Product readiness, 06 (item 10)

06's blocker list stands for the first session (no product images, unset Valkey/Postgres digests, Identity keys, Cloudflare Access). B-6 (GHCR double trigger) is now resolved by identity#6 and work#29 [V-gh]. None of this concerns the bootstrap re-apply.

### 3.11 Second bootstrap runbook, 08 (item 11)

Pinned Terraform and provider hashes, pinned clone with tree and diff-stat checks, `init -reconfigure` with stop on migrate, state backup with the 68-resource count (I counted 68 managed resources in the render), saved plan with address, move and attribute checks and Sid checks, apply of the saved plan only, post-apply `-detailed-exitcode` 0, encryption check, revision 3 with sha256 check, and a rollback to 46dfbd9 plus revision 2. Commands are correct. If the attribute jq ever lists a key besides `policy`, the runbook stops, which is safe. See M-1 for the step 9 download.

## 4. Findings

### Blocker
None.

### High
None.

### Medium

**M-1. The Phase 7 reports and simulation revision 3 are not committed.** `git status` in `/home/claude/munaxa-platform` shows `docs/aws-migration/agent-reports/2026-11-05-phase7/` untracked; PR #43 at 744c67c contains no docs. Runbook 08 step 9 downloads the script from `main/.../2026-11-05-phase7/supporting/simulation/b2-owner-simulation.sh`. Today that would 404 (it fails closed: `curl -f` and the sha256 check stop it) [V-repo].
*Fix:* commit the reports (with this review) as docs only, either to PR #43 or to a docs PR merged before the re-apply. If they go into #43, confirm `git diff 744c67c <new head> -- . ':!docs'` is empty and the bootstrap tree is still `b83d1077`, then fill `PIN` with the merge SHA.

**M-2. Reports 03, 04 and 05 and the PR #43 body describe head e78aa92.** The lead notes on 03 and 04 cover the applied patches, but 05 §1 and the PR body still describe e78aa92 and do not list 58b80f4 (SessionNeverNetworkPlacement, placement jq, key-id mask, warning headings, `!success()`) or 744c67c (ListRoleTags). An owner approving "PR #43" from the body would not see the session-deployer and workflow changes [V-gh, V-repo].
*Fix:* update the PR body table with the two later commits, and add the same lead note to 05 (and 06).

**M-3. First live tests of three behaviours come only after the re-apply.** These are: the simulator's handling of `aws:SourceIdentity` and `acm:Export` context entries; services' sessions carrying no source identity (else every task and the backstop are denied); and the real `planned_values` layout for the placement check. Each fails closed and visibly, but each would stop the first session [U, E].
*Fix:* keep D-4's order (no session before the backstop and P4 are verified). Add to the verification checklist: one backstop invocation with no `AccessDenied` in CloudTrail, one ECS task start with no boundary denial, and one `up` whose plan check passes. Do not treat revision 3 alone as proof of these.

### Low

**L-1. R10 deny is an enumerated list against an `logs:*` allow.** Today's data-bearing actions on own log groups are covered. The rest only read configuration or authorize on resources OwnNames does not match. But any new logs data action AWS adds would be allowed (02 §3 says so) [V-doc, E].
*Fix (before production):* replace `logs:*` in OwnNames with the configuration actions Terraform uses (Create/Delete/PutRetentionPolicy/Tag/Untag/AssociateKmsKey/Describe).

**L-2. TestingBackstop raises the ceiling of every nonprod role.** It is not limited to the backstop role [V-repo].
*Fix:* add `Condition = { ArnLike = { "aws:PrincipalArn" = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-backstop" } }` in a later bootstrap change (it would need revision 4; not worth a third re-apply now).

**L-3. Backstop role trust uses only `aws:SourceAccount`.** Agent 3 argues `aws:SourceArn` adds little because PassRole is the real control. I agree for Testing [V-repo, E].
*Fix:* optional `ArnLike aws:SourceArn arn:aws:scheduler:eu-central-1:229251310592:schedule/default/munaxa-nonprod-backstop-*` in the backstop PR.

**L-4. `SessionNeverNetworkPlacement` assumes the ALB create never calls `SetSecurityGroups`, `SetSubnets` or `SetIpAddressType`.** [E, U]
*Fix:* none now. If the first `up` fails on one of them, fix forward rather than drop the deny.

**L-5. Cleanup after a timed-out `up` may be cut short.** The cancel grace period and the remaining credential time can stop it (Agent 3 F-5) [E].
*Fix:* none needed once the AWS backstop is live (D-4 order). Optionally pass `STOP_WAIT_SECONDS=300` in the session job's final step.

**L-6. `NeverFromADeployerSession` rests on documented STS semantics.** It is not yet observed in this account [E]. Covered by M-3's checklist.

**L-7. Universal-target input key casing is [U].** This applies to `DbInstanceIdentifier`, `Cluster`, `Service` and `DesiredCount` (Agent 3 states it).
*Fix:* the D-4 verification run must show a successful invocation for both targets before the first session.

**L-8. 05 details.**
- 05 points at `/tmp/claude-0/phase7/a5/rulesets/` instead of `supporting/rulesets/`.
- `can_admins_bypass` is not in `env-image-release.json` or the platform env files. A later PUT may therefore reset it to its default. I believe the current REST API accepts `can_admins_bypass` in the body [U].

*Fix:* correct the path, and add `"can_admins_bypass": false` to the environment JSON files. Keep the GET confirmation step.

### Info

- **I-1.** SR083.2 stays `implicitDeny` under the new `*` deny. This is consistent with the run 1 evidence (N71.1, N74.1). If AWS ever returns explicitDeny there, it is a simulator-semantics change, not a policy defect.
- **I-2.** Pending `aws-terraform-nonprod` concurrency replacement (Agent 3 F-6) is acceptable. The database stop has its own group.
- **I-3.** R4 is accepted "for G3" in the owner's words. `Ec2AdoptDefaultSecurityGroup` stays active through Testing. 01 does not extend the acceptance, but the owner may want to say explicitly whether it covers Testing sessions.
- **I-4.** The preflight checks markers, not full equality with the render. The runbook's clean post-apply plan (step 8) is the equality check, so this is sufficient.

## 5. Conditions attached to the verdict

The verdict below covers two things: merging PR #43 at head 744c67c, or a later head that differs only in docs; and then the owner's second root re-apply of `infra/aws/bootstrap` at the PR #43 merge commit, per runbook 08. Its conditions:

1. Resolve M-1 before step 9.
2. Bootstrap tree at `PIN` is `b83d107719c5bfc4e2891cc15ab121509aae84aa`.
3. The plan is exactly the 5 policy updates.
4. Revision 3 ends with exit 0 and `expected_match=481` before R7(b) and R9 to R13 count as closed in AWS.
5. No G3 verdict is given here.

READY FOR SECOND BOOTSTRAP APPROVAL
