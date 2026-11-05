## 10. Simulation revision 2 review, 5 Nov 2026

Inputs: `phase6/reapply/stage2-3-cloudshell-output.txt` (real owner output, [V-aws]);
`a3/02a-SIMULATION-RUN-1-ANALYSIS.md`; revision 2 `a3/evidence/b2-owner-simulation.sh` (sha256 checked by me:
`5186cbc66385efc64683b1a16e9b58dc4e2ac5d22840ad0b00311922689fd205`); revision 1
`a3/evidence/b2-owner-simulation.rev1.sh` (`b62dbbef...61002`, the hash the run printed OK for). I made no AWS
call. My own check scripts and results are in `a7/evidence/sim2/`.

**Re-apply facts from the output** [V-aws]:
- `Apply complete! Resources: 19 added, 4 changed, 0 destroyed.` The plan predicted 6 changes. The 2 missing
  ones are the deployer trust re-reads, which rendered identical at apply, so they were no-ops. That matches
  §1 and is not a defect.
- Post-apply plan: `exit 0`, "No changes".
- Caller `arn:aws:iam::229251310592:root`. State key `key/679d1b6b-cb6a-491b-a585-cb630b3fbce5`.
- Run 1 result: 299 PASS, 33 FAIL, `exit 1`.

**(1) Expected values.** Verified by my own line-by-line comparison of all 332 `check` lines in revision 1 and
revision 2 (same 332 ids, 9 lines differ):
- D13.1, D14.1, N75.1, N78.1, N79b.1: the **only** change is `"ContextKeyType":"arn"` to `"string"`.
- N70.1, N71.1, N74.1: the only change is the resource `namespace/ns-u` to `*`, in the call and in the
  description. Expected values are unchanged.
- SR083.2 is the **only** expected-value change (`allowed` to `implicitDeny`), plus its description.
- Justification against the Service Authorization Reference (`a3/sar`; `ec2.json` is byte-identical to the copy
  Agent 2 downloaded independently):
  - `ec2:RevokeSecurityGroupIngress` has resource type `security-group` only;
  - `servicediscovery:TagResource` has **no** resource types (condition keys `aws:RequestTag/*` and
    `aws:TagKeys` only).
- These changes follow from the reference, not from the run 1 output.
  - SR083.2 is now a canary that cannot fail on policy content. The real Revoke check is SR083.1, which passed
    in run 1.
  - N70.1 on `*` exercises `CreateWithOwnTags` (allowed, residual R3 confirmed real). N71.1 and N74.1 on `*`
    exercise `NeverCreateForTheOtherEnvironment` (explicitDeny).
- My own resource-type check of every revision 2 case against the reference flags only SR083.2 (intended)
  and nothing else (`a7/evidence/sim2/sar-check-rev2.txt`). The 14 calls on `*` are reads whose resource
  scope is `*` in the policy. So no other case passes vacuously because of an inapplicable ARN.

**(2) Boundary split.**
- I extracted the script's own `python3 -I` block and ran it on my independent renders of both boundaries in
  the `--output json` indent-4 form. Nonprod: 14 statements in 2 documents of 1,463 and 1,210 characters. Prod:
  14 statements in 2 documents of 1,448 and 1,201 characters. In both cases the concatenated statements equal
  the original list, every document has Version 2012-10-17, and every document is at most 1,500 characters.
- IAM evaluates all identity policies of a request as one set, statement by statement: an explicit Deny in any
  document wins, otherwise an Allow in any document. Statements are moved whole, never edited. So the split is
  equivalent to the single document, which was already simulated as an identity policy (unchanged method) [E,
  IAM evaluation logic].
- Safety as root: the step only reads and writes inside the `mktemp -d` folder, and the AWS operations are the
  same 8 read-only ones as revision 1 (grep). Any failure (no python3, a statement over 1,500 characters, a
  failed assertion) calls `precondition_failed`, which exits 2 before anything is simulated. `bash -n` is
  clean. Exit logic is unchanged: 0 only if 332 ran with 0 mismatches.
- For later: with P3 and p6-02 the nonprod boundary needs 3 documents (1,463/1,342/271), and the split still
  works.

**(3) ContextKeyType.** Run 1's own error lists the accepted enum, and it has no `arn` [V-aws]. No line in
revision 2 uses `arn` (grep: 0). `iam:PermissionsBoundary` was already sent as `string` in run 1 and D31-D33
and S07 passed, so string-typed ARN values are accepted under `StringEquals`. Whether `ArnEquals` (D14.1,
`NeverInProtectedVpcs`) matches a string-typed entry is [U]. If it does not, D14.1 returns `allowed` and the
script fails. That is a visible failure, never a silent pass.

**(4) Over-permission in run 1: none.**
- No FAIL line has `actual=allowed`. The 33 failures are 29 `ERROR(rc=254)` ValidationErrors and 4
  implicitDeny results where allowed or explicitDeny was expected [V-aws].
- The real-AWS gap left by the 29 errors, which run 2 must close:
  - **every** boundary case (B01-B14, BP01-BP07): the core H-1 evidence;
  - D14.1: default-VPC protection;
  - the R4 adoption cases D13.1, N75.1, N78.1, N79b.1;
  - real-AWS confirmation of N71.1 and N74.1 as explicitDeny.
- Until run 2 passes, H-1 has **no** AWS-side evidence.

**(5) Risks for run 2** (none blocks it):
- D14.1 type semantics [U] (see 3).
- The 2,000-character member limit is observed, not documented (the docs say 131,072), and the parts sit
  500 under it.
- I did not test real CLI parsing of a JSON array of strings for `--policy-input-list file://` (no aws CLI
  allowed here) [E; the documented list form].
- The runbook's step 9 hash and fetched file must be updated to revision 2 (`5186cbc6...89fd205`) at the URL
  the owner fetches. Otherwise the hash check stops the run, which is fail-safe.

Verdict: **REVISION 2 READY FOR OWNER RUN**

Success is exit 0 and `RESULT total=332 expected_match=332 unexpected_mismatch=0 expected_total=332
complete=yes`. If anything fails, stop, and do not adjust expected values. Two conditions before the owner
runs it: publish revision 2 at the step 9 URL, and update the hash line.
