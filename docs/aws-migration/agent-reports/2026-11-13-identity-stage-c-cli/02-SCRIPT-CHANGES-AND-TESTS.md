# 02. Revision 2 of the script: changes and offline tests

- **Script:** [`supporting/stage-c-add-mfa-key-cli.sh`](supporting/stage-c-add-mfa-key-cli.sh). Its SHA-256 is in 00 and in 03, step 4.
- **Not run against AWS.** It was run only offline: the real AWS CLI v2 talked to a local fake AWS endpoint holding fake values.
- **Revision 1:** `2026-11-13-identity-stage-c/supporting/stage-c-add-mfa-key.sh` is unchanged and must no longer be used.

## 1. Changes from revision 1

All revision 1 checks are kept line for line (01, "Option D").

| Change | Why |
| --- | --- |
| Every AWS call is `aws <service> <operation> --cli-input-json file:///dev/stdin --output json --region eu-central-1 --endpoint-url https://<service>.eu-central-1.amazonaws.com --no-cli-pager --no-cli-auto-prompt --cli-connect-timeout 10 --cli-read-timeout 30` | Uses CloudShell's preinstalled AWS CLI v2 instead of boto3. No value is ever a command-line argument. Bounded timeouts: 3 attempts × 40 s fits well inside the 300 s per-call limit (review F4) |
| The request goes to the CLI as standard input in a **memfd**, an anonymous in-memory file with no path, closed after each call. The response comes back on a pipe | The CLI opens `/dev/stdin` twice, so a pipe would arrive empty (01). A memfd never touches the disk. If Python was built without `os.memfd_create`, the same libc call is made through `ctypes`, and this is checked once before any AWS call |
| The CLI runs with an **allowlisted environment** only: `PATH`, a fresh empty `HOME` (mode 0700, removed at the end), `C.UTF-8`, `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` set to `/dev/null`, the region, no pager, no auto-prompt, standard retry mode with 3 attempts, IMDS disabled, and CloudShell's `AWS_CONTAINER_*` credential variables | No profile, alias, plugin, CLI history, cache, proxy, CA bundle, endpoint override, `AWS_DATA_PATH` or other credential source can apply |
| Python itself starts through `/usr/bin/env -i` with only `PATH`, `C.UTF-8` and the `AWS_CONTAINER_*` variables | Drops `LD_AUDIT`, `GCONV_PATH`, `MALLOC_*` and anything else the shell exported (review F2) |
| Tooling checks before any AWS call | **CLI location:** `/usr/local/bin/aws` must resolve into `/usr/local/aws-cli/v2/`, or be `/usr/bin/aws`, and never anything under `/home/`. **Ownership:** the link, the binary, every parent directory and every file of that CLI version must be root-owned and not group- or world-writable (review F3). **Version:** `aws --version` must be `aws-cli/2.x.y`. **Credentials:** the container credential variables must be present. Each failure stops with `NOTHING WRITTEN` |
| `prctl(PR_SET_DUMPABLE, 0)`, best effort | No core dump of the Python process, and no ptrace or `/proc/<pid>/mem` read by other processes of the same user (review F5) |
| Errors: `ABORT AWS_ERROR <operation> <code>`. The code is taken from the CLI's standard error by a strict pattern; the error message is never printed | The message could quote a request |
| `WRONG_REGION` (boto3 `meta.region_name`) removed | Replaced by the explicit `--region`, the fixed regional endpoint and the region inside the pinned ARN |

## 2. Offline test (`supporting/offline-test-output.txt`)

**How it runs** (`supporting/offline-test/run.sh`, README there):

- The real script calls the **real AWS CLI v2.40.2**, installed in CloudShell's layout from the AWS package with a verified signature.
- The CLI talks over HTTP to `fake-aws-server.py`. That server emulates three things: the container credential provider (it checks the authorization token), STS `GetCallerIdentity` and the four Secrets Manager operations. It reuses the revision 1 fake (`stub/boto3.py`), so all revision 1 scenarios behave as before.
- Every fake value contains the marker `FAKESECRET`.
- The test makes three test-only substitutions, which the output shows: the Python launch lines (a fake `secrets` module for the forced collide and degenerate cases, and no `-I`), `/dev/tty`, and the two endpoints.
- Case 20 keeps `-I` and a real pseudo-terminal.

**Checked after every case:**

- the exit code and the expected line;
- no marker and no generated key anywhere in the output;
- no marker and no key in the arguments or environment of any process. The fake server scans `/proc` on every request; case 27 is a control that proves the scan detects a marker;
- the CLI's temporary home is gone;
- the persistent home is unchanged;
- for runs that write: exactly one `PutSecretValue`, with a UUID v4 token, exactly the parameters `ClientRequestToken`, `SecretId` and `SecretString` (no `VersionStages`), and only the pinned secret ARN.

**Result: ALL CASES PASS**, on Python 3.13 and again on CPython 3.9.25 (`supporting/offline-test-output-py39.txt`). Python 3.9 is the likely CloudShell system Python [E]. The 3.9 build used has no `os.memfd_create`, so that run also exercises the `ctypes` fallback.

| # | Case | Result |
| --- | --- | --- |
| 1 | normal run | `CREATED VERIFIED`; request shape as required |
| 1a | the written bundle in Identity 2db6ed9's own `loadEnvironment`, with the P-5 environment | starts; 1 entry, 32 bytes, 0 problems |
| 1b | run again on the result | `ALREADY DONE VERIFIED`; still exactly one `PutSecretValue` |
| 1c–1e | existing version wrong; an unlabelled version; labels move during the prompt | each aborts, nothing written |
| 2–6 | wrong account; ARN mismatch; wrong KMS key; rotation on; extra `AWSPENDING` | each aborts in preflight |
| 7–12 | not confirmed; ring present; extra key; duplicate key; empty value; binary secret | each aborts before the write |
| 13 | `GetSecretValue` denied, with a marker in the AWS error message | `ABORT AWS_ERROR get-secret-value AccessDeniedException`; the message is not shown |
| 14–15 | forced key collision; forced repeated-byte key | abort before the write |
| 16–18 | a concurrent writer; read-back differs; AWS error after the write | `ABORT …` plus `AFTER_WRITE_ATTEMPT` |
| 19 | the script `source`d | refused |
| 20 | `-I` kept, real terminal, real CLI | `CREATED VERIFIED`, `isolated=True` |
| 21 | no AWS CLI | `ABORT AWS_CLI_MISSING`, no AWS call |
| 22a–c | a CLI outside the allowed places; not root-owned; writable by others | `UNEXPECTED_LOCATION` / `NOT_ROOT_OWNED`, no AWS call |
| 23 | AWS CLI version 1 | `ABORT AWS_CLI_NOT_VERSION_2`, no AWS call |
| 24 | no container credentials | `ABORT CLOUDSHELL_CREDENTIALS_MISSING`, no AWS call |
| 25 | hostile home and environment: `~/.aws/config` with `cli_history`, endpoint and `credential_process`; `~/.aws/credentials`; a CLI alias file; static keys; web identity; endpoint, CA bundle, proxies, `AWS_DATA_PATH`, `GCONV_PATH`, `MALLOC_CHECK_`, `PYTHONSTARTUP`, `PYTHONHOME`, `TMPDIR` | `CREATED VERIFIED` through the fake endpoint only; no CLI history database anywhere; hostile `TMPDIR` unused |
| 26 | process scans across all cases | 121 scans, none with a hit |
| 27 | control: a marker placed in another process's arguments | detected |
| 28 | environment variable names of the script's Python and of every AWS CLI process | inside the allowlists. The CLI's own PyInstaller launcher adds `LD_LIBRARY_PATH` (its own `dist` folder) and `_PYI_*` for its child, and the test checks that value |

**Not verifiable offline [U]:**

- the real HTTPS endpoints and CloudShell's real credential endpoint;
- the exact CloudShell CLI path and version, and its Python version. The script checks all of these and stops before any AWS call if one differs;
- a deliberately tampered CloudShell environment (a shell function shadowing `/bin/bash`, or a sudo-modified CLI). The required clean-home step in 03 handles this (04, F1).
