# Identity post-merge preflight verification (10 Nov 2026)

Scope: verify that PR #78 is merged as reviewed, validate the corrected preflight script on `main`,
run the local tests, report CI, reconcile the earlier reports, and give the owner the exact
CloudShell procedure.

This work used repository inspection, local offline tests and GitHub read access only:

- no AWS connector and no AWS API call;
- no Terraform, no workflow dispatch;
- no IAM, KMS, Secrets Manager, ECS, RDS, networking, DNS, Cloudflare or GitHub settings change;
- no merge.

Labels: **[V]** verified here, **[O]** owner action required, **[U]** unverified.

> **Update, 10 Nov afternoon: sections 1 to 12 are superseded for execution by section 13.** A later
> review found two coverage gaps in the script verified here (P-11b checked policy names and five
> statement ids only; P-13 checked names, not network relationships). Section 13 records the
> hardening, its tests and reviews, the new script SHA256 and the procedure that replaces section 10.
> Sections 1 to 12 are kept as written for the audit trail: their SHA256, operation count, test
> counts and expected lines are as of `ae90b2d`.

---

## 1. Verdict

**VERIFIED — READY FOR OWNER-RUN READ-ONLY PREFLIGHT** (superseded: see section 13).
~~All CI jobs on the `main` merge commit succeeded (section 8).~~ Corrected wording: all jobs of the
CI workflow on `ae90b2d` succeeded; AWS Terraform has no push run (section 8). This is not an
AWS-readiness verdict.

- PR #78 is merged, and `main` is byte-identical to the reviewed PR head [V].
- On `main`, the script implements the corrected P-3, P-4 and P-12 checks and the caller guard [V].
- It is read-only by construction [V].
- Local tests pass: preflight 35/35, CloudTrail 7/7, JWT 26/26, `bash -n` [V].
- The earlier reports now mark the old instructions as superseded (this PR) [V].
- Nothing about the live AWS state is verified here. That is what the owner-run preflight is for [O].

## 2. PR #78 merge [V]

| Item              | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| State             | Merged (squash), by `tam2om`, 2026-11-10 11:46:20 UTC                    |
| Merge commit      | `ae90b2d3c7ed09c4b0053d426867ccb2d29d49ac`, parent `0bae671` (PR #77)    |
| Reviewed PR head  | `005ad38c01b287df44b4c4527515939f6fb4a3c2`                               |
| Head vs `main`    | `git diff 005ad38 ae90b2d` is empty: the merged tree is the reviewed one |
| Commits after it  | None. `main` HEAD is still `ae90b2d` at 11:52 UTC                        |

## 3. `main` SHA [V]

`main` = `ae90b2d3c7ed09c4b0053d426867ccb2d29d49ac`. The last three commits are #78, #77 and #76.
All three are docs-only.

## 4. Changed files in #78 [V]

`git diff --name-status 0bae671 ae90b2d` lists seven files, all under
`docs/aws-migration/agent-reports/`:

| Status | File                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| M      | `2026-11-10-identity-first-session-preparation/00-IDENTITY-FIRST-SESSION-PREPARATION.md`       |
| M      | `2026-11-10-identity-preflight-and-session-readiness/00-IDENTITY-PREFLIGHT-AND-SESSION-READINESS.md` |
| M      | `…-session-readiness/supporting/preflight-readonly.sh`                                         |
| M      | `…-session-readiness/supporting/preflight_aws_stub.py`                                         |
| M      | `…-session-readiness/supporting/preflight_readonly_test.py`                                    |
| A      | `2026-11-10-identity-preflight-results-review/00-IDENTITY-PREFLIGHT-RESULTS-REVIEW.md`         |
| M      | `README.md`                                                                                    |

Nothing under `infra/`, `.github/`, `packages/` or `apps/` changed, so there was no unexpected
infrastructure, workflow, IAM or deployment change.

SHA256 of the files on `main`, from `git show origin/main:<path> | sha256sum`:

| File                     | SHA256                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| `preflight-readonly.sh`  | `8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3` |
| `cloudtrail-denials.py`  | `ed3711dabcfd29d2514ea75a56637913a02164afaf4b33516e81a07daf7f12f8` |
| `preflight_aws_stub.py`  | `cde1a16a647a13c1bffb30b196ec5bb72640a6e5b94cc1e13d5f85efb71265b1` |
| `preflight_readonly_test.py` | `714589af01174d2dd252888b44b1c8aad6aac0888f1548069804806b5a7b41f3` |

## 5. P-3, P-4, P-12 and caller guard on `main` [V]

Line numbers refer to `preflight-readonly.sh` at `ae90b2d`.

### 5.1 P-3: task-definition families and revisions

- Line 236 runs `ecs list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE`.
  The result must be exactly
  `munaxa-nonprod-db-admin,munaxa-nonprod-identity,munaxa-nonprod-identity-bootstrap,munaxa-nonprod-identity-migrate`.
  An extra or missing family fails.
- Lines 241-244 then run `ecs list-task-definitions --family-prefix munaxa-nonprod-<family> --status ACTIVE`
  once per family. In this call the parameter is the exact family name (AWS ECS API reference), so
  each family must have exactly one ACTIVE revision, `<family>:1`. A second ACTIVE revision fails.
- Line 247: the image loop expects `identity-bootstrap` to run the API image
  `sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156`, the same image as
  `identity`, and not the migrate image. This matches the source: `infra/aws/stack/ops.tf:268`
  `image = var.images.identity_api`, and `stack/envs/nonprod.tfvars:61`.

### 5.2 P-4: secret references

- **Migrate task**, lines 280-287:
  - the secret names must be exactly `DATABASE_MIGRATION_URL`, so any extra name fails;
  - the reference must match
    `:secret:munaxa-nonprod/identity-migrate-XXXXXX:DATABASE_MIGRATION_URL::a3cc6622-df66-4787-bae7-83ccfec56ff4`.
  - Source: `stack/ops.tf:184` (`secret_keys = local.secret_keys["identity-migrate"]`),
    `stack/data.tf:152` (`["DATABASE_MIGRATION_URL"]`), and the tfvars pin at `nonprod.tfvars:84`.
- **Bootstrap task**, lines 289-295, a separate check:
  - `DIRECT_DATABASE_URL` must reference the same `identity-migrate` secret key with the same pin
    (source `stack/ops.tf:277`);
  - plus the `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` references to `identity-bootstrap`.
- Only `ecs describe-task-definition` output is read, which carries names and ARNs and never values.

### 5.3 P-12: CloudTrail denials

- The filter is embedded as a `<<'PY'` heredoc in `DENIAL_FILTER` and run with
  `python3 -I -c "$DENIAL_FILTER"` (line 462). No separate file is needed.
- It is byte-identical to the tested helper `cloudtrail-denials.py`, 55 lines. This is checked by
  `test_denial_filter_is_embedded_and_identical_to_helper`.
- Line 459 loops over `eu-central-1` and `us-east-1`.
- The filter matches `AccessDenied*` and `*UnauthorizedOperation` in each event's `errorCode` only.
- Pagination: line 460 calls `lookup-events --output json` with no `--max-results`, `--max-items`
  or `--no-paginate`, so the CLI fetches every page.
- Results: exit 0 is PASS, 1 is FAIL, and any other exit is ERROR.
- The window starts at `PREFLIGHT_SINCE`, default `2026-11-10T06:00:00Z` (line 27).

### 5.4 Caller guard

- **Account.** Lines 159-178 run `sts get-caller-identity` first. A failure, an empty answer or any
  account other than `229251310592` prints `OVERALL: NOT RUN` and exits 3 before any other call.
- **Root.** Lines 181-200: `arn:aws:iam::229251310592:root` is refused with exit 3 unless
  `ALLOW_ROOT_READONLY` is exactly `yes`. Accepted root runs print the IAM-bypass warning: a PASS
  proves nothing about any deployer's permissions (ACCESS-POLICY §1.2).
- **Roles and users.** An assumed role or IAM user of the same account is accepted with no flag.
- **Anything else.** Federated users, other ARN shapes and foreign accounts stop with exit 3 after
  the single sts call.

## 6. Read-only review [V]

The review covered the actual commands and control flow, not only the comments.

- Only two lines call `aws` directly:
  - line 145 is inside `aws_call`, after the allowlist check at line 141;
  - line 166 is the `sts get-caller-identity` guard.
- ~~The 31 `aws_call` sites all name allowlisted operations.~~ Corrected wording: the 31 distinct
  operations called through `aws_call` are all allowlisted (there are 32 `aws_call` call sites
  counting the eight `count` calls of P-7).
- The allowlist `ALLOWED_OPS` (line 37) has 32 operations. All are `describe-*`, `list-*` and `get-*`
  metadata reads, plus `sts get-caller-identity` and `cloudtrail lookup-events`.
- A call outside the allowlist is refused and recorded as ERROR. It is never run.
- The script contains none of the following, comments excluded:
  - `get-secret-value`, `batch-get-secret-value`;
  - `terraform`, `tfstate`, `s3`, `logs`;
  - `--max-results`, `--max-items`, `--no-paginate`.
- The secrets calls are `describe-secret`, `list-secret-version-ids` and `list-secrets`, which
  return metadata only.
- Any write-verb matches turned out to be false positives (`--start-time`, "backstop").
- Status logic:
  - a failed command is ERROR, never PASS;
  - ABSENT is only an AWS error code matching the check's own regex, never a CLI or network failure;
  - OVERALL is PASS only when there are no ERROR or FAIL lines.

## 7. Local tests [V]

Environment:

- a clean worktree of `ae90b2d`;
- Python 3.13.18, bash 5.2.21, Node from the session image;
- `jmespath 1.1.0` installed only in an isolated venv in the session scratchpad;
- nothing installed in the repository.

| Command (from `supporting/` of each report folder)    | Result                       |
| ----------------------------------------------------- | ---------------------------- |
| `bash -n preflight-readonly.sh`                       | exit 0                       |
| `<venv>/bin/python3 -I preflight_readonly_test.py -v` | `Ran 35 tests … OK` (~51 s)  |
| `python3 -I cloudtrail_denials_test.py -v`            | `Ran 7 tests … OK`           |
| `node --test verify-identity-jwt.test.mjs`            | 26 pass, 0 fail              |

The script was also run on its own in an empty directory, with the stub CLI on `PATH`:

| Scenario                          | Exit | AWS calls | Result                                                  |
| --------------------------------- | ---- | --------- | ------------------------------------------------------- |
| Non-root SSO ReadOnly role, no flag | 0  | 47        | P-3, P-4, P-12 lines PASS; `OVERALL: PASS`              |
| Root, no flag                     | 3    | 1         | `STOP … root`; `OVERALL: NOT RUN`                       |
| Root, `ALLOW_ROOT_READONLY=yes`   | 0    | 47        | `WARNING: running as root …`; `OVERALL: PASS`           |
| Foreign account                   | 3    | 1         | `OVERALL: NOT RUN (wrong account)`                      |
| Federated-user ARN                | 3    | 1         | `OVERALL: NOT RUN (caller not recognised)`              |
| `AccessDenied` on RDS             | 2    | 47        | P-2 ERROR; `OVERALL: INCOMPLETE`                        |
| ECS service-linked role absent    | 1    | 47        | `NoSuchEntity` classified ABSENT → FAIL; `OVERALL: FAIL` |

These runs prove the logic only, against stubbed AWS answers. They prove nothing about AWS.

## 8. GitHub CI [V]

| Run                          | Event             | Commit    | Job                                    | Result                                 |
| ---------------------------- | ----------------- | --------- | -------------------------------------- | -------------------------------------- |
| CI 42808203221               | PR #78            | `005ad38` | Lint · Typecheck · Test · Build        | success                                |
|                              |                   |           | Façades match the platform surface     | success                                |
|                              |                   |           | Accessibility                          | success                                |
| AWS Terraform 42808203348    | PR #78            | `005ad38` | Format, validate, mocked plan tests    | success                                |
|                              |                   |           | Plan, Apply                            | **skipped** (not dispatched; no AWS)   |
| CI 42810181227               | push to `main`    | `ae90b2d` | Lint · Typecheck · Test · Build        | success (11:48 UTC)                    |
|                              |                   |           | Façades                                | success                                |
|                              |                   |           | Accessibility                          | success (11:59:57 UTC)                |

- **AWS Terraform has no push run.** `.github/workflows/aws-terraform.yml` triggers only on
  `pull_request` to `main` and on `workflow_dispatch`, so there is no run for `ae90b2d`. Its last
  result is the PR run above.
- **Skipped is not success.** Plan and Apply did not run.

**Observation.** Scheduled `aws-session.yml` run #18 (42785877006, event `schedule`, 08:51 UTC on
`46c50f8`) succeeded. Its jobs were "Stop the database" and "Testing down". Claude did not trigger
it. It falls inside the P-12 window, so any denial it produced will show in P-12.

## 9. Owner actions [O]

| #   | Action                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Review and merge this docs PR. Claude does not merge. The preflight script does not depend on it: the script on `main` was final for this run (superseded: section 13)                                    |
| O-2 | Run section 10, mode B, in CloudShell yourself, and paste the whole output                                                                                                      |
| O-3 | G-4: check environment `aws-nonprod-session` in the GitHub UI (readiness report section 8). Still open                                                                         |
| O-4 | The Identity session (`aws-session.yml`) still needs your separate approval after the preflight review. This procedure does not ask you to dispatch it                          |

## 10. Owner CloudShell procedure

> **Superseded by section 13.8.** The expected SHA256 below is the `ae90b2d` script. Once the
> hardening is merged, a download from `main` will not match it, and the instruction "any other
> value: stop" applies.

Account `229251310592`, region `eu-central-1`. This procedure creates nothing: no role, user or
access key.

**Caller mode.**

- **A, non-root ReadOnly role:** only if such a role already exists and you have authorized its use.
  Under ACCESS-POLICY D-4 none has been created, so this mode is not available today. Do not create
  one for this run.
- **B, root with `ALLOW_ROOT_READONLY=yes`:** your decision of 11:33 UTC, per ACCESS-POLICY §1.3.
  Use this mode.

```bash
# CloudShell, region eu-central-1, signed in as root (mode B) or as the existing ReadOnly role (mode A)
mkdir -p ~/identity-preflight && cd ~/identity-preflight
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
sha256sum preflight-readonly.sh
#   expected: 8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3  preflight-readonly.sh
#   any other value: stop and do not run it

# mode B (root):
ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
# mode A (existing ReadOnly role only): same line without ALLOW_ROOT_READONLY=yes
```

- Download only this one file. No helper and no test file is needed.
- Paste the whole output, including:
  - the caller identity line (P-1);
  - every P-1 to P-13 line;
  - both P-12 lines (`eu-central-1` and `us-east-1`);
  - the final `OVERALL:` line. `tee` hides the exit code, so this line is the result.
- **What a PASS proves under root.** Root bypasses IAM. A PASS shows the resources are in the
  expected state. It does not show that the deployment roles have the permissions they need.
- **If you see an ERROR line**, stop and paste the output. Do not change anything to make it pass.
- **Do not dispatch the session** as part of this step.

Expected P-3 and P-4 lines:

- `families with an ACTIVE revision = munaxa-nonprod-db-admin,munaxa-nonprod-identity,munaxa-nonprod-identity-bootstrap,munaxa-nonprod-identity-migrate`;
- four lines of `… ACTIVE revisions = <family>:1`;
- `munaxa-nonprod-identity-bootstrap image @sha256:71d01fdf…`;
- `identity-migrate secret names = DATABASE_MIGRATION_URL`;
- `identity-migrate DATABASE_MIGRATION_URL pinned to a3cc6622-…`;
- `identity-bootstrap DIRECT_DATABASE_URL pinned to a3cc6622-…`.

**Report reconciliation done in this PR.** No policy text changed.

- **First-session preparation report:**
  - §3.2 is marked superseded for execution and points here;
  - the P-12 row notes the embedded filter;
  - step 23, a post-session check that still uses the helper, gains a single-file download line
    with its SHA256.
- **Readiness report:** the "31 read operations" bullet now says 32 since #78. Historical
  §11.2 is left as written, pinned to its old hash. §5.2 was already marked superseded in #78.
- **Results review:** the "until this PR is merged" download note now says to use `main`.

## 11. No AWS changes

This task made no AWS API call and did not use the AWS connector. It did not:

- run Terraform plan or apply;
- dispatch any workflow;
- create or change any IAM, KMS, Secrets Manager, ECS, RDS, networking, ALB, DNS, Cloudflare or
  GitHub environment setting;
- run a migration or bootstrap;
- merge anything.

The only changes are the Markdown files in this PR.

## 12. Safe to proceed?

Yes, to the **owner-run read-only preflight** (section 10, mode B). The script on `main` is the
reviewed one, it is read-only, it guards the account and caller, and its checks match the source.

This is not approval for the Identity session and not a claim that AWS is ready. That depends on
the preflight output, its review, G-4, and your separate session approval.

---

## 13. Hardening of P-11b and P-13 (10 Nov afternoon)

Requested by the owner at 12:31 UTC as a follow-up to PR #79, which stays unmerged. Repository and
offline work only: no AWS call of any kind, no AWS connector, no Terraform against AWS, no workflow
dispatch, no IAM, network or other AWS change, no merge. **No live AWS preflight has been run** with
the script in this section.

### 13.1 The two defects and their cause

| Check | What the `ae90b2d` script did                                                                                                                                                                                                                                                                                                                                                                                                                | Why that is not enough                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-11b | Listed the two `*-nonprod-session` roles with their max session; checked the deployer's inline policy names **include** `session-deployer` and attached names **include** `…-session-read` (regex); checked that 5 of 30 statement ids are present                                                                                                                                                                                         | The CI role's policy, both trust policies, the `munaxa-shared-deployer-read` attachment, any extra attached or inline policy, every Effect, Action, Resource and Condition, and both managed policy documents were never read. A role with an extra `AdministratorAccess` attachment, or with a widened statement under an expected Sid, passed                                          |
| P-13  | Looked up `-public-a`/`-public-b` and five security groups **by name** and compared their VPC with the database VPC; checked the `-rt-public` default route target starts with `igw-`                                                                                                                                                                                                                                                       | Nothing proved the route table is in that VPC, which subnets it serves, that the route is active (not `blackhole`), that the `igw-` is the stack's own gateway and attached, that no extra subnet, route table, route, endpoint or group exists, or anything about the database subnets and their route table                                                                          |

**Root cause.** Both checks were written in PR #76 and kept in #77/#78 by Claude from resource
names, not from the full Terraform definitions, and the tests only exercised the names. This is the
same class of error as P-3/P-4 in the results review (section 6 there). The owner's runs of
10 Nov did not reach a misleading PASS on either check, but a later run could have.

**Source references (at `main`).**

- P-11b: `infra/aws/bootstrap/iam_session.tf` (`ci_session_trust` l.14, `ci_session` role l.41 and
  inline policy l.50, `deployer_session_trust` l.65, `deployer_session` role l.83, document l.94,
  inline policy l.225, attachments l.233 and l.295, `deployer_session_read` l.245/l.286);
  `infra/aws/bootstrap/iam_allow.tf` (`deployer_read` l.78, l.100, l.107); the KMS state key via
  `alias/munaxa-shared-tfstate`.
- P-13: `infra/aws/stack/network.tf` (VPC l.32, gateway l.40, subnets l.45/l.56, route tables
  l.67/l.86, default route l.72, associations l.78/l.91, S3 endpoint l.101, default security group
  l.133); security groups in `data.tf` l.51, `edge.tf` l.37, `ops.tf` l.22 and the Identity service
  module (Config A1 set).

### 13.2 How the work was done

| Agent                          | Workstream                                                                                                                                       | Result                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A                              | P-11b IAM audit: every resource and document behind the two session roles, expected values per statement                                         | 7 defects (D1 to D7) and 6 points needing a decision (O1 to O6, section 13.3)                                                                                                                                                             |
| B                              | P-13 network audit: every network resource in `network.tf` and its relationships                                                                | 8 defects (D1 to D8), including the misclassification when P-2 errors and a wrong test CIDR                                                                                                                                             |
| C                              | Safety and test-harness audit; later the final safety review of the full diff                                                                    | 1 high (the suite could not detect an unexpected AWS operation), 5 medium, 7 low; see 13.6                                                                                                                                               |
| D                              | Documentation audit of the four 10 Nov reports and the index                                                                                     | List of superseded statements and wording fixes, applied in this PR                                                                                                                                                                       |
| Reviewer P-11b                 | Independent review of the P-11b implementation (not Agent A)                                                                                     | No critical or high; spec equal to an independent render; 2 medium and 4 low test gaps, 6 low; see 13.6                                                                                                                                                                                                                          |
| Reviewer P-13                  | Independent review of the P-13 implementation (not Agent B), with 32 mutation tests                                                              | 1 high, 1 medium, 7 low; see 13.6                                                                                                                                                                                                        |
| Coordinator (this thread)      | Integrated every edit in one worktree, the offline render, tests, docs, commit and PR. Subagents did not commit or push                          | This section                                                                                                                                                                                                                             |

**Offline render, no AWS.** To get the exact policy documents, the coordinator rendered
`infra/aws/bootstrap` at `ae90b2d` with Terraform 1.16.5 and the AWS provider 6.67.0 from a local
mirror, on a scratch copy where the four values that need AWS (state key ARN, state bucket ARN,
OIDC provider ARN, session role ARNs) were replaced by literals from earlier evidence, with fake
credentials and the HTTP(S) proxy pointed at a closed port. No state was read and no AWS endpoint
could be reached. The rendered JSON is committed as `supporting/session-roles-rendered.json`; it
matched Agent A's hand-made expectation statement for statement (session-deployer 30, session-read
4, deployer-read 2, CI inline 1, both trusts). A test fails if the embedded expectation ever drifts
from that file.

### 13.3 Decisions taken without inventing policy

Agent A raised six points where the code did not dictate the check. Each was settled from the code
and the existing access policy, not by inventing a rule:

- **O1 state key.** The rendered policy names the KMS state key ARN. The script embeds it and also
  checks that `alias/munaxa-shared-tfstate` still points at it.
- **O2 boundary.** The code sets no permissions boundary, so a boundary present is a FAIL (drift).
- **O3 output.** A difference prints the Sid and the differing Effect/Action/Resource; condition
  **values** are never printed, only that the condition differs.
- **O4 trust and extra roles.** Trust policies are compared; any other `*-session` role under the
  bootstrap path is a FAIL.
- **O5 drift from HEAD.** The expectation is the code at this commit. If live AWS predates a later
  code change, the check FAILs by design and the output says which statement differs.
- **O6 case.** Comparison is case-sensitive, as IAM evaluates ARNs and most values.

### 13.4 P-11b after the change

For both `munaxa-shared-ci-nonprod-session` and `munaxa-shared-deployer-nonprod-session`:

- the roles under `/munaxa-shared/bootstrap/` named `*-session` are exactly these two;
- Path, ARN and MaxSessionDuration 3600; permissions boundary absent;
- trust policy equal to the code;
- inline policy names exactly `{assume-own-session-deployer-only}` (CI) and `{session-deployer}`
  (deployer); attached policy ARNs exactly none (CI) and
  `{munaxa-shared-deployer-read, munaxa-shared-deployer-nonprod-session-read}` (deployer);
- every inline document and the default version of both managed policies equal the code.

**Comparison.** Documents are URL-decoded if needed, statements are keyed by Sid, and each statement
is canonicalised: string-or-list values become sets, condition operators and keys are normalised,
`"*"` stays distinct from an explicit list, Action stays distinct from NotAction and Resource from
NotResource. The Version, duplicate Sids, missing and unexpected statements (with or without Sid)
and every differing field are reported. A partial read is never a PASS: any call that fails is an
ERROR and the verifier then reports nothing for that document; an unreadable or malformed response
is an ERROR.

**What P-11b proves.** That the two roles, their trust and every permission document attached to
them are exactly what `infra/aws/bootstrap` at this commit renders, with nothing added.

**What it does not prove.** It is not an effective-permission test. Run as root it exercises no IAM
evaluation. It does not evaluate SCPs, resource policies (KMS key, S3 bucket), session policies or
the GitHub OIDC side, and it does not show that `up` will succeed. Only a real session does that.

### 13.5 P-13 after the change

The VPC is found by its `Name` tag; every other read is filtered by that VPC id (the gateway by its
`Name` tag, so a detached gateway or one attached elsewhere is reported):

- exactly one VPC `munaxa-nonprod`, 10.130.0.0/16, available, not default, equal to the database VPC
  from P-2 (P-2 ERROR gives ERROR; no database gives FAIL);
- exactly five subnets with the code's AZ and CIDR, no public IP on launch, available;
- exactly one gateway `munaxa-nonprod-igw`, attached to that VPC only;
- exactly three route tables: main (local only), `-rt-public` and `-rt-db`; duplicates FAIL;
- associations: `-rt-public` exactly public-a and public-b, `-rt-db` exactly db-a, db-b and db-c,
  each in state `associated`; each subnet has one explicit association; no edge association; the
  main association only on the main table;
- routes: the local route active on every table; on `-rt-public` exactly one `0.0.0.0/0` route
  whose only target is that gateway's id and whose state is `active`, and exactly one S3
  prefix-list route to the endpoint, active; any other route FAILs;
- exactly one VPC endpoint: S3 Gateway, available, on `-rt-public` only, tagged
  `munaxa-nonprod-s3`;
- security groups in the VPC exactly `default`, `-alb`, `-database`, `-db-admin`, `-identity`,
  `-identity-migrate`; the default group tagged `munaxa-nonprod-default-unused` with no rules.

If the VPC does not resolve, or its id is not a valid `vpc-` id, the dependent reads are not made
and each is reported as ERROR, never PASS.

### 13.6 Safety changes and review findings

**From Agent C (all fixed unless stated):**

- **H1:** the suite could not detect an unexpected AWS operation. Every test now checks each call
  against the exact allowlist, the exact option set and the environment, and one test pins the full
  ordered list of baseline calls.
- **M1:** CloudTrail helper read a truncated or malformed lookup as clean. Now exit 2 (ERROR) on a
  `NextToken`, a missing `Events` list or a non-object event; the script accepts exit 0 only with
  the line `events N denials 0`. New `cloudtrail-denials.py` SHA256 `0669df65…b7589`, re-embedded.
- **M2:** endpoint and profile overrides. The script clears `AWS_ENDPOINT_URL*`, sets
  `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS=true`, unsets shell functions named like the tools it uses,
  and refuses `--endpoint-url`, `--profile`, `--cli-input-*`, `--debug`, `--no-verify-ssl`,
  `--no-sign-request`, `--ca-bundle` and paging options; `--region` only for CloudTrail
  (eu-central-1, us-east-1).
- **M3:** `PREFLIGHT_SINCE` is validated (ISO UTC, not in the future); otherwise P-12 is ERROR and
  CloudTrail is not read.
- **M4:** P-6 counts secrets scheduled for deletion too (`--include-planned-deletion`).
- **M5:** counts use JSON output, so `--query` runs once on the combined pages.
- **L1, L2, L5 to L7:** ACM ARN validated before use, temporary files in one directory removed on
  exit, and smaller fixes.
- **Not changed, documented as limitations:** L3, absence (ABSENT) is still recognised from the AWS
  error code in the CLI message; L4, CloudTrail error codes other than `AccessDenied*` and
  `UnauthorizedOperation` (for example `AuthorizationError`) are not counted as denials.

**From the P-13 reviewer:**

- **High (fixed):** an unexpected VPC id format made the script skip the dependent reads silently.
  The missing files are now marked as not fetched, the verifier checks the id format, and the result
  is ERROR. Test added.
- **Medium (fixed):** 19 of 32 mutations of the verifier survived the tests (missing default or S3
  route, local route, S3 route target and state, association state, edge and main associations,
  default group tag, P-2 ERROR and no-database branches, VPC CIDR/state/IsDefault, gateway single
  attachment and count, endpoint count and state, unexpected subnet, duplicate route table). Ten
  tests were added that cover each.
- **Low (documented, see 13.9):** endpoint policy, security group rules other than the default
  group's, VPC DNS attributes, the subnet `Tier` tag, NACLs and the DB subnet group membership are
  not compared. The default group's no-rules check and the endpoint tag were added.

**From the P-11b reviewer:** an independent offline render of `infra/aws/bootstrap` matched all six
embedded documents and the committed render; 50 direct probes found no way for broader permissions
to PASS (case, operator, principal, Action/NotAction and Resource/NotResource swaps, extra keys and
statements all FAIL; malformed input ERRORs); condition values are never printed. No critical or
high finding.

- **Medium (fixed, tests added):** 9 of 37 mutations survived. Tests now cover a `NotResource`
  turned into `Resource` and `Action` into `NotAction`, an unknown statement key, an unreadable or
  absent managed policy document (never PASS), and changed role Path and Arn. Two survivors are
  equivalent for this spec; two low ones (empty list, string principal) are left.
- **Low (fixed):** a `PermissionsBoundary` object without an ARN was read as none; any boundary
  value now FAILs (test added). A comment cited a report folder that does not exist; corrected.
- **Low (documented):** only roles named `*-session` under the bootstrap path are listed; absence is
  matched on the code and message together (same as Agent C L3, gives FAIL, never PASS); a
  difference in a statement without Sid is reported without field detail; KMS key policies, bucket
  policies and SCPs are outside P-11b. The tests' fixture is built from the embedded spec, so the
  spec's correctness rests on the render comparison test and on regenerating the render whenever
  `infra/aws/bootstrap` changes.

**Agent C final safety review of the full diff (working tree against `1430b4b`):** no critical
finding and no code finding above low. All seven checks hold: only the 37 allowlisted read
operations can run and none reads secret values, state, logs or application data; no failed, unread
or malformed response becomes PASS; the option, endpoint, account and root guards hold; the embedded
CloudTrail filter is byte-identical to `cloudtrail-denials.py`; the harness detects unexpected
operations, options and endpoint overrides; the docs claim no live run and call skipped jobs
skipped; only report files changed.

- **High, docs (fixed):** the reports already pointed to section 13 and 13.8 before they were
  written, and the new SHA256 was not published. This section and 13.8 close it.
- **Low (fixed):** `--region=VALUE` was not refused (test added); only named shell functions were
  cleared, so every inherited function is now removed before the script defines its own (test with
  inherited `read`, `printf` and `record` functions added); two corrected sentences in sections 1
  and 6 are now struck through and kept instead of replaced; the readiness report's "no logs" now
  says CloudTrail events are downloaded and filtered locally.
- **Low (documented):** the static scan does not catch an indirect launch such as `X=aws; $X …`
  (the runtime call list and stub log do, on tested paths); a role whose policy lists answer
  `NoSuchEntity` after `get-role` succeeded gives ERROR instead of FAIL (conservative);
  `AWS_CA_BUNDLE` and `HTTPS_PROXY` are not reset, like `BASH_ENV` (use a fresh CloudShell tab).
- During the review, one static mutation test still targeted the verifier's old import lines and
  failed; its input was updated to the current imports (the check itself is unchanged).

### 13.7 Tests and validation

All offline, with the stub AWS CLI; no real AWS call was made by any test.

| Command (from the repository root)                                                                                                                       | Exit | Result         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------- |
| `bash -n docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh`                          | 0    | syntax OK      |
| `python3 -m unittest preflight_readonly_test` (in that `supporting/` folder, Python 3.11 with `jmespath`)                                                | 0    | 103 tests OK (489 s) |
| `python3 -I cloudtrail_denials_test.py` (in `2026-11-10-identity-first-session-preparation/supporting/`)                                                 | 0    | 8 tests OK     |
| `node --test verify-identity-jwt.test.mjs` (same folder)                                                                                                 | 0    | 26 tests, 26 pass |
| `prettier --check` (3.9.6) on the changed Markdown                                                                                                       | 0    | all files formatted |

The preflight suite went from 35 tests at `ae90b2d` to 103; no existing test was removed or
weakened (one expectation changed: an `AccessDenied` on networking now makes P-13 ERROR instead of
the old partial result). New classes: `StaticSafetyTest`, `SessionRolesTest` (P-11b),
`NetworkTopologyTest` (P-13), `GeneralSafetyTest`. They cover all 14 P-11b and all 16 P-13 cases the
owner listed, and every general safety case:

- unknown operation refused before execution;
- foreign account stops after `get-caller-identity`;
- root without the flag stops, root with it warns;
- a failed command is never a PASS (every call in turn made to fail);
- no secret value, state, log or application data is read (operation allowlist, static scan);
- the script runs alone in an empty directory and leaves no file behind;
- the CloudTrail filter stays embedded, byte-identical to `cloudtrail-denials.py`, and tested;
- any unexpected AWS operation, option or endpoint override fails the suite.

No lockfile, workflow or Terraform file changed. The diff contains only the files listed in the PR.

### 13.8 Owner CloudShell procedure (replaces section 10)

> **Note added 11 Nov 2026:** for reruns, use the command in
> [`2026-11-11-identity-readiness-status` section 5](../2026-11-11-identity-readiness-status/00-IDENTITY-READINESS-STATUS.md).
> It adds `set -o pipefail`, so the script's exit status survives `tee`, and an automatic SHA256
> check. The block below is kept as the procedure the 11 Nov run followed.

Only after this PR is merged. Account `229251310592`, region `eu-central-1`, mode B (root with
`ALLOW_ROOT_READONLY=yes`), your decision of 11:33 UTC. The procedure creates nothing.

```bash
# Fresh CloudShell tab, region eu-central-1, signed in as root
mkdir -p ~/identity-preflight && cd ~/identity-preflight
rm -f preflight-readonly.sh
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
sha256sum preflight-readonly.sh
#   expected: 21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c  preflight-readonly.sh
#   any other value: stop and do not run it
ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
```

- Download only this one file. Use a fresh CloudShell tab so no earlier shell setting applies.
- Paste the whole output, from the caller line to the final `OVERALL:` line.
- Expected P-11b lines on a match: 20 PASS lines ending with
  `alias/munaxa-shared-tfstate = the state key in the expected policy`, and the INFO line
  `P-11b compares documents with the code. It does not evaluate effective permissions…`. The key
  lines are `inline session-deployer: 30 statement(s) match the code`,
  `managed policy munaxa-shared-deployer-nonprod-session-read: 4 statement(s)…` and
  `managed policy munaxa-shared-deployer-read: 2 statement(s)…`.
- Expected P-13 lines on a match: 19 PASS lines, including
  `route table munaxa-nonprod-rt-public routes = local, 0.0.0.0/0 -> igw-… active, S3 endpoint active`
  and `default security group has no rules`.
- A FAIL on P-11b or P-13 means live AWS differs from the code at this commit. Do not change
  anything; paste the output for review. An ERROR means something was not read: also stop and paste.
- What a PASS proves under root: resource state and policy documents only, not permissions.
- Do not dispatch the session as part of this step.

### 13.9 Limitations

- No live AWS preflight has been run with this script. Its expectations come from the code and an
  offline render, and the state key ARN from earlier evidence (checked live through the alias).
- P-11b compares documents; it is not an effective-permission test (13.4).
- P-13 does not compare the S3 endpoint policy, rules of groups other than `default`, VPC DNS
  attributes, the subnet `Tier` tag, NACLs or the DB subnet group membership.
- The security group set is Config A1's. Applying another configuration makes P-13 FAIL until the
  set in the script is updated.
- Live resources that predate a later code change FAIL by design (13.3, O5).
- Agent C L3 and L4 and the final review's documented lows remain (13.6).

### 13.10 Verdict

**VERIFIED — READY FOR OWNER-RUN READ-ONLY PREFLIGHT**, using the script from `main` once this PR has
been reviewed and merged (until then `main` still serves the `ae90b2d` script, whose P-11b and P-13
are the defective versions described in 13.1).

This is not an AWS-readiness verdict. The owner must still run the read-only preflight, provide the
complete output, and have it reviewed. G-4 must also be verified. The Identity session requires
separate explicit owner approval.

CI: this report is committed before CI runs on it. The CI result for the commit (success, failure,
pending or skipped, per job) is recorded in the PR description and the final thread reply; skipped
AWS Terraform Plan/Apply jobs are not success.
