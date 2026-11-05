# Phase 7: IAM remediation and owner simulation revision 3

**Date:** 5 Nov 2026
**Authors:** Agent 2 (IAM and residual risks), consolidated by the lead
**Account and Region:** 229251310592, eu-central-1

**Code reviewed:** munaxa-platform PR [#43](https://github.com/munaxa/munaxa-platform/pull/43), head `744c67ce58782b7cec0616d5d801aca821bd83fa`. Its bootstrap tree is `b83d107719c5bfc4e2891cc15ab121509aae84aa`.

**Active in AWS:** the bootstrap at `46dfbd920c6ee7ac940f0b7ca05656aca461f777` [V-aws, owner re-apply on 5 Nov].

**Labels used in this report:**

| Label | Meaning |
| --- | --- |
| [V-repo] | Repository evidence |
| [V-doc] | Public Service Authorization Reference JSON, fetched 5 Nov 06:52 UTC |
| [V-aws] | Earlier output pasted by the owner |
| [L] | Local test or local evaluation |
| [E] | Inference |
| [U] | Unverified |
| [O] | Owner action required |

No AWS call and no GitHub write were made for this report. **Local policy evaluation is not an AWS IAM simulation. Revision 3 has not been run in AWS.**

## 1. Summary

1. **The second re-apply changes policy text only.** The bootstrap change from 46dfbd9 to 744c67c touches IAM policy content and nothing else. An offline diff harness gives `Plan: 0 to add, 5 to change, 0 to destroy`, and only the `policy` attribute changes [L].
2. **Revision 3 has 481 calls.** Each is a read-only IAM simulation call. They are made up of:
   - the 332 calls of revision 2, of which 13 have a new expected value;
   - 149 new calls.
3. **Expected values come from the policy text.** Every expected value was derived by hand from the policy statements. A local evaluator agrees on 481 of 481 when run against the rendered 744c67c policies [L]. When revision 2 is run against the same render, it mismatches on exactly the 13 intended cases [L].
4. **Every case is valid against the Service Authorization Reference.** All 481 cases use a real action, a matching resource type and valid condition keys: 0 problems [V-doc].
5. **All policies are within the IAM size limits.** The tightest are the session inline policy, at 9,468 of 10,240 characters, and `-allow` nonprod, at 5,701 of 6,144 [L].
6. **Script sha256:** `12cd2ca763a9109de72eca8a0d1ffc6663acff7e470d9199bc7e2a803566e22b`. It is in [`supporting/simulation/b2-owner-simulation.sh`](supporting/simulation/b2-owner-simulation.sh).
   - The diff from revision 2 is [`b2-owner-simulation.rev2-to-rev3.diff`](supporting/simulation/b2-owner-simulation.rev2-to-rev3.diff), sha256 `8056f3ef8ce9b26e7e8b1aa42a14437b46a002f3e5d2bfae26fea3a4a448c935`.
   - Revision 2 was `5186cbc6…89fd205`. It is still the right script for 46dfbd9.

## 2. What each patch changed [V-repo]

The line numbers below refer to commit 58b80f4. Commit 744c67c adds only `iam:ListRoleTags` to ManageOwnRoles.

| Source | Sid | File | Effect |
| --- | --- | --- | --- |
| p6-01 | ServiceLinkedRoles | iam_allow.tf | `iam:CreateServiceLinkedRole` is now limited to `aws-service-role/{ecs,elasticloadbalancing,rds}.amazonaws.com/*`. It used to be `aws-service-role/*` |
| p6-01 | NoExportableCertificates | iam_allow.tf | Denies `acm:RequestCertificate` when `acm:Export` is `ENABLED`. The match is case-insensitive |
| p6-01 | NeverExportCertificates | iam_allow.tf | Denies `acm:ExportCertificate` |
| p6-01 | NoLogOrDatabaseData | iam_allow.tf | Denies 9 logs data actions, `rds:DownloadDBLogFilePortion`, `rds:DownloadCompleteDBLogFile` and `ecs:ExecuteCommand` |
| p6-01 | SessionDiscoveryWithOwnTags | iam_session.tf | The session's request-tag `CreateService` is now only on `service/*` |
| p6-01 | SessionDiscoveryTagOnCreate | iam_session.tf | `servicediscovery:TagResource` is in its own statement. Residual R3 remains |
| p6-02 | NeverFromADeployerSession | iam.tf | Both boundaries deny every call made while `aws:SourceIdentity` is present |
| P3 | TestingBackstop | iam.tf | **Nonprod boundary only:** allows `rds:StopDBInstance` on `db:munaxa-nonprod-*` and `ecs:UpdateService` on `service/munaxa-nonprod/*` |
| P4 | SessionNeverSecurityGroupRules | iam_session.tf | Explicitly denies the session the 7 security-group rule actions |
| P4 | Removed statements | iam_session.tf | SessionIngressOnOwnGroups, SessionNeverEdgeOrDatabaseGroups, SessionNewRules and SessionRuleTagsOnCreate are gone |
| P4 | SessionNeverGroupTags | iam_session.tf | Now also covers `security-group-rule/*` |
| Phase 7 (Agent 4, F-1) | SessionNeverNetworkPlacement | iam_session.tf | Denies the session `elasticloadbalancing:SetSecurityGroups`, `SetSubnets`, `SetIpAddressType`, `ec2:ModifyNetworkInterfaceAttribute`, `CreateSecurityGroup` and `DeleteSecurityGroup` |
| Phase 7 (Agent 2) | ManageOwnRoles | iam_allow.tf | Adds `iam:ListRoleTags` on the deployer's own stack roles, a read the provider may need when it refreshes a role |

## 3. Residual risks in code (register numbering)

The code comments number two risks the other way round from the register:
- Register **R9** is the session security-group rules. Code comments call it "R10".
- Register **R10** is the data reads. Code comments call it "R9".

| Risk | Status in code |
| --- | --- |
| R7 | **Partly closed.** A boundary refuses everything to a session that carries a source identity. Both deployer trusts require one, and AWS keeps it through role chaining [E]. Two things stay open: the content of role trusts, and the self-grants through bucket and key policies (R8, R19). |
| R9 | **Closed in code.** The session deployer has no rule action, and each rule action is explicitly denied. Tags on groups and rules are denied. Network placement is denied as well. |
| R10 | **Closed in code for the listed actions.** The list is enumerative, so a logs read action that AWS adds later would not be covered [E]. |
| R11, R12, R13 | **Closed in code.** |

**None of this is active in AWS** until the second re-apply has run and revision 3 has passed.

## 4. Tests [L]

| Check | Result |
| --- | --- |
| `terraform fmt -check` | Clean |
| `terraform validate` | Success |
| `terraform test` (bootstrap) | 12 passed, 0 failed at e78aa92, 58b80f4 and 744c67c |
| Evaluator: revision 2 on a 46dfbd9 render | 332/332 |
| Evaluator: revision 2 on a 744c67c render | Mismatches on the 13 cases in §6.1 only |
| Evaluator: revision 3 on a 744c67c render | 481/481 |
| Service Authorization Reference check | 481 cases, 0 problems |
| `bash -n`, `shellcheck` | Clean |

## 5. Service Authorization Reference results [V-doc]

For each of the 481 calls, the check confirmed four things:
- the action exists;
- the resource ARN matches one of the action's resource types (or the call uses `*` where the action has none);
- every context key is a global key or a key of that service;
- every `ContextKeyType` is valid.

Every action pattern and condition key in every rendered statement was also checked.

These facts shaped the cases:
- `acm:RequestCertificate` has no resource type, and `acm:Export` is one of its keys.
- `logs:GetLogEvents` uses `log-stream`.
- `servicediscovery:TagResource` has no resource type. That is why R3 stays.
- Only `ModifySecurityGroupRules` has a `security-group-rule` resource.

**Two points are unverified [U]:**
- **Context entries.** It is not confirmed that the simulator accepts `aws:SourceIdentity` and `acm:Export` as context entries. If it refuses one, the call is counted as an API error, and the script fails visibly.
- **Size of policy members.** The 2,000-character limit on policy members was observed, but it is not documented. The boundaries are therefore split into smaller documents:
  - nonprod: 1,463, 1,342 and 271 characters;
  - prod: 1,448 and 1,333 characters.

## 6. Revision 2 to revision 3

**Script size:** 696 lines and 481 calls.
- By expected result: 215 allowed, 175 explicitDeny, 91 implicitDeny.
- By call type: 431 `simulate-principal-policy` and 50 `simulate-custom-policy`.
- In all it makes 499 AWS calls, every one read-only.
- Every line that was unchanged from revision 2 is byte-identical.

**Harness behaviour:**
- **Preflight (exit 2).** The script stops with exit 2 before simulating unless the live policies are the 744c67c ones. It checks for these markers:
  - `NeverFromADeployerSession` in both boundaries;
  - `TestingBackstop` in the nonprod boundary and not in the prod one;
  - `NoLogOrDatabaseData`, `NoExportableCertificates`, `NeverExportCertificates` and `iam:ListRoleTags` in both `-allow` policies;
  - `SessionNeverSecurityGroupRules` and `SessionNeverNetworkPlacement` in the session inline policy;
  - `SessionIngressOnOwnGroups` no longer present.

  Against the 46dfbd9, e78aa92 and 58b80f4 policies, the script exits 2 [L].
- **Errors (exit 1).** An API error counts as a failure (`api_errors`). So does an expected value that is not a decision (`harness_errors`). Any mismatch or any error ends with exit 1.
- **Pass (exit 0).** Exit 0 needs 481 matching calls with 0 errors.
- **Stop early.** With `STOP_ON_MISMATCH=1`, the script stops at the first failure.
- **Success line:** `RESULT total=481 expected_match=481 unexpected_mismatch=0 api_errors=0 harness_errors=0 expected_total=481 complete=yes`.

### 6.1 Expected values that changed (13)

| Case | Revision 2 | Revision 3 | Deciding statement |
| --- | --- | --- | --- |
| D30.1 | implicitDeny | explicitDeny | NoLogOrDatabaseData |
| S04.1, S04.2, SR094.1, SR094.2, SR095.1, N82.1 | implicitDeny | explicitDeny | SessionNeverSecurityGroupRules |
| SR081.1, SR081.2, SR083.1, SR092.2, SR093.2 | allowed | explicitDeny | SessionNeverSecurityGroupRules. The session allows were removed |
| SR082.1 | allowed | explicitDeny | SessionNeverGroupTags, which now covers rules |

**Why 13 and not 14:**
- Phase 6 counted 14 changed cases. The fourteenth, SR083.2, was already corrected in revision 2 and stays `implicitDeny`. Revoke has no rule resource.
- SR092.1, SR093.1, N80.1 and N81.1 stay `explicitDeny`, now through the new statement.

### 6.2 Added cases (149)

Every row, with its deciding statement, is in [`supporting/simulation/rev3-case-changes.tsv`](supporting/simulation/rev3-case-changes.tsv). A Markdown copy is in [`rev3-case-table.md`](supporting/simulation/rev3-case-table.md).

| Group | What it shows |
| --- | --- |
| LD (R10) | Log and database data reads are explicitly denied to both deployers, including across environments. Normal writes such as PutRetentionPolicy, DescribeDBLogFiles and UpdateService stay allowed |
| SL (R12) | Service-linked roles for ecs, elasticloadbalancing and rds are allowed. Others are implicitly denied |
| AC (R13) | `acm:Export=ENABLED`, in either case, is explicitly denied. An absent key or DISABLED is allowed. ExportCertificate is explicitly denied |
| SD (R11, R3) | A session service on `service/*` with its own tags is allowed. An untagged foreign namespace is implicitly denied. A prod namespace is explicitly denied |
| SI (R7) | Each boundary explicitly denies every call made with any source identity. Calls without one are allowed. The deployers have no boundary, so they are unaffected |
| TB (P3) | The nonprod boundary allows stopping the database and scaling services in. The prod boundary allows neither, and other-environment, other-region and source-identity calls are denied |
| SG (R9) | All 7 rule actions, and rule and group tags, are explicitly denied to the session. The full deployers keep their rights on their own groups |
| BK (backstop) | The session can read and refresh the backstop role and schedules. It cannot change them. The full nonprod deployer can create them. The prod deployer cannot |
| NP (F-1) | The 6 placement actions are explicitly denied to the session. The full nonprod deployer is still allowed them on its own resources |
| RT (ListRoleTags) | Allowed on the deployer's own roles. Explicitly denied on the other environment's roles and on bootstrap roles. Implicitly denied on foreign roles |

## 7. Mock runs with a fake `aws` [L]

| Run | Exit | Result |
| --- | --- | --- |
| Local decisions, run twice | 0 | 481/481. The two outputs are identical, so the script is deterministic |
| Older policies (46dfbd9, e78aa92, 58b80f4) | 2 | The preflight stops the run |
| Every call answers `allowed` | 1 | 266 mismatches |
| Every call returns an API error | 1 | `api_errors=481` |
| Malformed RequestCertificate calls | 1 | `api_errors=9` |
| `STOP_ON_MISMATCH=1` | 1 | Stops after 2 calls, `complete=no` |
| An invalid expected value | 1 | `harness_errors=1` |

## 8. Second re-apply plan and policy sizes [L]

**How the plan was derived.** The harness first applies 46dfbd9 into state, with every resource overridden. It then plans 744c67c against that state.

**Result:** `0 to add, 5 to change, 0 to destroy`. Only `policy` changes, on these five resources:
- `aws_iam_policy.deployer_allow["nonprod"]`
- `aws_iam_policy.deployer_allow["prod"]`
- `aws_iam_policy.workload_boundary["nonprod"]`
- `aws_iam_policy.workload_boundary["prod"]`
- `aws_iam_role_policy.deployer_session["nonprod"]`

There is no move, replace or destroy. The full list is in [`expected-reapply2-changes.txt`](supporting/simulation/expected-reapply2-changes.txt), sha256 `25c175df…9e95`.

**Why nothing else changes.** Between 46dfbd9 and 744c67c these files are unchanged: `main.tf`, `budget.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `backend.tf` and the lock file.

**What the harness cannot see.** Drift in the real AWS state is not modelled [E]. The runbook stops on any drift.

**Policy sizes**, in minified characters:

| Policy | Size | Limit |
| --- | --- | --- |
| `-allow` nonprod | 5,701 | 6,144 |
| `-allow` prod | 5,634 | 6,144 |
| `-allow-tagged` nonprod / prod | 3,702 / 3,663 | 6,144 |
| Boundary nonprod / prod | 3,000 / 2,743 | 6,144 |
| Deployer inline nonprod / prod | 6,796 / 6,812 | 10,240 |
| Session inline | 9,468 | 10,240 |

## 9. Backstop permissions check

**Statements involved:**

| Principal | Statements | What they cover |
| --- | --- | --- |
| Session deployer | RefreshOwnRoles | The five role reads, including ListRoleTags |
| Session deployer | ConfigurationReads | `scheduler:GetSchedule` and `ListSchedules` |
| Full nonprod deployer | OwnRolesWithOwnBoundary, ManageOwnRoles, PassOwnRoles (includes `scheduler.amazonaws.com`) | Creating and passing the backstop role |
| Full nonprod deployer | OwnNames on `schedule/*/munaxa-nonprod-*` | The schedules |

The names in `stack/backstop.tf` match these statements: the role `/munaxa-shared/munaxa-nonprod-session-backstop`, and the schedules `munaxa-nonprod-backstop-*` in group `default`.

**Result: no blocker.** Two points remain [E]:
- that Scheduler sets no source identity, which matters because p6-02 would otherwise block the role;
- that the `ecs:cluster` condition works at run time.

## 10. Still unverified

- **Results in AWS [U].** Revision 3 has not been run. It needs the second re-apply first.
- **Simulator context entries [U].** Whether the simulator accepts `aws:SourceIdentity` and `acm:Export` as context entries.
- **Real-state drift [U].**
- **Provider calls on delete [U].** Whether deleting a role makes the provider call DetachRolePolicy.
