# 05. Independent security review

Two independent reviewers looked at the script, the owner instructions, the tests and the P-5 plan. Each worked from the files and Identity's source, not from this report's conclusions. Neither ran anything against AWS. Round 2 was a fresh reviewer who had not seen round 1. After the round 2 fixes, the round 2 reviewer checked them (§3).

Scope requested by the owner:

- secret leakage;
- key-generation correctness;
- accidental replacement;
- wrong account or region;
- races;
- unsafe retries;
- version staging;
- IAM over-permission;
- shell history and process-list exposure;
- recovery and rollback.

## 1. Round 1

**Verdict:** "Approve after fixing M1." No Critical or High findings. Every requirement in 02 §2 passed, with line references.

| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| M1 | Medium | Download from mutable `main`; the fingerprint was compared by eye (first and last 8 characters); no fallback if the download fails | **Fixed.** `sha256sum -c` compares all 64 characters and must print `OK`. The fingerprint is repeated in Claude's thread message as a second channel, with a link pinned to the merged commit. The repository is public (checked: `raw.githubusercontent.com` returns 200). There is an upload fallback through CloudShell's **Actions**, then **Upload file**, with the same check |
| L1 | Low | `python3` and `bash` from `PATH`; a tampered persistent home could run other code | **Fixed** (strengthened in round 2): `/bin/bash -p ./…`, `exec /usr/bin/python3 -I -W ignore -` |
| L2 | Low | An unexpected key name would be printed | **Fixed.** Only `missing=<expected names>` and `extra_count=<n>` are printed |
| L3 | Low | `cd "$HOME"` | **Fixed.** `cd /` |
| L4 | Low | `ensure_ascii=False` could fail after the write phase began | **Fixed.** `ensure_ascii=True` |
| L5 | Low | Unlabelled versions are hidden from `DescribeSecret`; the preflight is stale after the prompt | **Fixed.** `ListSecretVersionIds(IncludeDeprecated=True)` must list only `ad02f18e`, and the labels are re-checked right before the write. Offline cases 1d and 1e |
| L6 | Low | The preflight table in 03 did not check `caller` and `kms_key` | **Fixed.** Both rows added |
| L7 | Low | The test removed `-I` and the real terminal | **Fixed.** Case 20 keeps `-I -W ignore` and types `CREATE` on a real pseudo-terminal |
| I1 | Info | `del` does not wipe memory | `ulimit -c 0` added. Not wiping memory is **accepted**: Python strings are immutable and the process lives for seconds inside the owner's CloudShell |
| I2 | Info | The re-run and "do not run again" rows read as contradictory | **Fixed.** A separate section covers re-running after a lost window, and any `ABORT` line means no re-run |
| I3 | Info | `ad02f18e` keeps only `AWSPREVIOUS`; a later write would remove its label | **Accepted, documented** (01 §6; previous report 04 §3 step 5: no further write until stage D) |

## 2. Round 2

**Verdict:** "Approve with changes." No Critical or High findings. The reviewer re-ran the offline test on a copy.

| Id | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| R2-1 | Low-Medium | The launch was not as isolated as 03 claimed. A tampered `~/.bashrc` could still act through an `env` function, exported functions overriding builtins, `SHELLOPTS`/`PS4`, `LD_PRELOAD`, or `~/.aws/config` with an attacker CA or proxy | **Fixed.** `/bin/bash -p` (privileged mode ignores `BASH_ENV`, `ENV`, imported functions, `SHELLOPTS`, `BASHOPTS`) with a path, so no alias or function applies. The script unsets static keys, preload, OpenSSL, CA-bundle and proxy variables, sets `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` to `/dev/null` and `PATH=/usr/bin:/bin`, and uses explicit regional endpoints. The 03 wording is corrected, with an optional **Actions**, then **Delete home directory** step |
| R2-2 | Low | A re-run after a lost window could overlap a first run that is still alive | **Fixed.** 03 requires `pgrep -af 'python3 -I -W ignore -'` to print nothing before a re-run. The post-write checks would still catch an overlap (`LABELS_UNEXPECTED`) |
| R2-3 | Low | A harmless Python deprecation warning could trigger the "anything else, stop" rule | **Fixed.** `-W ignore` and `warnings.simplefilter("ignore")`; step 4 uses `-W ignore` too |
| R2-4 | Low | The test was not reproducible (build inputs missing), and `run.sh` passed even when a case failed | **Fixed.** `build-identity-config.sh`, `build/id-p5.txt` and a README are shipped. `run.sh` checks each case's exit code and expected line and exits non-zero on any failure or leak. Rebuilt and re-run from a clean copy: **ALL 25 CASES PASS** |
| R2-5 | Info | Stage C cannot be repeated after an undo with this script | **Documented** in 03 and 04: an undo is only meaningful before stage D, and a repeat needs a revised, reviewed script |
| R2-6 | Info | A comment called the token "fixed" | **Fixed.** It now says the token is generated once per run, and the preflight guards re-runs |
| R2-7 | Info | The KMS check compares the full key ARN; a different form would stop the script | **Accepted.** It fails closed before any read, and Stage R saw the full ARN form [S] |
| R2-8 | Info | The P-5 change is minimal and correct; nit: the "supplied by the owner on 10 Nov" comment | **Fixed** in the 04 diff |

## 3. Round 2 fix verification

The round 2 reviewer re-checked the final script and instructions.

- **Verdict: "approve."** All 8 findings are fixed or accepted as above, and no regression was found.
- The reviewer re-ran the offline test from a clean copy, with the documented setup: `rc=0`, "ALL CASES PASS", leak check clean.
- Case 1a: `parseMfaKeys entries=1 keyBytes=32 problems=0`, `loadEnvironment (prod) starts`.
- Before that setup, the same run correctly failed with "2 FAILURE(S)", so missing prerequisites now fail the run.

On whether the environment clearing could break CloudShell's sign-in:

- The `AWS_CONTAINER_*` variables are kept; only static keys, config files, proxies and CA settings are cleared.
- If sign-in or the network still failed, the first call (`sts:GetCallerIdentity`) would stop the script with `NOTHING WRITTEN`, before any value is read.

Two new Info items:

- `pgrep` might be missing in CloudShell. **Fixed:** 03 now says that if the command is not found, choose **Actions**, then **Restart**, before running again.
- An `LD_PRELOAD` already exported by a tampered interactive shell reaches `/bin/bash` before the script can clear it. **Accepted:** 03 says plainly that a deliberately tampered home cannot be fully defended against this way, and offers **Delete home directory**.

## 4. Accepted Low and Informational items, with reasons

| Item | Why it is accepted |
| --- | --- |
| **L-1.** The operation runs as the account root user, not a least-privilege role (01 §7) | Root is the owner's approved development access (ACCESS-POLICY, 8 Nov). Creating a dedicated role means an IAM change, which this task does not allow and the owner has deferred (D-4). The script touches only one ARN, by full name |
| I1. `del` does not wipe memory | immutable Python strings; a seconds-long process in the owner's own CloudShell; core dumps disabled |
| I3. `ad02f18e` is protected only by the `AWSPREVIOUS` label | the rule "no further write to this secret until stage D" holds; PR #121 and stage D move every pin to the new version |
| R2-7. The KMS key ARN form | fails closed before any read |
| CloudShell versions of Python and boto3, and the container credential provider, cannot be checked offline [U] | step 4 checks boto3 under `-I`; any credential or import problem stops the script before any read |
