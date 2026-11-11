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
(`ALLOW_ROOT_READONLY=yes`). Paste the whole block at once. It runs in a subshell `( … )`, so a
stop ends only the block and not the CloudShell session.

```bash
(
  set -o pipefail
  EXPECTED_SHA256=21ae3205aa867df610bb27ee59f08325bf1adca1e8dabef5f147b8c21c159f7c
  SCRIPT_URL=https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh

  mkdir -p ~/identity-preflight && cd ~/identity-preflight || { echo "STOP: cannot enter ~/identity-preflight"; exit 10; }
  rm -f preflight-readonly.sh
  curl -sSf -o preflight-readonly.sh "$SCRIPT_URL" || { echo "STOP: download from main failed; nothing was run"; exit 10; }

  ACTUAL_SHA256=$(sha256sum preflight-readonly.sh | cut -d' ' -f1)
  echo "expected SHA256: $EXPECTED_SHA256"
  echo "actual SHA256:   $ACTUAL_SHA256"
  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "STOP: SHA256 mismatch; the script was NOT run"
    exit 11
  fi

  OUT="preflight-$(date -u +%Y%m%dT%H%MZ).txt"
  ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee "$OUT"
  STATUS=$?
  echo "preflight exit status: $STATUS (output saved in ~/identity-preflight/$OUT)"
  exit "$STATUS"
)
```

**How it behaves:**

- **Download.** The script is fetched from `main` only. If the download fails, the block prints
  `STOP` and ends with status 10. Nothing is run.
- **SHA256 gate.** The block prints the expected and the actual SHA256 and compares them exactly.
  - On a mismatch it prints `STOP: SHA256 mismatch; the script was NOT run` and ends with status 11.
    The script is not run.
  - In that case `main` has changed, and the new SHA256 must be reviewed before any run.
- **Exit status.** `set -o pipefail` makes the `tee` pipeline return the script's own status. The
  status is captured on the very next line as `STATUS=$?`. It is printed immediately as
  `preflight exit status: N`:
  - 0 = `OVERALL: PASS`;
  - 1 = `OVERALL: FAIL`;
  - 2 = `OVERALL: INCOMPLETE`;
  - 3 = `OVERALL: NOT RUN`.
  - 10 and 11 come from the block itself and mean the script never ran.
- **Read-only.** The script uses only its read-only allowlist. It changes no AWS resource.
- **No overrides.** Do not set `PREFLIGHT_SINCE` and do not edit the script. The default window
  still starts at 10 Nov 06:00 UTC, so the original 10 events appear again.
- **Paste back:** the whole output, from `expected SHA256:` to `preflight exit status:`.

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

**The accepted signature.** A denial is accepted only if it matches all eight conditions:

| #   | Condition                                                      | Required value                                                                                                                                                   |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | Service, action and error code                                 | `eventSource` `s3.amazonaws.com`, `eventName` `ListTagsForResource`, `errorCode` `AccessDenied`                                                                   |
| S-2 | Region                                                         | `awsRegion` `eu-central-1`                                                                                                                                       |
| S-3 | Caller role                                                    | session issuer `munaxa-shared-deployer-nonprod` or `munaxa-shared-deployer-nonprod-session`, with session name `gha-run-<run id>`                                  |
| S-4 | Bucket                                                         | `munaxa-nonprod-school-files-229251310592` or `munaxa-nonprod-docs-files-229251310592`                                                                             |
| S-5 | Implicit deny, not explicit                                    | `errorMessage` contains "because no identity-based policy allows" and does not contain "explicit deny"                                                         |
| S-6 | Provider version                                               | `userAgent` contains `terraform-provider-aws/6.67.0`                                                                                                             |
| S-7 | Fallback succeeded                                             | a `GetBucketTagging` event with no `errorCode`, for the same bucket, by the same session ARN, with the same `eventTime` (same second)                              |
| S-8 | Run succeeded                                                  | the GitHub Actions run `<run id>` from S-3, in `munaxa/munaxa-platform`, has conclusion `success`                                                                 |

A P-12 denial for any other action, service, region or caller does not match. The number of
denials checked must equal the P-12 eu-central-1 count.

**How to verify S-1 to S-7.** The preflight lines show the caller but not the bucket, the message,
the user agent or the fallback. Use this read-only CloudShell block. It makes two
`cloudtrail lookup-events` calls and changes nothing.

Run it only with the owner's read authorization for that review. It can be run in CloudShell, or
the same reads can be made through the root connector.

```bash
(
  set -o pipefail
  cd "$(mktemp -d)" || exit 10
  for n in ListTagsForResource GetBucketTagging; do
    aws cloudtrail lookup-events --region eu-central-1 \
      --lookup-attributes AttributeKey=EventName,AttributeValue=$n \
      --start-time 2026-11-10T06:00:00Z --output json --query 'Events[].CloudTrailEvent' > "$n.json" ||
      { echo "STOP: lookup of $n failed"; exit 10; }
  done
  python3 -I - ListTagsForResource.json GetBucketTagging.json <<'PY'
import json, sys
ROLES = {"munaxa-shared-deployer-nonprod", "munaxa-shared-deployer-nonprod-session"}
BUCKETS = {"munaxa-nonprod-school-files-229251310592", "munaxa-nonprod-docs-files-229251310592"}
def load(path):
    return [json.loads(s) for s in json.load(open(path))]
def bucket(e):
    return (e.get("requestParameters") or {}).get("bucketName")
fallback_ok = {(e.get("userIdentity", {}).get("arn"), bucket(e), e.get("eventTime"))
               for e in load(sys.argv[2])
               if e.get("eventSource") == "s3.amazonaws.com" and e.get("awsRegion") == "eu-central-1"
               and not e.get("errorCode")}
denials = sorted((e for e in load(sys.argv[1]) if e.get("errorCode")), key=lambda e: e.get("eventTime", ""))
bad, runs = 0, set()
for e in denials:
    ui = e.get("userIdentity", {})
    arn = ui.get("arn", "")
    role = ui.get("sessionContext", {}).get("sessionIssuer", {}).get("userName")
    session = arn.rsplit("/", 1)[-1]
    msg = e.get("errorMessage") or ""
    checks = {
        "S-1 service/action/code": (e.get("eventSource"), e.get("eventName"), e.get("errorCode"))
                                   == ("s3.amazonaws.com", "ListTagsForResource", "AccessDenied"),
        "S-2 region": e.get("awsRegion") == "eu-central-1",
        "S-3 role and session": role in ROLES and session.startswith("gha-run-") and session[8:].isdigit(),
        "S-4 bucket": bucket(e) in BUCKETS,
        "S-5 implicit deny": "because no identity-based policy allows" in msg and "explicit deny" not in msg,
        "S-6 provider 6.67.0": "terraform-provider-aws/6.67.0 " in (e.get("userAgent") or ""),
        "S-7 GetBucketTagging success same second": (arn, bucket(e), e.get("eventTime")) in fallback_ok,
    }
    failed = [k for k, v in checks.items() if not v]
    bad += bool(failed)
    if session.startswith("gha-run-"):
        runs.add(session[8:])
    print(e.get("eventTime"), e.get("eventSource"), role, bucket(e), session,
          "MATCH S-1..S-7" if not failed else "NO MATCH: " + ", ".join(failed))
print(f"ListTagsForResource denials: {len(denials)}; matching S-1..S-7: {len(denials) - bad}; not matching: {bad}")
print("S-8: confirm each run concluded 'success':", " ".join(sorted(runs)) or "none")
sys.exit(1 if bad else 0)
PY
  echo "signature check exit status: $?"
)
```

- **Exit status.** The block ends with `signature check exit status: 0` only when every
  `ListTagsForResource` denial matches S-1 to S-7. Status 1 means at least one does not.
- **S-8.** Check each listed run ID in GitHub (Actions, or the run metadata) and confirm its
  conclusion is `success`.
- **Count.** Compare the number of denials with the P-12 eu-central-1 count. If P-12 lists any
  denial that is not a `ListTagsForResource` denial, that denial does not match.

**Readiness rule:**

- **All N match S-1 to S-8 and every other check PASSes:** the assessment may state
  "READY FOR OWNER APPROVAL (raw OVERALL: FAIL, P-12 accepted provider fallback only)". It must
  never say "OVERALL: PASS".
- **Any denial does not match, the counts differ, or any other check is FAIL, ERROR or
  INCOMPLETE:** stop. Report it for review.

**READY FOR OWNER APPROVAL is a technical readiness assessment only. It is not deployment
authorization and does not permit workflow dispatch, ECS execution, migration, bootstrap, or secret
operations.**

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
