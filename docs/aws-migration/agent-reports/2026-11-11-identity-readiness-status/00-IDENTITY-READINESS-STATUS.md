# Identity readiness status after the S3 investigation (11 Nov 2026)

Scope: documentation only. This page records the completed S3 `ListTagsForResource` investigation
in the Identity readiness record. It also sets out the three things still outstanding before the
first Identity session.

It is the current Identity readiness checklist. It replaces section 6 of the run review as the list
of open items. The historical reports are not rewritten. Their raw results stand as recorded.

**Sources:**

| Source                                                                                                                                                               | What it holds                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`2026-11-11-identity-preflight-run-review/evidence/preflight-20261111T0543Z.txt`](../2026-11-11-identity-preflight-run-review/evidence/preflight-20261111T0543Z.txt)   | Raw preflight output, 11 Nov 05:43 to 05:45 UTC (SHA256 `7670ed90…a2b1`)       |
| [`2026-11-11-identity-preflight-run-review/00-IDENTITY-PREFLIGHT-RUN-REVIEW.md`](../2026-11-11-identity-preflight-run-review/00-IDENTITY-PREFLIGHT-RUN-REVIEW.md)       | Review of that run, and the owner's D-1 decision (05:54 UTC)                  |
| [`2026-11-11-s3-listtags-denial-investigation/00-S3-LISTTAGS-DENIAL-INVESTIGATION.md`](../2026-11-11-s3-listtags-denial-investigation/00-S3-LISTTAGS-DENIAL-INVESTIGATION.md) | The investigation and its verdict                                             |
| [`2026-11-11-s3-listtags-denial-investigation/evidence/cloudtrail-s3-listtags-events.json`](../2026-11-11-s3-listtags-denial-investigation/evidence/cloudtrail-s3-listtags-events.json) | All 10 CloudTrail events                                                      |
| [`2026-11-11-s3-listtags-denial-investigation/supporting/listtags-denials.sh`](../2026-11-11-s3-listtags-denial-investigation/supporting/listtags-denials.sh)           | Read-only CloudShell helper for the same events                               |
| [`2026-11-10-identity-post-merge-preflight-verification/`](../2026-11-10-identity-post-merge-preflight-verification/00-IDENTITY-POST-MERGE-PREFLIGHT-VERIFICATION.md) §13.8 | The run procedure the 11 Nov run followed. Section 5 below replaces it for reruns |

**Method.** Repository and Git history only. There was no AWS call and no AWS connector use. No
GitHub setting was read or changed, no workflow was dispatched and nothing was merged.

---

## 1. Three separate results

Do not merge these three. Each has its own status.

| Layer                                    | Status                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Original technical result**         | **`OVERALL: FAIL (1 check(s) failed)`**, script exit status 1. 13 of 14 checks PASS, no ERROR. **P-12 FAIL**: `eu-central-1: events 1658 denials 10`. This is the raw result. It is unchanged and stays FAIL. P-12 did not pass.                                                     |
| **B. Investigation conclusion for P-12** | **RESOLVED — EXPECTED BEHAVIOUR.** The 10 denials are explained, verified and accepted (sections 2 and 3). This is a conclusion about the cause of those 10 events. It does not convert the raw P-12 result into a PASS.                                                            |
| **C. Remaining deployment prerequisites** | **OUTSTANDING.** G-4 is not verified (section 4). The read-only preflight has not been rerun with the corrected command (section 5). The Identity deployment has not been approved (section 7). **The Identity deployment remains unauthorized.**                                    |

## 2. P-12 investigation record

**Status: RESOLVED — EXPECTED BEHAVIOUR.** Investigation completed and verified on 11 Nov 2026,
read-only.

**What the 10 events are:**

- They are 10 separate requests, not duplicates.
- They come from 5 runs × 2 buckets. Each run asked once for `munaxa-nonprod-school-files-229251310592` and once for `munaxa-nonprod-docs-files-229251310592`.
- Every event has its own event ID and request ID.
- The preflight list looked duplicated only because it does not print the bucket.

**The five runs.** All five succeeded. The post-apply plan reported no changes.

| Run           | Workflow and purpose                                   | Role                                     | Conclusion                       |
| ------------- | ------------------------------------------------------ | ---------------------------------------- | -------------------------------- |
| `42766116306` | AWS Terraform, Config A1 plan (22/0/0/0)               | `munaxa-shared-deployer-nonprod`         | success                          |
| `42766582624` | AWS Terraform, Config A1 apply                         | `munaxa-shared-deployer-nonprod`         | success                          |
| `42766964719` | AWS Terraform, post-apply plan                         | `munaxa-shared-deployer-nonprod`         | success, **No changes**          |
| `42785877006` | AWS Testing session, scheduled `down`                  | `munaxa-shared-deployer-nonprod-session` | success                          |
| `42928482147` | AWS Testing session, scheduled `down`                  | `munaxa-shared-deployer-nonprod-session` | success                          |

Every denial fell inside a plan or refresh step. None fell inside an apply step.

**Root cause:**

1. **Provider behaviour.** Terraform AWS provider 6.67.0 reads `aws_s3_bucket` tags through the S3
   Control tagging API first: `ListTagsForResource`, `TagResource` and `UntagResource`. It has done
   this since 6.23.0.
2. **Missing permission.** The deployer roles do not allow `s3:ListTagsForResource`. This covers
   both `munaxa-shared-deployer-nonprod` and `munaxa-shared-deployer-nonprod-session`.
3. **Implicit deny.** AWS returns an implicit deny: "no identity-based policy allows". No explicit
   deny matches. The bucket policy is TLS-only. SCPs do not apply in the management account.
4. **Fallback.** The provider falls back to `GetBucketTagging`. The fallback is documented in the
   provider changelog, section 6.23.0, PR #45251. In CloudTrail, each denial is followed in the
   same second by a successful `GetBucketTagging` on the same bucket from the same session.
5. **Result.** The tags of both the School and the Docs file buckets were read successfully in
   every run. Drift detection on those tags still works.

**Affected resources:**

- `aws_s3_bucket.files["school"]` and `aws_s3_bucket.files["docs"]`, at `infra/aws/stack/storage.tf:41`.
- Nothing was written. No state differs.

## 3. Accepted decision for these denials

The owner accepted the denials as known on 11 Nov 2026 at 05:54 UTC (D-1, decision card). That
acceptance is confirmed by the investigation verdict **EXPECTED — no permission change required**.
It means:

- **No IAM permission change.** `s3:ListTagsForResource` is not added to either deployer role.
- **No change to bucket policies.**
- **No change to SCPs.**
- **No suppression.** These CloudTrail events are not suppressed, filtered or hidden. The preflight
  script is not changed to ignore them. P-12 keeps counting every denial.
- **Accepted provider fallback.** These specific, explained denials are treated as an accepted
  provider fallback behaviour, under the signature in section 6. Any denial that does not match the
  signature is a stop condition.

D-1 says "P-12 counts as passed for this run". Read that as an acceptance of the 10 explained
events, not as a change to the raw result. P-12's raw result for 11 Nov is FAIL. Its status is
RESOLVED — EXPECTED BEHAVIOUR.

## 4. G-4: GitHub environment `aws-nonprod-session` (OUTSTANDING)

**Status: NOT VERIFIED.** Claude cannot read environment settings: on 10 Nov the API returned HTTP
403 through this session's proxy. Nothing was read or changed for this page. The owner checks it in
the GitHub UI under munaxa-platform → Settings → Environments → `aws-nonprod-session`, and records
what the screen actually shows.

**What the repository says it should be:**

| Setting                 | Expected                                                                 | Repository evidence                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required reviewers      | **None, by design**                                                      | `.github/workflows/aws-session.yml` (Testing session job): "No required reviewer, so the evening backstop can run unattended". The 2026-10-30 independent review calls it "no required reviewer, by design" |
| Wait timer              | None                                                                     | Not configured anywhere in the repository; a timer would delay the scheduled `down`                                                                                                                                                                 |
| Deployment branches     | **`main` only** (selected branches rule)                                 | 2026-10-31 phase 4 plan and master status, item 1 (owner-reported done 4 Nov). The workflow jobs also require `github.ref == 'refs/heads/main'`, and the `munaxa-shared-ci-nonprod` OIDC trust requires `ref = refs/heads/main`               |
| Prevent self-review     | Not applicable without reviewers                                         |                                                                                                                                                                                                                                                      |
| Environment variables   | `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` = the `-session` roles      | First-session preparation §3.1 G-4                                                                                                                                                                                                                   |
| Environment secrets     | None expected (OIDC, no stored AWS keys)                                 | ACCESS-POLICY: no access keys                                                                                                                                                                                                                       |

**Record to fill in from the UI**, values as shown:

| Setting               | Actual (owner) |
| --------------------- | -------------- |
| Required reviewers    |                |
| Wait timer            |                |
| Deployment branches   |                |
| Admins can bypass     |                |
| Variables (names)     |                |
| Secrets (names)       |                |

G-4 passes when every actual value matches the expected column. A difference is not changed as part
of this check: report it for review.

Because the environment has no required reviewer by design, GitHub does not hold a `up` dispatch
for approval. The approval in section 7 is therefore procedural. No one dispatches `up` until the
owner has approved it explicitly.

## 5. Read-only preflight rerun (OUTSTANDING, owner-run)

This replaces the command block in post-merge verification §13.8 for reruns. That block piped the
script into `tee` without `pipefail`, so the shell reported `tee`'s status (0) rather than the
script's. The script itself is unchanged.

**Command.** Fresh CloudShell tab, region `eu-central-1`, signed in as root, mode B
(`ALLOW_ROOT_READONLY=yes`). Run it only while main still holds the expected script.

```bash
set -o pipefail
mkdir -p ~/identity-preflight && cd ~/identity-preflight
rm -f preflight-readonly.sh
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
echo "21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c  preflight-readonly.sh" | sha256sum -c - \
  && { ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee "preflight-$(date -u +%Y%m%dT%H%MZ).txt"; echo "preflight exit status: $?"; }
```

**How it behaves:**

- **SHA check.** `sha256sum -c` prints `preflight-readonly.sh: OK` and only then runs the script.
  On any other value it prints `FAILED` and nothing runs. In that case stop: main has changed and
  the expected SHA must be reviewed first.
- **Exit status.** With `pipefail`, `preflight exit status:` is the script's own status:
  - 0 = `OVERALL: PASS`;
  - 1 = `OVERALL: FAIL`;
  - 2 = `OVERALL: INCOMPLETE`;
  - 3 = `OVERALL: NOT RUN`.
- **Read-only.** The script uses only its read-only allowlist. It changes no AWS resource.
- **No overrides.** Do not set `PREFLIGHT_SINCE` and do not edit the script. The default window
  still starts at 10 Nov 06:00 UTC, so the original 10 events appear again.
- **Paste back:** the whole output from the caller line to `preflight exit status:`.

**What to expect:**

- P-12 in eu-central-1 lists the original 10 denials. It adds 2 more for each later Terraform run
  that read the file buckets, for example each scheduled `down` run.
- If P-12 is the only failing check, expect `OVERALL: FAIL` and exit status 1.
- That is the honest raw result. It is assessed as described in section 6.

## 6. How the final readiness assessment accounts for P-12

**Raw result.** Report it verbatim, for example `OVERALL: FAIL`, exit status 1, P-12 FAIL with N
denials. Never write P-12 as PASS.

**Next to it,** record a separate assessment line:

> P-12: N denials, all matching the accepted provider-fallback signature (RESOLVED — EXPECTED
> BEHAVIOUR, investigation 2026-11-11); 0 unexplained denials.

**The accepted signature.** Every listed denial must match all of these:

1. `eventSource` is `s3.amazonaws.com`, `eventName` is `ListTagsForResource` and `errorCode` is
   `AccessDenied`, in `eu-central-1`.
2. The caller is `munaxa-shared-deployer-nonprod` or `munaxa-shared-deployer-nonprod-session`. The
   session name is `gha-run-<id>`, and that GitHub Actions run concluded `success`.
3. The resource is `munaxa-nonprod-school-files-229251310592` or
   `munaxa-nonprod-docs-files-229251310592`. The message says "no identity-based policy allows":
   an implicit deny.

**How to verify points 2 and 3.** The preflight lines show the caller but not the bucket. Get both
from the same read-only lookup the investigation used. Run it only with the owner's read
authorization for that review, as a CloudShell command or through the root connector.

```bash
aws cloudtrail lookup-events --region eu-central-1 \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ListTagsForResource \
  --start-time 2026-11-10T06:00:00Z --output json --query 'Events[].CloudTrailEvent' |
  python3 -I -c 'import json,sys
for s in json.load(sys.stdin):
    e = json.loads(s)
    if e.get("eventSource") == "s3.amazonaws.com" and e.get("errorCode"):
        implicit = "no identity-based policy allows" in (e.get("errorMessage") or "")
        print(e["eventTime"], e["userIdentity"].get("arn"), (e.get("requestParameters") or {}).get("bucketName"),
              e["errorCode"], "implicit" if implicit else "NOT-IMPLICIT")'
```

**Readiness rule:**

- **All N match the signature and every other check PASSes:** the assessment may state
  "READY FOR OWNER APPROVAL (raw OVERALL: FAIL, P-12 accepted provider fallback only)". It must
  never say "OVERALL: PASS".
- **Any denial does not match, or any other check is FAIL, ERROR or INCOMPLETE:** stop. Report it
  for review.

## 7. Deployment approval

**The Identity deployment remains unauthorized.** Nothing in this page, the investigation or D-1
approves the session.

The first Identity session (first-session preparation runbook, steps 8 to 23) needs the owner's
explicit approval. That approval is given in writing in the project, and only after the owner has
reviewed:

1. the G-4 record (section 4);
2. the rerun output and its assessment (sections 5 and 6).

Until then:

- no `aws-session.yml up` dispatch;
- no ECS task;
- no migration, bootstrap, DNS or secret action.

## 8. Readiness checklist

The 11 Nov results are from the raw output. "Status now" is this page's assessment.

| Check  | 11 Nov 05:43 UTC raw result                      | Status now                                                    |
| ------ | ------------------------------------------------ | ------------------------------------------------------------- |
| P-1    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-2    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-3    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-4    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-5    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-6    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-7    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-8    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-9    | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-10   | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-11   | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-11b  | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| P-12   | **FAIL** (eu-central-1: 10 denials; us-east-1: 0) | **FAIL (raw, unchanged); investigation RESOLVED — EXPECTED BEHAVIOUR** |
| P-13   | PASS                                             | PASS (to be reconfirmed by the rerun)                         |
| OVERALL | **`OVERALL: FAIL (1 check(s) failed)`**         | Unchanged as a raw result                                     |
| G-1, G-2, G-3, G-5 | PASS on 10 Nov (preflight and session readiness report) | Recheck on the session day (first-session preparation §3.1) |
| G-4    | BLOCKED for Claude on 10 Nov                     | **OUTSTANDING**: owner UI check, section 4                     |
| Rerun  | n/a                                              | **OUTSTANDING**: owner-run, section 5                          |
| Session approval | n/a                                    | **OUTSTANDING**: deployment unauthorized, section 7            |

## 9. Verification of this documentation change

| Check                                                    | Result                                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Investigation report unchanged                           | `00-S3-LISTTAGS-DENIAL-INVESTIGATION.md` is byte-identical to commit `f9df890`. SHA256 `d575011b…34ac`                                                                                         |
| Historical preflight output intact                       | `preflight-20261111T0543Z.txt` is byte-identical to commit `80a051e` (PR #81). SHA256 `7670ed90…a2b1`. It still ends `OVERALL: FAIL (1 check(s) failed)`                                        |
| Referenced evidence paths exist                          | Every relative link in this page resolves to a file in the branch (checked by script)                                                                                                          |
| No IAM permission added                                  | `git diff origin/main` touches only `docs/aws-migration/agent-reports/`. Nothing under `infra/` or `.github/` changed, and `s3:ListTagsForResource` appears in no `.tf` file                          |
| Preflight script unchanged                               | SHA256 `21ae3205…c159f7c`, the same as `main`                                                                                                                                                   |
| No claim that P-12 passed                                | Sections 1, 3, 6 and 8 state the raw P-12 result as FAIL                                                                                                                                    |
| Investigation and authorization kept apart               | Section 1 separates them into layers B and C. Section 7 states that the deployment is unauthorized                                                                                            |

## 10. No changes outside the repository

There was no AWS API call and no AWS connector use. No Terraform, IAM, SCP, bucket policy or
resource change was made. No GitHub environment or setting was read or changed, no workflow was
dispatched and no secret was accessed. Nothing was deployed and nothing was merged.
