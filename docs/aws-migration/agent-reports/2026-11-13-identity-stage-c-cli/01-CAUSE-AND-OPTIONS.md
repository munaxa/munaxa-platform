# 01. Why step 4 failed, and the options

## What happened [O]

At 18:21 UTC on 13 Nov 2026, the owner ran step 4 of the revision 1 instructions (`2026-11-13-identity-stage-c/03`):

```
/usr/bin/python3 -I -W ignore -c "import boto3; print('boto3', boto3.__version__)"
ModuleNotFoundError: No module named 'boto3'
```

The stop rule was followed. The script was not run, and nothing was read, written or generated.

## Cause

- AWS documents boto3 as preinstalled in CloudShell, and says to check it with `pip3 list | grep boto3` [D: CloudShell user guide, "Compute environment: specifications and software"]. The guide gives no install location.
- The script deliberately runs `/usr/bin/python3 -I`. Isolated mode ignores the user site-packages in the persistent home (`~/.local/...`) and every `PYTHON*` variable. That is how revision 1 stops a tampered home directory from changing the code that handles the key.
- So, in the owner's CloudShell, boto3 is not in the system interpreter's own site-packages. It is either installed per user in the home directory, or it belongs to another interpreter on `PATH`. [E] Both are reasonable readings; the exact location cannot be checked offline [U].
- Either way, using that boto3 would mean dropping `-I` or trusting code from the home directory. The home directory persists between sessions and can be changed by anything that ever ran there. That is the risk round 2 of the revision 1 review (R2-1) asked us to close.

## Options

| Option | Security | Verdict |
| --- | --- | --- |
| A. Owner installs boto3 (`pip install`) | downloads code at run time into the home directory; the owner asked not to | rejected |
| B. Drop `-I` and use whatever boto3 `python3` finds | the key-handling process would load code from the persistent home | rejected: reopens R2-1 |
| C. Point the script at the AWS CLI's bundled Python | the CLI v2 is a frozen PyInstaller build; its botocore is not importable from outside | not possible |
| D. Use the **AWS CLI v2**, which CloudShell preinstalls, for every AWS call; keep all logic in the system Python with `-I` | values reach the CLI only on its standard input (an in-memory file) and come back on a pipe; the CLI runs with a fresh empty home, no config, no credentials file, no history, no pager; the CLI binary must be the root-owned install outside any home directory | **chosen** |
| E. AWS Tools for PowerShell or the Node.js SDK | also preinstalled, but loaded from paths that are harder to pin and to test offline | not needed |

## Option D: what changes and what does not

Unchanged from revision 1 (the reviewed logic, line for line):

- the preflight (account, region, ARN, name, KMS key, deletion, rotation, replication, exact labels, unlabelled versions);
- the CREATE prompt on the real terminal;
- the strict JSON checks and the exact five keys;
- the key: `secrets.token_bytes(32)`, base64url without padding, Identity 2db6ed9's `parseMfaKeys` and `reusesSecret` rules, `ring_ok`;
- the merge self-check, the label re-check before the write, one `PutSecretValue` with a UUID v4 `ClientRequestToken` and no `VersionStages`;
- the read-back and exact final labels, the already-done path, and the output rules.

Changed:

- every AWS call goes through `aws <service> <operation> --cli-input-json file:///dev/stdin` (02 §1);
- new tooling checks run before any AWS call: the CLI's location, owner and version, and that CloudShell's container credentials exist;
- error output is the AWS error code taken from the CLI's standard error, never its message.

The CLI is AWS's own client for the same API. CloudShell runs it with the same container credentials the boto3 path would have used. CloudTrail records the same events, and Secrets Manager never logs `SecretString` [D].

## Facts checked on a real AWS CLI v2

The real AWS CLI v2.40.2 was installed offline, from the official package with a good signature from the AWS CLI Team key `FB5D B77F D5C1 18B8 0511 ADA8 A631 0ACC 4672 475C`, in the same layout as CloudShell (`/usr/local/bin/aws` → `/usr/local/aws-cli/v2/…`). It was run against a local fake AWS endpoint, so no AWS call was made.

- **`--cli-input-json file:///dev/stdin` with a pipe fails.** strace shows the CLI opens `/dev/stdin` twice. The second read of a pipe is empty, giving `ParamValidation … Invalid JSON received` before any request. The first test run caught this. The fix gives the CLI an anonymous in-memory file (`memfd`) as standard input: it has no path, never touches the disk, can be reopened from the start, and is closed after each call.
- With `AWS_CONFIG_FILE=/dev/null` and a fresh `HOME`, the CLI wrote no history database, cache or file anywhere (case 25).
- The CLI never printed or logged a value. An AWS error message containing a marker was not shown, only its code (case 13).
