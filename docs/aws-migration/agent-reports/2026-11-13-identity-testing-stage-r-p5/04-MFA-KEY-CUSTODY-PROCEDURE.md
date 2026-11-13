# 04. MFA key custody: operator procedure (prepared, not executed)

Legend: **[V]** verified in code, **[L]** local test with stubs, **[U]** not verified, **[O]** owner action.

**Nothing here was run.** No key was generated, read, written, rotated or exposed. No Secrets Manager version was created.

## 1. The contract [V]

| Item | Value | Source |
| --- | --- | --- |
| Where | JSON key `MFA_ENCRYPTION_KEYS` inside the existing bundle `munaxa-nonprod/identity` | `infra/aws/stack/data.tf:171`, munaxa-identity `docs/runbooks/aws.md` |
| Format | `kid=key[,kid=key…]`; key = exactly 32 random bytes, base64url (43 characters, no padding) or standard base64 | munaxa-identity `packages/config/src/mfa-keys.ts` |
| kid | `mfa-nonprod-2026-11` (1-64 of `[A-Za-z0-9_-]`; not 43 characters, so the stack's "looks like a key" validation accepts it). Non-secret: it is written into every ciphertext envelope | `variables.tf:384-395`; chosen in P-5 after Identity's own example `mfa-2026-11` (`docs/runbooks/mfa.md`) |
| Startup rules (production mode, which Testing uses) | refuses: no ring; an entry not `kid=key`; a key not 32 bytes; a repeated-byte key; a duplicate kid; a primary kid not in the ring; a key equal to `IDENTITY_SIGNING_SECRET` or contained in the signing private key | `environment.ts` `mfaKeyIssues`; harness 11/11 against 2db6ed9 (supporting) |
| How ECS reads it | `valueFrom = <bundle ARN>:MFA_ENCRYPTION_KEYS::<version id>`, a pinned version. ECS refuses to start a task whose pinned version lacks the JSON key | `services.tf:153`, rendered diff (supporting) |
| Other bundle keys (unchanged) | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` | `data.tf:172` |

Adding a key to an existing JSON bundle is a **read, merge, write**: `PutSecretValue` replaces the whole `SecretString`. Whatever performs stage C therefore holds every value of the bundle in memory for a moment. That is the central custody question.

## 2. Route options

| Route | Where the values exist | Rule conflicts | Verdict |
| --- | --- | --- | --- |
| **M-1. Owner, AWS CloudShell, one prepared script** (`supporting/stage-c-add-mfa-key.DRAFT.sh`) | only in one Python process in the owner's CloudShell, inside AWS | needs the owner to paste one script; the 11 Nov direction prefers that the owner runs no AWS command | **Recommended.** Strongest custody: nothing passes through Claude, the connector or GitHub |
| M-2. `asm-exec` with `{{resolve:secretsmanager:munaxa-nonprod/identity:SecretString}}` (the CLAUDE.md pattern) | in a child process of Claude's session; never in Claude's context | none | **Unavailable**: `asm-exec` is not installed here (checked 13 Nov) [V]. Use it if a later session has it |
| M-3. Claude runs the same logic as a server-side script through the AWS connector | in the connector's sandbox | **needs an explicit owner exception** to CLAUDE.md "MUST NOT call get-secret-value"; open L-A0: whether the connector logs request parameters or responses cannot be verified (Option A review, 11 Nov). Here that would expose the **whole bundle** (signing key, database URL), not one password | Not recommended |
| M-4. Console only (Secrets Manager "Retrieve secret value", "Edit", add a row) | the owner's browser | the console has no 32-byte generator, so the key would come from somewhere else and be pasted | Not recommended (paste and clipboard exposure) |

**Owner decision required [O]:** M-1 (recommended) or M-3 with the named exception. This is the only new decision the task found.

## 3. Procedure M-1 (stage C), step by step

Preconditions: Stage R done (02) and the owner's explicit stage C approval. Irreversible in effect: once a TOTP secret is sealed under the key, the key must be kept.

1. Open AWS CloudShell in **eu-central-1** as the account `229251310592` (root, MFA, as today). CloudShell keeps a home directory, so the script turns history off itself (`set +o history`) and writes no file.
2. Paste the script from `supporting/stage-c-add-mfa-key.DRAFT.sh` (after its review; Claude will give it as one block). It:
   - checks the account and that `AWSCURRENT` is still `ad02f18e-…` (the pinned version), and stops otherwise;
   - reads that version, checks the five required keys, refuses if `MFA_ENCRYPTION_KEYS` already exists;
   - generates 32 bytes with Python `secrets`, base64url, checks it does not collide with the signing secrets;
   - writes one new version with `PutSecretValue` (an idempotency token, no stage argument, so it becomes `AWSCURRENT` and `ad02f18e` becomes `AWSPREVIOUS`);
   - checks with `DescribeSecret` afterwards that the new version is `AWSCURRENT` and `ad02f18e` is `AWSPREVIOUS` (Secrets Manager has no conditional write, so this also detects a concurrent write);
   - prints only `CREATED VERIFIED`, the new version id, the previous id, the kid and the key **names**. Any error prints only `ABORT <code>` or `ABORT EXCEPTION <type> <AWS error code>`, never a traceback or message text.
   - runs in a child shell, so an abort never closes the CloudShell session.
3. The owner copies **only those printed lines** into this thread. They are not secret.
4. Close CloudShell. Nothing to clean up: no file, no history entry, no environment variable.
5. **No further write to `munaxa-nonprod/identity` until stage D is verified.** After stage C, `ad02f18e` keeps only the `AWSPREVIOUS` label; a second `PutSecretValue` would leave it unlabelled, and unlabelled versions are deprecated and may be removed by Secrets Manager [U]. The 5277d71 rollback revisions and the db-admin revision pin `ad02f18e` until stage D. If stage C must be redone, stop and report: the script refuses a second run anyway (`AWSCURRENT_IS_NOT_THE_PINNED_VERSION`). Optional, owner-approved metadata write: a custom label on `ad02f18e` with `UpdateSecretVersionStage` (for example `PINNED-5277D71`), which keeps it labelled.

[L] Tested locally against a stub of boto3 with fake values (`supporting/stage-c-script-stub-test-output.txt`): the output lists only the six key names and ids, no value; an AccessDenied prints one `ABORT EXCEPTION` line and the outer shell keeps running; the written ring passes Identity's own `parseMfaKeys` (1 entry, kid `mfa-nonprod-2026-11`, 0 problems). [U] Not run in CloudShell; that boto3 is preinstalled there is expected, not verified (if missing: `pip3 install --user boto3`, which needs no secret).

**Why moving `AWSCURRENT` is safe:** every ECS reference to this bundle carries a version id (`services.tf`, `ops.tf`). The 5277d71 task definitions keep reading `ad02f18e` until stage D replaces them. Nothing reads `AWSCURRENT` of this bundle [V].

## 4. Keeping the value invisible

| Place | Control |
| --- | --- |
| Claude | M-1: Claude never runs stage C and never sees the bundle. Claude only reads `DescribeSecret` / `ListSecretVersionIds` afterwards |
| Logs | the script prints no value; Identity's startup errors name variables, never values (`mfaKeyIssues`); ECS task definitions hold only ARNs |
| Shell history | `set +o history`; the key is never an argument or an environment variable |
| CI output | no workflow reads the bundle; `aws-terraform.yml` never prints planned attribute values; task definitions contain ARNs only |
| Reports and Git | only the kid and version ids are recorded; `nonprod.tfvars` validation refuses a 43-character kid (a pasted key) |
| CloudTrail | records `GetSecretValue` and `PutSecretValue` as management events; Secrets Manager does not log the secret string in CloudTrail (AWS documentation) [U: confirm with one `LookupEvents` read in the R-12 style afterwards, booleans only] |

## 5. Recording and verification (after stage C, read-only)

1. Claude (connector, read-only): `DescribeSecret munaxa-nonprod/identity` shows the new version id as `AWSCURRENT` and `ad02f18e-…` as `AWSPREVIOUS`, created at the stage C time, by the owner's principal (CloudTrail `PutSecretValue`, one event).
2. Claude updates PR #121: `secret_version_ids.identity = "<new version id>"`, removes the merge-blocker comment, re-runs the offline checks, takes it out of draft for review.
3. Recorded in the next report: the kid `mfa-nonprod-2026-11`, the new version id, the previous version id. Nothing else.

## 6. Production MFA enforcement is unchanged [V]

- P-5 changes only `envs/nonprod.tfvars` and `envs/nonprod.expected-changes.json`. `envs/prod.tfvars` and `prod.expected-changes.json` are untouched (`git diff --stat`).
- `prod.tfvars` has `images = {}`: no Identity runs in production.
- No Identity code changed. The production rule (no ring, no start) is in Identity's configuration, which 2db6ed9 keeps (CVE report 07).
- `mfa_policy = "off"` applies to Testing only. Enforcement for privileged roles in production stays a separate decision (munaxa-identity `docs/production-readiness.md` §6).

## 7. Escrow and loss

The key exists only in Secrets Manager versions of `munaxa-nonprod/identity`. There is no other copy, by design. Deleting the bundle (30-day recovery window) or losing every version that holds it loses the key, and every TOTP secret sealed under it becomes unreadable. In Testing that is acceptable: the only MFA user is the throwaway `@example.invalid` account, which can be re-enrolled. Production needs its own escrow decision before any MFA user exists there.

The data KMS key's policy must let the owner's principal use the key through Secrets Manager for the read and the write [U]: if it does not, the script stops with `ABORT EXCEPTION ClientError AccessDeniedException` before writing anything. Stage R R-6/R-7 checks the key policy by reading it.

## 8. If the key leaks

Follow munaxa-identity `docs/runbooks/mfa.md` "Rotation", all four steps at once: add a new entry and make it primary, re-encrypt with `operator-cli mfa-reencrypt`, settle recovery codes, retire the old entry. In Testing, the throwaway `@example.invalid` account is the only MFA user, so re-enrolling it is enough.
