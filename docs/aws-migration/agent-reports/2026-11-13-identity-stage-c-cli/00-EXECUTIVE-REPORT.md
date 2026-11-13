# 00. Executive report: Identity Testing stage C, revision 2 (AWS CLI instead of boto3)

**Status (13 Nov 2026): REVISED PACKAGE READY FOR OWNER APPROVAL. Stage C has not been run.**

- No AWS call was made for this revision. No secret was read or written, and no key was generated except fake values in local tests.
- Nothing was deployed. PR #121 was not changed or merged.
- The revision 1 script is superseded and must not be used.

Legend: **[V]** verified in source or by a local test, **[D]** AWS documentation, **[E]** expectation, **[U]** not verifiable offline, **[O]** owner action.

## What happened and what changed

- **What happened [O]:** the owner stopped at step 4 of the revision 1 instructions. `/usr/bin/python3 -I` in CloudShell has no boto3. Nothing was run.
- **Cause:** the script deliberately runs the system Python in isolated mode, so that nothing from the persistent home directory can load into the process that handles the key. In CloudShell, boto3 is not visible to that interpreter (01) [D][E].
- **Fix:** revision 2 keeps every revision 1 check and makes each AWS call through the AWS CLI v2 that CloudShell preinstalls (01 option D, 02 §1):
  - values go to the CLI only as standard input, through an anonymous in-memory file, and come back on a pipe;
  - the CLI runs with an allowlisted environment and a fresh empty home, so no profile, history, alias, proxy, CA bundle or other credential source applies;
  - the CLI must be the root-owned v2 install outside any home directory.
- **One new owner step:** delete the CloudShell home directory before downloading the script. This closes a weakness the review demonstrated: a tampered `~/.bashrc` could shadow `/bin/bash` (04, F1).

## Results

| # | Item | Result |
| --- | --- | --- |
| 1 | Script | [`supporting/stage-c-add-mfa-key-cli.sh`](supporting/stage-c-add-mfa-key-cli.sh), **SHA-256 `e857c0447b8dc23b87a0b62b0472f53bac08eaf50f1022d0152e1bcd44508c70`** |
| 2 | Offline test with the **real AWS CLI v2.40.2** against a fake AWS | the 25 revision 1 cases plus 10 new ones for the CLI path all pass, with no marker or key in any output, argument or environment. They pass on Python 3.13 and on 3.9 (02 §2) [V] |
| 3 | Bug found by the real-CLI test and fixed | the CLI opens `/dev/stdin` twice, so a pipe arrives empty. The script now passes a memfd [V] |
| 4 | Identity compatibility | the bundle the script writes still makes Identity 2db6ed9's loader start in production mode (case 1a) [V] |
| 5 | Independent review | round 1: "approve with changes". No Critical finding. F1 (High, an environment precondition) is fixed by the new clean-home step. F2 to F5 (Low or Info) are fixed. Round 2 verified the fixes: "approve". R1 is fixed, R2 and R4 are covered in the instructions, R3 and R5 are noted (04) |
| 6 | Owner instructions | [03](03-OWNER-CLOUDSHELL-INSTRUCTIONS.md): clean home, account check, download with `sha256sum -c`, run, check the preflight lines, type CREATE, send two lines |
| 7 | Stage C content | unchanged: five values kept; `MFA_ENCRYPTION_KEYS = mfa-nonprod-2026-11=<32 CSPRNG bytes, base64url>`; one new version, `AWSCURRENT`; `ad02f18e` becomes `AWSPREVIOUS`; `mfa_policy` stays `off` |
| 8 | PR #121 (P-5) | unchanged. The one-line update in `2026-11-13-identity-stage-c/04` still applies once the owner sends the real version id |

## The owner decision now [O]

Approve the revised procedure. Then run [03](03-OWNER-CLOUDSHELL-INSTRUCTIONS.md) in CloudShell (about 10 minutes) and paste the two lines `new_version_id …` and `kid mfa-nonprod-2026-11` into the Claude thread. Running it is your approval of stage C. Stages D and E each still need a separate approval.

## Remaining risks

| Risk | Handling |
| --- | --- |
| Not yet run against the real service or CloudShell's real CLI and credential endpoint [U] | every tool check runs before any AWS call; any unexpected answer stops it with `NOTHING WRITTEN` or, after the write, `AFTER_WRITE_ATTEMPT` (03 table) |
| CloudShell's exact CLI path, file permissions or Python build differ from the expected ones [U] | the script fails closed: `AWS_CLI_*`, `NO_MEMFD` or `EXCEPTION`. The owner pastes the line; nothing is retried or installed |
| The key now crosses into a second process (the AWS CLI) | same user, never on disk or in arguments; in revision 1 the same bytes went through boto3 in-process. Accepted (04, F5) |
| Root, not least privilege (L-1, carried forward) | accepted under the 8 Nov access policy; one ARN only |
| Carried forward: S-1, S-2, S-3, the $10 budget | unchanged |

## Not performed

No AWS call for this revision. Earlier today, under the owner's separate route M-3 authorization (Claude through the AWS connector), a safety-gate probe made one `sts:GetCallerIdentity` call and stopped: the connector's sandbox blocks `secrets`, `os` and `base64`, so the reviewed logic could not run there. M-3 was not used. The following were also not performed: no `GetSecretValue` or `PutSecretValue`, no key, no Terraform, no IAM, KMS, ECS, database, DNS or production change, no image or package, no GitHub settings change, and no update or merge of PR #121.

## Files

| File | Contents |
| --- | --- |
| 01 | cause and options |
| 02 | script changes and offline tests |
| 03 | owner CloudShell instructions (replace revision 1's 03) |
| 04 | independent review |
| `supporting/` | the script, the offline test and its two outputs (Python 3.13 and 3.9) |
