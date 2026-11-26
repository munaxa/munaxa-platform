# 09 - School Testing pin (munaxa-platform#209)

Date: 26 Nov 2026 (requested 22:46 UTC). This was a review only; nothing was pushed, merged or applied. The PR comes from the thread "Bring Munaxa School to Testing like Docs".

## Verdict

**No Critical, High, Medium or Low findings; 6 informational notes.** The PR (head `e24bbfa`) is mergeable from a security standpoint once CI is green. The apply and the Testing session are separate owner decisions.

## What I checked

### OIDC client secret
- `data "aws_secretsmanager_secret" "identity_oidc_clients"` reads metadata only (DescribeSecret and the resource policy), never the value.
- Identity's execution role grants the secret's full ARN, which is tighter than the `-??????` pattern in 0042203. This closes file 08 I-6 for nonprod.
- A missing secret fails the plan (fail closed).
- The report states the secret uses `alias/munaxa-nonprod-data` (file 08 I-5).

### Identity environment
- `IDENTITY_OIDC_PROVIDER=enabled` with one client: `school-munaxa-demo`, bound to `munaxa-group`, with the exact https redirect `https://school.test.munaxa.com/api/v1/auth/identity/callback`.
- The secret is pinned to its own version (`3e83e65c…`), and the identity bundle is not rewritten.
- The image is 101ef90 (identity#32/#33/#34, all reviewed). Microsoft and Google SSO stay off because `identity_sso_config` is unset.

### School environment
- From the #204 stack logic: `STAFF_PASSWORD_SIGN_IN=disabled` and `IDENTITY_SIGN_IN=enabled`.
- `IDENTITY_APP_REDIRECT_URI` is unset, so the teacher-app hand-off is off and school#34 L-1 is not exposed on Testing.
- Docs keeps `PASSWORD_SIGN_IN=enabled`, because there is no Docs client.

### E-1 task guard
- **New families:**
  - `school-migrate`: the owner URL is pinned, and there is no task role.
  - `school-provision`: the app URL is pinned and ADMIN_EMAIL comes from the slug's one-run secret. It has a read-only root filesystem, no task role and the db-admin security group.
  - The test now checks their images and every pin in the `secret_version_ids` block against the tfvars.
- **`account-email-verified`, plan and apply variants:**
  - The organisation and the reference are fixed.
  - `{ACCOUNT_ID}` must match a strict UUID pattern, and any input a command does not use is refused, so nothing extra can be passed to the command.
- **db-admin** now declares the app and owner URLs for identity, control, work and school, each pinned to a version.

### Declared plan (41 changes)
- 31 creates, 9 task definitions replaced, 1 in-place update (the Identity execution policy).
- There are no destroys. Nothing changes in services, the ALB, networking, the database, KMS, secrets, DNS or production.
- The 3 Docs task-definition replacements come only from #204 (`PASSWORD_SIGN_IN=enabled`) and from the Identity host joining the Docs outbound allow-list.

### D-SSL exception
- Five digests are added (Identity 101ef90, School c51dd62), Testing-only under the owner's 21:30 UTC decision. They keep the 2026-12-01 fail-closed expiry.

## Informational

- **I-1:** `CONTROL_PLANE_TOKEN` is a marked placeholder. School licensing fails closed until the owner issues the credential and school-api is re-pinned.
- **I-2:** `provision-school` logs the administrator address to the ops log group. This is acceptable on Testing; redact it before production.
- **I-3:** The planning identity needs DescribeSecret and GetResourcePolicy on the secret. The deployer scope covers both.
- **I-4:** Consider a postcondition on the data source that `kms_key_id` is the data key.
- **I-5:** db-admin holds the owner URLs for four products. Keep running it only inside sessions.
- **I-6:** Run `account-email-verified` before the first School sign-in. This is step 2 of the session.
