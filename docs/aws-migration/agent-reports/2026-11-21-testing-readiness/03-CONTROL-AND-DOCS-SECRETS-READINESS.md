# 03. Control and Docs secret readiness

No secret was created, read or changed. No value was seen by Claude.

## 1. Review of the custody scripts (brief §4B)

Scripts: `scripts/aws/owner/control-testing-secrets.sh`, `docs-testing-secrets.sh`,
`work-testing-secrets.sh` (tests in `scripts/aws/owner/test/`).

| Requirement | Result | Evidence |
| --- | --- | --- |
| Values never in logs or reports | Met. Values only on the AWS CLI's stdin (memfd) and pipes; never argv, environment, files or output; `ABORT` lines carry at most an AWS error code; core dumps off; not dumpable | Script header and `aws()`; the fake CLI fails a test if a value appears in argv or environment; `assertClean` on every output |
| `status` exposes metadata only | Met (Control, Work: no `GetSecretValue`; Docs: reads the catalogue's tenant id inside the process, prints only the id and placeholder/real markers) | `test_status_reads_no_value`, `test_status_on_empty_bundles_reads_no_value` |
| Bundle creation idempotent | Met: resumable; a bundle with one version is read back and checked, never rewritten; `many` versions stops | `test_partial_fill_resumes` and the state machine `empty/one/many` |
| Validates the expected AWS identity | **Was account only. Now** root or `AWSReservedSSO_MunaxaEngineering_<16 hex>/<name>` only, checked before any secret call; the session name is never printed | `test_caller_identity.py` (new): Engineering accepted, root accepted, 7 other callers refused with only the STS call made |
| Rejects other accounts or Regions | Met: `WRONG_ACCOUNT`; Region and endpoints hard-coded to `eu-central-1`; KMS key ARN and secret ARN prefix checked on every secret | `describe()` checks; `test_wrong_account_stops_before_any_secret_call` |
| No overwrite without an explicit safe procedure | Met: `bundles` writes only empty bundles; `replace-key` (Docs, Work) changes exactly one named key, typed confirmation, hidden input, new version (old one stays AWSPREVIOUS) | Mode table in each header |

## 2. The change in this PR

Each script, after the account check:

```python
CALLER = who.get("Arn", "")
if CALLER == f"arn:aws:iam::{ACCOUNT}:root": caller_shown = CALLER
else: match arn:aws:sts::229251310592:assumed-role/(AWSReservedSSO_MunaxaEngineering_[0-9a-f]{16})/<name>
      otherwise ABORT CALLER_NOT_ALLOWED; print the role with "<session name not shown>"
```

`fake_aws.py` gained an optional `caller_arn`. CI runs the new test in the existing custody step.

**New SHA-256 values (owner checks before running; supersede the sprint pack's):**

| Script | sha256 |
| --- | --- |
| `control-testing-secrets.sh` | `1989bca366a5b748ad32d9448d3c2e69839997c2a3fe1d0b850c0652b1d59f95` |
| `docs-testing-secrets.sh` | `22dc6ecfb778b25adc1538163b2d42995b23c9c18c74536b782b5b7a155d9bf1` |
| `work-testing-secrets.sh` | `183e5723e80cde3949496cf05bb58883b3542fc8713c2becdc99600805723a02` |

Tests: 64 passed + 27 sub-tests (`python3 -m pytest -q scripts/aws/owner/test`, local 21 Nov
~16:22 UTC); before the change 61 passed. `shellcheck` is not installed locally; CI runs it.

## 3. Owner instructions (pack items 3 and 5), as `MunaxaEngineering`

Portal → `229251310592` → **MunaxaEngineering** → Management console → Region Frankfurt →
CloudShell. (Before Identity Center exists, root is still the approved interim method and the
scripts accept it.)

```bash
for s in control-testing-secrets.sh docs-testing-secrets.sh; do
  curl -fsSLo "$s" "https://raw.githubusercontent.com/munaxa/munaxa-platform/main/scripts/aws/owner/$s"; done
sha256sum control-testing-secrets.sh docs-testing-secrets.sh     # must equal the table above
/bin/bash -p ./control-testing-secrets.sh bundles                 # type FILL
/bin/bash -p ./control-testing-secrets.sh status
/bin/bash -p ./docs-testing-secrets.sh bundles                    # type FILL; press Enter at the Resend prompt (placeholder)
/bin/bash -p ./docs-testing-secrets.sh status
```

| Expected | Send Claude |
| --- | --- |
| Control: `BUNDLES VERIFIED`, two `version_id` lines (control-migrate, control-api) | the two `version_id` lines |
| Docs: three version ids (docs-operator, docs-migrate, docs-api); `status` shows `mail_key        placeholder` and `control_token   placeholder` | the three ids and the two marker lines |
| Any `ABORT` | the ABORT lines only |

Rollback: the bundles are only read when a session runs. To restart a bundle, the script header
lists the exact delete-version procedure (root). Nothing is ever deleted by the scripts except the
Docs one-run provision secret.

## 4. Docs values the owner provides, and where

| Value | When | Where entered | Never |
| --- | --- | --- | --- |
| Resend key | Not now (placeholder, R-2). Later: `docs-testing-secrets.sh replace-key MAIL_RESEND_API_KEY` after `notify.munaxa.com` is verified in Resend; key with **sending access only** | CloudShell hidden prompt | chat, GitHub, files |
| Control deployment credential (`mxc_…`) | Session 2 step 11, after Control issues it | `docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN`, hidden prompt | chat |
| First Docs administrator e-mail, name, password | Session 2 step 12d | `docs-testing-secrets.sh provision-create` (password hidden, typed twice); deleted by `provision-delete` after the task | chat, GitHub |
| Everything else (database passwords, JWT, Redis, metrics, tenant catalogue) | generated inside the script | none | |
