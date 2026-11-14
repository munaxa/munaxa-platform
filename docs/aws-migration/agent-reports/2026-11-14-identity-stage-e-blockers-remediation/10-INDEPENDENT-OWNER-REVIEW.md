# Independent owner review of PR #130

Date: 14 to 15 Nov 2026. Requested by the owner on 14 Nov, 22:49 UTC. Reviewed PR:
https://github.com/munaxa/munaxa-platform/pull/130, head `38dd0e7`, base `main` `68fa6f9`, branch
`claude/project-thread-edtxfe`. The PR's own conclusion ("STAGE E REPOSITORY PREPARATION COMPLETE,
READY FOR OWNER REVIEW") was treated as a claim to verify, not as evidence.

## Conclusion

**PR #130 INDEPENDENT REVIEW PASSED — READY FOR OWNER MERGE DECISION**

The review found **0 Critical, 3 High, 6 Medium** (one Medium, B-1, is the security side of High
A-3) and 19 Low findings. Every High and Medium finding that the repository can fix is fixed on
the PR branch, with regression tests that fail on the earlier code (file 13). The one Medium that
code cannot settle, **L-A0 (B-2)**, is **unresolved and is an owner decision (D-LA0)**: it does not
block the merge, because merging runs nothing, but it blocks C-8 and C-8R (file 11). A third
verification pass (Pass C) confirmed the fixes and found 7 more Lows; 6 are fixed, 1 is accepted.

## Status, kept separate

| # | Statement | Status |
| --- | --- | --- |
| 1 | Repository implementation of BE-1, BE-2, BE-3, BE-4 (decision record), BE-8 | **Complete** (with the review fixes) |
| 2 | Independent review (Pass A correctness, Pass B security, Pass C verification) | **Complete** |
| 3 | Offline tests | **Complete, all pass** (file 13 §4) |
| 4 | Terraform | **Prepared, not applied**; off by default; no plan against a backend (file 12) |
| 5 | AWS behaviour | **Not verified.** The [U] items (Step Functions response casing and error names, `DescribeTaskDefinition` shapes through the connector, `RunTask` `clientToken`, the Fargate hand-off volume, `dependsOn` timing, the connector's own records) fail closed and are first exercised by D-B4, the first E-1 `discover` and the first probe run |
| 6 | Owner decisions | **Required** (file 08): D-PR, D-BE4, D-LA0 (new, unresolved), D-B2, D-B3, D-B4, D-B5, D-PIN, D-E |
| 7 | Stage E | **Not authorized, not started** |

## How the review was done

- Clones unshallowed; baseline tests run at 38dd0e7 (connector 112, simulator 30, Node 114,
  Terraform stack 75, bootstrap 14, all passing).
- **Pass A (correctness)** and **Pass B (security)** by separate reviewer agents that read the code
  and ran mutation experiments; neither was given the PR's conclusions as fact.
- Fixes applied, then **Pass C** by a third reviewer that checked each fix and searched for tests
  that would still pass with a safety check deleted.
- L-A0 reviewed from repository evidence only (file 11). Terraform and IAM reviewed offline with
  mocked providers (file 12).
- Every test ran with AWS credentials removed from the environment.

## Findings

### High (3, all fixed)

| ID | Finding | Fix |
| --- | --- | --- |
| A-1 | Cleanup Choice states compared AWS response fields without checking they exist. In JSONPath Step Functions a missing path raises `States.Runtime`, which `Catch` on `States.ALL` does not handle, so one unexpected response shape failed the whole execution, including the ALB branch that protects against cost | `IsPresent` guards before every comparison; raw `ResultPath` instead of `ResultSelector`; "unexpected" per branch |
| A-2 | The secret branch read `ARN`; the aws-sdk integration may return `Arn` (unverified), which would hit A-1 | both accepted; neither present is "unexpected" |
| A-3 | E-1 validated environment **names** only, not values, and ignored unknown task and container fields. A revision with another `PGHOST` (pointing the db-admin master credentials elsewhere, B-1) or another `IDENTITY_BASE_URL` would have passed as valid | every value pinned in the manifest and compared; task size, runtime platform, extras and unknown fields checked; Terraform test ties the manifest to the rendered definitions |

### Medium (6: 5 fixed, 1 owner decision)

| ID | Finding | Status |
| --- | --- | --- |
| A-4 | E-1 `status` reported IN_PROGRESS for a task ECS no longer knows (DescribeTasks `failures` ignored) | fixed |
| A-5 | Runbooks still contained hand-written `RunTask` paths that bypass E-1 | fixed, lint test |
| A-6 | Cleanup read only the first `ListSecrets` page; the bootstrap secret on a later page would never be deleted | fixed, paged and bounded |
| A-7 | The not-run alarm would flap daily | fixed, 26 hourly periods |
| B-1 | = A-3 security impact (credential redirection through an environment value) | fixed with A-3 |
| B-2 | **L-A0**: what the connector records when C-8/C-8R send the password in `SecretString` | **unresolved, owner decision D-LA0** (file 11) |

### Low (19)

Fixed: A-8, A-10 (part), A-11 (part), B-7, B-8, C-1, C-2, C-3, C-4, C-5, C-6. Accepted with the
residual risk stated: A-9, A-10 (rest), A-11 (rest), A-12, B-3, B-4, B-5, B-6, C-7, A-sim (file 13 §3,
file 12 §4).

## L-A0

Repository evidence (17 recorded connector results, 224 AWS calls) shows the connector returns no
request parameters or responses in `api_calls`, but it does record the **full AWS error message**,
and one recorded message echoes request content. What the connector's server-side audit log keeps
is unknown. **L-A0 is not accepted by this review.** C-8 and C-8R must not run until the owner
decides D-LA0; file 11 gives a canary procedure that tests it with no real credential, and a
safer alternative (CloudFormation `GenerateSecretString`) if the canary shows any leak.

## Terraform and IAM

Counts reproduced from the code: bootstrap 2 updates and 2 creates; stack 8 creates and 1 update;
probe pin 1 create. At the defaults nothing is created or changed in nonprod, prod or bootstrap,
and nothing can be created in prod. No Critical, High or Medium IAM finding (file 12).

## What this review did not do

No AWS connector call, no AWS CLI call, no Terraform plan against a backend, no apply, no AWS or
GitHub Actions workflow dispatch, no RDS start or stop, no ECS service or task, no migration or
bootstrap run, no secret created, read, changed or deleted, no credential or password generated,
no IAM, KMS, network, DNS, certificate, budget or schedule change, no image publication, no
deployment, no GitHub repository or environment setting change. PR #130 and PR #129 were not
merged. C-8 and C-8R were not run. Stage E was not started.

## Files of this review

| File | Content |
| --- | --- |
| 10 | This summary |
| 11 | L-A0 connector credential leakage review |
| 12 | Terraform and IAM review |
| 13 | Fixes, regression tests, accepted Lows, exact test results |
