# 03. Owner instructions: stage C in AWS CloudShell

**For:** the owner only. **Time:** about 10 minutes. **What it does:** adds one new version to the secret `munaxa-nonprod/identity`. The new version holds the five existing values unchanged, plus a new MFA encryption key that the script generates inside AWS. **What it does not do:** it deploys nothing, starts nothing and changes no other secret. The running Testing configuration keeps using the old version until stage D.

**You are the only one who handles the key.** The key never appears on your screen. Nothing you copy back to Claude is secret.

Run this only when you have decided to do stage C. Once Identity has stored an MFA secret under this key, the key must be kept. In Testing that is acceptable, because the only MFA user will be a throwaway test account.

## Before you start

- Use a desktop browser. Sign in to the AWS console as you normally do: account `229251310592`, root, with MFA.
- You do not need a laptop terminal, the AWS CLI on your PC, or any file on your PC.
- Keep the Claude thread open. If anything does not match this page, stop and paste the screen lines into the thread. Nothing on the screen is secret.

## Step 1. Select the region and open CloudShell

1. At the top right of the console, open the region menu and choose **Europe (Frankfurt) eu-central-1**.
2. At the top of the console, click the **CloudShell** icon (a small terminal symbol `>_`, to the left of the bell). You can also type `CloudShell` in the search box and open it.
3. Wait until you see a prompt that ends in `$`. The first start can take about a minute.
4. If CloudShell was already open, start a new tab: **Actions** (top right of the CloudShell pane), then **New tab**.

## Step 2. Check the account and region

Type, or copy and paste, each line and press Enter:

```bash
aws sts get-caller-identity --query Account --output text
```

Expected: `229251310592`

```bash
echo "$AWS_REGION"
```

Expected: `eu-central-1`

If either line shows something else, **stop**. Close CloudShell, check the account and the region menu, and start again at step 1.

## Step 3. Download the reviewed script and check its fingerprint

Claude's message in the thread gives the same download link pinned to the exact reviewed commit, and repeats the fingerprint below. If you have that message, use its link. The link below, on `main`, works as well. In both cases the fingerprint check decides.

```bash
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-13-identity-stage-c/supporting/stage-c-add-mfa-key.sh
```

Now check the fingerprint. The machine compares all 64 characters:

```bash
echo "f059fa2e870162155a46b1e79ee7dcd2d7f78e0b815cb93c7164dd7fb40db6a0  stage-c-add-mfa-key.sh" | sha256sum -c -
```

Expected, exactly: `stage-c-add-mfa-key.sh: OK`

If it says `FAILED`, or anything else, **stop**: run `rm stage-c-add-mfa-key.sh` and tell Claude. Never run a file that fails this check. The fingerprint must also match the one in Claude's thread message, which is a second channel.

**If the download fails** (for example `curl: (22) … 404`), you can upload the file instead:

1. Open the GitHub page of the file, click **Download raw file**, and save it on your PC as `stage-c-add-mfa-key.sh`.
2. In CloudShell, choose **Actions**, then **Upload file**, and select it.
3. Run the same `sha256sum -c` line. It must print `OK`.

The script holds no secret. You may open it with `less stage-c-add-mfa-key.sh` (press `q` to leave).

## Step 4. Check the tools the script uses

```bash
/usr/bin/python3 -I -W ignore -c "import boto3; print('boto3', boto3.__version__)"
```

Expected: one line such as `boto3 1.xx.x`. If you see an error instead, **stop** and paste the error line to Claude. Do not install anything.

## Step 5. Run the script

```bash
/bin/bash -p ./stage-c-add-mfa-key.sh
```

Always start it with exactly this line. Do not paste the script's contents into the terminal.

- The full paths and `-p` (privileged mode) make the shell ignore aliases, shell functions, `BASH_ENV` and similar startup settings.
- The script itself also clears the proxy, TLS, preload and credential-file settings, then uses CloudShell's own sign-in and the system Python.

This protects against accidental leftovers in the CloudShell home directory, which persists between sessions. It cannot fully protect against someone who has deliberately tampered with your CloudShell home. If you have any doubt about that, first choose **Actions**, then **Delete home directory**, and start again at step 1.

### 5a. Preflight (nothing is read or written yet)

The script first shows lines like these. Check every line against the table.

```
caller          arn:aws:iam::229251310592:root
account         229251310592
region          eu-central-1
secret          arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm
kms_key         arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37
current         ad02f18e-f3e7-41da-9959-f9b41e0b7e1a (the only version)
PREFLIGHT OK    nothing read or written yet
Type CREATE and press Enter to add the MFA key ring (anything else stops):
```

| Line | Must be |
| --- | --- |
| `caller` | `arn:aws:iam::229251310592:root` (you, signed in as the account root user) |
| `account` | `229251310592` |
| `region` | `eu-central-1` |
| `secret` | `arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm` |
| `kms_key` | `arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37` |
| `current` | `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a (the only version)` |
| last line | `PREFLIGHT OK` and the question |

If everything matches, type `CREATE` in capital letters and press Enter. To stop instead, type anything else, for example `no`, and press Enter. Nothing has been read or written at that point.

### 5b. Expected result

After a few seconds:

```
writing         new version <a new id>
CREATED VERIFIED
secret          munaxa-nonprod/identity
new_version_id  <the same new id>   (AWSCURRENT)
previous        ad02f18e-f3e7-41da-9959-f9b41e0b7e1a   (AWSPREVIOUS)
kid             mfa-nonprod-2026-11
key_names       DATABASE_URL,IDENTITY_SIGNING_PRIVATE_KEY,IDENTITY_SIGNING_SECRET,MFA_ENCRYPTION_KEYS,REDIS_PASSWORD,REDIS_URL
SEND CLAUDE     the new_version_id and kid lines above, nothing else
```

The id is a random identifier of the form `xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx`. It is not secret. `CREATED VERIFIED` means the script has already checked all of the following:

- the new version holds the five old values unchanged plus the key ring;
- the new version is `AWSCURRENT`;
- `ad02f18e-…` is `AWSPREVIOUS`.

## Step 6. Check the version labels yourself (metadata only)

```bash
aws secretsmanager list-secret-version-ids --secret-id munaxa-nonprod/identity --output table
```

Expected: exactly two versions, the new id with `AWSCURRENT` and `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` with `AWSPREVIOUS` (the table also shows dates and the KMS key id). This command shows metadata only, never a value.

Do **not** open "Retrieve secret value" in the Secrets Manager console, and do not run any `get-secret-value` command.

## Step 7. Send Claude two lines

Copy the `new_version_id` and `kid` lines into the Claude thread, for example:

```
new_version_id  1b2c3d4e-....-4...-....-............   (AWSCURRENT)
kid             mfa-nonprod-2026-11
```

Nothing else is needed. Then clean up and close:

```bash
rm stage-c-add-mfa-key.sh
```

Close the CloudShell pane. There is nothing else to clean up: the script writes no file and no history, and it sets no environment variable.

## If something goes wrong

Every message the script prints is safe to paste to Claude.

| You see | Meaning | Do |
| --- | --- | --- |
| A line starting `ABORT`, followed by `NOTHING WRITTEN` | it stopped before writing anything, for the reason given | paste the lines to Claude; do not retry until Claude answers |
| `ABORT NOT_CONFIRMED` | you did not type `CREATE` | nothing happened; run step 5 again if you want to |
| `ABORT WRONG_ACCOUNT`, `SECRET_…_MISMATCH`, `UNEXPECTED_VERSIONS` | not the expected account or secret state | stop; paste to Claude |
| `ABORT EXCEPTION ClientError AccessDeniedException` | your sign-in lacks a permission | stop; paste to Claude |
| `ABORT BOTO3_MISSING` | CloudShell's Python has no AWS library | stop; paste to Claude |
| `ABORT EXCEPTION NoCredentialsError` | the script could not use CloudShell's sign-in | stop; paste to Claude; nothing was read or written |
| A line containing `AFTER_WRITE_ATTEMPT` | a version may have been written, but the final check did not pass | **do not run the script again**; paste all lines to Claude, who checks the labels read-only |
| `ALREADY DONE VERIFIED` | stage C had already succeeded, for example in an earlier run whose window you lost; this run wrote nothing | send the `new_version_id` and `kid` lines, as in step 7 |
| The browser or CloudShell closed while it was running, and you saw **no** `ABORT` line | unknown | see "Running it again after a lost window" below |
| Anything else | — | stop; paste it to Claude |

### Running it again after a lost window

Closing the browser does not always stop a command that CloudShell is still running.

1. Open CloudShell again and do steps 1, 2 and 4.
2. Make sure no earlier run is still alive:

   ```bash
   pgrep -af 'python3 -I -W ignore -'
   ```

   This must print **nothing**. If it prints a line, choose **Actions**, then **Restart** (or wait two minutes), and check again. If it says `command not found`, choose **Actions**, then **Restart**, before going on.
3. Do step 3 again if the file is gone, then run step 5 once more.

The script then does one of three things:

- it does the work;
- it recognises that the work is already done (`ALREADY DONE VERIFIED`, and you send its two lines);
- it stops before writing anything.

If you saw any `ABORT` line in the earlier run, do not run it again: paste the lines to Claude.

**Undo.** Normally nothing needs undoing. Nothing reads the `AWSCURRENT` label of this secret: every task definition names a version id. If Claude asks for an undo, it is one labels-only command that Claude will give you. It moves `AWSCURRENT` back to `ad02f18e-…` and deletes nothing.

- An undo is only meaningful **before** PR #121 is applied (stage D), because after that the Identity task uses the new version by its id.
- After an undo, this script refuses to run again (`UNEXPECTED_VERSIONS`). Repeating stage C would need a revised, reviewed script.

## What Claude does next (not part of this page)

1. Claude checks the labels and dates with a read-only metadata call. It never reads the value.
2. Claude updates PR #121 with the new version id (report 04).
3. Claude re-runs the offline checks and asks you for the stage D decision separately.
