# Independent review: B2 discrepancy, revision 4 and second re-apply evidence

**Date:** 5 Nov 2026. **Reviewer:** independent IAM security reviewer. I did not write `00`, `01`, `02`, `04` or the two scripts, and I was told to challenge them, not approve them.
**AWS calls:** none. No credentials, no GitHub writes, no repository edits. CanteenHub, Render and Supabase were not inspected.
**Labels:** [O-ev] owner AWS output (`supporting/diagnostic-1-results/`, SHA256SUMS re-checked: all 5 OK), [V-repo] repository at HEAD (bootstrap tree `b83d1077…` = `6b8997a`, no bootstrap diff `744c67c`..HEAD), [L] my own offline analysis, [V-doc] AWS documentation, [E] inference, [U] unavailable.

## Scope

The current drafts of `00`, `01`, `02` and `04`, `supporting/b2-followup-diagnostic.sh` (sha256 `83bdb7ac…f6d6`, re-computed and matching), `supporting/reapply-evidence-print.sh` (`27db077f…922c`, matching), and the diagnostic-1 results. Reference material: the prior folder (`07` §2 and §3), the revision 3 script, the phase 7 runbook, `aws-terraform.yml`, the renders at `744c67c`, and the SAR snapshot.

## Method

1. **Statement matching.** I wrote my own matcher (`/tmp/claude-0/review-nd/match.py`), independent of the lead's. It reads every statement of the four nonprod deployer documents (`-allow`, `-allow-tagged`, `-read`, inline) and handles NotAction, NotResource, wildcards and conditions.
2. **Revision 3 scan.** I wrote a condition-aware scan of all revision 3 `sim` cases on the deployer roles (`rev3scan.py`). It finds every explicitDeny case that no Allow reaches, and names where each deciding Deny lives.
3. **Column check.** I re-derived the matched-statement columns from compact JSON and calibrated the convention on the synthetic A6 policy.
4. **Line-by-line reading** of the revision 3 preflight and of both new scripts.

## Findings

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | **High** | `02` §2 says "Preflight … does not list attachments". **This is false.** Revision 3 preflight runs `list-attached-role-policies`. It requires `-read`, `-allow` and `-allow-tagged` on both deployers (`expect_attached`, script lines 71-92, calls at lines 86-87) and the inline `deployer` (lines 89-90). The run reached `complete=yes`, so attachment by name was verified in AWS [O-ev]. The prior `07` §4 already said so ("Preflight already ran the attached-policy lookup"). The cited preflight range "lines 125 to 151" leaves out lines 61-124 | `b2-owner-simulation.sh` lines 61-151 |
| F2 | Medium | **Claim (a), as written, is wrong for `-allow`.** In the compact `744c67c` render, column 4806 falls *inside* `NeverExportCertificates` (which starts at 4732). `NoLogOrDatabaseData` starts at 4830, or 4829 if counted from the preceding comma. Calibration on A6: the simulator reports the second statement at its preceding comma (C120). On that basis the render predicts 4829 (nonprod) and 4765 (prod). AWS reports 4806 and 4742: both exactly 23 characters earlier. The inline claim (4573 = comma before `NeverTheOtherEnvironmentByName`) does match. The statement span (5154-4806 = 348) also matches `NoLogOrDatabaseData`. **So the live `-allow` text is not byte-identical to the render.** The difference is 23 characters, sits before that statement, and is the same in both environments. The cause is unknown: possibly normalisation, possibly content. `01` §1 "land exactly on statement starts in all three documents" is therefore incorrect | [L] `json.dumps(…, separators=(',',':'))` |
| F3 | Info | **The conclusion of (a) still holds, by elimination.** The only Deny statements in `-allow` are `NoExportableCertificates`, `NeverExportCertificates` and `NoLogOrDatabaseData`, and only the last covers `logs:GetLogEvents`. An explicitDeny sourced from `-allow` must therefore be `NoLogOrDatabaseData`. `01` should rest the claim on this argument, not on the column arithmetic | [V-repo + O-ev] |
| F4 | Medium | **`01` §4 overclaims:** "the many revision 3 cases decided that way" (by a lone managed-policy Deny). My scan finds **no** revision 3 deployer case decided only by a managed-policy Deny with no applicable Allow, except D30.1 (stream form, uninformative). LD50.1 also has the inline `NeverTheOtherEnvironmentByName`. AC05.1 and AC09.1 (ExportCertificate) and AC01.1, AC04.1 and AC07.1 (exportable RequestCertificate) all have a satisfied tag-conditioned Allow. **The "lone managed Deny" hypothesis is therefore neither weakened nor supported by revision 3: it is untested.** A row 4 outcome would affect D30.1 only, not "many" cases. The same sentence appears in follow-up table row 4 ("every revision 3 case … re-examined") | [L] `rev3scan.py` |
| F5 | Medium | **Follow-up table row 4 is incomplete.** If a lone managed Deny is not reported, then C7 (GetLogEvents on `/other`, also a lone managed Deny) must be implicitDeny. Row 4 does not constrain C7. With C3 to C5 implicitDeny and C7 explicitDeny, row 4 would fire first and state a cause that C7 contradicts. Fix: add "C7 = implicitDeny" to row 4. Also, a split result (C3 implicitDeny, C4 and C5 explicitDeny, meaning logs-specific) falls into row 8. That is acceptable, but it could be named | `01` §5 |
| F6 | Low | **Follow-up row 1 misreads a synthetic `allowed`.** C1 or C2 `allowed` would be a simulator defect, not "a policy defect". Restrict the policy-defect reading to C3 to C10 | `01` §5 |
| F7 | Medium | **"Fixed before the run" is not yet true.** The table is in an uncommitted draft. It is pre-committed only once merged, or hashed into the record, before the owner runs the script. State the sha256 of `01` at approval time | process |
| F8 | Medium | **Claim (c) is over-generalised, and the [E] beside it is weak.** A9 shows only that FilterLogEvents with an Allow `*` accepts a stream ARN, although the SAR resource type of FilterLogEvents is `log-group`. So the simulator accepts a *type-mismatched* stream ARN for FilterLogEvents, but rejects the *SAR-correct* stream ARN for GetLogEvents. That argues against a plain resource-type mismatch as the mechanism. "Internal type for GetLogEvents is log-group" is one possibility, not a finding. "Specific to GetLogEvents" rests on one other action. Say "not general to all logs actions: FilterLogEvents differs (A9)" | [O-ev] A9; SAR `logs.json` |
| F9 | Low | **Claim (b) is correct, with one wording error.** All 19 rows are present with no ERROR, no B row is allowed, A8 is allowed, A4 is allowed, A7 is explicitDeny, B1/B3/B7/B9 are implicitDeny, and A1 = A5 = implicitDeny. The applied forms are log-group (A2 + A6) and `*` (A4 + A7), so row 7 is not triggered, and B2 alone triggers row 8. The wording error: `01` §2 row 7 calls the `:*` form "applied". By the `07` §2 definition it is not, because no synthetic Deny was run on `:*`. This does not change the verdict | [O-ev] summary.tsv |
| F10 | Medium | **`02` overstates what preflight proves.** It says "Intended policy contents are live … strong for those five resources". Preflight greps for Sid strings in the default version. It does not compare documents. Together with F2, the evidence shows the platform#43 markers are present, not that the contents equal the `6b8997a` render | script lines 125-150 |
| F11 | Low | **Gaps in the evidence-print script.** It makes no AWS call, and it prints no secret: only Sids, serials, lineage, addresses, attachment role and ARN, and counts. But: (i) its attachments cover only `deployer_allow`, not `-read` or `-allow-tagged`, so "attachment pairs of the bootstrap policies" in `02` is broader than the script; (ii) the "plan commit check" does not check a commit. It should add `git -C /tmp/p7/munaxa-platform rev-parse HEAD`, which is local, plus the runbook's tree hash `b83d1077…`, which I confirmed equals `6b8997a:infra/aws/bootstrap`; (iii) `python3` runs from cwd `/tmp/p7` without `-I`; (iv) values from tfstate are Terraform's record, not live AWS | script |
| F12 | Low | **Stale or imprecise lines in `01`.** §3 Q1 says "[O-ev, as summarised]", but the JSON is now supplied. §4 says the extra Deny would sit "near the inline limit", but `NoLogOrDatabaseData` is in the managed `-allow` policy (5,701 of 6,144 characters). `00` line 38 says "any log-stream ARN", but five were tested | `01`, `00` |
| F13 | Info | **The B2 statement table in `01` §3 Q1 is independently confirmed.** The only applicable statement is `NoLogOrDatabaseData`. The eight conditioned inline Denies that match on action and resource all evaluate false with only `aws:RequestedRegion`, including the NotAction statements and the `Null`-gated negated operators. `-read` and `-allow-tagged` have no matching statement. The deployer role has no permissions boundary (`iam.tf` line 190). This is the management account, so no SCP applies | [L] `match.py` |

## Q1. Is the leading simulator hypothesis sufficiently supported?

**For the log-stream part: yes.**
- Synthetic A1 (Allow `*`) and A5 (Allow + Deny `*`) on a stream ARN match nothing.
- The same policies on the group ARN do match (A2 allowed, A6 explicitDeny).
- B1, B3, B7 and B9 reproduce revision 3 [O-ev].

This is now strong, direct evidence that the four revision 3 failures are a simulator request-form effect, not a missing deny.

**Not supported:** the mechanism. See F8.

**The hypothesis does not cover B2.** B2 is on the evaluated (group) form.

## Q2. Does B2 remain unexplained?

**Yes.** B2.json shows:
- `MatchedStatements: []`;
- a resource-specific entry with no statements;
- no missing context;
- an `EvalResourceName` equal to the supplied ARN.

That is the same shape as B4, which was evaluated seconds apart on the same role and action. B4 proves `-allow` was loaded and `NoLogOrDatabaseData` was evaluated for the log-group form.

**What the author gets right.** The "another unconditioned statement also matches" pattern fits every row. N44.1 refutes it for inline policies. My scan adds about 60 further passing lone-inline-Deny cases, for example D15.1, N40.1 and N98.1. But nothing in revision 3 tests a lone *managed* Deny (F4), so that sub-hypothesis is open.

**Alternatives the drafts do not list, and that the follow-up design partly covers:**
- a special treatment of names under the AWS-reserved `/aws/` prefix (C7 tests this);
- the simulator relevance-filtering policies by whether some Allow names the resource (C3 to C5 test this);
- non-determinism (C9 tests this).

**Not covered:** the 23-character difference between the live and rendered `-allow` text (F2). It is unlikely to matter for B2, because B4 matched the same statement, but it is unexplained.

## Q3. Is own-environment GetLogEvents adequately denied?

**Adequately evidenced, but not directly observed on the real request form.**
- B4, B5 and B8 show `NoLogOrDatabaseData` deciding explicitDeny on the group form, and B6 on `*` [O-ev].
- The live API authorizes against the log-stream ARN (SAR), and the simulator cannot evaluate that form.
- An unconditioned `Resource: "*"` matches any resource string in live evaluation [V-doc].

**The Deny is load-bearing here.** `OwnNames` (`logs:*` on `log-group:/munaxa/<env>/*`) does wildcard-match the stream ARN. So **without the Deny, own-environment GetLogEvents would be allowed live** [L].

The residual risk is that the live engine behaves like the simulator did in B2. **No evidence suggests that** [E]. Only a real GetLogEvents attempt by a deployer session would observe it directly, and that is out of scope. **Rating: Low risk, [E].** Cross-environment access is additionally covered by the inline by-name Deny (B10).

## Q4. Does revision 4 (prior `07` §3) preserve the original expectations?

**Partly.**
- No expected value changes.
- LD01.1, LD30.1 and LD50.1 on the group form are exactly B4, B8 and B10, which passed with `-allow` matched. They would pass.
- **D30.1 on the group form is exactly B2, and would fail again** (correctly flagged in `04`).
- Revision 4 tests a form the live API does not authorize against. Its security meaning therefore rests on the `*`-semantics argument (Q3), and the stream canaries record only simulator behaviour.

That is acceptable, with D30.1 handled explicitly, but **revision 4 is not justified until B2 is resolved, or until D30.1's request or expectation gets a separately approved change.**

## Q5. Is a policy modification necessary?

**No.** No row is `allowed`. The Deny is present, attached (preflight, F1) and observed deciding on every evaluable own-environment and cross-environment form. B2's group is reached by no Allow.

A specific-ARN duplicate Deny would at most change simulator output, not live enforcement. It is not needed, and I agree with rejecting it.

## Q6. Is the follow-up diagnostic sound?

**It is read-only.** It makes only `simulate-custom-policy` and `simulate-principal-policy` calls, with synthetic policies inline, and keeps the full JSON. The ARNs and context are correct.

**My matcher confirms C3, C4, C5 and C7 are lone managed-Deny cases, and C6 is a lone inline-Deny case.** In C5 the tag-conditioned `OwnTagged` Allow matches but is false.

**Minor points:**
- C8 is not used by any row;
- `P_ROLE` and the stream variables are unused;
- `mc` is not `local`.

**The table needs F5, F6 and F7 before it can be called complete and pre-committed.**

## Q7. Is the bootstrap evidence assessment (`02`) accurate?

**Mostly.**
- "GitHub cannot hold it" is correct: `aws-terraform.yml` line 17 says bootstrap is CloudShell-only.
- The runbook writes to `/tmp/p7`, and the apply output and attachment listing are scrollback only.
- The `actions_list` result was not re-verified by me [U].

**The errors are F1 and F10.** Attachments by name were verified at revision 3 time [O-ev]. Contents are verified only as markers.

**The NOT VERIFIED status for the re-apply is correct.** The plan, the 0/5/0 counts, the post-apply `No changes.` and the serial advance are all unevidenced [O-rep / U].

## Q8. Other factual errors

F2, F4, F8, F9 and F12.

**`01` line 168 (`iam_allow.tf` line 477) is correct.** It should also cite preflight lines 86-87.

**The verdict `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` is correct.** Row 8 is triggered, and the confirmation criteria (row 9) are not met. The drafts claim no G3, Testing or re-apply readiness.

## Required changes before merge

1. **`02`:** correct F1 and the line range, and soften F10.
2. **`01` §1:** replace the column claim with the elimination argument, and record the 23-character offset as an open item (F2, F3).
3. **`01` §4 and follow-up row 4:** remove "many revision 3 cases" (F4).
4. **Follow-up table:** apply F5 and F6, and record the sha256 of `01` at approval (F7).
5. **`01` §2:** reword the A9 inference (F8) and the row 7 `:*` wording (F9).
6. **Evidence print:** add the local `git rev-parse` of the clone, and correct `02`'s description of what it prints (F11).

REVIEW CONCLUSION: AGREE WITH CHANGES — the blocked verdict, the not-verified re-apply status and "no policy change" are sound, but `02` misstates preflight (attachments were verified), the `-allow` column mapping is off by 23 characters, the lone-managed-Deny impact is overclaimed, and follow-up row 4 must also require C7 = implicitDeny.
