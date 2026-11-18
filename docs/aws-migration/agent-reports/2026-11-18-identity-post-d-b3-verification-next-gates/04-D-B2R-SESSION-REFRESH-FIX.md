# 04. D-B2R: the session role's refresh fix (PR #137) and its owner procedure

**Status: PREPARED, OWNER ACTION REQUIRED.** The code is in PR #137, which is unmerged. The owner
scripts are tested offline. Nothing is applied.

## 1. The change (PR #137, code)

- **[PR #137](https://github.com/munaxa/munaxa-platform/pull/137)**, branch `claude/project-thread-l55y5v-fix`, head `cc9a7bb`.
- **`infra/aws/bootstrap/iam_session.tf`:** `RefreshSessionCleanup` gains `states:ListStateMachineVersions`. Its resources are unchanged: `stateMachine:munaxa-nonprod-*`, `munaxa-nonprod-*` topics, `alarm:munaxa-nonprod-*`.
- **`infra/aws/bootstrap/tests/bootstrap.tftest.hcl`:** a new assertion pins the full refresh read set and nonprod-only resources, and refuses `ValidateStateMachineDefinition` on the session role.
- **Offline results:**
  - bootstrap `terraform test`: 14/14;
  - mutation tests: removing the action gives 13/14, adding `ValidateStateMachineDefinition` gives 13/14;
  - `fmt` and `validate`: pass.
- **Rendered session-read policy** (Terraform 1.16.5, provider 6.67.0, no credentials, plan only): 1,470 characters on `main`, 1,504 on the branch. After normalization the only difference is the one action.

**Security review.**

- It adds one `List*` action that reads version ARNs of the cleanup state machine. It gives no
  execution data and no definition beyond what `DescribeStateMachine` already returns.
- The session role still cannot create, update, delete, start or validate a state machine.
- No production name is reached: the prod session role does not exist, and the statement is behind
  `each.key == "nonprod"`.
- Finding: none.

## 2. Expected bootstrap plan

With `-var testing_session_cleanup=true`, the plan must be exactly
`Plan: 0 to add, 1 to change, 0 to destroy.`

The one change is `aws_iam_policy.deployer_session_read["nonprod"]`, an in-place update. Only its
`policy` attribute changes, and the statement diff is
`RefreshSessionCleanup + states:ListStateMachineVersions`. The state has 70 resources before and
after. IAM keeps up to 5 versions of a managed policy, and the provider deletes the oldest
non-default version when needed. The plan script prints the current count.

## 3. Owner procedure (root, AWS CloudShell, eu-central-1)

This uses the same reviewed pattern as D-B2 (2026-11-15 report, file 02), adapted for this change.

| Step | Who | What | Approval needed |
| --- | --- | --- | --- |
| 1 | Owner | Merge PR #137, or tell Claude to | **yes/no 1** |
| 2 | Owner | In CloudShell, download `supporting/d-b2r-plan-owner-cloudshell.sh` from `main` and run it with the merge commit. Plan only | part of yes/no 1 |
| 3 | Claude | Reviews the pasted log and gives the saved plan's SHA-256 | none |
| 4 | Owner | `supporting/d-b2r-apply-owner-cloudshell.sh <commit> <plan sha256>` | **yes/no 2**, separate, after step 3 |
| 5 | Claude | Checks the next scheduled `down` ("Plan the switches" must pass) | none |

**The plan script** (`supporting/d-b2r-plan-owner-cloudshell.sh`) does the following, and every
failed check stops it:

- checks the account is 229251310592, the caller is root, the region is eu-central-1, and no state lock exists (only a 404 counts as no lock; any other error stops);
- downloads Terraform 1.16.5, checks HashiCorp's SHA-256 and the reported version, working in a temporary directory because the CloudShell home is only 1 GB;
- requires the commit to be on `main`, and requires the bootstrap diff since the D-B2 apply (`9752146`) to be exactly the two reviewed files with the reviewed git blob ids (`a38ceb2b…`, `de8b6365…`);
- checks the provider lock;
- runs `init -lockfile=readonly` and `terraform test`, and requires 70 resources in state;
- reads the live boundary, session-read and cleanup policies, which must equal the D-B2 code (no drift);
- saves a plan, which must be exactly the one update above, with the exact statement delta and a size of at most 6,144 characters.

It has no apply and changes no AWS resource. The only object it writes is Terraform's own short-lived state lock (`.tflock`) in the state bucket during `plan`, which Terraform removes at the end. It deletes the plan JSON and the live-policy copies after the checks, because they contain state values.

**The apply script** (`supporting/d-b2r-apply-owner-cloudshell.sh`) does the following:

- reads only the last run in the plan log, which must contain no `STOP:` line and end "PLAN VERIFIED" for the same commit;
- repeats the commit, bootstrap-diff and blob checks on its own fresh clone;
- refuses unless the saved plan's SHA-256 equals the one given, and `expected.json` and `norm.jq` are byte-identical to the plan script's;
- applies that saved plan only, which must report `0 added, 1 changed, 0 destroyed`;
- then requires a `-detailed-exitcode` plan with no changes, 70 resources, and live policies equal to the reviewed code;
- deletes the saved plan and the live-policy copies at the end.

It uses no `-auto-approve` and no `-target`.

**Offline test of both scripts.** Both were run against stubbed `aws`, `terraform`, `git` and
`curl`, on a synthetic plan built from the offline renders, and both passed. Each mutation stopped
the script as expected:

- an extra policy action;
- an extra prod address;
- a wrong plan summary;
- live drift;
- a commit without the fix;
- a short pin;
- a wrong plan SHA;
- the live policy not updated after the apply;
- a wrong apply summary.
- a state-lock read that fails with anything other than 404 (for example 403);
- an apply after a later plan run that stopped (the apply reads only the last run).

The scripts cannot be run against AWS by Claude. The real check is the owner's run.

**If PR #137 changes before merge**, the blob ids in the plan script must be updated in this report
first.

## 4. While this is not applied

- Every scheduled `down` fails at "Plan the switches". The database is still stopped by the separate job and by the 21:00 UTC AWS backstop.
- No ALB or service exists to scale in, because no session has started.
- The `aws-session.yml` failure e-mails are expected noise until the fix is applied.
- A Testing `up` would also fail at the same step. That is harmless, because no session is authorized.
