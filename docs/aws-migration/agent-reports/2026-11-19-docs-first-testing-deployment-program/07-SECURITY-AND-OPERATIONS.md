# 07. Security and operations

## 1. Principles kept

- No temporary authentication, no disabled licensing check, no production-incompatible shortcut. Docs in Testing runs production mode and fails closed until Control issues its credential.
- Root through the connector, read-only, for checks only. No IAM user, no access key.
- No secret value read, printed, copied or logged. Secret values are created inside AWS by owner scripts (L-A0 pattern).
- Every AWS change is an owner-approved apply or owner-run script.

## 2. Docs-specific controls

| Control | Where |
| --- | --- |
| Separate DB roles: `edms_owner` (migrate only), `edms_app` (api), backup role | docs bundles, `docs-owner-password.sql` |
| Owner password never in the api bundle | script check `OWNER_PASSWORD_IN_API_BUNDLE` |
| Licensing fails closed (402) | Docs `CONTROL_PLANE` mode |
| S3 with the task role; no static keys | `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE` |
| One-run provision secret, deleted after use | script `provision-delete` |
| MFA sealing key, signature witness, audit checkpoint secrets: 48-byte URL-safe random | script |

## 3. Operations

- Sessions run through the session workflow; `down` the same day; R at 21:05 and the backstop at 21:00 catch anything left.
- Alarms email the owner on cleanup failure or a missed run.
- Logs: CloudWatch, 14-day retention in Testing.

## 4. Independent review of the secret script

An independent reviewer (separate agent, given only the code at commit `87b6d90`) reviewed the script and its tests.

**Verdict: APPROVE. No Critical, High or Medium findings.** It confirmed value custody (argv, env, files, tracebacks), the derived URLs and catalogue against the Docs schemas, the resume order, retry idempotency, label handling and the CI step.

| # | Low finding | Action |
| --- | --- | --- |
| 1 | After an earlier write in the same run, an abort printed "NOTHING WRITTEN BY THIS STEP" | **Fixed** in `d55a197`: the abort names the bundles written and asks for the ABORT lines; test added |
| 2 | provision-create did not apply Docs' rule that the password must not contain the email or display name | **Fixed** in `d55a197` (and length counted in UTF-16 units); test added |
| 3 | `pg_url_ok` read the port outside its `try` | **Fixed** in `d55a197` |
| 4 | Two runs at the same time leave a bundle with two versions (detected, no split password, manual repair) | Not changed in code; the owner instruction for the script (file 10, A-4) says to run it in one CloudShell tab at a time |
| 5 | The summary always said the Control token was a placeholder | **Fixed** in `d55a197` |
| 6 | Test gaps: tty/getpass path and root-owned CLI check are replaced in tests; no "write succeeded but CLI reported error" case; no second replace-key | Recorded; the tty and CLI paths are the same code as the stage C script |

After the fixes: 18/18 tests pass, shellcheck clean.
