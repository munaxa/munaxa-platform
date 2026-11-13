# 01. Preflight and execution

## 1. Route M-3 (AWS connector): stopped at the safety gate, about 18:15 UTC

The owner authorized M-3 at 18:09 with a mandatory gate: stop if plaintext could reach the model, and do not replace the reviewed logic with an improvised one.

- One `sts:GetCallerIdentity` probe confirmed account `229251310592`.
- The connector's `run_script` sandbox rejects the imports `secrets`, `os`, `base64`, `binascii`, `hashlib`, `codecs` and `contextlib`. The reviewed script needs the operating-system CSPRNG (`secrets.token_bytes(32)`) and `base64`.
- Running stage C there would have needed a different random source and a hand-written encoder, which the instruction forbids. M-3 was therefore not used. No secret call was made through the connector.

## 2. Route M-1 revision 1: stopped by the owner at step 4

`/usr/bin/python3 -I` in CloudShell has no boto3. Nothing was run. The owner asked for an investigation (18:21).

## 3. Route M-1 revision 2: approved and run

- Revision 2 (AWS CLI instead of boto3) was reviewed independently and merged in PR #125 (`d4864b4`). The owner approved the procedure at 19:29 UTC.
- The owner ran it in CloudShell, eu-central-1, signed in as root with MFA [O].

## 4. Timeline (UTC, 13 Nov 2026, from CloudTrail [V])

| Time | Event | Meaning |
| --- | --- | --- |
| 19:34:29 | CloudShell `StartEnvironment` | fresh environment after the clean-home step |
| 19:37:06–07 | `DescribeSecret`, `ListSecretVersionIds` | a first run that stopped at the preflight or the prompt; nothing written |
| 19:39:58–59 | `DescribeSecret`, `ListSecretVersionIds` (include deprecated) | preflight of the run that wrote |
| 19:40:14 | `GetSecretValue` of `ad02f18e` (`AWSCURRENT`) | the read in the read-merge-write |
| 19:40:15 | `DescribeSecret` | label re-check before the write |
| 19:40:16 | `PutSecretValue`, client request token `80914756…` | the single write |
| 19:40:16 | `DescribeSecret` | label check after the write |
| 19:40:17 | `GetSecretValue` of `80914756` (`AWSCURRENT`) | the script's read-back verification |
| 19:41:12 | `ListSecretVersionIds` | the owner's step 6 metadata check |
| 19:44 | owner message in the thread | `new_version_id 80914756-68cd-420d-8094-0fd49afe3492`, `kid mfa-nonprod-2026-11` |

The script reported `CREATED VERIFIED` [O], which means it checked that the new version holds the five earlier values unchanged plus the key ring, and the labels. Claude cannot see the values and did not try to [U]; the labels and the single write are confirmed independently in 02 and 03.
