# BE-8: connector scripts that run in the sandbox

Status: **RESOLVED IN THE REPOSITORY, NOT RUN.** Every script was tested against a fake AWS only.

## 1. The defect

On 13 Nov the AWS connector's `run_script` sandbox refused the reviewed stage C logic because it
imported `secrets`, `os`, `base64` and `hashlib` (report 2026-11-13-identity-stage-c-execution).
The Option A scripts C-8, C-16 and C-24 had the same imports, so they would have failed at the
first Stage E step that needs them.

## 2. The rules, now enforced

`scripts/aws/connector/sandbox_harness.py` reproduces the sandbox and checks each script's source:

- no `import` or `from … import`; only the pre-imported names (`asyncio`, `datetime`, `json`,
  `re`, `time`, `ClientError`, …);
- no dunder names, no `getattr`, `hasattr`, `type`, `eval`, `exec`, `open`, `print`;
- no variable named like a forbidden module (`secrets`, `os`, …);
- exactly one `call_boto3`, inside the shared helper, with literal service and operation names;
- the last statement is the bare expression `result`.

`run_script` then executes the script against a fake `call_boto3`, with an optional fake clock and
a time limit (55 s) like the connector's.

Every connector script starts with the same **shared helper block** (account and region guard,
`code_of` that returns an error code and never a message, a single `aws()` wrapper with retry on
throttling, timeouts as codes). A test proves the block is byte-identical in every script.

## 3. The scripts

| Script | Does | Fails closed on | Idempotent |
| --- | --- | --- | --- |
| C-8 `c8-create-operator-secrets.py` | `GetRandomPassword` and both `CreateSecret` calls (persistent `munaxa-nonprod/identity-operator`, one-run `munaxa-nonprod/identity-bootstrap`), KMS `alias/munaxa-nonprod-data`, tags | unedited or malformed email, wrong account, an existing or pending-deletion name, a trivial password three times, any denial or malformed answer | a fixed `ClientRequestToken`; a timeout after create retries with the same token; a second run is refused |
| C-8R `c8r-recover-operator-secrets.py` | after a bootstrap that created no account: new password, `PutSecretValue` on the persistent secret, recreate the one-run secret | `NO_ACCOUNT_CONFIRMED` not set, bootstrap secret present, persistent secret missing | same token on retry |
| C-8v `c8v-verify-operator-secrets.py` | metadata check of both secrets (KMS key, tags, version count and stages, no rotation, not deleted) | any drift, a bad input, a denial, a malformed answer | read-only |
| C-16 `c16-delete-bootstrap-secret.py` | deletes only the one-run secret, by its ARN, without recovery, then confirms it is gone | name or ARN mismatch, the persistent secret missing, a denial, still present after the time limit | a second run reports `absent` |
| C-24 `c24-custody-cloudtrail-check.py` | CloudTrail since `T_CREATE`: who read or changed either secret | any value read (`GetSecretValue`, `BatchGetSecretValue`), a custody breach, an unparseable event, a malformed lookup, incomplete pagination within the time guard (reports `INCOMPLETE`, never `PASS`) | read-only |

No script names `GetSecretValue` or `BatchGetSecretValue` as an operation (tested). Results carry
names, ARNs, version ids, counts and codes only; fake AWS error messages deliberately echo the request, and
the tests check every result for the email, the password and the planted values (`leaks()`).

The committed `INPUT` lines are placeholders (`<IDENTITY_OPERATOR_EMAIL>`, a sample time); a test
fails if a real-looking value is committed. The operator email is typed only into the session copy.

The two new scripts, E-1 (`e1-task-guard.py`, file 01) and H-20
(`h20-session-cleanup-gate-and-arm.py`, file 02), follow the same rules and share the same helper
block.

## 4. Tests

`scripts/aws/connector/test_connector_scripts.py`, 56 tests:

- source rules (5): every script passes; the shared block is identical; no value-read operation;
  the checker refuses what the sandbox refused on 13 Nov; inputs are placeholders;
- C-8 (18), C-8R (6), C-8v (6), C-16 (11), C-24 (10): success, every abort path, denial,
  throttling, timeouts before and after a write, partial failure with the recovery named,
  malformed answers, unexpected exceptions (a code only), and the planted-value leak check.

Run: `python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'` (all three test
files, 112 tests). CI runs the same in `aws-terraform.yml`.

## 5. Limits

- The harness is a model of the sandbox built from the 13 Nov refusal and the connector's
  documentation; a rule it does not know would show up as a refusal at the first real run, before
  any AWS call (the sandbox checks source before running it).
- [U] The exact boto3 parameter names in the sandbox's botocore version (for example `RunTask`
  `clientToken`, file 01) are not exercised until the first real run.
