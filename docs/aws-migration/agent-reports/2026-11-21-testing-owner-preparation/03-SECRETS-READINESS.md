# 03. Control and Docs secret readiness

**No secret was created, read, updated or deleted. No value was seen by Claude or requested in chat.**

## 1. Scripts re-verified

| Script | SHA-256 (unchanged since platform#155) |
| --- | --- |
| `scripts/aws/owner/control-testing-secrets.sh` | `1989bca366a5b748ad32d9448d3c2e69839997c2a3fe1d0b850c0652b1d59f95` |
| `scripts/aws/owner/docs-testing-secrets.sh` | `22dc6ecfb778b25adc1538163b2d42995b23c9c18c74536b782b5b7a155d9bf1` |
| `scripts/aws/owner/work-testing-secrets.sh` (not in this deployment) | `183e5723e80cde3949496cf05bb58883b3542fc8713c2becdc99600805723a02` |

No script file changed in this PR, so the owner instructions keep these hashes.

| Requirement | Result | Evidence |
| --- | --- | --- |
| Values never in output, argv, environment, logs, reports | Met: values reach the AWS CLI only on stdin (memfd); core dumps off; the fake CLI fails a test if a value appears in argv or environment; `assertClean` on every output | test suites |
| Hidden prompts | `getpass.getpass` for every sensitive input (control line 317, docs line 414) | grep |
| `status` is metadata only | Control/Work: no `GetSecretValue`; Docs: reads only the catalogue tenant id in-process, prints id and placeholder/real markers | `test_status_reads_no_value` |
| Resumable and idempotent; never overwrites | `bundles` writes only empty bundles; one version is read back and checked; `many` stops; `replace-key` makes one new version (old = AWSPREVIOUS) | `test_partial_fill_resumes` |
| Caller | root or `AWSReservedSSO_MunaxaEngineering_<16 hex>/<name>` only, before any secret call; session name never printed | `test_caller_identity.py` (7 refused callers) |
| Account and Region | `WRONG_ACCOUNT`; Region and endpoints fixed to `eu-central-1` | `test_wrong_account_stops_before_any_secret_call` |
| KMS key and ARN prefix | every secret: name, `arn:aws:secretsmanager:eu-central-1:229251310592:secret:<name>-` prefix, `KmsKeyId` = nonprod data key, no replication | `describe()` (control 237-245, docs 334-342) |
| Errors | `ABORT <CODE>` with at most an AWS error code | test suites |
| Docs one-run provision secret | `provision-create` (typed CREATE, hidden password twice), tagged, deleted by `provision-delete` with no recovery window | docs tests |

Tests: `python3 -m pytest -q scripts/aws/owner/test` → **64 passed, 27 sub-tests passed**
(local, 21 Nov 19:08 UTC; the new Docs bootstrap tests are run separately, file 02).

## 2. Owner instructions (as MunaxaEngineering after file 01, or root before it)

Portal → `229251310592` → **MunaxaEngineering** → Management console → Region **Frankfurt** → CloudShell:

```bash
for s in control-testing-secrets.sh docs-testing-secrets.sh; do
  curl -fsSLo "$s" "https://raw.githubusercontent.com/munaxa/munaxa-platform/main/scripts/aws/owner/$s"; done
sha256sum control-testing-secrets.sh docs-testing-secrets.sh   # must equal the table above
/bin/bash -p ./control-testing-secrets.sh bundles    # type FILL
/bin/bash -p ./control-testing-secrets.sh status
/bin/bash -p ./docs-testing-secrets.sh bundles       # type FILL; press Enter at the Resend prompt = placeholder
/bin/bash -p ./docs-testing-secrets.sh status
```

| Bundle set | Expected | Send Claude (version ids are metadata, not secrets) |
| --- | --- | --- |
| Control | `BUNDLES VERIFIED`; `version_id` lines for `control-migrate` and `control-api` | the two `version_id` lines |
| Docs | three `version_id` lines (`docs-operator`, `docs-migrate`, `docs-api`); `status`: `mail_key        placeholder`, `control_token   placeholder` | the three ids and the two marker lines |
| Any problem | an `ABORT …` line | only the ABORT line |

The version ids go into Apply 2 (`secret_version_ids`, file 06).

**Placeholder Resend configuration (first Testing deployment):** pressing Enter stores a marked
placeholder; Docs starts and mail dead-letters after retries. Later, once `notify.munaxa.com` is
verified in Resend: `/bin/bash -p ./docs-testing-secrets.sh replace-key MAIL_RESEND_API_KEY` (type
REPLACE, paste a **sending-access-only** key at the hidden prompt), send Claude the new `docs-api`
`version_id`; Claude pins it in a PR (one docs-api task-definition replacement).

**Later replacement of the Docs Control credential:** during the Control session (file 06 Stage 5)
the owner issues the Docs deployment credential (`mxc_…`) in the Control portal, then runs
`/bin/bash -p ./docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN` (type REPLACE, paste at the
hidden prompt) → `status` shows `control_token   mxc`; send Claude the new `docs-api` `version_id`.
Offline plan of that pin: **2 task-definition replacements** (`module.docs_api` and
`aws_ecs_task_definition.docs_provision`, which both read docs-api), 0 create, 0 destroy (file 06).
To rotate later: revoke in the Control portal, issue a new one, repeat `replace-key`.

Rollback: bundles are only read when a session runs. To restart a bundle, the script header lists the
exact delete-version procedure (root). The scripts delete nothing except the Docs one-run provision secret.
