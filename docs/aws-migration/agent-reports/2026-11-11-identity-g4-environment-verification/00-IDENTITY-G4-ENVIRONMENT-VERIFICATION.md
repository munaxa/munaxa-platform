# G-4 verification: GitHub environment `aws-nonprod-session` (11 Nov 2026)

## 1. Executive summary

**Verdict: NOT VERIFIED — OWNER UI INSPECTION REQUIRED.**

The environment's settings cannot be read with the GitHub access available here.

- The GitHub integration has no tool for environment settings, variables or secrets.
- The direct API returned HTTP 403 through this session's proxy on 10 Nov.
- The restriction was not bypassed.

What could be checked is run metadata from the latest scheduled `aws-session.yml` run (`42928482147`, 11 Nov 00:04 UTC). It is indirect, but consistent with the expected configuration:

- The two jobs in `aws-nonprod-session` started 4 seconds after they were created. Nothing held them for approval, which fits "no required reviewers, no wait timer".
- The variables resolved to the expected session roles in that environment:
  - `AWS_CI_ROLE_ARN` = `…/munaxa-shared-ci-nonprod-session`;
  - `AWS_DEPLOYER_ROLE_ARN` = `…/munaxa-shared-deployer-nonprod-session`.

Run metadata cannot show the protection settings themselves, the branch rule, administrator bypass, whether the variables are defined on the environment or the repository, or the environment secrets. Those need the owner's UI check (section 6).

## 2. Verification scope

- **Target:** repository `munaxa/munaxa-platform`, environment `aws-nonprod-session`, items 1 to 7 of the owner's task (11 Nov 07:07 UTC).
- **Expected values:** taken from `2026-11-11-identity-readiness-status`, section 4.
- **Method:**
  - GitHub Actions run and job metadata, and one job log, read through the GitHub integration (read-only);
  - repository source at `main` `f594ab8`.
- **Not done:**
  - no environment, variable, secret or protection-rule read through any other route;
  - no setting changed;
  - no workflow dispatched;
  - no AWS call;
  - no secret value read.
- **Preflight rerun of 11 Nov, about 07:01 to 07:03 UTC.** The raw output was not seen in this thread. This report relies on the owner's summary of it:
  - P-1 to P-11b PASS;
  - P-12 FAIL, the 10 known `ListTagsForResource` denials;
  - P-13 PASS;
  - `OVERALL: FAIL (1 check failed)`, exit status 1.

  The raw P-12 result stays FAIL. The investigation status is RESOLVED — EXPECTED BEHAVIOUR (`2026-11-11-s3-listtags-denial-investigation`). This report does not reassess it.

## 3. Actual G-4 settings (what could be observed)

| #   | Setting                                          | Observed                                                                                                                                                                                                                       | How                                                              |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | Required reviewers                               | Not readable. Indirect: jobs `130220935921` (Stop the database) and `130220937095` (Testing down) were created at 00:04:50/51 and started at 00:04:54/55 UTC with no approval step. A required reviewer would have held them | Job metadata, run `42928482147`                                  |
| 2   | Wait timer                                       | Not readable. Indirect: the same 4 second gap. A wait timer of 1 minute or more would have delayed the start                                                                                                                         | Job metadata, run `42928482147`                                  |
| 3   | Deployment branch and tag rule                   | Not readable. The run was on `main`, so it shows nothing about other branches                                                                                                                                                  | Run metadata (`head_branch: main`)                               |
| 4   | Administrators can bypass                        | Not readable. Nothing in run metadata shows it                                                                                                                                                                                 | —                                                                |
| 5a  | `AWS_CI_ROLE_ARN`                                | Resolved in this environment to `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session`. Whether it is set on the environment or on the repository is not readable                             | Job log `130220935921`, `role-to-assume`, 00:04:57 UTC           |
| 5b  | `AWS_DEPLOYER_ROLE_ARN`                          | Resolved in this environment to `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session`. The level is not readable                                                                     | Job log `130220935921`, `DEPLOYER_ROLE_ARN`, 00:04:58 UTC        |
| 6   | Environment secrets                              | Not readable. The workflow references no `secrets.*` (`.github/workflows/aws-session.yml`), so no secret is needed. Whether one exists is unknown                                                                                 | Source at `f594ab8`                                              |
| 7   | Variables point to the session roles             | Yes for the values in effect on 11 Nov 00:04 UTC (5a, 5b). OIDC accepted the role: "Authenticated as assumedRoleId …:gha-run-42928482147-db"                                                                                    | Job log `130220935921`                                           |

Supporting observations:

- The workflow uses `vars.AWS_CI_ROLE_ARN` and `vars.AWS_DEPLOYER_ROLE_ARN` (lines 74, 84, 115, 129, 141 and 190). Both jobs declare `environment: aws-nonprod-session` (lines 60 and 106) and gate on `github.ref == 'refs/heads/main'` (lines 57 and 98).
- The A1 runs in environment `aws-nonprod` on 10 Nov used `munaxa-shared-deployer-nonprod` (CloudTrail sessions `gha-run-42766116306` and the two after it). So the values differ between the two environments, and at least one environment defines its own. Which one cannot be told from here.

## 4. Expected versus observed

| #   | Item                              | Expected                                   | Observed                                                                                       | Result           | Evidence and time                                         |
| --- | --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| 1   | Required reviewers                | None, by design                            | Not readable. Indirect: no approval hold                                                       | **NOT VERIFIED** | Job metadata, run `42928482147`, 11 Nov 00:04:50–55 UTC   |
| 2   | Wait timer                        | None                                       | Not readable. Indirect: started 4 s after creation                                             | **NOT VERIFIED** | Same                                                      |
| 3   | Deployment branches               | `main` only                                | Not readable                                                                                   | **NOT VERIFIED** | —                                                         |
| 4   | Administrator bypass              | Record the actual setting                  | Not readable                                                                                   | **NOT VERIFIED** | —                                                         |
| 5a  | `AWS_CI_ROLE_ARN`                 | The `-session` CI role                     | `…/munaxa-shared-ci-nonprod-session` in effect; level unknown                                   | **NOT VERIFIED** (value consistent) | Job log `130220935921`, 11 Nov 00:04:57 UTC |
| 5b  | `AWS_DEPLOYER_ROLE_ARN`           | The `-session` deployer role               | `…/munaxa-shared-deployer-nonprod-session` in effect; level unknown                             | **NOT VERIFIED** (value consistent) | Job log `130220935921`, 11 Nov 00:04:58 UTC |
| 6   | Environment secrets               | None                                       | Not readable. None referenced by the workflow                                                  | **NOT VERIFIED** | Source `f594ab8`                                          |
| 7   | Variables point to session roles  | Yes                                        | Yes, for the values resolved on 11 Nov 00:04 UTC                                               | **NOT VERIFIED** (value consistent) | Job log `130220935921`                        |

No item is FAIL. Nothing observed contradicts the expected configuration. No item is PASS,
because the settings themselves were not read.

Items 5a, 5b and 7 are marked NOT VERIFIED, not PASS, for two reasons:

- the task asks for the environment's variables, and the level (environment or repository) is not visible;
- the values are 7 hours old and could have changed since.

## 5. Evidence and limitations

**Evidence gathered (read-only, 11 Nov 2026, about 07:10 UTC):**

- `aws-session.yml` run list: the 5 latest runs, all `schedule`, `main`, `success`. The latest is `42928482147`.
- Jobs of run `42928482147`:
  - `Stop the database`, `130220935921`;
  - `Testing down`, `130220937095`.

  Both conclude `success`, with step timings.
- The job log of `130220935921`:
  - the `configure-aws-credentials` inputs (`role-to-assume`, `role-session-name gha-run-42928482147-db`, `audience sts.amazonaws.com`, `allowed-account-ids 229251310592`);
  - the step's `DEPLOYER_ROLE_ARN`;
  - "Authenticated as assumedRoleId".

  Masked values (`***`) were not and cannot be revealed.
- Repository source at `f594ab8`: the workflow references listed in section 3.

**Limitations:**

- The GitHub integration has no environment-settings tool.
- The REST endpoints `repos/{owner}/{repo}/environments/{name}`, `…/variables` and `…/secrets` were refused with HTTP 403 through this session's proxy on 10 Nov (`2026-11-10-identity-preflight-and-session-readiness`, G-4 row). They were not retried through another route.
- Run metadata proves only what happened in one scheduled run. It cannot prove settings that did not come into play in that run: the branch rule, admin bypass and secrets.

## 6. Owner actions required (manual UI inspection)

1. Open <https://github.com/munaxa/munaxa-platform/settings/environments> and choose `aws-nonprod-session`. Change nothing.
2. **Deployment protection rules:**
   - record whether **Required reviewers** is ticked, and if so who is listed;
   - record whether **Wait timer** is ticked, and if so how many minutes;
   - record whether **Allow administrators to bypass configured protection rules** is ticked.
3. **Deployment branches and tags:**
   - record the selected option (No restriction, Protected branches only, or Selected branches and tags);
   - if it is Selected, list every rule shown. Expected: exactly `main`.
4. **Environment secrets:** record only the names listed, or "none". Do not open or copy any value.
5. **Environment variables:**
   - record the names listed, and the values of `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN`;
   - expected values:
     - `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod-session`
     - `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session`
6. Optional: open <https://github.com/munaxa/munaxa-platform/settings/variables/actions> and record whether repository-level variables with the same two names exist, with their values.
7. Paste the recorded values, or screenshots, back into the project thread.

**What decides the result:**

- The verdict becomes **VERIFIED — G-4 MATCHES EXPECTED CONFIGURATION** only if:
  - required reviewers is none;
  - the wait timer is none;
  - the branches are `main` only;
  - there are no environment secrets;
  - both variables are defined on the environment with the expected values.
- The admin bypass is recorded as observed. It is not a pass or fail condition.
- Any difference makes the verdict **FAILED — G-4 CONFIGURATION DIFFERS FROM EXPECTED**. The difference is reported, not fixed.

## 7. Outstanding items

| Item                          | Status                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| G-4                           | **NOT VERIFIED**, owner UI inspection (section 6)                                                              |
| Preflight rerun of 11 Nov 07:01 | Owner-reported `OVERALL: FAIL`, exit status 1, P-12 only. Raw output not seen here. It should be pasted or attached so the P-12 signature can be checked (readiness status, section 6) |
| Deployment approval           | **Not given. The Identity deployment remains unauthorized.**                                                   |

READY FOR OWNER APPROVAL, if reached later, is a technical readiness assessment only. It does not
authorize a workflow dispatch, ECS execution, migration, bootstrap or secret operation.

## 8. Final verdict

**NOT VERIFIED — OWNER UI INSPECTION REQUIRED.**

No setting, variable, secret, protection rule, AWS resource, IAM item, Terraform file, DNS record or
workflow was changed or dispatched. Nothing was merged.
