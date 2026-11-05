# Simulation revision 3: root causes of the four mismatches

**Date:** 5 Nov 2026, about 10:15 to 11:30 UTC.
**Author:** the lead.
**AWS calls:** none, of any kind. No credentials were used. No policy, simulation expected value or AWS resource was changed.

**Labels:**

- [O-ev]: AWS evidence the owner provided.
- [V-repo]: repository evidence, at commit `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` unless stated otherwise.
- [V-doc]: published AWS documentation or the Service Authorization Reference (SAR) JSON.
- [L]: local analysis.
- [E]: inference.
- [U]: unverified.

## 1. Summary

All four failures are `logs:GetLogEvents` on a **log-stream** ARN. In every one, the simulator returned `implicitDeny`, the result for "no statement matched".

That result cannot be explained by the policy text:

- **The deny matches any resource.** `NoLogOrDatabaseData` is a Deny with `Resource: "*"` and no condition, and it lists `logs:GetLogEvents`. A `*` resource matches every ARN string.
- **Two more statements match the exact ARN strings and were also silent:**
  - In LD01.1 and LD30.1, the `OwnNames` Allow (`logs:*` on `log-group:/munaxa/<env>/*`) matches the stream ARN by wildcard. If it had been evaluated, the minimum result would have been `allowed`.
  - In LD50.1, the inline `NeverTheOtherEnvironmentByName` Deny (`*` on `log-group:/munaxa/prod/*`) matches the stream ARN.
- **The same deny works for every other action it lists.** For the same principals and the same allow policy, the simulator returned `explicitDeny` from this statement for 8 other `logs:` actions on log-group ARNs, and for 4 `rds:` and `ecs:` actions [O-ev].

In every failure, every statement whose pattern matches the ARN (two per case: the `*` Deny plus `OwnNames` in LD01.1 and LD30.1, or plus `NeverTheOtherEnvironmentByName` in LD50.1; only the `*` Deny in D30.1) was reported as not matching. The only explanation consistent with this is that **the simulator did not evaluate any statement against this action and resource pair** [E, high]. In other words, it does not accept the SAR log-stream ARN as a resource for `GetLogEvents`.

The simulator did the same in run 1 (`2026-11-05-bootstrap-reapply/02` §4) [O-ev]. The strongest precedent is N71.1 and N74.1: a `Resource: "*"` Deny (`NeverCreateForTheOtherEnvironment`) returned `implicitDeny` on an ARN outside the action's resource types, and N70.1 showed the same for a `*` Allow. SR083.2 is weaker support, because it used a specific resource pattern. Here the ARN does follow the SAR's resource type for `GetLogEvents` (`log-stream`), so the simulator's resource model for this action differs from the SAR [E, medium-high; not yet proven].

**Classification:**

- **Policy statement defect:** excluded for the four failures [V-repo + L].
- **Root cause:** a simulator semantic difference, so the four expectations can never be met with this request form. That makes it a missing test-case assumption (the resource form) together with an expectation the simulator cannot produce.

**Proof still needed.** The diagnosis is not proven by AWS evidence. An owner-run, read-only controlled test is prepared that proves or disproves it: `supporting/getlogevents-diagnostic.sh`, described in `07` §2.

**Verdict:** `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. A policy defect is excluded by inspection, and the leading hypothesis is the simulator's resource model, but that hypothesis is [E] until the controlled test confirms it. The independent review (`08`, F2) asked for this wording, and the lead agrees. If the test confirms the hypothesis, the verdict becomes `SIMULATION EXPECTATION DEFECT IDENTIFIED — OWNER REVIEW REQUIRED`. The re-apply stays **NOT VERIFIED**.

## 2. Evidence base

| Item | Source | Label |
| --- | --- | --- |
| Result line, and the four FAIL lines with principals | Owner messages, 5 Nov 10:10 and 10:11 UTC | [O-ev] |
| The other 477 cases passed, including LD02.1 to LD13.1, LD20.1, LD31.1 to LD33.1, LD40.1 and LD41.1 | Implied by the owner's result line, which lists exactly 4 FAIL lines. The full TSV was not supplied | [O-ev], [U] for per-row detail |
| Preflight passed: `NoLogOrDatabaseData` is present in both `-allow` policies | The script stops at preflight otherwise (`b2-owner-simulation.sh` lines 139 to 141). The run reached `complete=yes` | [O-ev] + [V-repo] |
| Statement source | `infra/aws/bootstrap/iam_allow.tf` lines 426 to 436 (comment 422 to 425) | [V-repo] |
| Rendered policies | Phase 7 Agent 2 render of `744c67c`. The IAM content equals `6b8997a`, because the merge commit adds no IAM change after `744c67c` (`git diff 744c67c 6b8997a -- infra/aws/bootstrap` is empty) | [V-repo] |
| SAR | `servicereference.us-east-1.amazonaws.com` JSON, fetched 5 Nov 06:52 UTC: `GetLogEvents` uses the `log-stream` resource type, ARN `arn:${Partition}:logs:${Region}:${Account}:log-group:${LogGroupName}:log-stream:${LogStreamName}`. `FilterLogEvents`, `GetLogRecord`, `StartLiveTail` and the rest use `log-group` | [V-doc] |
| Simulator API documentation | `API_EvaluationResult`: `EvalResourceName` is "The ARN template for the simulated resource type … or `*` if no ARN format is defined for the action". The simulator therefore classifies resources by type. No published page states what happens when a supplied ARN does not fit the simulator's type for the action | [V-doc] |
| CloudWatch Logs permissions reference | "For the Resource field, you can specify the ARN of a log group or log stream, or specify `*`." `GetLogEvents`: "Required to retrieve log events from a log stream." | [V-doc] |

I verified the merge-commit claim above:

```
$ git diff --stat 744c67c 6b8997a -- infra/aws/bootstrap
(empty)
```

## 3. Requirements 1 to 10

### 1. The exact statement, in both deployer allow policies

Source, `iam_allow.tf` lines 422 to 436 [V-repo]:

```hcl
  # OwnNames grants logs:* and rds:* by name, which would include reading log data and database
  # log files. The deployer only manages configuration: no data reads, no export, no subscription
  # filter, no ECS Exec (phase 5 review 06 §8.3, R9). Here rather than in the inline guardrails:
  # the session deployer has no logs or RDS-file allow, and its inline policy is near its limit.
  statement {
    sid    = "NoLogOrDatabaseData"
    effect = "Deny"
    actions = [
      "logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery", "logs:GetQueryResults",
      "logs:StartLiveTail", "logs:GetLogRecord", "logs:Unmask", "logs:CreateExportTask",
      "logs:PutSubscriptionFilter", "rds:DownloadDBLogFilePortion", "rds:DownloadCompleteDBLogFile",
      "ecs:ExecuteCommand",
    ]
    resources = ["*"]
  }
```

**How it is attached.** The statement belongs to `data.aws_iam_policy_document.deployer_allow` (a `for_each` over nonprod and prod). That document becomes the managed policies `munaxa-shared-deployer-nonprod-allow` and `munaxa-shared-deployer-prod-allow` (line 471), which are attached to each deployer (line 477).

**Rendered form.** In both rendered policies the statement is `{"Sid":"NoLogOrDatabaseData","Effect":"Deny","Action":[…12 actions…],"Resource":"*"}`. It has no `Condition`, `NotAction` or `NotResource` [V-repo].

### 2. Every rendered statement that can match `logs:GetLogEvents`

I evaluated every statement locally against the action name `logs:GetLogEvents` with case-insensitive wildcards [L].

**Deployer allow policy:**

| Policy | Sid | Effect | Action pattern | Resource pattern | Condition |
| --- | --- | --- | --- | --- | --- |
| allow (nonprod) | `OwnNames` | Allow | `logs:*` | `arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/*`, plus non-logs ARNs | none |
| allow (prod) | `OwnNames` | Allow | `logs:*` | `…:log-group:/munaxa/prod/*` | none |
| allow (both) | `NoLogOrDatabaseData` | Deny | `logs:GetLogEvents` | `*` | none |

**Deployer inline policy** (`deployer_inline_<env>`):

| Sid | Effect | Action | Resource | Condition |
| --- | --- | --- | --- | --- |
| `NeverMunaxaDocsOrBootstrap` | Deny | `*` | includes `…:log-group:*munaxa-docs*` | none |
| `NeverTheOtherEnvironmentByName` (nonprod) | Deny | `*` | includes `…:log-group:/munaxa/prod/*` | none |
| `NeverTheOtherEnvironmentByName` (prod) | Deny | `*` | includes `…:log-group:/munaxa/nonprod/*` | none |
| `NeverAnotherProjectByTag` | Deny | `*` | `*` | `Null` / `StringNotEquals` on `aws:ResourceTag/Project`. No tag context was supplied, so it does not apply |
| `NeverTagForAnotherProject` | Deny | `*` | `*` | `Null` / `StringNotEquals` on `aws:ResourceTag/Project`. No tag context was supplied, so it does not apply |
| `NeverTheOtherEnvironmentByTag` | Deny | `*` | `*` | `aws:ResourceTag/Environment` or `aws:RequestTag/Environment` conditions. No tag context was supplied, so it does not apply |
| `NeverCreateForTheOtherEnvironment` | Deny | `*` | `*` | `aws:ResourceTag/Environment` or `aws:RequestTag/Environment` conditions. No tag context was supplied, so it does not apply |
| `NeverMunaxaDocsProductionByTag` | Deny | `*` | `*` | tag conditions. No tag context was supplied, so it does not apply |
| `NeverTagAsMunaxaDocs` | Deny | `*` | `*` | tag conditions. No tag context was supplied, so it does not apply |

**Read policy** (`ConfigurationReads`): it allows `logs:DescribeLogGroups`, `ListTagsLogGroup` and `ListTagsForResource` only. It has no `GetLogEvents`.

**Permissions boundaries:** none apply. The deployer roles carry no permissions boundary; the deployer role is defined at `iam.tf` lines 190 to 197 with no `permissions_boundary`, and the workload boundary (`iam.tf` lines 18 to 41) applies only to roles the stack creates [V-repo]. The attached `-allow-tagged` policy has no statement that matches `GetLogEvents` on these ARNs (review F7) [L]. The session deployer does not have the `-allow` policy attached.

### 3. The four cases

Each case comes from `b2-owner-simulation.sh` revision 3, sha256 `12cd2ca7…6e22b`. All four use `sim`, which calls `simulate-principal-policy`. Every case has the same context, and no tag keys:

`[{"ContextKeyName":"aws:RequestedRegion","ContextKeyValues":["eu-central-1"],"ContextKeyType":"string"}]`

| Line | Case | Principal (`role/munaxa-shared/bootstrap/…`) | Resource | Expected | Before revision 3 |
| --- | --- | --- | --- | --- | --- |
| 227 | D30.1 | `munaxa-shared-deployer-nonprod` | `…:log-group:/aws/other:log-stream:x` | explicitDeny | Revision 2 expected implicitDeny, which passed in run 2. The deny did not exist then |
| 530 | LD01.1 | `munaxa-shared-deployer-nonprod` | `…:log-group:/munaxa/nonprod/identity:log-stream:ecs/identity/1` | explicitDeny | New in revision 3 |
| 546 | LD30.1 | `munaxa-shared-deployer-prod` | `…:log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` | explicitDeny | New in revision 3 |
| 552 | LD50.1 | `munaxa-shared-deployer-nonprod` | `…:log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` | explicitDeny | New in revision 3 |

**Related passing case.** LD40.1 (line 550) sends the same request from the session deployer, which has no logs allow, and expects implicitDeny. It passed, but it cannot discriminate, because it would pass for either cause (§4).

### 4. How the simulator output is read

- `sim` runs `aws iam simulate-principal-policy … --query 'EvaluationResults[0].EvalDecision' --output text`.
- `decision()` accepts only rc 0 with exactly `allowed`, `explicitDeny` or `implicitDeny`. Anything else becomes `ERROR(...)` and counts as an API error.
- `check()` compares the result string to the expected value [V-repo].

There is one action and one resource per call, so `EvaluationResults[0]` is the only result. Its `EvalDecision` is the most restrictive decision across resources [V-doc]. With `api_errors=0`, all four calls returned a well-formed `implicitDeny` [O-ev].

**Meaning of the three values** in the IAM evaluation logic:

| Value | Meaning |
| --- | --- |
| `explicitDeny` | At least one applicable Deny statement matched |
| `allowed` | At least one applicable Allow matched, and no Deny matched |
| `implicitDeny` | No applicable statement matched |

`--query` hides `MatchedStatements` and `ResourceSpecificResults`, so revision 3 cannot show which statements the simulator considered. The controlled test keeps the full JSON (`07` §2).

### 5. Resource-level permissions for this ARN format

- **Supported.** The SAR lists `GetLogEvents` with exactly one resource type, `log-stream`, with ARN format `arn:${Partition}:logs:${Region}:${Account}:log-group:${LogGroupName}:log-stream:${LogStreamName}` [V-doc].
- **The test ARNs fit that format exactly.** Agent 2's revision 3 SAR check records `log-stream` as matched for all five log-stream cases (`phase7/supporting/simulation/sar-check-rev3.txt` lines 36, 335, 351, 355, 357) [V-repo].
- **Agent 2's evaluator was not wrong to predict explicitDeny.** It applied the SAR, and the SAR says the request is valid. The gap is between the SAR and the simulator's own resource model [E].

### 6. Is a different ARN format, wildcard or scope needed?

- **For the policy: no.**
  - `Resource: "*"` already covers every possible format.
  - A narrower resource on a Deny can only match less, never more.
  - The `OwnNames` Allow pattern `log-group:/munaxa/<env>/*` already matches both the group ARN and the stream ARN.

  No policy edit can make the simulator evaluate a statement it treats as not applicable [L].
- **For the test: probably yes.**
  - The four requests need the resource form that the simulator applies to `GetLogEvents`. That form is not yet known, so the controlled test probes all four candidates: the log-stream ARN, the log-group ARN, the log-group ARN with `:*`, and `*`.
  - The test also keeps the log-stream form as a canary, in the same way SR083.2 was kept (`07` §3).

### 7. Is `GetLogEvents` allowed elsewhere, and should the deny override it?

| Case | Allow that matches the ARN string | Deny that matches the ARN string | Live outcome if every matching statement is applied |
| --- | --- | --- | --- |
| D30.1 | none: `/aws/other` is not in `OwnNames` | `NoLogOrDatabaseData` | Denied, explicitly. Without the deny it is still denied, implicitly |
| LD01.1 | `OwnNames` (`logs:*` on `/munaxa/nonprod/*`) | `NoLogOrDatabaseData` | Denied, explicitly. **The deny is the only control**; without it, the action would be allowed |
| LD30.1 | `OwnNames` (`logs:*` on `/munaxa/prod/*`) | `NoLogOrDatabaseData` | Denied, explicitly. **The deny is the only control** |
| LD50.1 | none: the nonprod `OwnNames` covers only `/munaxa/nonprod/*` | `NoLogOrDatabaseData` and `NeverTheOtherEnvironmentByName` | Denied, explicitly, by two statements. Without both, it is still denied implicitly |

Yes, the deny must override the `OwnNames` `logs:*` Allow, and under IAM evaluation logic an explicit Deny always does. Overriding it was the purpose of R10: `OwnNames` grants `logs:*` for configuration management, and the deny removes the data-read actions from it (`phase7/01`, R10; `phase7/02`).

### 8. Why all four return implicitDeny and not explicitDeny

**Four candidate causes, and why each fails:**

1. **The deny is not attached or not live.** Excluded:
   - preflight read both `-allow` documents from AWS and found the Sid;
   - the same Sid produced `explicitDeny` for LD02.1 to LD13.1 and LD31.1/LD32.1 on the same roles [O-ev].
2. **The resource pattern did not match.** Excluded: `*` matches every string. `OwnNames` and `NeverTheOtherEnvironmentByName` match the strings as well [L].
3. **A condition was not met.** Excluded: none of the matching statements has a condition [V-repo].
4. **An action-name difference.** Excluded:
   - the deny names `logs:GetLogEvents` literally;
   - `OwnNames` names `logs:*`;
   - the inline policy uses `*`;
   - the simulator accepted the action, and an unknown action is an API error, of which there were none [O-ev].

**Remaining hypothesis.** The simulator treats this (action, resource) pair as one to which no statement applies, which produces `implicitDeny`. That is the behaviour the run 1 evidence shows for an ARN outside the action's resource type (SR083.2, `2026-11-05-bootstrap-reapply/02`) [O-ev]. The difference here is that the ARN does match the SAR. The simulator's internal resource model for `GetLogEvents` therefore does not accept the SAR log-stream form [E, medium-high].

**Why all four, and only these four.** Every other `logs:` case uses a log-group ARN with an action whose SAR resource type is `log-group`, and all of those passed. The five log-stream cases all returned implicitDeny: these four, plus LD40.1, which expected it [O-ev].

### 9. Did the request include the intended policy and the correct ARN?

**The policy: yes.**
- `simulate-principal-policy` with `--policy-source-arn <role>` evaluates every policy attached to the role. Here that is the inline policy and the managed `-read` and `-allow` policies, and preflight proved that `-allow` contains the Sid.
- It does not take a policy document as input, so it cannot have used a stale local copy [V-doc + V-repo].

**The ARN: yes.** The FAIL lines echo exactly the ARNs in the script, and those ARNs fit the SAR log-stream format [O-ev + V-doc].

**Not proven by the existing output:** which resource template the simulator used, and whether it listed any matched statement. `--query` dropped both. The controlled test records them.

### 10. The original R10 design and the Phase 6 and 7 reviews

**The design** (Phase 5 review 06 §8.3; Phase 6 p6-01; Phase 7 `01` R10 and `02`):
- `OwnNames` keeps `logs:*` for configuration;
- one Deny on `*` removes data reads, export, subscription filters and ECS Exec.

The intent is that the deny applies whatever ARN form the service authorizes against, and that intent is correct [V-repo].

**Phase 7 Agent 2** (`02`, line 98) recorded that `logs:GetLogEvents` uses `log-stream`. It then built the requests on log-stream ARNs, which is right by the SAR.

**Phase 7 Agent 7**, the independent review (`10`), confirmed the deciding statement for D30.1 as `NoLogOrDatabaseData` with its own evaluator [L]. It did not model a divergence between the simulator and the SAR. Its note I-1 covered only the SR083.2 case, an ARN outside the SAR type.

**The gap in review.** No review had evidence of how the real simulator treats a log-stream ARN, because revision 2 had only one such case (D30.1), and it expected implicitDeny. That expectation was met for a reason nobody examined. **Nothing in the Phase 6 or 7 reviews is contradicted about the policy;** what was missing is the simulator assumption.

## 4. Case-by-case findings

**Shared resource prefix.** Every resource ARN below begins with `arn:aws:logs:eu-central-1:229251310592:`.

### D30.1

| Field | Value |
| --- | --- |
| Principal | `munaxa-shared-deployer-nonprod` |
| Action | `logs:GetLogEvents` |
| Resource | `log-group:/aws/other:log-stream:x` |
| Context | `aws:RequestedRegion=eu-central-1` |
| Expected | explicitDeny |
| Actual | implicitDeny [O-ev] |
| Statement | `munaxa-shared-deployer-nonprod-allow` / `NoLogOrDatabaseData` (Deny, `logs:GetLogEvents`, `*`). No Allow matches |
| Root cause | The simulator applies no statement to `GetLogEvents` on a log-stream ARN [E, medium-high]. Not a policy defect [V-repo + L] |
| Security impact | None, by inspection. In live AWS the request is refused either way: by the explicit deny, and, without it, by the absence of any allow. No cross-environment, escalation, network, security-group or data exposure [E, high] |
| Proposed correction | After the controlled test: re-target the request to the resource form the simulator applies, keep explicitDeny, and add a log-stream canary (`07`). No policy change |
| Confidence | Policy correct: high. Simulator cause: medium-high until the controlled test |

### LD01.1

| Field | Value |
| --- | --- |
| Principal | `munaxa-shared-deployer-nonprod` |
| Action | `logs:GetLogEvents` |
| Resource | `log-group:/munaxa/nonprod/identity:log-stream:ecs/identity/1` |
| Context | `aws:RequestedRegion=eu-central-1` |
| Expected | explicitDeny |
| Actual | implicitDeny [O-ev] |
| Statements | `NoLogOrDatabaseData` (Deny, `*`) overrides `OwnNames` (Allow `logs:*` on `log-group:/munaxa/nonprod/*`, which matches the stream ARN) |
| Root cause | As for D30.1. Even the matching Allow was not applied, which would otherwise have produced at least `allowed` [L] |
| Security impact | **This is the case that matters.** For own-environment logs the deny is the only barrier. It has been shown for 8 other log-data actions but **not yet observed for `GetLogEvents`** in any AWS evaluation. By IAM logic a `*` Deny applies to every resource, so the live request is refused [E, high]. Until the controlled test, the claim "R10 is live for `GetLogEvents`" is [U]. No cross-environment, escalation, network or security-group effect |
| Proposed correction | As for D30.1. This case must end as a passing explicitDeny on a resource form the simulator applies |
| Confidence | As for D30.1 |

### LD30.1

| Field | Value |
| --- | --- |
| Principal | `munaxa-shared-deployer-prod` |
| Action | `logs:GetLogEvents` |
| Resource | `log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` |
| Context | `aws:RequestedRegion=eu-central-1` |
| Expected | explicitDeny |
| Actual | implicitDeny [O-ev] |
| Statements | `munaxa-shared-deployer-prod-allow` / `NoLogOrDatabaseData` overrides prod `OwnNames` (`logs:*` on `log-group:/munaxa/prod/*`) |
| Root cause | As for LD01.1 |
| Security impact | As for LD01.1, for prod log data. Prod has no workloads yet, so no prod log groups are expected to exist [E: G3 is nonprod only]. For prod, no logs data action has been observed denied in AWS yet; the 8 log-group cases ran on the nonprod deployer only (review F11) |
| Proposed correction | As for LD01.1 |
| Confidence | As for D30.1 |

### LD50.1

| Field | Value |
| --- | --- |
| Principal | `munaxa-shared-deployer-nonprod` |
| Action | `logs:GetLogEvents` |
| Resource | `log-group:/munaxa/prod/identity:log-stream:ecs/identity/1` |
| Context | `aws:RequestedRegion=eu-central-1` |
| Expected | explicitDeny |
| Actual | implicitDeny [O-ev] |
| Statements | `NoLogOrDatabaseData` (Deny, `*`), and the inline `NeverTheOtherEnvironmentByName` (Deny `*` on `log-group:/munaxa/prod/*`, which matches the stream ARN). No Allow matches |
| Root cause | As for D30.1. Two Deny statements whose patterns match were both not applied, which is the strongest sign that the policy text is not the cause [L] |
| Security impact | **No cross-environment exposure.** No allow reaches prod log groups for the nonprod deployer, so the request is refused even with no deny [E, high] |
| Proposed correction | As for D30.1 |
| Confidence | As for D30.1 |

## 5. The wider assessment the owner asked for

| Question | Answer | Basis |
| --- | --- | --- |
| Could any mismatch allow cross-environment access? | No. D30.1 and LD50.1 have no allow at all, and LD50.1 also has the by-name environment deny | [V-repo + L] |
| Could any mismatch allow privilege escalation? | No. Read-only data actions only; no IAM, STS or policy action is involved | [V-repo] |
| Session network or security-group rule changes? | Not involved. Those cases (SR08x, SR09x, NP01 to NP16) passed | [O-ev] |
| Log data access? | Not shown to be possible. The only open point is that the `GetLogEvents` deny for own-environment logs (LD01.1, LD30.1) has not yet been observed in an AWS evaluation | [E, high] / [U] |
| Database data access? | Not involved. `rds:Download*` (LD10.1, LD11.1, LD32.1) and `ecs:ExecuteCommand` passed as explicitDeny | [O-ev] |
| Does `api_errors=0` prove security? | No. It proves only that every call was well-formed. The four mismatches show that a well-formed call can still fail to exercise the statement it was written for | [L] |

## 6. Separate observation (not a cause of the four failures)

Locally, I listed the SAR read actions that are neither in `NoLogOrDatabaseData` nor list-only, and that `OwnNames` `logs:*` could reach on a log-group ARN [L]. They are:

- `GetDataProtectionPolicy`, `GetLogGroupFields`, `GetTransformer`: metadata or field names, not events;
- `GetScheduledQueryHistory`, `GetLookupTable`, `GetLogAnomalyDetector`: these use other resource types (`scheduled-query`, `lookup-table`, `anomaly-detector`), which `OwnNames` does not cover.

Write actions such as `PutDataProtectionPolicy` or `DeleteDataProtectionPolicy`, and the delivery APIs, are reachable through `logs:*`, but they do not read data by themselves.

This is consistent with the open Phase 7 review item L-1 ("replace the enumerated logs deny with a broader one", `phase7/09`). It is listed for that follow-up and is not part of this verdict.
