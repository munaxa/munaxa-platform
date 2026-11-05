# Simulation revision 3: remediation plan

**Date:** 5 Nov 2026. Lead.
**Status:** proposal only. Nothing in this plan has been run. No AWS call was made, and no IAM policy or expected value was changed.

**Labels:**

| Label | Meaning |
| --- | --- |
| [O-ev] | owner evidence |
| [V-repo] | repository |
| [V-doc] | documentation |
| [L] | local |
| [E] | inference |
| [U] | unverified |
| [O] | owner action |

## 1. Recommendation

**No policy code change is proposed.** The diagnosis in `06` §3.8 excludes a policy defect for the four failures:
- A Deny on `*` cannot be made to match more.
- Narrowing it or widening an Allow could only weaken R10.

**Recommended path:**
1. Prove the simulator cause with a controlled, owner-run, read-only test (§2).
2. On a confirming result, prepare simulation revision 4. It changes the resource form of the four requests and adds canaries (§3). It is independently reviewed and is used only after the owner approves the revised acceptance criteria.
3. The owner runs revision 4. No re-apply is needed, because AWS already holds `6b8997a`.

**Current verdict:** `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. It changes only on a row 9 result in §2.

## 2. Controlled read-only test (owner-run, needs approval) [O]

**Script:** `supporting/getlogevents-diagnostic.sh`, sha256 `be3cbb81aa8a6764573b19b3be1ec754f319282c0c76f9e5da9b45d6eae8d189`.

**Calls.** It makes 19 calls, all `iam:SimulateCustomPolicy` or `iam:SimulatePrincipalPolicy`:
- They are read-only and are the same API family as revision 3.
- No other AWS API is called.
- It creates no policy and assumes no role.

**Output.** It keeps the full JSON (no `--query`), then writes `summary.tsv` with these columns:
- `EvalDecision` (a missing decision becomes `ERROR`)
- `EvalResourceName` (the simulator's resource template)
- `MatchedStatements`
- `ResourceSpecificResults`
- `MissingContextValues`

Matched statements are read from both the top level and each resource-specific result, with line and column. The owner should send `summary.tsv` and the B-block JSON files.

I ran it offline against a stub `aws`: syntax OK, and 19 rows are produced [L].

**Block A: synthetic one-statement policies, through `simulate-custom-policy`.** These need no account policy.

| Test | Policy | Action | Resource |
| --- | --- | --- | --- |
| A1 | Allow GetLogEvents `*` | GetLogEvents | nonprod log-stream ARN |
| A2 | Allow GetLogEvents `*` | GetLogEvents | log-group ARN |
| A3 | Allow GetLogEvents `*` | GetLogEvents | log-group ARN with `:*` |
| A4 | Allow GetLogEvents `*` | GetLogEvents | `*` |
| A5 | Allow and Deny, both `*` | GetLogEvents | log-stream ARN |
| A6 | Allow and Deny, both `*` | GetLogEvents | log-group ARN |
| A7 | Allow and Deny, both `*` | GetLogEvents | `*` |
| A8 (control) | Allow FilterLogEvents `*` | FilterLogEvents | log-group ARN |
| A9 (control) | Allow FilterLogEvents `*` | FilterLogEvents | log-stream ARN |

**Block B: the live deployer roles, through `simulate-principal-policy`.** B1, B3, B7 and B9 repeat D30.1, LD01.1, LD30.1 and LD50.1 with full output.

| Test | Role | Resource |
| --- | --- | --- |
| B1 | nonprod | `/aws/other` stream |
| B2 | nonprod | `/aws/other` group |
| B3 | nonprod | nonprod stream |
| B4 | nonprod | nonprod group |
| B5 | nonprod | nonprod group with `:*` |
| B6 | nonprod | `*` |
| B7 | prod | prod stream |
| B8 | prod | prod group |
| B9 | nonprod | prod stream |
| B10 | nonprod | prod group |

**How to read the result.** These rows were written before the run, so the outcome cannot be fitted afterwards. They are checked in order, and the first matching row decides. Here "the applied form" means a resource form X (log-group, log-group `:*`, or `*`) for which A2/A3/A4 = allowed **and** A6 (or A7 for `*`) = explicitDeny.

| # | Observed | Conclusion | Verdict |
| --- | --- | --- | --- |
| 1 | Any row is `ERROR` (including `ERROR(no EvalDecision)`), or fewer than 19 rows | The test did not run as designed | No conclusion. Report the row and stay blocked |
| 2 | Any B row is `allowed` | The live policy grants GetLogEvents | **Policy defect: stop.** §4. Treat as a security finding for Testing; G3 stays blocked |
| 3 | A8 ≠ allowed | The control failed: the simulator does not behave as in revision 3 for log-group actions | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` |
| 4 | A4 ≠ allowed or A7 ≠ explicitDeny | The simulator does not apply even a `*` statement on `*` for GetLogEvents | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. Ask AWS Support; no revision 4 |
| 5 | B1, B3, B7 or B9 ≠ implicitDeny | Revision 3 does not reproduce | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. Rerun revision 3 before any conclusion |
| 6 | A1 ≠ implicitDeny or A5 ≠ implicitDeny (A1 allowed, A5 explicitDeny, or any mixed result) | The simulator does apply statements to a log-stream ARN, so the hypothesis is wrong | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. §4 |
| 7 | No applied form exists | The simulator applies nothing usable for GetLogEvents | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` |
| 8 | For the applied form, any of the matching B rows (B2 or B6 for D30.1; B4/B5/B6 for LD01.1; B8 for LD30.1; B10 for LD50.1) = implicitDeny | **The R10 failure mode**: the deny did not apply on a form the simulator evaluates | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`. R10 for GetLogEvents stays [U]; §4 |
| 9 | Rows 1 to 8 do not hold, A1 = A5 = implicitDeny, and the applied-form B rows are explicitDeny with `matched_sids` naming the `-allow` policy | **Simulator semantic difference confirmed, and R10 for GetLogEvents observed in AWS** | `SIMULATION EXPECTATION DEFECT IDENTIFIED — OWNER REVIEW REQUIRED`. Go to §3 |
| 10 | Any other combination | Not foreseen | `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` |

A9 is recorded for information: it shows whether the simulator applies a log-stream ARN for a log-group action. It does not change a verdict by itself.

**Does the test grant access? No.** It is a simulation. The synthetic Allow policies in Block A exist only in the request and are attached to nothing [V-doc: the simulator "does not make an actual AWS service request"].

## 3. Simulation revision 4 (prepared only after a confirming result)

**Proposed changes.** Each one is listed separately for review. None is a silent edit.

| Case | Revision 3 | Proposed revision 4 | Expected value |
| --- | --- | --- | --- |
| D30.1 | log-stream `/aws/other:log-stream:x` | the resource form that test A shows the simulator applies for GetLogEvents, `/aws/other` | **explicitDeny (unchanged)** |
| LD01.1 | nonprod log-stream | same form for `/munaxa/nonprod/identity` | **explicitDeny (unchanged)** |
| LD30.1 | prod log-stream | same form for `/munaxa/prod/identity` | **explicitDeny (unchanged)** |
| LD50.1 | prod log-stream, nonprod role | same form for `/munaxa/prod/identity` | **explicitDeny (unchanged)** |
| LD40.1 | session, nonprod log-stream | same form | implicitDeny (unchanged). Now it discriminates, because the request is one the simulator evaluates |
| new LC01.1 to LC04.1 | - | the four revision 3 log-stream requests, kept as canaries | implicitDeny, labelled "simulator applies no statement to a log-stream ARN for GetLogEvents (07 §2 test A1/A5)" |

**What does not change:**
- Every expected value of an existing case stays the same.
- Only the resource strings of five requests change, which mirrors the run 1 correction for N70, N71 and N74 (`2026-11-05-bootstrap-reapply/02` §4).
- The four canaries record the simulator behaviour, so a future change in the simulator is noticed. This is the SR083.2 precedent.

**Totals.** 485 calls (481 + 4) and `EXPECTED_TOTAL=485`.

**If test A shows that only `*` is applied,** the four requests use `*`. LD50.1 then loses its cross-environment specificity, so the prod log-group cross-environment check is carried instead by `NeverTheOtherEnvironmentByName` cases on a log-group action (LD02-style, FilterLogEvents on the prod group, new LD51.1, explicitDeny). That is stated in revision 4 if needed.

**Process** (owner exit criteria):
1. Run the test in §2.
2. Prepare revision 4 as a docs-only PR. The `-allow` policies are not touched.
3. Independent review of revision 4.
4. **The owner approves the revised acceptance criteria:** the four changed requests, the four canaries, and 485 as the total.
5. The owner runs revision 4. The required result is `total=485 expected_match=485 unexpected_mismatch=0 api_errors=0 harness_errors=0`.

**No AWS re-apply is involved in any of these steps.**

## 4. If the test does not confirm the cause

**If the simulator does apply log-stream ARNs** (A1 allowed, A5 explicitDeny) but B3 is still implicitDeny, the cause lies in what the principal simulation sees. The next read-only checks, owner-run and each needing approval, are:
- `get-policy-version` of the default version of `munaxa-shared-deployer-nonprod-allow`, kept as full JSON;
- `get-role` for the deployer, to show any permissions boundary.

Preflight already ran the attached-policy lookup (review F10), so these add only what it did not keep. The case table and policy would be re-examined, and no policy change would be made before a reviewed PR.

**If any B row is `allowed`,** a policy defect is proven:
1. Prepare a code PR that removes the cause, with an independent review.
2. Regenerate the simulation.
3. Get a new explicit owner approval for a third re-apply.
4. Until then, record that the Testing deployer can read the logs of its own environment.

## 5. What this plan does not do

- No IAM policy edit. No change to the deny or to `OwnNames`.
- No change to any expected value, here or in revision 3. Revision 3 stays on main as it is, as the record of what was run.
- No Terraform plan or apply, no workflow dispatch, no G3, no backstop apply, no Testing session.

**Open item, unchanged:** L-1, the broader logs deny, stays a next-phase item (`06` §6, `phase7/09`). It needs its own PR and re-apply, and it is not part of this remediation.
