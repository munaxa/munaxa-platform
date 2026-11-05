# Bootstrap re-apply at 46dfbd9 and owner IAM simulation (5 Nov 2026)

Lead orchestrator. Labels: [V-aws] live AWS evidence (owner CloudShell output, `evidence/run1-cloudshell-apply-and-simulation.txt`), [V-gh], [V-repo], [E], [U], [O].

## 1. What happened

| Time (UTC) | Event | Evidence |
| --- | --- | --- |
| 5 Nov 03:15 | Tamer approved D-1 (decision card): root re-apply of `infra/aws/bootstrap` at `46dfbd920c6ee7ac940f0b7ca05656aca461f777` only | Project thread |
| 03:2x | Precondition checked: no AWS workflow was running. The nightly `aws-session.yml` run 41943924455 (00:47) was the first one not skipped, and it succeeded | [V-gh] |
| about 05:05 | Stage 1, runbook `2026-11-04-phase6/01` §6 steps 1 to 6. Every stop condition passed | [V-aws] (pasted into the thread) |
| about 05:15 | Stage 2, apply of the saved plan and the post-apply checks. Passed | [V-aws] `evidence/run1-…txt` |
| about 05:20 | Stage 3, owner simulation revision 1: **exit 1**, 299/332. Stopped as the runbook requires | [V-aws] `evidence/run1-…txt` |
| 05:26 | Step 10: the owner set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on `aws-nonprod-session` | Owner, in the thread [O, done] |

The CloudShell home volume was full: 1.5 MB free, the remainder taken by the retained Docs bootstrap working folder, which was left untouched. The state backup and the plan files still fit.

### Stage 1, all checks met [V-aws]

- Caller `arn:aws:iam::229251310592:root`, region eu-central-1.
- Terraform 1.16.5, with the zip's SHA256 checked.
- The clone is at the pinned SHA, and the diff stat matches (7 files, +1295/-136).
- `init -reconfigure` succeeded with aws provider 6.67.0.
- The state before the change: serial 2, 49 resources. S3 version `2nRfrdWm…` of 31 Oct 13:42, 201,237 bytes.
- The plan exited 0 with **`Plan: 19 to add, 6 to change, 0 to destroy.`**
- `ADDRESSES-OK`.
- Exactly one move: `aws_iam_policy.workload_boundary` → `["nonprod"]`.
- Exactly the 6 expected attributes change.
- The CI subject is `…:environment:aws-nonprod`, and the boundary name is unchanged.

### Stage 2, apply [V-aws]

- **`Apply complete! Resources: 19 added, 4 changed, 0 destroyed.`**
  - The plan showed 6 changes, but the 2 deployer trust documents came out identical at apply time, so they changed nothing.
  - The 4 real updates are the ones expected.
- The post-apply `terraform plan -detailed-exitcode` exited **0** (no changes).
- Outputs:
  - session roles `…/bootstrap/munaxa-shared-ci-nonprod-session` and `…/munaxa-shared-deployer-nonprod-session`;
  - boundaries `munaxa-shared-workload-boundary` and `…-prod`;
  - the deployer and CI role ARNs are unchanged.
- The bootstrap state object is `aws:kms` with the state key `679d1b6b-…`. Before, the state used SSE-S3.
- `munaxa-shared-ci-nonprod` trusts only `environment:aws-nonprod` on `refs/heads/main`.
- Attachments: each full deployer has 3 managed policies plus its `deployer` inline policy. The session deployer has 2 managed policies plus `session-deployer`.

**Result:** B2/TD-14, H-1, H-2, H-2b and H-3 are now **active in AWS**. The policy content is evidenced by the clean post-apply plan against code at 46dfbd9. Proof of the decisions comes from simulation run 2.

### Stage 3, simulation revision 1 (sha256 `b62dbbef…`) [V-aws]

`RESULT total=332 expected_match=299 unexpected_mismatch=33 … complete=yes`, exit 1. This was the first real IAM simulation in the project.

- **Passed:** every state key, alias and bucket case, every CI-role case and every cross-environment case. That includes the four cases that were broken in Phase 5 (D22, D23, SR073, SR074).
- **29 failures were requests AWS rejected.** No decision was made on them:
  - 5 used the context key type `arn`, which AWS does not accept;
  - 24 boundary documents exceeded the observed 2,000-character limit per policy member.
- **4 real decisions:** SR083.2, N70.1, N71.1 and N74.1. All four were denials, and all four named an ARN that the action never authorizes on.
- **No over-permission:** no failed line came back `allowed`.
- The analysis is in `02-SIMULATION-RUN-1-ANALYSIS.md` (Agent 3).

## 2. Simulation revision 2

- **Script:** `evidence/b2-owner-simulation.sh`, sha256 `5186cbc66385efc64683b1a16e9b58dc4e2ac5d22840ad0b00311922689fd205`. The diff from revision 1 is in `evidence/b2-owner-simulation.rev1-to-rev2.diff`.
- **Changes from revision 1:** 9 lines.
  - Five lines change the context type from `arn` to `string`.
  - Three lines change the resource to `*`, because `servicediscovery:TagResource` has no resource types. The expected values stay the same.
  - SR083.2's expected value changes from allowed to implicitDeny, following the Service Authorization Reference. SR083.1, the real check, passed.
  - The boundaries are split into whole-statement documents of at most 1,500 characters, all passed in one call.
- **Independent review (Agent 7, `03-INDEPENDENT-REVIEW-REVISION-2.md`):** **"REVISION 2 READY FOR OWNER RUN"**.
- **Found by revision 1:** residual R3 is real. Claiming an untagged Cloud Map namespace on `*` is allowed, as the register says.

### Owner run 2 (read only, root, CloudShell) [O]

Everything goes in `/tmp`, because the home volume is full.

```bash
mkdir -p /tmp/p6run2 && curl -fsSLo /tmp/p6run2/b2-owner-simulation-rev2.sh \
  https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-05-bootstrap-reapply/evidence/b2-owner-simulation.sh
echo "5186cbc66385efc64683b1a16e9b58dc4e2ac5d22840ad0b00311922689fd205  /tmp/p6run2/b2-owner-simulation-rev2.sh" | sha256sum -c - \
  && bash /tmp/p6run2/b2-owner-simulation-rev2.sh /tmp/p6run2/simulation-run2.out; echo "exit $?"
```

- **Success:** exit 0 and `RESULT total=332 expected_match=332 unexpected_mismatch=0 expected_total=332 complete=yes`.
- **On any FAIL:** stop and paste the output. Never adjust an expected value to fit the output.
- **Known risk:** D14.1 may fail if `ArnEquals` does not match a string-typed value [U]. It would fail visibly, never silently.

## 3. Gate status after this report (Phase 6 §6)

| # | Gate | Status |
| --- | --- | --- |
| 1 | #38 merged | Met |
| 2 | Owner approved the re-apply | **Met** (03:15 UTC) |
| 3 | Bootstrap re-applied | **Met** [V-aws] |
| 4 | Simulation shows zero unexpected mismatches | **Not met**: run 1 exited 1; run 2 is pending [O] |
| 5 | Residuals fixed or accepted | Not met (D-2) |
| 6 | Fresh plan after the re-apply | Not met. It is allowed only after gate 4 |
| 9 | Session role ARNs on the environment | **Met** (owner, 05:26). The first use is the next nightly run [U] |

All other gates are unchanged from `2026-11-04-phase6/09`. **G3 apply is not authorized.**

## 4. Confirmations

- The only AWS writes in this step were the owner's IAM re-apply, as approved, and its S3 state write.
- The AWS connector, which is signed in as root, was not used.
- No G3 plan or apply ran. No image was published, and no secret or DNS change was made. CanteenHub was not touched.
