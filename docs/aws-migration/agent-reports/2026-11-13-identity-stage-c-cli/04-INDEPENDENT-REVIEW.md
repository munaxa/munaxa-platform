# 04. Independent security review of revision 2

An independent reviewer, who had not worked on the script, reviewed the files and Identity 2db6ed9's source, not this report. The reviewer made no AWS call. Experiments ran on copies, including a full harness run under CPython 3.9.

Scope:

- leakage through output, argv, `/proc` environ, memfd, CLI history, cache or logs, temporary directories, core dumps and error text;
- key correctness against Identity's rules;
- a second version or a replacement;
- wrong account, region or secret;
- races and retries;
- staging;
- trust in the CLI binary;
- the CLI environment;
- timeouts during the write;
- Python 3.9 compatibility;
- whether the tests prove what they claim;
- whether anything is weaker than in revision 1.

## Round 1: "approve with changes"

Verified by the reviewer:

- the key format and the Identity rules. `IDENTITY_SIGNING_SECRET` is the variable the loader checks;
- the CLI receives only the allowlist;
- no value reaches argv or the environment, and only the error code is printed;
- the full suite passes under 3.9;
- retries resend the same token and body, which is idempotent, and send no `VersionStages`;
- a timeout or Ctrl-C during the write ends in `AFTER_WRITE_ATTEMPT`, and a re-run then takes the read-only "already done" path.

| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| F1 | High (an environment precondition, as in revision 1) | A tampered `~/.bashrc` can define a shell function named `/bin/bash` that shadows `/bin/bash -p ./script`. The reviewer demonstrated it. With sudo, it can also replace the CLI or Python, and the binary checks still pass | **Fixed in the procedure.** Step 2 of 03 is now required: **Actions → Delete** the CloudShell home directory, then **Open a tab**, before the download, the `sha256sum -c` check and the run. The wording follows the AWS CloudShell user guide [D]. The binary checks are described as protection against misconfiguration, not against tampering |
| F2 | Low | Python inherited the shell environment minus a denylist that missed `LD_AUDIT`, `GCONV_PATH`, `MALLOC_*` | **Fixed.** `exec /usr/bin/env -i` with `PATH`, `C.UTF-8` and the `AWS_CONTAINER_*` variables only. Case 28 checks the names |
| F3 | Low | Only the link and the binary were checked, not the CLI's files and parent directories | **Fixed.** Every parent directory and every file of the installed CLI version must be root-owned and not group- or world-writable |
| F4 | Low | The CLI's default 60 s connect and 60 s read, times 3 attempts, could exceed the 300 s limit | **Fixed.** `--cli-connect-timeout 10 --cli-read-timeout 30` |
| F5 | Info | Values now cross into a second process (memfd and pipe), readable by the same user only | `prctl(PR_SET_DUMPABLE, 0)` added for the Python process. The CLI child is **accepted** as residual |
| F6 | Info | `MFA_ENCRYPTION_PRIMARY_KID` comes from the task definition, not the secret | already set in P-5 (`2026-11-13-identity-stage-c/04` §1) |
| F7 | Info | Python's `b64decode` rejects lengths that are 1 mod 4, which Node accepts; this only affects the reuse comparison | no effect on a random key; accepted |
| Harness | — | Hostile CA and proxy settings would pass vacuously over HTTP; a non-existent `AWS_CLI_HISTORY` variable was used; case 26 counted only the last case; there was no 3.9 run | **Fixed.** The fake variable is replaced by real ones (`AWS_DATA_PATH`, `GCONV_PATH`, `MALLOC_CHECK_`, `PYTHONSTARTUP`, `PYTHONHOME`). Case 28 checks the environment names directly, case 26 totals all scans, and the suite runs on 3.9 too. Real HTTPS remains [U] |

## Round 2 (fix verification): "approve"

The reviewer re-checked every fix:

- the `${VAR:+VAR="$VAR"}` pattern keeps hostile values byte for byte under `set -euo pipefail`;
- the tree walk covers 8,751 entries, all root-owned;
- the timeouts are bounded;
- `prctl` does not affect `/dev/tty` or the CLI child;
- the memfd fallback is exercised under 3.9;
- the clean-home step closes F1.

| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| R1 | Low | `os.walk` silently skipped unreadable directories, so that check failed open | **Fixed.** `onerror` stops with `AWS_CLI_NOT_ROOT_OWNED`. Both suites were re-run and pass |
| R2 | Low | If CloudShell's own permissions differ, the script stops at `AWS_CLI_NOT_ROOT_OWNED`. That is fail-safe | **Covered.** The 03 table says this can happen, and to paste the line, not retry and not change anything |
| R3 | Info | `C.UTF-8` and `os.memfd_create` on AL2023 Python 3.9 cannot be checked offline | both fail closed before any AWS call; the ctypes fallback covers a Python built without `os.memfd_create` |
| R4 | Info | The menu wording could not be checked from the reviewer's side | checked against the AWS CloudShell user guide ("Getting started", step 8) [D]. 03 adds a stop rule if the menus look different |
| R5 | Info | Case 28 can read the non-dumpable process's environment only because the fake server runs as root | noted in the test README |

## Accepted items

| Item | Why |
| --- | --- |
| The CLI child process holds the request in its memfd and the response in a pipe (F5) | the same user, the same machine, for seconds; the clean-home step removes persistent code that could read it |
| L-1: root, not least privilege (carried from revision 1) | the owner's 8 Nov access policy; a single ARN |
| Real HTTPS, CloudShell's credential endpoint and the CLI build cannot be checked offline [U] | every tool check comes before any AWS call; any difference fails closed |
