# 00. Executive report: Identity Testing stage C, MFA bundle preparation

**Status (13 Nov 2026): STAGE C PACKAGE READY FOR THE OWNER TO RUN (route M-1). Nothing was run against AWS. No key or secret was generated, read, written or exposed. Nothing was deployed. PR #121 was not changed and not merged.**

Legend: **[V]** verified in source or by a local test, **[S]** from the Stage R live results, **[D]** AWS documentation, **[E]** expectation, **[U]** not verifiable offline, **[O]** owner action.

## What is ready

| # | Item | Result |
| --- | --- | --- |
| 1 | Bundle schema | exactly `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD`, plus `MFA_ENCRYPTION_KEYS` once `identity_security_config` is set (`data.tf:171`). Read and merge is required, because `PutSecretValue` replaces the whole string (01) [V][D] |
| 2 | Key format | `mfa-nonprod-2026-11=<43 characters>`, the base64url encoding of 32 CSPRNG bytes. It is not a repeated byte and does not reuse the signing secret or private key, per Identity 2db6ed9's `mfa-keys.ts`. The ring the script writes makes Identity 2db6ed9's own loader **start** in production mode with the P-5 environment (01, 02) [V] |
| 3 | `mfa_policy` | stays `off` (runbook P-4; privileged enrolment not ready; operator account never enrolled) (01 §5) [V] |
| 4 | Staging | a new version, `AWSCURRENT`; `ad02f18e` becomes `AWSPREVIOUS`; nothing deleted. Moving `AWSCURRENT` is harmless because every ECS reference pins a version id (01 §6) [V][D] |
| 5 | Script | [`supporting/stage-c-add-mfa-key.sh`](supporting/stage-c-add-mfa-key.sh), rewritten and hardened (02 §1). It meets all 16 task requirements (02 §2) |
| 6 | Offline test | 25 cases against a fake AWS, including a real terminal with `-I`. **All pass; 0 leaks** of fake values or the key. Reproducible from `supporting/offline-test/` (02 §3) [V] |
| 7 | Owner instructions | 03: step by step from opening CloudShell to the two lines to send back, with stop rules |
| 8 | P-5 | the exact one-line pin change plus comment is prepared but **not applied** (04). The mocked render shows the new id reaching the Identity and db-admin references only. `--enforce` still refuses a plan without the db-admin replacement [V] |
| 9 | Review | two independent rounds. No Critical or High. Round 1: 1 Medium and 6 Low, all fixed. Round 2: 1 Low-Medium and 3 Low, all fixed. Remaining Low and Info items accepted with reasons (05) |

**Script SHA-256:** `f059fa2e870162155a46b1e79ee7dcd2d7f78e0b815cb93c7164dd7fb40db6a0`

## The owner action now [O]

Run stage C yourself in AWS CloudShell by following [03-OWNER-CLOUDSHELL-INSTRUCTIONS.md](03-OWNER-CLOUDSHELL-INSTRUCTIONS.md), about 10 minutes. Then paste the two lines `new_version_id …` and `kid mfa-nonprod-2026-11` into the Claude thread.

Running it is your decision and your approval of stage C. Once an MFA secret has been stored under the key, the key must be kept.

## What happens after

- Claude checks the labels with metadata only. That needs your go-ahead for one read-only connector call.
- Claude then updates PR #121 with your version id (04), re-runs the offline checks, and keeps the PR in draft until review.
- Stage D (plan and apply) and stage E (the session) each need a separate approval (06).

## Remaining risks

| Risk | Handling |
| --- | --- |
| The script has never run against the real service [U] | every unexpected response stops it; the output says whether a write could have happened; a re-run is safe (02, 03) |
| CloudShell's Python, boto3 or credential provider differ from expectations [U][E] | step 4 checks boto3 first; any failure stops before reading a value |
| The operation runs as root, not least privilege (L-1) | accepted under the 8 Nov access policy; one ARN only (05 §4) |
| `ad02f18e` is kept only by its `AWSPREVIOUS` label | no further write to this secret until stage D (01 §6) |
| The key has no escrow outside Secrets Manager | acceptable in Testing (throwaway MFA account); production needs its own decision (previous report 04 §7) |
| Carried forward: S-1, S-2, S-3, the $10 budget | unchanged by this task (06) |

## Not performed

| Action | Status |
| --- | --- |
| AWS calls | none in this task |
| `GetSecretValue` or `PutSecretValue` | none |
| Key | not generated, read, copied, stored or transmitted, except fake values in local tests |
| Terraform | no plan or apply against AWS, no state change (mocked `terraform test` only) |
| Other changes | none to IAM, OIDC, KMS, accounts, ECS, PostgreSQL, migrations, sessions, DNS, Cloudflare, ACM, production, images, packages, GitHub settings or the budget |
| PR #121 | not updated, not merged |

## Files

| File | Contents |
| --- | --- |
| 01 | source and schema |
| 02 | script requirements, changes and tests |
| 03 | owner CloudShell instructions |
| 04 | P-5 update |
| 05 | independent review |
| 06 | gates and findings |
| `supporting/` | the script; the offline test with its output; the P-5 placeholder render diff; the plan-intent enforcement re-run |
