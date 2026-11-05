# B2: detailed analysis of the diagnostic discrepancy

**Date:** 5 Nov 2026, from about 11:20 UTC.
**Author:** the lead.
**AWS calls:** none. Repository and offline analysis only.

**Labels:**

| Label | Meaning |
| --- | --- |
| [O-ev] | owner-provided AWS evidence |
| [V-repo] | repository, at `6b8997a` (IAM-identical to the `744c67c` render) |
| [V-doc] | AWS documentation |
| [L] | local analysis |
| [E] | inference |
| [U] | unverified or unavailable |

## 1. Evidence

The owner supplied, at 11:25 UTC, `summary.tsv` (all 19 rows) and `A6.json`, `B2.json`, `B4.json` and `B6.json`. They are copied unmodified to `supporting/diagnostic-1-results/`, with `SHA256SUMS` [O-ev]. The diagnostic script was `getlogevents-diagnostic.sh`, sha256 `be3cbb81…d189`.

Every resource below begins with `arn:aws:logs:eu-central-1:229251310592:`. Matched statements are given as policy, then character column.

### Block A: synthetic policies (`simulate-custom-policy`)

| Test | Policy, action and resource | Decision | Matched |
| --- | --- | --- | --- |
| A1 | Allow `*`, GetLogEvents, `…identity:log-stream:ecs/identity/1` | implicitDeny | none |
| A2 | Allow `*`, GetLogEvents, `log-group:/munaxa/nonprod/identity` | allowed | input, C38 (Allow) |
| A3 | Allow `*`, GetLogEvents, `…identity:*` | allowed | C38 |
| A4 | Allow `*`, GetLogEvents, `*` | allowed | C38 |
| A5 | Allow and Deny `*`, GetLogEvents, stream | implicitDeny | none |
| A6 | Allow and Deny `*`, GetLogEvents, log group | explicitDeny | C120 (Deny) |
| A7 | Allow and Deny `*`, GetLogEvents, `*` | explicitDeny | C120 |
| A8 | Allow `*`, FilterLogEvents, log group | allowed | C38 |
| A9 | Allow `*`, **FilterLogEvents, stream** | **allowed** | C38 |

### Block B: live deployer roles (`simulate-principal-policy`)

| Test | Role, action and resource | Decision | Matched |
| --- | --- | --- | --- |
| B1 | nonprod, GetLogEvents, `/aws/other:log-stream:x` | implicitDeny | none |
| **B2** | **nonprod, GetLogEvents, `log-group:/aws/other`** | **implicitDeny** | **none** |
| B3 | nonprod, GetLogEvents, nonprod stream | implicitDeny | none |
| B4 | nonprod, GetLogEvents, `log-group:/munaxa/nonprod/identity` | explicitDeny | `munaxa-shared-deployer-nonprod-allow` C4806 |
| B5 | nonprod, GetLogEvents, `…identity:*` | explicitDeny | `-allow` C4806 |
| B6 | nonprod, GetLogEvents, `*` | explicitDeny | `-allow` C4806 |
| B7 | prod, GetLogEvents, prod stream | implicitDeny | none |
| B8 | prod, GetLogEvents, `log-group:/munaxa/prod/identity` | explicitDeny | `munaxa-shared-deployer-prod-allow` C4742 |
| B9 | nonprod, GetLogEvents, prod stream | implicitDeny | none |
| B10 | nonprod, GetLogEvents, `log-group:/munaxa/prod/identity` | explicitDeny | `-allow` C4806, and the inline `deployer` C4573 |

### Which statements the columns are

**The inline column is confirmed** [V-repo + L]: column 4573 of the inline nonprod `deployer` policy is `{"Sid":"NeverTheOtherEnvironmentByName",…}` in the compact render.

**The `-allow` columns do not line up with the render** (independent review `03`, finding on claim a):
- In the compact 744c67c render, column 4806 falls inside `NeverExportCertificates`.
- Calibrated on A6, the render predicts `NoLogOrDatabaseData` at 4829 (nonprod) and 4765 (prod).
- AWS reports 4806 and 4742, so the live text before that statement is 23 characters shorter in both environments. Why is not known [U].

**The deciding statement is still `NoLogOrDatabaseData`,** by elimination rather than by column [V-repo + L]. In `-allow` it is the only Deny that covers `logs:GetLogEvents`. No Allow can produce `explicitDeny`, and no other Deny in `-allow` lists a `logs:` action.

**So it is now observed in AWS that `NoLogOrDatabaseData` decided B4, B5, B6, B8 and B10** [O-ev + elimination].

## 2. Applying the pre-established table (`2026-11-05-second-bootstrap-reapply/07` §2)

| Row | Condition | Result |
| --- | --- | --- |
| 1 | ERROR or fewer than 19 rows | Not triggered: 19 rows, no ERROR |
| 2 | Any B row `allowed` | Not triggered |
| 3 | A8 ≠ allowed | Not triggered (A8 allowed) |
| 4 | A4 ≠ allowed or A7 ≠ explicitDeny | Not triggered |
| 5 | B1/B3/B7/B9 ≠ implicitDeny | Not triggered: revision 3 reproduces |
| 6 | A1 or A5 ≠ implicitDeny | Not triggered: A1 = A5 = implicitDeny |
| 7 | No applied form | Not triggered: the log-group form (A2 allowed, A6 explicitDeny) and `*` (A4 allowed, A7 explicitDeny) are applied. The `:*` form was evaluated for an Allow (A3), but no synthetic Deny was run on it |
| **8** | An applied-form B row = implicitDeny | **Triggered by B2 alone.** B4, B5, B6, B8 and B10 are explicitDeny |
| 9 | Confirmation | **Not reached** |

**Result:** **`ROOT CAUSE UNRESOLVED — REMAINS BLOCKED`**, as fixed before the run.

**What the run did confirm:**
- **The log-stream part of the hypothesis.** The simulator applies no statement, not even a synthetic `*` Allow or Deny, to GetLogEvents on a log-stream ARN (A1, A5, B1, B3, B7, B9).
- **The log-group form is evaluated, unlike the stream form.** A9 shows the simulator accepts a stream ARN for **FilterLogEvents**, although that action's SAR resource type is `log-group`. So a plain resource-type mismatch does not explain A1. The claim that the stream behaviour is GetLogEvents-specific rests on this one other action [E].

## 3. Question by question

### Q1. Why does B2 return implicitDeny?

**Not established.**

**What the repository shows for B2** [V-repo + L]. I matched every statement in the four documents attached to `munaxa-shared-deployer-nonprod`: `-allow`, `-allow-tagged`, `-read` and the inline `deployer`. For `logs:GetLogEvents` on `log-group:/aws/other`:

| Policy | Statement | Effect | Matches action and resource | Condition met with only `aws:RequestedRegion=eu-central-1`? |
| --- | --- | --- | --- | --- |
| `-allow` (managed) | `NoLogOrDatabaseData` | Deny | yes (`Resource: "*"`) | **no condition, so it applies** |
| `-allow` (managed) | `OwnNames` | Allow | no (`/munaxa/nonprod/*` only) | - |
| inline | `ThisRegionOnly` (NotAction) | Deny | yes | no (region is eu-central-1) |
| inline | `NeverAnotherProjectByTag` | Deny | yes | no (`Null aws:ResourceTag/Project = false` needs the key) |
| inline | `NeverTagForAnotherProject` | Deny | yes | no |
| inline | `NeverMunaxaDocsProductionByTag` | Deny | yes | no |
| inline | `NeverTagAsMunaxaDocs` | Deny | yes | no |
| inline | `NeverTheOtherEnvironmentByTag` | Deny | yes | no |
| inline | `NeverCreateForTheOtherEnvironment` | Deny | yes | no |
| inline | `NeverInProtectedVpcs` (NotAction) | Deny | yes | no (`ec2:Vpc` absent) |
| inline | `NeverTheOtherEnvironmentByName` | Deny | no (`/munaxa/prod/*`) | - |
| `-allow-tagged`, `-read` | (all) | - | no matching statement | - |

**What the expected result would be.** By IAM evaluation logic [V-doc: an explicit Deny in any applicable policy overrides], B2 should be **explicitDeny** from `NoLogOrDatabaseData`.

**What actually happened.** The simulator reported no matched statement at all [O-ev, B2.json]. A Deny on `*` with no condition cannot fail to match the resource string. So either:
- the simulator did not evaluate `NoLogOrDatabaseData` for this request; or
- the policy it evaluated is not the one in the repository.

Preflight makes the second less likely, because it found the Sid in the live `-allow` document [O-ev].

### Q2. Why does synthetic A6 show the Deny, while live B2 does not?

A6 and B2 differ in **three** ways, not one:

| | A6 | B2 |
| --- | --- | --- |
| API | `simulate-custom-policy` | `simulate-principal-policy` |
| Policies | one synthetic policy: Allow `*` + Deny `*` | four attached policies; the Deny sits in a managed policy |
| Resource | `/munaxa/nonprod/identity` (own name) | `/aws/other` (foreign name) |
| Other matching statements | the synthetic Allow `*` | **none unconditioned except the Deny itself** |

A6 therefore does not test the B2 resource. No test so far isolates which of the three differences matters [L].

**One structural pattern does fit every result known so far** [L, E]. In every explicitDeny row, another unconditioned statement also matches the resource:
- **B4 and B5:** `OwnNames`, the Allow `logs:*` on `/munaxa/nonprod/*`.
- **B8:** prod `OwnNames`.
- **B10:** `NeverTheOtherEnvironmentByName`, the inline Deny `*` on `/munaxa/prod/*`.
- **B6:** for `*`, every statement.
- **A6:** the synthetic Allow `*`.

In B2, the only unconditioned matching statement is the lone `*` Deny in the managed `-allow` policy.

B10 adds a further data point: `NoLogOrDatabaseData` *was* reported there with no Allow present, but another (inline, specific-ARN) Deny also matched.

**This pattern is a hypothesis, not a cause.** It is contradicted for the inline policy. In revision 3, N44.1 (`secretsmanager:PutResourcePolicy` on `secret:munaxa-nonprod/x-AbCdEf`) passed as explicitDeny [O-ev], and by my matcher its only unconditioned matching statement is the inline `NeverAccountSettingsOrSharing` (Deny on `*`) [L]. So "a lone `*` Deny is not reported" is false in general. It could still be true:
- for a lone Deny in an attached **managed** policy;
- for logs specifically;
- for a foreign group name such as `/aws/...`.

The follow-up test in §5 separates these.

### Q3. Which policy documents and statements were evaluated in B2?

**From the output:** no statement matched [O-ev]:
- `MatchedStatements` is `[]`;
- the single `ResourceSpecificResults` entry has no `MatchedStatements` key;
- `EvalDecisionDetails` is `{}`;
- `MissingContextValues` is `[]`.

The simulator lists only matching statements [V-doc], so the output cannot show which policies it loaded. B4 (same role and action, seconds apart) shows that the `-allow` policy was loaded and that `NoLogOrDatabaseData` was evaluated for GetLogEvents on a log-group ARN. B10 shows that the inline policy was loaded [O-ev].

### Q4. Does the output explain the discrepancy?

**No.**
- B2.json has the same shape as B4.json.
- Its `EvalResourceName` is the exact ARN in both, in the same log-group form. So the simulator classified both resources the same way. (The API documentation says this field is a template; here it is the supplied ARN [O-ev vs V-doc].)
- No context key is missing, and there are no decision details.

**The only difference is the log group name** (`/aws/other` against `/munaxa/nonprod/identity`). That difference changes which *other* statements match: `OwnNames` matches the Munaxa name and nothing matches `/aws/other` (§3 Q1 table).

### Q5. Is the result consistent with the simulator, the principal and the attachments?

**The principal and the attachments are consistent:**
- B2, B4 and B10 used the same role.
- `-allow` is attached (`iam_allow.tf` line 477), and was evaluated in B4 and B10 [V-repo + O-ev].

**The simulator is not consistent with IAM semantics here.** An unconditioned Deny on `*` was evaluated for one log-group ARN (B4) and not for another (B2), with the same role, action and policies. No published AWS documentation found so far explains this [V-doc search].

### Q6. What it means for the security guarantee of `NoLogOrDatabaseData`

| Scope | What has now been observed | Remaining gap | Live access risk |
| --- | --- | --- | --- |
| Own environment, nonprod (`/munaxa/nonprod/*`) | **explicitDeny decided by `NoLogOrDatabaseData`** for GetLogEvents on the log-group form (B4, B5) and on `*` (B6) [O-ev] | The SAR form (the log-stream ARN) cannot be evaluated by the simulator (A1, A5) | Low [E]: an unconditioned `*` Deny covers every resource string in live evaluation [V-doc]. This rests on the simulator and live engine agreeing on `*`, which B4 to B6 support |
| Own environment, prod | **explicitDeny decided by `NoLogOrDatabaseData`** on the log-group form (B8) [O-ev] | As above | Low [E] |
| Cross-environment (nonprod deployer on prod) | **explicitDeny decided by `NoLogOrDatabaseData` and `NeverTheOtherEnvironmentByName`** (B10) [O-ev] | As above | None found: a by-name inline Deny also applies, and no Allow exists |
| Foreign log groups (`/aws/other`) | **implicitDeny** (B2): the Deny is not observed | **Why the Deny is not reported is unexplained** | None found: no Allow covers `/aws/other` (`OwnNames` covers `/munaxa/<env>/*`, and `-read` allows only Describe/ListTags), so the live request is refused even without the Deny [V-repo + L]. Nonetheless the guarantee "refused by `NoLogOrDatabaseData`" is **not demonstrated** for foreign groups |

**The practical risk** is therefore not an observed grant of access. It is that **the deny's behaviour is not understood in one case**. Until it is, the claim "a `*` Deny is always reported by this simulator" is false, and no simulation case built on that claim is trustworthy. That is why the verdict stays blocked.

## 4. Is a policy change necessary?

**No change is indicated by the evidence** [L]:
- No row returned `allowed`.
- Every own-environment and cross-environment row on an evaluable form returned explicitDeny.
- B2 concerns a resource that no Allow reaches.

**Changes considered and rejected:**
- **Adding a specific-ARN Deny** (for example `log-group:*`) next to the `*` one would only work around a simulator symptom. It would add size to the managed `-allow` policy (5,701 of 6,144 characters in the render), and it would hide the question rather than answer it.
- **Narrowing or moving the deny** could weaken R10.

**This is re-examined if:**
- the follow-up test shows the simulator ignores lone managed-policy denies in general, because every future case decided only by a managed-policy Deny would then be untestable. The independent review's condition-aware scan of revision 3 found **no** such case apart from D30.1; about 60 lone inline-Deny cases passed (`03`). In that case the test suite, not the policy, needs rework;
- or any live row returns `allowed`.

## 5. Follow-up controlled test (prepared, not run, needs owner approval)

**Script:** `supporting/b2-followup-diagnostic.sh`. The table below is fixed once this report is on main, before the owner runs the script. Its sha256 is `83bdb7acaa2fb9ce4dd669ba4d8ba07c6b380545137a644af89171fee021f6d6`.

**Calls.** It makes 10 calls, `iam:SimulateCustomPolicy` or `iam:SimulatePrincipalPolicy` only, all read-only. The full JSON is kept. I tested it offline with a stub: syntax OK, 10 rows [L].

**B2.json does not explain B2 (Q4), so this test is the next step.**

| Test | What it isolates | Resource |
| --- | --- | --- |
| C1 | Synthetic B2: Allow `*` + Deny `*`, custom | `log-group:/aws/other` |
| C2 | Synthetic lone Deny `*`, custom | `log-group:/aws/other` |
| C3 | Live role, lone managed Deny (`NoLogOrDatabaseData`), other logs action | FilterLogEvents on `/aws/other` |
| C4 | Live role, lone managed Deny (`NoLogOrDatabaseData`), RDS | `rds:DownloadDBLogFilePortion` on `db:other-db` |
| C5 | Live role, lone managed Deny (`NeverExportCertificates`), ACM | `acm:ExportCertificate` on `certificate/foreign` |
| C6 | Control: live role, lone **inline** Deny (`NeverAccountSettingsOrSharing`), like N44.1 | `secretsmanager:PutResourcePolicy` on `secret:other/x-AbCdEf` |
| C7 | Name: a non-`/aws/` foreign group | GetLogEvents on `log-group:/other` |
| C8 | Name: a second own-named group | GetLogEvents on `log-group:/munaxa/nonprod/zzz` |
| C9, C10 | Reproduce B2 and B4 | as B2 and B4 |

**Interpretation, fixed before the run.** Rows are checked in order, and the first match decides.

| # | Observed | Conclusion |
| --- | --- | --- |
| 1 | Any ERROR, fewer than 10 rows, or any C row `allowed` | No conclusion. A live (C3 to C10) `allowed` is a policy defect: stop. A synthetic (C1, C2) `allowed` is a simulator defect: stop and report |
| 2 | C9 ≠ implicitDeny or C10 ≠ explicitDeny | B2 or B4 does not reproduce. Unresolved |
| 3 | C6 ≠ explicitDeny | The control fails. Unresolved |
| 4 | C1 = explicitDeny, C2 = explicitDeny, C3 = C4 = C5 = implicitDeny, and C7 = implicitDeny | **The simulator does not report a lone Deny from an attached managed policy.** It is a simulator behaviour; the live policy is unaffected [E]. No other revision 3 case is decided that way (`03`), but future cases must not rely on a lone managed-policy Deny. Owner review required |
| 5 | C1 or C2 = implicitDeny | The foreign group name is not evaluated even synthetically. A resource-name behaviour of the simulator. Owner review required |
| 6 | C7 = explicitDeny and C9 = implicitDeny | Specific to `/aws/` names. Owner review required |
| 7 | C3/C4/C5 = explicitDeny, C1/C2 = explicitDeny, C7 = implicitDeny | Specific to GetLogEvents on foreign groups. Unresolved; ask AWS Support |
| 8 | Any other combination | Unresolved |

**No result of this table alone makes the verdict "confirmed".** Rows 4 to 6 give a cause, which then needs an independent review and owner approval before any change to the acceptance criteria.
