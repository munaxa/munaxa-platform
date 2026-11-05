# Phase 6, Agent 3 addendum: analysis of owner simulation run 1

Date: 5 Nov 2026. Author: Agent 3. Labels: [V-aws] the owner's real CloudShell output,
[V-doc] AWS documentation, [V-repo] repository or rendered policy, [E] inferred, [U] not verified.
I made no AWS calls of any kind. The AWS documentation I used is the public IAM API Reference and
the public Service Authorization Reference JSON (`servicereference.us-east-1.amazonaws.com`, no
credentials, saved under `a3/sar/`).

## 1. Run 1 in short [V-aws]

- **Source**: `phase6/reapply/stage2-3-cloudshell-output.txt`. The script was revision 1 (sha256 `b62dbbef…c61002`; the hash check printed OK), run as `arn:aws:iam::229251310592:root`.
- **State key** resolved to `key/679d1b6b-cb6a-491b-a585-cb630b3fbce5`.
- **Result line**: `RESULT total=332 expected_match=299 unexpected_mismatch=33`, exit 1.
- **First real AWS simulation in the project.** 299 calls returned exactly the locally evaluated decision. This includes:
  - the four state key lines that were broken in Phase 5 (D22, D23, SR073, SR074);
  - every N01 to N14 state key, alias and bucket case;
  - all CI role cases;
  - all session cases except SR083.2.
- **The 33 mismatches are 29 request errors plus 4 decisions.** None of them shows a policy that grants more than designed.

| Group | Calls | Cause | Fix in revision 2 |
| --- | ---: | --- | --- |
| (a) ValidationError on `contextKeyType` | 5 (D13.1, D14.1, N75.1, N78.1, N79b.1) | `ec2:Vpc` was sent with type `arn` | Type `string` |
| (b) ValidationError on `policyInputList` | 24 (all B and BP cases) | The boundary was sent as one document over the 2,000-character member limit | Split into documents of at most 1,500 characters |
| (c) Real decisions differing from expected | 4 (SR083.2, N70.1, N71.1, N74.1) | The request named an ARN that the action never authorizes on | 3 requests corrected; 1 expected value changed (§4) |

**Check of my local tools.** The stub `aws` now enforces both API validations, and the evaluator now applies the Service Authorization Reference's resource types. Run on revision 1, they reproduce **exactly the same 33 ids** and the same 299 passes (`evidence/stub/out/p6r1/`).

## 2. (a) Context key type

- [V-doc] IAM API Reference, `ContextEntry`, says: "Valid Values: `string | stringList | numeric | numericList | boolean | booleanList | ip | ipList | binary | binaryList | date | dateList`". There is no `arn` value.
- The run 1 error lists the same set [V-aws].
- [V-doc] The Service Authorization Reference types `ec2:Vpc` as `ARN`. That is the key's condition type, used with `ArnEquals` in `NeverInProtectedVpcs` (`iam.tf:407-417`). The simulator API has no matching context type, so an ARN-valued key is passed as `string`.
- Precedent [V-aws]: `iam:PermissionsBoundary` was passed as `string` in revision 1, and D31, D32, D33 and S07 passed.
- **Change**: `"ContextKeyType":"arn"` becomes `"string"` in D13.1, D14.1, N75.1, N78.1 and N79b.1. The script no longer contains `arn` as a type.
- **Only D14.1 really depends on `ArnEquals` matching a string-typed entry** [U until run 2]. The other four lines have the same expected result either way.
  - If D14.1 returns `allowed` in run 2, the cause is either the simulator's handling of the type or a real gap.
  - In that case, run the D14.1 call without `--query` and check whether `MissingContextValues` or the matched statements name `NeverInProtectedVpcs`.

## 3. (b) Boundary documents and the 2,000 limit

- **Observed** [V-aws]: `Value at 'policyInputList' failed to satisfy constraint: Member must have length less than or equal to 2000`, on all 24 `simulate-custom-policy` calls.
- **Documented** [V-doc]: the SimulateCustomPolicy page gives `PolicyInputList.member.N` (and `PermissionsBoundaryPolicyInputList`) a maximum length of 131,072. **The service enforced 2,000.** I treat the observed limit as authoritative and cannot explain the difference [U].
- **Sizes** [V-repo, rendered from 46dfbd9]:

  | Boundary | Minified | `--output json` (indent 4), as the script stored it | Statements |
  | --- | ---: | ---: | ---: |
  | nonprod | 2,635 | 4,597 | 14 |
  | prod | 2,611 | 4,573 | 14 |

  Both are over 2,000 even when minified, so minifying alone does not help.
- **`--permissions-boundary-policy-input-list` does not solve it.** It takes exactly one boundary document ("You can input only one permissions boundary") with the same member constraint, so the document cannot be split there.
- **Chosen method: split the boundary into several identity policies in one `simulate-custom-policy` call.**
  - IAM evaluates all identity policies of a request as one set: any matching explicit Deny wins, otherwise any matching Allow, otherwise implicit deny.
  - Each statement is evaluated on its own, so spreading whole statements over several documents gives the same decision as the single document [V-doc, IAM policy evaluation logic].
- **How the script does it.** After `get-policy-version`, a small `python3 -I` step:
  - minifies the document;
  - packs whole statements greedily into documents of at most 1,500 characters (a margin below 2,000);
  - checks that the concatenated statements equal the original list, same content and same order;
  - writes a JSON array of strings, which the CLI passes as several members.
- The preflight stops (exit 2) if `python3` is missing or the split cannot be made.
- Locally, against the rendered boundaries: nonprod becomes 2 documents of 1,463 and 1,210 characters, and prod 2 documents of 1,448 and 1,201. The stub enforces the 2,000 limit and evaluates the parts as a set: 24 of 24 match.
- **Alternative evidence if this also fails:**
  - The boundary documents were rendered offline from 46dfbd9 [V-repo], and the post-apply plan was clean [V-aws per the lead]. So AWS holds exactly the rendered JSON in `evidence/rendered/boundary_*.json`.
  - The owner can compare them with `aws iam get-policy-version … --query PolicyVersion.Document` (read-only) and a JSON diff.
  - No stack role carries a boundary until G3. After G3, the simulator can test a real stack role (`simulate-principal-policy` on `role/munaxa-shared/munaxa-nonprod-*`), which evaluates the attached boundary server-side, with no size limit on our side.

## 4. (c) The four real outcomes

**Common cause** [V-doc, Service Authorization Reference JSON, `a3/sar/ec2.json`, `a3/sar/servicediscovery.json`]. All four calls named an ARN that IAM never evaluates for that action. The simulator then finds no applicable statement and returns `implicitDeny`.
- I ran a check of all 332 cases against the reference (`evidence/tools/sar_check.py`, output in `evidence/sar-check-phase6.txt`). It flags exactly these four in revision 1, and nothing else, except calls on `*`, which the policy grants on `*`.

### SR083.2: session `ec2:RevokeSecurityGroupIngress` on `security-group-rule/sgr-1`

- [V-doc] RevokeSecurityGroupIngress has one resource type, `security-group` (condition keys `aws:ResourceTag/*`, `ec2:ResourceTag/*`, `ec2:SecurityGroupID`, `ec2:Vpc`). It has **no `security-group-rule` resource.**
- Statement `SessionIngressOnOwnGroups` (`iam_session.tf:119-133`, rendered in `session_nonprod.json`) does list `security-group-rule/*`. IAM simply never evaluates that ARN for Revoke.
- No condition "fails" on the rule. The resource is outside the action's authorization.
- **Session `down` and `up` after G3 are not broken.**
  - The real Revoke request authorizes only on the task security group, and that is SR083.1, which **passed** [V-aws].
  - `up` uses AuthorizeSecurityGroupIngress on the group (SR081.1 passed), on the new rule with request tags (SR081.2 passed, via `SessionNewRules`), and CreateTags on the rule at create (SR082.1 passed).
  - The final proof is the first session run after G3 [U].
- **Agent 5's P4 is not needed for this.** P4 (`a5/evidence/P4-r10-no-session-sg-rules.patch`) makes `from_alb` persistent and removes every session security-group rule action, to close R10.
  - If P4 is merged, SR081.1, SR081.2, SR082.1 and SR083.1 must change from `allowed` to a deny in the script. They would become positive tests that the session can no longer touch rules.
- Optional tidy-up, no security effect: the `security-group-rule/*` resource in `SessionIngressOnOwnGroups` never matches anything.
  - Revoke does not use it.
  - For Authorize, the reference gives the rule only `aws:RequestTag` and `aws:TagKeys`, so the `aws:ResourceTag` conditions of that statement can never match a rule.
- **Expected value changed** (the only one): SR083.2 `allowed` becomes `implicitDeny`. The line is relabelled as a canary for "not a resource of Revoke".
  - Evidence: the reference entry above, and the [V-aws] result. My revision 1 expectation was wrong because my evaluator did not model resource types.

### N70.1: `servicediscovery:TagResource` with own tags on an untagged namespace (residual R3)

- [V-doc] `servicediscovery:TagResource` has **no resource types**. Its only condition keys are `aws:RequestTag/${TagKey}` and `aws:TagKeys`. IAM authorizes it against `*`, and `aws:ResourceTag` is not available.
- The run 1 call named `namespace/ns-u`, an ARN the action never uses, so the result was `implicitDeny`.
- **Real IAM does not deny the real request.** A real TagResource is evaluated on `*`, and `CreateWithOwnTags` (`iam_allow.tf:209-226`, Resource `*`, request tags Project = munaxa and Environment = nonprod) allows it. **R3 is real and not safer than reported.** It stays a residual for the owner to accept or close. Phase 5 report `02` §5 already derived R3 from this very fact.
- **What Terraform needs at G3 is not denied by this.**
  - D53.1 (CreatePrivateDnsNamespace with tags, on `*`) passed [V-aws].
  - D54.1 (CreateService on the own namespace) passed [V-aws].
  - D54.2 (the new service with tags) passed [V-aws].
  - Any tagging that Cloud Map authorizes at create is `servicediscovery:TagResource` on `*` with the stack's request tags. That is exactly the corrected N70.1, through the same statement and conditions as D53. It is allowed locally; [U until run 2].
- **Request changed, expected value unchanged**: resource `namespace/ns-u` becomes `*`, still `allowed`.

### N71.1 and N74.1: the same claim with Environment = prod (deployer, session)

- Same cause: an ARN for an action with no resource types.
- On `*`, these hit `NeverCreateForTheOtherEnvironment` (`iam.tf:370-380`; the session inherits it through `source_policy_documents`), so the expected `explicitDeny` stands.
- **Request changed, expected value unchanged**: resource becomes `*`.

## 5. Every change from revision 1 to revision 2

| Line | Change | Evidence |
| --- | --- | --- |
| D13.1, D14.1, N75.1, N78.1, N79b.1 | `ec2:Vpc` type `arn` becomes `string`; expected unchanged | API ContextEntry enum [V-doc]; run 1 error [V-aws] |
| All 17 B and 7 BP lines | Boundary passed as a JSON list of whole-statement documents of at most 1,500 characters; expected unchanged | Run 1 error [V-aws]; IAM evaluation logic [V-doc] |
| SR083.2 | **Expected `allowed` becomes `implicitDeny`**; description relabelled | SAR: Revoke has only `security-group` [V-doc]; run 1 [V-aws] |
| N70.1, N71.1, N74.1 | Resource `namespace/ns-u` becomes `*`; expected unchanged | SAR: TagResource has no resource types [V-doc] |
| Header | Revision note, the split step, and a `python3` precondition | — |

No other expected value changed.
- Totals: 332 calls (160 allowed, 100 explicit deny, 72 implicit deny); 308 `simulate-principal-policy` and 24 `simulate-custom-policy`.
- AWS invocations: 345 in total, all read-only, the same set of operations as revision 1.

## 6. Revision 2 artefacts

- **Script**: `a3/evidence/b2-owner-simulation.sh`, sha256 **`5186cbc66385efc64683b1a16e9b58dc4e2ac5d22840ad0b00311922689fd205`**.
- **Diff from revision 1**: `a3/evidence/b2-owner-simulation.rev1-to-rev2.diff` (sha256 `5e216ad0…91e953`): 9 check lines changed plus the header.
- **Revision 1, kept**: `a3/evidence/b2-owner-simulation.rev1.sh` (`b62dbbef…`).
- **Diff from Phase 5**: `a3/evidence/b2-owner-simulation.phase5-to-phase6.diff`.
- **Checks** (all local, not AWS):

  | Check | Result |
  | --- | --- |
  | `bash -n` | Clean |
  | Local evaluator (SAR-aware) | 332/332 |
  | Stub, local answers | exit 0, 332/332 |
  | Stub, always `allowed` | exit 1 |
  | Stub, API error on every call | exit 1 |
  | Stub, #38 policies missing | exit 2 |
  | Stub on revision 1 | the same 33 failures as the real run |

  shellcheck was not run (unavailable) [U].
- **Owner run 2** (read-only, as root in CloudShell): the same command as run 1, with the new hash. **Success**: exit 0 and `RESULT total=332 expected_match=332 unexpected_mismatch=0 expected_total=332 complete=yes`. If D14.1 fails, see §2.

## 7. Summary

1. Run 1 was the first real AWS simulation. 299 of 332 calls matched, including every state key, alias, bucket, CI role and cross-environment case.
2. 29 of the 33 mismatches were request errors, not decisions.
3. (a) `arn` is not a valid ContextKeyType. `ec2:Vpc` is now sent as `string`; only D14.1 depends on that [U].
4. (b) The service enforced a 2,000-character limit per policyInputList member, although the docs say 131,072. The boundaries (2,635 and 2,611 minified) are now split into whole-statement documents of at most 1,500 characters, which evaluate identically.
5. (c) All 4 real outcomes come from ARNs the action never uses, per the Service Authorization Reference. A check of all 332 cases flags only these.
6. SR083.2: Revoke authorizes only on the security group (SR083.1 passed), so session up and down are not broken. The expected value changed to implicitDeny. P4 is not needed for this.
7. N70, N71 and N74: TagResource has no resource types, so they are now simulated on `*`. R3 remains a real residual, and nothing Terraform needs is denied (D53 and D54 passed).
8. Only one expected value changed (SR083.2). Every other change fixes the request.
9. Revision 2 sha256 is `5186cbc6…89fd205`. Locally and in the stub it gives 332/332; the stub reproduces run 1 exactly.
10. Owner run 2 is required; success is exit 0 with 0 mismatches.
