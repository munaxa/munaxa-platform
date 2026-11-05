# Second bootstrap re-apply: independent review of the GetLogEvents diagnosis

**Date:** 5 Nov 2026. **Reviewer:** independent IAM security reviewer (did not write 00/04/06/07).
**AWS calls:** none. No credentials, no GitHub writes, no CanteenHub/Render/Supabase. No file in the repo was edited.

Labels: [V-repo] repository at `6b8997a` · [V-doc] AWS documentation fetched in this review, or the SAR JSON · [L] local analysis · [E] inference · [U] unverified · [O-ev] owner evidence as quoted in the drafts.

## Scope

Drafts `00-EXECUTIVE-RESULT.md`, `04-SIMULATION-REV3.md`, `06-MISMATCH-ROOT-CAUSES.md`, `07-REMEDIATION-PLAN.md` and `supporting/getlogevents-diagnostic.sh` (uncommitted, in `2026-11-05-second-bootstrap-reapply/`). Checked against `infra/aws/bootstrap/{iam_allow,iam,iam_session}.tf` at `6b8997a`, the renders in `phase7/a2/supporting/rendered-744c67c/`, the SAR file `phase7/a2/sar/logs.json` (fetched 06:52 UTC), the rev3 script, and the run 1 precedent (`2026-11-05-bootstrap-reapply/02`).

## Method

1. `git diff 744c67c 6b8997a` (the whole tree, not only bootstrap) is empty, and `git cat-file` confirms that `744c67c` exists. So the renders are byte-for-byte the source of `6b8997a` [V-repo]. The working tree `iam_allow.tf` also equals `6b8997a`.
2. I wrote my own local matcher, independent of the lead's. It runs every statement of all 14 rendered documents against `logs:GetLogEvents` and the three stream ARNs, and takes account of Action/NotAction, Resource/NotResource and Condition [L].
3. I checked the rev3 script's `sim`/`decision`/`check`/preflight (lines 71-195) and case lines 226-227 and 530-552, and the rev2-to-rev3 diff.
4. I checked the diagnostic: its sha256, `bash -n`, the call count, that it calls no AWS API other than `simulate-*`, and its jq expressions, which I ran on sample JSON.
5. I fetched AWS docs: `API_SimulatePrincipalPolicy` and the IAM User Guide page "Testing IAM policies with the IAM policy simulator".

## Findings

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | High | **The diagnostic's interpretation table is not exhaustive.** It covers only some outcomes. Missing: (a) a B row on a form that A says is applied returns **implicitDeny**. That is the exact R10 failure mode, and the table handles only `allowed`. (b) B1/B3/B7/B9 now return explicitDeny, so rev3 does not reproduce. (c) A4 = implicitDeny, so the simulator applies nothing even on `*`. (d) A1 = implicitDeny but A5 = explicitDeny. (e) A1 = allowed with A5 ≠ explicitDeny. (f) A8/A9, the controls, have no row at all. (g) A decision of `null` (empty `EvaluationResults`) is not treated as ERROR. There is no catch-all, so a result can still be fitted after the run. | `07` §2 table; script lines 181-185 [V-repo]; jq run on an empty result gives `null` [L] |
| F2 | Medium | **Verdict wording overclaims.** "SIMULATION EXPECTATION DEFECT IDENTIFIED" asserts a cause that `00`, `06` §1 and `07` all mark as not proven by AWS evidence [E, medium-high]. Until the diagnostic runs, the root cause is unresolved. | `00` l.20-22; `06` l.30, 37 |
| F3 | Medium | **Row 2 of the table depends on a field the jq may not fill.** It needs "`MatchedStatements` naming the `-allow` policy", but the jq reads only the top-level `EvaluationResults[0].MatchedStatements`. When `--resource-arns` is given, matched statements may be reported per resource, under `ResourceSpecificResults[].MatchedStatements`, which is not extracted. It also records `StartPosition.Line` without `Column`, which cannot tell statements apart in a compact document. | script l.183-184 [V-repo]; field placement [U] |
| F4 | Low | `summary.tsv` drops `MissingContextValues`, `OrganizationsDecisionDetail`, `PermissionsBoundaryDecisionDetail` and `EvalDecisionDetails`. The raw JSON keeps them, but only the TSV is requested. | script l.175-185; `07` §2 |
| F5 | Low | **"Three independent statements" is an overclaim.** No single case has three matching statements: D30.1 has one (the deny), LD01.1 and LD30.1 have two (the deny and `OwnNames`), and LD50.1 has two (the deny and `NeverTheOtherEnvironmentByName`). `00` says "two more statements" for "the same request", which is also wrong for any single request. The argument still holds across cases. | `06` l.28; `00` l.42-44; my matcher [L] |
| F6 | Low | **The strongest precedent is not cited.** Run 1 N71.1/N74.1 show a **`Resource: "*"` Deny** (`NeverCreateForTheOtherEnvironment`) returning implicitDeny on an ARN outside the action's resource types, and N70.1 shows the same for a `*` Allow. SR083.2, which `06` does cite, used a specific resource pattern, so it is weaker support for "even `*` is not applied". | run1 `02` §4 [V-repo] |
| F7 | Low | **The `-allow-tagged` policy is left out of the statement inventory** (§3.2) and of the list of policies the principal simulation evaluates (§3.9). It is attached to both deployers, and preflight checks it. I confirmed that no statement in it matches `logs:GetLogEvents`, so the conclusion is unchanged. | rev3 script l.86-87; `iam_allow.tf` l.452-466 [V-repo]; matcher [L] |
| F8 | Low | **Line-number errors in `06`.** The deny is cited as lines 424-436 (§2) and 420-436 (§3.1); the comment is 422-425 and the statement is 426-436. "No boundary on the deployers" cites `iam.tf` 18-41 (the boundary locals); the deployer role is `iam.tf` 190-197, which has no `permissions_boundary`. | `iam_allow.tf`, `iam.tf` at `6b8997a` [V-repo] |
| F9 | Low | **Confidence is stated three ways.** `00` says "high confidence"; `06` §1 says [E, high] and then [E, medium-high]. One value should be used: medium-high until the test. | `00` l.22; `06` l.28, 30 |
| F10 | Low | **Label errors.** `06` §4 LD30.1 has "no prod log groups exist [V-repo]", which is a live-state claim, so [E]. `07` §4 proposes `list-attached-role-policies` as a new check, but preflight already ran it (`expect_attached`), so that check adds nothing. | rev3 l.86-87 |
| F11 | Info | **Prod has no logs-action evidence.** The "8 other logs actions" are all on the **nonprod** deployer (LD02.1-LD09.1). For prod, only LD31.1 (ECS) and LD32.1 (RDS) show the deny. It is the same rendered statement, so the risk is low. | rev3 l.531-548 [V-repo] |
| F12 | Info | Other `logs:*` writes reachable through `OwnNames` on own groups (`DeleteDataProtectionPolicy`, `PutMetricFilter`, `PutTransformer`, `AssociateKmsKey`) can change how log data is protected or processed. These are pre-existing and belong to L-1. They are not caused by these mismatches. | SAR `logs.json` [V-doc] |

## 1. IAM semantics

- **`Resource: "*"` matches every resource ARN, and an applicable explicit Deny overrides any Allow.** This is standard evaluation logic [E; this review did not fetch the evaluation-logic page]. `allowed`, `explicitDeny` and `implicitDeny` mean what `06` §4 says.
- **The fetched simulator pages do not document how the simulator treats an ARN that does not fit the action's resource type** [V-doc].
  - `API_SimulatePrincipalPolicy` says only that each action is evaluated "for each resource".
  - The User Guide warns that "results can differ from your live AWS environment".
  - So the claim "the simulator applies no statement" is [E], supported by run 1 evidence: SR083.2, N70.1, N71.1 and N74.1 (F6).
  - **The new element here is unsupported:** that the simulator rejects an ARN which *does* fit the SAR `log-stream` type. That is exactly what the diagnostic must prove.
- **One plausible mechanism, not proven [U]:** the simulator's `log-group` template, `log-group:${LogGroupName}`, may classify the stream ARN as a log group, and `GetLogEvents` does not accept that type.

## 2. Statements, ARNs, other explanations

**Confirmed [V-repo + L]:**
- `NoLogOrDatabaseData` is in `deployer_allow`, and so in both `-<env>-allow` policies (attached at `iam_allow.tf:477`).
- It is a Deny with no condition, no `NotAction`, no `NotResource`, and `Resource: "*"`.
- My matcher finds exactly what `06` §3.7 says matches.
- The deployer roles have no `permissions_boundary` (`iam.tf:190-197`).

**Other explanations, each excluded or bounded:**
- **Conditioned denies.** `ThisRegionOnly` and `NeverInProtectedVpcs` use `NotAction`, so they fail the region or VPC condition. The tag-conditioned denies fail because no tag context was supplied.
- **Policy splitting.** It applies only to `simdoc` boundary calls; `sim` uses the live role.
- **Role path.** The ARN includes `/munaxa-shared/bootstrap/`. A wrong ARN would be an API error.
- **Policy version.** Preflight reads the default version, which is what the simulator uses. The same statement gave explicitDeny for LD02.1 to LD09.1, so a partial version cannot be live.
- **`--query`.** It takes `EvaluationResults[0]`, the only result for one action and one resource. Pagination does not change that.
- **`decision()`.** It passes `implicitDeny` only on rc 0 with an exact string.
- **SCPs.** The account is the Organizations management account, which SCPs do not affect [E].
- **RCPs.** The simulator does not evaluate them [V-doc].
- **Eventual consistency.** It cannot affect one Sid inside one policy version. A rerun (B1/B3/B7/B9) checks it anyway, but F1(b) has no interpretation for it.

**Conclusion:** no explanation in the policy text remains [L]. The simulator-model explanation is the only candidate left, but it is unproven.

## 3. Change the deny or change the test? Which verdict?

**Changing the deny is neither needed nor safe.** A Deny on `*` cannot match more. Narrowing it, or widening an Allow, only weakens R10 [L]. Agreed.

**Changing the test is appropriate**, after the diagnostic confirms the cause:
- re-target the 5 requests;
- keep every expected value;
- add 4 canaries.

**Why this is sufficient.** The Deny's resource is `*`, so the live deny does not depend on which ARN form the service authorizes against. An explicitDeny observed for `GetLogEvents` on **any** form the simulator evaluates is enough evidence that the live statement applies to the action [E, high].

**On the verdict:** it should read `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED (leading hypothesis: simulator resource model; diagnostic pending)`. It becomes `SIMULATION EXPECTATION DEFECT IDENTIFIED` only when the diagnostic produces the pre-committed confirming pattern (F2). The current drafts already carry every caveat, so this is a labelling change, not a change of substance.

## 4. Can the solution grant access or weaken R10? Is the script correct?

**Read-only:** yes [V-repo].
- The script calls only `aws iam simulate-custom-policy` and `simulate-principal-policy`. A grep found no other `aws` invocation.
- Its synthetic policies exist only in the request.
- It writes only to local `$OUT`.
- `bash -n` passes, there are exactly 19 calls (A1-A9, B1-B10), and the sha256 matches `07` (`d90a4cbf…c5c`).
- `--policy-input-list file://` with a JSON array of strings is the form rev3 already uses successfully.
- Merging stderr into the `.json` file makes any CLI error an ERROR row, which is conservative.

**Correctness: fix F1, F3 and F4 before approval.**
1. **Interpretation table.** Add explicit rows for F1(a)-(g). In particular, a B row = implicitDeny where the matching A row shows the form is applied must give `ROOT CAUSE UNRESOLVED`, and R10 for `GetLogEvents` stays [U]. End with a catch-all: "any other combination → ROOT CAUSE UNRESOLVED — REMAINS BLOCKED".
2. **jq extraction.** Also read `ResourceSpecificResults[].MatchedStatements` and `StartPosition.Column`, plus `MissingContextValues`, `OrganizationsDecisionDetail` and `PermissionsBoundaryDecisionDetail`.
3. **Evidence request.** Ask the owner for the 10 B-block JSON files as well as the TSV (they contain no secrets).

**Revision 4 does not weaken R10** [L]:
- Expected values are unchanged, and the `-allow` policies are not touched.
- The canaries detect a simulator change, and also any future `allowed`.
- The `*`-only fallback in `07` §3 correctly moves the cross-environment check to a log-group action through `NeverTheOtherEnvironmentByName`.
- **Residual, which should be written down:** no simulation can ever show the stream form itself denied. That is acceptable only because of the `*` argument in §3.

## 5. Live-AWS security impact

| Area | Assessment |
| --- | --- |
| Cross-environment | None. D30.1 and LD50.1 have no matching Allow on any policy, so they are refused live even without a deny. LD50.1 also has the unconditioned by-name deny [V-repo + L]. |
| Escalation | None. Read-only data actions only [V-repo]. |
| Session network and security-group changes | Not involved. Those cases passed [O-ev]. |
| DB data | `rds:Download*` and ECS Exec gave explicitDeny (LD10.1-LD13.1, LD31.1, LD32.1) [O-ev]. |
| Log data, own environment (LD01.1, LD30.1) | `OwnNames` `logs:*` matches the stream ARN, so the only barrier is the `*` Deny. By evaluation logic it applies live [E, high], but it has not been observed for `GetLogEvents`, and for prod not for any logs action (F11). It stays [U] until the diagnostic. |

## 6. Factual errors, line numbers, overclaims

These are F5, F7, F8, F9 and F10 above.

**Verified correct:**
- the rev3 sha256;
- case lines 227, 530, 546, 550 and 552;
- preflight lines 139-141;
- the SAR resource types (`GetLogEvents` uses `log-stream`; the other eight use `log-group`);
- SAR-check lines 36, 335, 351, 355 and 357 (all `log-stream`);
- rev2 D30.1 = implicitDeny;
- `iam_allow.tf` 471 and 477;
- the `744c67c` to `6b8997a` IAM identity.

The `06` §6 list of unblocked read actions omits `GetLogFields`, `GetScheduledQuery` and `GetDelivery*` (none returns events, so this is Info only).

REVIEW CONCLUSION: AGREE WITH CHANGES — keep the policy unchanged and run the diagnostic after completing its interpretation table (F1, F3), but label the current state ROOT CAUSE UNRESOLVED — REMAINS BLOCKED until the diagnostic confirms the simulator cause.
