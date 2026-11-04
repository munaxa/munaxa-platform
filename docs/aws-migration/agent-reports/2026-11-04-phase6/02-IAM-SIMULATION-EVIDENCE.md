# Phase 6, Agent 3: IAM simulation and evidence (B2 / TD-14, H-1, H-2, H-2b, H-3)

Date: 4 Nov 2026. Author: Agent 3. Labels: [V-repo] repository evidence, [V-gh] GitHub evidence,
[V-aws] live AWS evidence, [E] inferred or estimated, [U] not yet verified, [O] owner action required.

**No AWS IAM simulation has run in this project for the platform#38 policies.** This phase did not
run one either: no AWS call, no aws CLI, no AWS MCP tool. Everything below is one of two things. It
is static analysis of the scripts, or **local policy evaluation**: my own evaluator run against
policy JSON that Terraform rendered offline. Local evaluation is not an AWS simulation. The only
real simulation is the owner running the script below in CloudShell after the root re-apply [O].

Evidence folder: `/tmp/claude-0/-home-claude/2fb8123e-8f4e-5ef3-94b0-e6568e1a6098/scratchpad/phase6/a3/evidence/`
(written as `evidence/` below).

## 1. Result

| Item | Finding |
| --- | --- |
| Phase 5 script (`docs/aws-migration/agent-reports/2026-11-04-phase5/supporting/b2-owner-simulation.sh`, sha256 `90aff88f…eafd19`) | **214 simulate calls** (203 `simulate-principal-policy`, 11 `simulate-custom-policy`), plus 2 other calls (`get-policy`, `get-policy-version`), so **216 AWS invocations**. It has 196 distinct cases. Counted statically [V-repo] and with a stub `aws` [V-repo, local] |
| 93 versus 214 | 93 was the count for the first version (8170e12). It was never updated in `02-SECURITY-B2-TD14.md` §1. The 121 calls added at 0ff0879 bring it to 214 (§3) [E, reconstructed] |
| Defects | **4 lines would FAIL against a correctly applied bootstrap.** D22.1, D23.1, SR073.1 and SR074.1 use the mocked state key ARN `key/00000000-…` from `tests/bootstrap.tftest.hcl:25`, not the real key. So H-2 protection of the state key was never actually tested. Also: the script always exits 0, even with 74 mismatches. It writes no results file, has no preflight, writes to a fixed `/tmp` path and sets no retry mode (§4) |
| Fixed script | `evidence/b2-owner-simulation.sh` (sha256 `b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002`), with the diff against Phase 5 in `evidence/b2-owner-simulation.phase5-to-phase6.diff`. **332 simulate calls** (308 principal, 24 custom) in 345 AWS invocations, all read-only. It writes a results TSV, ends with a `RESULT` line, exits 1 on any mismatch and exits 2 if a precondition fails |
| Local evaluation (NOT AWS) | Policies were rendered offline from 46dfbd9 with the real provider. Phase 5 cases: 214/214 match if the policy key equals the placeholder, and 210/214 with a real key ARN, which reproduces the 4 defects. Phase 6 script: **332/332 match** |
| Stub dry runs (NOT AWS) | Answers from the local evaluator: exit 0, 332/332. Constant `allowed`: exit 1, 171 mismatches. API error on every call: exit 1, 332 mismatches. Missing #38 policies: exit 2, nothing simulated |
| bash -n | Clean for the Phase 5 and the Phase 6 script [V-repo] |
| shellcheck | **Not run** [U]. It is not installed, and running a downloaded shellcheck binary was refused by the session's permission classifier |

## 2. Method and boundaries

- **Rendering** [V-repo]. `git archive 46dfbd9 infra/aws/bootstrap` was extracted to `a3/render/`. I added a test file (`evidence/rendered/render.tftest.hcl`) that prints each policy document through a failing assert.
  - It used the real AWS provider 6.67.0 from Agent 2's checksum-verified mirror, through Agent 2's wrapper `a2/evidence/harness/tfx` with `OFFLINE=1`: no credentials, and all HTTPS sent to a dead port.
  - The provider settings are placeholders, not credentials.
  - One render-only change: the state key and bucket ARNs are written as literals (`evidence/rendered/render-only-iam.tf.diff`), with the key given as `key/STATEKEY-0000-…`. Override blocks alone left those documents unknown at plan time.
  - Output: 11 documents in `evidence/rendered/*.json`. The session inline policy is 9,800 characters minified, the same as Phase 5 reported.
- **Local evaluator** (`evidence/tools/iam_local_eval.py`; **not an AWS simulation**).
  - It applies explicit deny, then allow, otherwise implicit deny.
  - It uses wildcard matching and the condition operators the bootstrap uses. A missing key counts as true for negated operators and as true for ForAllValues.
  - It does not model key policies, bucket policies, SCPs or IfExists.
  - The CI roles' inline policies are written out by hand from `iam.tf:513-520` and `iam_session.tf:55-62`, because their Resource is unknown at plan.
- **Stub** (`evidence/stub/bin/aws`, `evidence/stub/run-stub.sh`). A fake `aws` first on PATH logs every invocation to `stub/out/*/aws-calls-*.jsonl` and returns a canned answer. The runner removes AWS credentials, points all proxies at `127.0.0.1:9` and checks that the stub is first on PATH. **No real AWS call was possible or made.**

## 3. Exact call count, and 93 versus 214

**Static parse** [V-repo] (`evidence/tools/parse_checks.py`, `checks-phase5.json`). The script has 214 `check` lines. Of these, 203 call `sim` (`simulate-principal-policy`) and 11 call `simb` (`simulate-custom-policy` on the nonprod boundary). There are also 2 setup calls (`get-policy`, `get-policy-version`, lines 28-29).

**Dynamic count** (stub log, `stub/out/p5/aws-calls-local.jsonl`): 203 + 11 + 1 + 1 = **216 invocations**. All 214 simulate calls carry `aws:RequestedRegion`.

| Prefix | Cases | Calls | Added when |
| --- | ---: | ---: | --- |
| D01 to D59 (nonprod deployer) | 59 | 68 | 8170e12 (first version) |
| P01, P02 (prod deployer) | 2 | 2 | 8170e12 |
| S01 to S13 (session) | 13 | 15 | 8170e12 |
| B01 to B08 (nonprod boundary) | 8 | 8 | 8170e12 |
| **Subtotal, first version** | **82** | **93** | equals "93" in `02` §1 and the 82-case matrix in `02` §6 |
| B07b, B08b, B08c (N-1) | 3 | 3 | 0ff0879 (matrix 85) |
| RB1n1, RB1n2, RB1p1, RB1p2 (B-1, `aws:ViaAWSService`) | 4 | 4 | 0ff0879, asked for by `06` §8 l.547-549 |
| SR001 to SR107 (B-2 session refresh, up/down, refusals) | 107 | 114 | 0ff0879 (`session_coverage.py` 107/107) |
| **Phase 5 final** | **196** | **214** | `02` §11, `00-lead` l.38, `NEXT-EXECUTION-PLAN` l.13 |

- The reconstruction of the first version is [E]. The Phase 5 evidence folder (`df3735a4-…/phase5/evidence/02/`) no longer exists, and the repository only has the final script (one commit, b6b4a0a; PR #38 changed only `infra/aws/bootstrap/**`). The arithmetic is exact: 82 cases, 93 calls, then plus 3 + 4 + 114 = 214.
- **Doc errata**:
  - `02-SECURITY-B2-TD14.md:24` still says 93.
  - `NEXT-EXECUTION-PLAN.md:13` says "214 read-only `simulate-principal-policy` calls"; in fact 11 of them are `simulate-custom-policy`.
- **Phase 6 script**: 214 Phase 5 lines (8 corrected) plus 118 new = **332 simulate calls** (308 principal, 24 custom).
  - Setup is read-only: 1 sts, 1 kms describe-key, 3 list-attached-role-policies, 4 list-role-policies, 2 get-policy and 2 get-policy-version.
  - **345 invocations** in total [V-repo, stub log `stub/out/p6/aws-calls-local.jsonl`].

## 4. Defects in the Phase 5 script

| # | Defect | Effect | Fix in Phase 6 script |
| --- | --- | --- | --- |
| F1 | **State key ARN is the test mock** `arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000` (from `tests/bootstrap.tftest.hcl:25`) in D22.1, D23.1, SR073.1, SR074.1. The real policy names the real key (`iam.tf:197, 248, 258` take `aws_kms_key.state.arn`) | Against a correct re-apply: D22 and D23 return implicitDeny instead of explicitDeny, and SR073 and SR074 return implicitDeny instead of allowed. That is **4 false FAILs**, and the H-2 key deny is never exercised [V-repo, local eval B in `local-eval-phase5-script.txt`, stub run `p5/stdout-local.txt`] | `STATE_KEY_ARN` is resolved at run time with `kms describe-key --key-id alias/munaxa-shared-tfstate` (read-only), and the 4 lines use it |
| F2 | Exit status is always 0 (the last command is `echo`) | Automation or a quick check cannot tell failure from success. Stub constant-`allowed`: 74 mismatches, exit 0 | Exit 1 on any mismatch or error, or if fewer than 332 checks ran |
| F3 | No results file; the operator is told to `tee` | Weak evidence | TSV results file (`verdict, id, expected, actual, principal, description`) and a final `RESULT total= expected_match= unexpected_mismatch=` line |
| F4 | No preflight. Run before the re-apply, it reports noise. A failed `get-policy` is ignored, and the `simb` calls then fail confusingly | Misleading output | Checks the account, the state key alias, that the #38 managed and inline policies are attached to all 3 deployers and the session CI role, and that both boundaries contain the #38-only Sid `OwnRdsMasterSecretByTag`. Exit 2 otherwise |
| F5 | Fixed path `/tmp/boundary-nonprod.json` | Minor | `mktemp -d` with cleanup |
| F6 | No retry mode for about 216 rapid IAM calls | Possible throttling FAILs [E] | `AWS_RETRY_MODE=standard`, `AWS_MAX_ATTEMPTS=8`. An API error is reported as `ERROR(rc=…)` and counts as a mismatch |
| F7 | `iam:PermissionsBoundary` is passed with `ContextKeyType: arn` (D31, D32, D33, S07). The policy uses `StringEquals`, and the Service Authorization Reference types the key as String | Whether the simulator compares an arn-typed value under StringEquals is [U]. A wrong guess would turn D32 into a false FAIL | Changed to `string` |
| F8 | Prod boundary never simulated; prod deployer has only 6 lines; CI roles not simulated | Gap in H-1 and R-17 | Added BP01 to BP07, more prod cases and C01 to C08 |

Not defects, but noted:
- SR107.2 is labelled "state key alias" while it simulates a nonprod key. N04.2 now tests an alias aimed at the real state key.
- SR067 and SR068 use `repository/munaxa-identity`, while the real repositories are `munaxa-identity/api` and so on. Both match `repository/munaxa-*`, so the result is the same.

## 5. Script versus bootstrap at 46dfbd9 [V-repo]

| Item | Script | Bootstrap |
| --- | --- | --- |
| Deployer roles | `role/munaxa-shared/bootstrap/munaxa-shared-deployer-{nonprod,prod}` | `iam.tf:169-170` |
| Session deployer | `…/munaxa-shared-deployer-nonprod-session` | `iam_session.tf:86-87` |
| CI roles (new cases) | `…/munaxa-shared-ci-{nonprod,prod}`, `…/munaxa-shared-ci-nonprod-session` | `iam.tf:502-503`, `iam_session.tf:44-45` |
| Boundaries | `policy/munaxa-shared/munaxa-shared-workload-boundary`, `…-boundary-prod` | `iam.tf:21-22, 42` |
| Managed policies (preflight) | `munaxa-shared-deployer-read`, `-<env>-allow`, `-<env>-allow-tagged`, `-nonprod-session-read` | `iam_allow.tf:93, 410, 426`, `iam_session.tf:298` |
| Inline policies (preflight) | `deployer`, `session-deployer`, `assume-own-session-deployer-only` | `iam.tf:465`, `iam_session.tf:237, 53` |
| State bucket and alias | `munaxa-shared-tfstate-229251310592`, `alias/munaxa-shared-tfstate` | `main.tf:19, 43` |
| State key | Phase 5: mock ARN (F1). Phase 6: resolved at run time | `iam.tf:197, 248, 258` |
| `aws:RequestedRegion` | On 332/332 calls (asserted in `eval_phase6.py`, counted in the stub log) | `ThisRegionOnly`, `iam.tf:202` (NotAction iam, sts, route53, s3); boundary `iam.tf:115-120` |
| `aws:ViaAWSService` (Bool) | RB1*, N43, N48, N49 | `RdsMasterSecret`, `iam_allow.tf:293-305` |
| `kms:ViaService` | N100 to N104 (new; Phase 5 had none) | `DataKeyThroughRdsAndSecretsManager`, `iam_allow.tf:310-323` |
| `aws:CalledVia` | Not used | No policy at 46dfbd9 uses it (only the comment at `iam_allow.tf:298`); B-1 replaced it |
| Resource and request tags | Project and Environment (plus Name for security groups) per case | `OwnTagged`, `Ec2*`, `CreateWithOwnTags`, session statements |

## 6. Expected allow and deny matrix (Phase 6 script, 332 calls)

Expected values are per call. A multi-resource request (lines .1 and .2) is allowed only if every
line is allowed. So an `allowed` .2 line inside a "refused" case (for example SR092.2) is correct:
the .1 line refuses the request. Full rows: `evidence/checks-phase6-categorized.json` and `evidence/local-eval-phase6.tsv`
(which includes the statement Sids that matched locally).

| Category | Calls | Allowed | Explicit deny | Implicit deny | Roles | Examples (id: expected) |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Own-environment writes and reads (deployer) | 21 | 21 | 0 | 0 | nonprod | D01.1 Delete own SG: allowed |
| Tags required on create | 3 | 0 | 3 | 0 | nonprod | D11.1 CreateVpc without tags: explicitDeny |
| Untagged KMS keys (R1) | 7 | 2 | 2 | 3 | nonprod | D28.1 Claim an untagged key with own tags: allowed (residual); N60.1 claim as prod: explicitDeny; D21.1 ScheduleKeyDeletion on an untagged key: implicitDeny |
| Untagged ACM certificates (R2) | 6 | 2 | 3 | 1 | nonprod | N65.1 Claim an untagged certificate: allowed (residual); N66.1 claim as prod: explicitDeny; D48.1 delete untagged: implicitDeny |
| Untagged Cloud Map (R3) | 8 | 2 | 2 | 4 | nonprod, session | N70.1 Claim an untagged namespace: allowed (residual); N71.1 claim as prod: explicitDeny; D47.1 DeleteNamespace untagged: implicitDeny |
| Untagged and default security groups (R4) | 12 | 3 | 4 | 5 | nonprod, prod, session | D13.1 Adopt a new VPC default SG: allowed (residual); D14.1 adopt in the account default VPC: explicitDeny; D03.1 delete an untagged SG: implicitDeny |
| Other untagged resources (EC2, ELB, logs, ECS) | 7 | 1 | 0 | 6 | nonprod | D07.1 Subnet in an untagged VPC: implicitDeny |
| Cross-environment | 22 | 2 | 17 | 3 | nonprod, prod, session | N35.1 Prod creates its own role with its boundary: allowed; N30.1 nonprod assumes the prod deployer: explicitDeny; N23.1 untagged prod ECS service: implicitDeny |
| State key, alias and bucket (H-2, H-2b) | 19 | 4 | 14 | 1 | nonprod, prod, session | D38.1 Write nonprod state: allowed; D22.1 and N01.1 state key deletion (even tagged nonprod): explicitDeny; N12.1 read the bootstrap state: implicitDeny |
| Production and Docs secrets | 12 | 1 | 9 | 2 | nonprod, prod, session | N48.1 RDS deletes the master secret on the deployer's behalf: allowed; N40.1 prod secret value: explicitDeny; N48.2 rds! delete directly: implicitDeny |
| Production and Docs buckets | 7 | 1 | 5 | 1 | nonprod, prod, session | N55.1 Own bucket policy: allowed (R8); N50.1 prod object: explicitDeny; N52.1 own object (no data reads): implicitDeny |
| IAM roles and boundaries (H-1) | 5 | 2 | 0 | 3 | nonprod | D32.1 CreateRole with own boundary: allowed; D33.1 with the prod boundary: implicitDeny |
| Docs, bootstrap and other-project protection | 4 | 0 | 4 | 0 | nonprod | D19.1 Delete the Docs final snapshot: explicitDeny |
| Guardrails (region, account settings, sharing, users) | 10 | 0 | 10 | 0 | nonprod | D41.1 Describe in us-east-1, N94.1 CreateAccessKey: explicitDeny |
| Route 53 (R5) | 5 | 3 | 1 | 1 | nonprod | D46.1 DeleteHostedZone on any zone: allowed (residual); D58.1 default VPC association: explicitDeny |
| RDS master secret and data key via service (B-1) | 9 | 4 | 1 | 4 | nonprod, prod | RB1n1.1 CreateSecret rds! with ViaAWSService=true: allowed; RB1n2.1 with false: implicitDeny |
| Session: plan refresh reads (B-2) | 74 | 74 | 0 | 0 | session | SR031.1 DescribeKey on an own key: allowed |
| Session: up/down writes | 26 | 26 | 0 | 0 | session | SR084.1 ecs CreateService: allowed |
| Session: refusals (H-3, R10) | 43 | 2 | 18 | 23 | session | SR092.1 rule on the ALB group: explicitDeny; S07.1 CreateRole: implicitDeny |
| CI roles reach only their own deployer (R-17, H-3) | 8 | 4 | 0 | 4 | ci-nonprod, ci-prod, ci-session | C04.1 Session CI to session deployer: allowed; C05.1 session CI to the full nonprod deployer: implicitDeny |
| Boundary nonprod (H-1) | 17 | 5 | 6 | 6 | boundary-nonprod | B02.1 Own secret: allowed; B03.1 prod-tagged key: explicitDeny; B01.1 prod secret: implicitDeny |
| Boundary prod (H-1) | 7 | 2 | 1 | 4 | boundary-prod | BP02.1 Own secret: allowed; BP03.1 nonprod-tagged key: explicitDeny; BP01.1 nonprod secret: implicitDeny |
| **Total** | **332** | **161** | **100** | **71** | | |

| Principal | Allowed | Explicit deny | Implicit deny | Total |
| --- | ---: | ---: | ---: | ---: |
| deployer nonprod | 42 | 59 | 30 | 131 |
| deployer prod | 6 | 9 | 2 | 17 |
| deployer nonprod-session | 102 | 25 | 25 | 152 |
| ci-nonprod | 1 | 0 | 2 | 3 |
| ci-prod | 1 | 0 | 1 | 2 |
| ci-nonprod-session | 2 | 0 | 1 | 3 |
| boundary nonprod (custom policy) | 5 | 6 | 6 | 17 |
| boundary prod (custom policy) | 2 | 1 | 4 | 7 |

The Phase 5 script alone has 214 calls: 140 allowed, 35 explicitDeny and 39 implicitDeny.

## 7. Cases added in Phase 6 (118 calls)

These have the `N`, `C`, `B09` to `B14` and `BP` ids. Each expected value was reasoned against the
bootstrap code and then confirmed by the local evaluator. One of my own expectations was wrong and
the evaluator corrected it before the build: N74 is an explicitDeny through the inherited
`NeverCreateForTheOtherEnvironment`.

- **State key, alias and bucket (15).**
  - The state key is refused deletion, a key policy change and a grant even if someone tagged it Environment=nonprod (N01 to N03). This is the real test of `ProtectStateKeyAndBucket`.
  - An own alias aimed at the state key is refused on the key line (N04.2). Deleting or repointing the shared alias is refused (N05, N06).
  - The prod deployer and the session deployer cannot delete the key (N07, N14). Both deployers keep the state data-plane rights (N08, N09).
  - Deleting the state bucket or changing its encryption is refused (N10, N11). The bootstrap state cannot be read (N12). The session cannot delete prod state (N13).
- **Cross-environment (19).** Covers prod-named roles, PassRole, the prod database, cluster and log groups. Also covered:
  - the prod boundary on a nonprod role (N26);
  - widening the boundary with CreatePolicyVersion (N27);
  - removing a boundary (N28);
  - attaching AdministratorAccess (N29);
  - one deployer assuming another (N30, N31);
  - prod against nonprod state, secrets, roles and tags (N32 to N38).
- **Production secrets (11) and buckets (7).** Prod secret value and describe; the rds! value; PutResourcePolicy; BatchGetSecretValue; Docs secrets; prod and Docs objects and bucket policies; and the deployer's own objects (no data reads).
- **Four untagged types (21).** KMS claim as prod or another project, grant, decrypt, and deletion after a claim (the R1 chain). ACM claim own and prod, delete, request without tags. Cloud Map claim own and prod, delete, session limits. Default SG: wrong Name, another project, prod, session adoption, emptying a foreign group, prod adoption (R4).
- **Session limits (14).** db-admin, prod and untagged groups; a foreign ALB; a prod service; the prod database; another nonprod database; PassRole to Scheduler; RunTask; logs; region; an ALB without tags; CreateUser.
- **Guardrails (5)**, **kms:ViaService (5)**, **CI roles (8)**, **nonprod boundary (6)**, **prod boundary (7)**.

## 8. Owner execution (reproducible, read-only, root in CloudShell) [O]

Preconditions: platform#38 (46dfbd9) has been re-applied by root, and no aws-terraform or
aws-session job is running. The lead decides how the script reaches CloudShell, either committed
next to the Phase 5 copy or uploaded with CloudShell's "Upload file".

```bash
sha256sum b2-owner-simulation.sh   # b62dbbef15b9418a5f82615346b97997b45c653afad1b917c6a2fbfc22c61002
bash b2-owner-simulation.sh | tee b2-owner-simulation.out ; echo "exit=$?"   # use ${PIPESTATUS[0]} for the script's code
```

- **AWS calls, all read-only**: `sts get-caller-identity`, `kms describe-key` (alias only), `iam list-attached-role-policies`, `iam list-role-policies`, `iam get-policy`, `iam get-policy-version`, `iam simulate-principal-policy`, `iam simulate-custom-policy`.
  - No create, change or delete calls.
  - No secret reads and no `get-secret-value`.
  - No credentials are created, copied or stored.
  - The results file contains decisions and test names only.
- **Outputs**: `b2-owner-simulation-results-<UTC>.tsv` and, as the last line, `RESULT total=332 expected_match=… unexpected_mismatch=… expected_total=332 complete=yes results=…`.
- **To rerun one failing case**: `grep '^check <id> ' b2-owner-simulation.sh` shows the exact call. Run that aws command without `--query` to see the matched statements and missing context values.

**Success criteria** (all are required):
1. Exit code 0, and the last line reads `RESULT total=332 expected_match=332 unexpected_mismatch=0 expected_total=332 complete=yes`.
2. Zero `FAIL` lines and zero `ERROR(` decisions in the results file.
3. The preflight printed `caller: arn:aws:iam::229251310592:root` and a `state key: arn:aws:kms:eu-central-1:229251310592:key/<uuid>`.
4. The owner keeps the results TSV and the `.out` file as [V-aws] evidence. Only after this may any report say "AWS simulation passed".

If anything fails, stop. Do not adjust expectations in the script to make it pass. Report every
FAIL line; any fix goes through a PR, a review and a re-apply.

## 9. What the simulator cannot show, and remaining [U]

1. **Key policies, the state bucket policy (TlsOnly) and SCPs** are not evaluated. 229251310592 is the Organizations management account, so SCPs do not apply to it anyway [E].
2. **Point (a) from `02` §6**: `kms:CreateKey` also authorizes `PutKeyPolicy` on the new key, admitted only if KMS evaluates the request tags. The simulator cannot model a key that does not exist yet [U]. This is confirmed only by the G3 apply.
3. **Point (b) and (c), the RDS master secret**: the simulation proves the policy logic for `aws:ViaAWSService` (RB1, N48). Whether RDS really calls with the deployer's credentials (forward access session) is shown only by the G3 apply [U].
4. **Trust policies** (GitHub OIDC subject, `sts:SourceIdentity`) are not simulated. The nonprod chain worked in run 41887322394 [V-gh, Agent 4], with head 46dfbd920c6ee7ac940f0b7ca05656aca461f777. The session chain stays [U] until the first `aws-session` run with the new environment variables.
5. **Simulator semantics that cannot be tested here** [U]: `string` versus `arn` type for `iam:PermissionsBoundary` (F7, changed to the SAR type), and newer action names such as `elasticloadbalancing:DescribeListenerAttributes`. If the simulator rejects any of these, the call shows as `ERROR`, not as a silent PASS.
6. Suggested as a later addition, not added: `simulate-principal-policy --resource-policy` with the state bucket policy and `aws:SecureTransport=false`.

## 10. Proposed patches (lead decides; nothing pushed)

1. **P-A**: replace `docs/aws-migration/agent-reports/2026-11-04-phase5/supporting/b2-owner-simulation.sh` with `evidence/b2-owner-simulation.sh`, or add it as a Phase 6 supporting file. The diff is `evidence/b2-owner-simulation.phase5-to-phase6.diff`: 9 lines changed (the `check()` function, 4 state key lines and 4 PermissionsBoundary types), a new header and preflight, and 118 added cases.
2. **P-B**: doc errata.
   - `02-SECURITY-B2-TD14.md:24`: 93 becomes 214 in Phase 5, now 332.
   - `NEXT-EXECUTION-PLAN.md:13` and `00-lead-orchestrator.md:38`: the count becomes "332 read-only simulate calls (308 simulate-principal-policy, 24 simulate-custom-policy)", with success = exit 0 and `unexpected_mismatch=0`.
3. **P-C (optional, test hygiene)**: in `infra/aws/bootstrap/tests/bootstrap.tftest.hcl:25`, use an obviously fake key id such as `key/mock-state-key`, so it cannot be copied into owner material as if it were real again.

## 11. Evidence index (`evidence/`)

- `b2-owner-simulation.sh`: the fixed owner script.
- `b2-owner-simulation.phase5-to-phase6.diff`: the diff against Phase 5.
- `phase5-b2-owner-simulation.sh`: a copy of the Phase 5 script.
- `checks-phase5.json`, `checks-phase6.json`, `checks-phase6-categorized.json`, `matrix.md`: the parsed cases and the matrix.
- `local-eval-phase5-script.txt`, `local-eval-phase6.tsv`: the local evaluation results (NOT AWS).
- `rendered/`: the 11 policy JSON files, the render test, the render-only diff and the terraform output.
- `tools/`: the parser, the evaluator, the builder, header and footer, and the matrix generator.
- `stub/`: the stub `aws` and its runner. `stub/out/p5` and `stub/out/p6` hold the call logs, stdout and results for the modes local, allowed, error and noattach.

## 12. Summary

1. No AWS IAM simulation has run for the #38 policies, in Phase 5 or Phase 6. All results here are local evaluation or stub runs.
2. The Phase 5 script makes exactly 214 simulate calls (203 principal, 11 custom) and 216 AWS invocations, covering 196 cases.
3. "93" counts the first version (8170e12: 82 cases). 0ff0879 added 121 calls (N-1 3, B-1 4, B-2 114). `02` §1 was never updated.
4. Critical defect: 4 lines use the mocked state key ARN. Against a correct re-apply they would FAIL, and H-2 was never really tested.
5. The Phase 5 script exits 0 whatever happens, writes no results file and has no preflight.
6. The fixed script makes 332 read-only simulate calls (345 invocations). It resolves the state key, checks that #38 is in place, writes a TSV and exits 1 on any mismatch or 2 on a failed precondition.
7. It adds 118 cases: state key and alias, cross-environment, prod secrets and buckets, the 4 untagged types, session limits, kms:ViaService, CI roles and the prod boundary.
8. Local evaluation against policies rendered offline from 46dfbd9: 332/332 match. The evaluator independently agrees with all 214 Phase 5 expectations, apart from the key placeholder.
9. Success = exit 0 and `RESULT total=332 expected_match=332 unexpected_mismatch=0 complete=yes`, run by root in CloudShell after the re-apply [O].
10. Still [U]: CreateKey's implicit PutKeyPolicy, RDS forward access sessions, trust policies and some simulator type semantics. shellcheck was not run.

Proposed patches: P-A (replace the owner script), P-B (doc errata for 93/214 and the call-type mislabel), P-C (optional, a clearly fake mock key id in the tests).
