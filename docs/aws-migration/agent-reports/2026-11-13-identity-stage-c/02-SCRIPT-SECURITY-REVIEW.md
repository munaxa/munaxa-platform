# 02. The stage C script: requirements, changes and offline tests

Script: [`supporting/stage-c-add-mfa-key.sh`](supporting/stage-c-add-mfa-key.sh). Its SHA-256 is given in 03, step 3, and in 00. **It was not run against AWS.** It was run only offline, against a fake boto3 holding fake values.

## 1. What changed from the 13 Nov draft

The draft was `2026-11-13-identity-testing-stage-r-p5/supporting/stage-c-add-mfa-key.DRAFT.sh`. It is rewritten here.

| Change | Why |
| --- | --- |
| Run as a file with `/bin/bash -p ./stage-c-add-mfa-key.sh`; refuses to be `source`d; `exec /usr/bin/python3 -I -W ignore -` | Pasting a long block into a terminal is error-prone, and pasted text can enter history. Privileged mode and full paths stop aliases, functions, imported functions, `BASH_ENV` and `SHELLOPTS` from the persistent CloudShell home from changing what runs (round 2 finding 1). `-I` ignores every `PYTHON*` variable, user site-packages and the current directory |
| `set +x`, `umask 077`, `ulimit -c 0`, `cd /`, `PATH=/usr/bin:/bin`; unset `PYTHON*`, `AWS_PROFILE`, `AWS_ENDPOINT_URL*`, static `AWS_*` keys, `AWS_CA_BUNDLE`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `OPENSSL_CONF`, `SSL_CERT_*`, `*_CA_BUNDLE`, every proxy variable; `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` set to `/dev/null`; explicit regional HTTPS endpoints | no tracing, no core file, no redirected endpoint, proxy, TLS trust store or credential source: only CloudShell's own container credentials [E: CloudShell provides them through the container credential provider; without them the script stops with `NoCredentialsError` before any read] |
| `logging.disable`; `warnings` ignored (`-W ignore` and `simplefilter`); a quiet `excepthook` that prints only the exception type and AWS error code; phase-aware `ABORT` | no traceback, no message text, and on any error the owner knows whether a write could have happened |
| The secret is addressed by its **full ARN** (`…identity-sn5umm`); the name, KMS key, deletion, rotation and replication are checked | the right secret, not a look-alike |
| **Exact version state**: `VersionIdsToStages == {ad02f18e: [AWSCURRENT]}`, and `ListSecretVersionIds(IncludeDeprecated=True)` lists only `ad02f18e` | fails closed on any unexpected version, including unlabelled ones |
| A **CREATE** confirmation on the real terminal after the metadata preflight, before any value is read | the owner checks the preflight lines first (03, 5a) |
| Strict JSON: no duplicate keys, a JSON object, exactly the five expected names, all non-empty strings | nothing unexpected is carried forward silently |
| The key checks mirror Identity's `parseMfaKeys` and `reusesSecret` exactly, and a final `ring_ok` self-check | the ring Identity refuses can never be written |
| `ensure_ascii=True`; a merge self-check (the five values equal, in order) | values preserved; no encoding error after the write began |
| **Labels re-checked right before the write** | the preflight can be minutes old |
| `ClientRequestToken` = a new UUID; the response must equal it and be `AWSCURRENT` | an SDK retry is idempotent; the response is checked |
| After the write: labels exactly `{new: AWSCURRENT, ad02f18e: AWSPREVIOUS}`; the new version **read back and compared** in-process | proves both the content and the staging |
| **Re-run path**: if stage C is already done, it writes nothing, re-reads both versions in-process, checks five equal values plus a valid ring, and prints the id | safe recovery from a lost window |
| Output only ids, ARNs, the kid, key names, and counts of unexpected names (no unexpected name is printed) | nothing value-bearing on screen |

## 2. Requirements (from the task) against the script

| Requirement | Where | Result |
| --- | --- | --- |
| Caller account and region confirmed before any change | `:169-175` | PASS |
| Exact secret name | `:178-180` (ARN and name) | PASS |
| Current version equals the baseline, else stop | `:193-217`, re-checked at `:261` | PASS |
| Existing secret read only inside the owner's CloudShell process | `:136-158`, called at `:233` after CREATE | PASS |
| Every existing field and value preserved | `:237-240`, `:253-256`, read-back `:276-279` | PASS |
| Only the MFA field added, nothing else modified | `:249`, exact name set `:237` | PASS |
| Cryptographically secure randomness | `secrets.token_bytes(32)` `:243` | PASS |
| Exact key format and size for Identity | `:244-252` with `identity_decode`, `reuses`, `ring_ok` (`:88-125`); offline 1a: Identity 2db6ed9's loader **starts** | PASS |
| Correct primary kid | `KID = "mfa-nonprod-2026-11"` `:52`, equal to PR #121's `mfa_primary_kid` | PASS |
| New version written without exposing material | value only in the HTTPS request body `:266`; not in CloudTrail [D] | PASS |
| Never print secret JSON, raw key or base64 key | all `say` lines are constants, ids or names; offline leak check over every case: 0 | PASS |
| No tracing, debug output, history, temp plaintext, env-var exposure | `:33-41`, `:44`; the key is never an argument or a variable of the shell | PASS |
| Result verified through metadata | `:272-274` | PASS |
| New `AWSCURRENT`, previous `AWSPREVIOUS` | `:274` exact equality | PASS |
| Previous version never deleted or overwritten | no delete or label call exists; versions are immutable | PASS |
| Fails closed on unexpected structure, version id, account, region or AWS response | every check calls `stop`; offline cases 2 to 18 | PASS |

## 3. Offline test (`supporting/offline-test-output.txt`)

How it ran:

- `supporting/offline-test/run.sh` runs the real script against a fake boto3 that holds fake values. Every fake value contains the marker `FAKESECRET`.
- Cases 1 to 19 make two substitutions, which the output shows: the interpreter line, so the stub can be imported, and `/dev/tty`, replaced by a file holding the typed answer.
- Case 20 keeps `-I` and a **real pseudo-terminal**: the stub is installed in a virtualenv's site-packages, and `CREATE` is typed on the terminal.
- After every case, the output is searched for the fake markers and for the generated key: **0 hits in all cases**.
- Each case must show its expected exit code and line. `run.sh` exits non-zero on any failure or leak. Result: **ALL 25 CASES PASS** (`== RESULT` line).
- Reproduced from a clean copy of `supporting/offline-test/` (README there), with the Identity loader rebuilt from 2db6ed9 by `build-identity-config.sh`: same result.

| # | Case | Result |
| --- | --- | --- |
| 1 | normal run | `CREATED VERIFIED`, exit 0 |
| 1a | the written bundle in Identity 2db6ed9's own `loadEnvironment`, with the P-5 task environment (`NODE_ENV=production`, `MFA_POLICY=off`, primary kid `mfa-nonprod-2026-11`) | **starts**; `parseMfaKeys`: 1 entry, 32 bytes, 0 problems; no reuse |
| 1b | run again on the result | `ALREADY DONE VERIFIED`, nothing written, same id |
| 1c | already done, but the existing version's ring is wrong | `ABORT EXISTING_VERSION_NOT_AS_EXPECTED` |
| 1d | a version without a label exists | `ABORT UNEXPECTED_VERSIONS listed=2`, nothing read |
| 1e | labels move while the operator sits at the prompt | `ABORT LABELS_CHANGED_SINCE_PREFLIGHT`, nothing written |
| 2-6 | wrong account; ARN mismatch; wrong KMS key; rotation on; extra `AWSPENDING` | each aborts in preflight, `NOTHING WRITTEN` |
| 7 | typed `yes` instead of `CREATE` | `ABORT NOT_CONFIRMED`, nothing read |
| 8-12 | ring already present; extra key (`extra_count=1`, no name printed); duplicate JSON key; empty value; binary secret | each aborts before the write |
| 13 | `GetSecretValue` denied | `ABORT EXCEPTION ClientError AccessDeniedException`, `NOTHING WRITTEN` (the stub's error message, which contains a marker, is not printed) |
| 14-15 | forced key collision with the pepper; forced repeated-byte key | `KEY_COLLIDES_WITH_ANOTHER_SECRET`; `KEY_SELF_CHECK_FAILED` |
| 16-18 | a concurrent writer after our write; read-back differs; AWS error after the write | `ABORT …` plus `AFTER_WRITE_ATTEMPT` |
| 19 | the script `source`d | `ABORT SOURCED`; the outer shell keeps running |
| 20 | `-I` kept, real terminal | `CREATED VERIFIED`, typed on the terminal, no leak |

Also checked: the real `botocore` 1.44 accepts every request shape the script sends, using `Stubber` with no network. That covers `GetSecretValue` with both `VersionId` and `VersionStage`, and `PutSecretValue` with `ClientRequestToken`.

**Not verifiable without AWS [U]:**

- CloudShell's exact Python and boto3 versions. The script uses only Python 3.6+ syntax, and step 4 of 03 checks boto3 with `-I` first.
- The real service responses. The fields the script reads are taken from the API reference [D] and from the Stage R `DescribeSecret` output [S].
