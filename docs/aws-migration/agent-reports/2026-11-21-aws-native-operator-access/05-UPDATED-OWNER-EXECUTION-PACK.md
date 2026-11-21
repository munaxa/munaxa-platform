# 05. Updated owner execution pack (AWS-native operator access)

**This file replaces `2026-11-21-deployment-acceleration-sprint/05-OWNER-EXECUTION-PACK.md`.
Nothing in it has been executed.** Every item needs the owner's yes when it is reached. A merged
PR is not permission to apply, publish, start, or change AWS, GitHub settings or DNS.

What changed against the sprint pack, and nothing else:

| Item | Before (sprint pack) | Now |
| --- | --- | --- |
| 2 | Create a Cloudflare Access application; send team domain and AUD | **Removed.** Replaced by **IAM Identity Center operator setup and verification** (O-IAM-1 to O-IAM-6) |
| 3, 4, 5, 6 | CloudShell **as root** | CloudShell from an Identity Center session with **`MunaxaEngineering`** (after item 2). Item 6's bootstrap part stays root (break-glass list, OPERATOR-ACCESS.md §2.2) |
| 8 | PR sets `operator_access` from item 2 | PR sets Identity's MFA policy (`privileged`, the two Control operator roles) with the Identity pin; **no `operator_access`** |
| 9a (new) | n/a | Set the `OPERATOR_CIDRS` GitHub environment variable before the Control session |
| 10 | Sign in at `operator-test.munaxa.com` through Cloudflare Access and Identity MFA | Sign in from your own address; Identity asks for TOTP (enrolment the first time) |
| DNS (in 10) | Operator record **proxied** | Operator record **DNS only**, like every other Testing record |

Unchanged: the order of Identity → Control → Docs, D-SSL as the gate before session 2, every cost
estimate, every rollback, the script hashes of the sprint pack. Repository work (Claude, merged
under the standing rule) and owner-executed AWS operations (each needs a yes) are kept apart in
every row.

Shared facts: account `229251310592`, Region `eu-central-1`; Stage E organisation `munaxa-group`
(`071d3060-70ac-4017-9ff9-094ff715051e`) and operator subject `ae62eef5-cf65-43c8-83e2-7786d2d5ae87`
(identifiers, not secrets); operator e-mail always `IDENTITY_OPERATOR_EMAIL`, never in a repository.
Plans run through munaxa-platform **Actions → "AWS Terraform"** and must match the committed
declaration. Custody script hashes are those listed in the sprint pack (unchanged by this PR).

---

## Session 1: available now

### 1. GitHub Packages read grant (optional, not on the critical path)

Unchanged from the sprint pack (Packages → Manage Actions access → add `munaxa-identity`,
`munaxa-control`, `munaxa-work` with **Read**). GitHub settings only; no cost.

### 2. AWS operator access: IAM Identity Center (replaces the Cloudflare Access application)

| Field | Value |
| --- | --- |
| Where | AWS console, signed in as root (this is the last routine root step), then the Identity Center access portal |
| Command | O-IAM-1 enable Identity Center (organization instance, `eu-central-1`, Identity Center directory). O-IAM-2 MFA: every sign-in; security keys/built-in authenticators and authenticator apps; register at sign-in. O-IAM-3 user for `IDENTITY_OPERATOR_EMAIL`, sign in once, register MFA. O-IAM-4 permission sets `MunaxaAdministrator`, `MunaxaEngineering`, `MunaxaReadOnly` from the reviewed JSON (`/mnt/project-files/aws-foundation/proposed-2026-10-29/iam/` plus the managed policies in OPERATOR-ACCESS.md §2.2), assigned in `229251310592` as decision D-IAM-1. O-IAM-6 sign the Claude AWS connector in with `MunaxaReadOnly` |
| Inputs | Decision D-IAM-1 (assignments). Your MFA device |
| Expected | Access portal URL; one user with one MFA device; three permission sets provisioned in `229251310592` |
| Verification (O-IAM-5) | 1. Console sign-in asks for MFA. 2. `aws configure sso` + `aws sso login --profile munaxa-readonly` work (OPERATOR-ACCESS.md §3.2). 3. `aws sts get-caller-identity` shows `AWSReservedSSO_MunaxaReadOnly_…`, not root. 4. With ReadOnly, `aws ecs list-clusters --region eu-central-1` works and `aws secretsmanager get-secret-value --secret-id munaxa-nonprod/identity` is **AccessDenied** (proves the deny; reads nothing). 5. With Engineering in CloudShell, `/bin/bash -p ./control-testing-secrets.sh status` works. 6. Claude's connector call shows the ReadOnly role. Paste outputs 3 to 6 to Claude (they hold no secret) |
| Rollback | Remove assignments; delete permission sets and user; disable the instance. Root still works throughout |
| Cost / live impact | US$0 (Identity Center has no charge); no workload change; GitHub OIDC unaffected |

Not needed any more: a Cloudflare Zero Trust application, a team domain, an AUD tag, an e-mail
allowlist, an Access session duration.

### 3. Control secret bundles (A-4C)

As the sprint pack, but run in CloudShell from a **`MunaxaEngineering`** session (after item 2):
`/bin/bash -p ./control-testing-secrets.sh bundles`, then `status`. The script prints the caller;
it must be `AWSReservedSSO_MunaxaEngineering_…`. If item 2 is not done yet, root remains the
approved interim method (ACCESS-POLICY §1) and the report records it.

### 4. Docs bootstrap: migrate image repository (A-3)

As the sprint pack (plan: +1 ECR repository, +1 lifecycle policy, publisher policy update in place,
0 destroy), from a `MunaxaEngineering` CloudShell. **If the plan touches anything outside the
`munaxa-*` role and policy paths or the ECR repositories, stop and use root** (the permission set
refuses it by design; ask Claude to check the denial first).

### 5. Docs secret bundles and the Resend decision (A-4, A-6)

As the sprint pack (placeholder recommended for the first run), from a `MunaxaEngineering`
CloudShell.

### 6. RDS restart stop (optional; not enabled)

As the sprint pack. The **bootstrap** part stays **root** (break-glass list); the stack part runs
through "AWS Terraform".

---

## Session 2: after OpenSSL 3.5.10 is in Alpine

**Gate (unchanged, rechecked 21 Nov 15:20 UTC):** Alpine edge `libssl3` is `3.5.9-r1`, v3.22 is
`3.5.9-r0`; the image scans still fail on 5 HIGH OpenSSL CVEs. Claude watches for 3.5.10 and then:
1. merges the bump PRs (identity#24, control#13, docs#182; work#35, School after);
2. merges **control#14 (this change)** before Control's images are built, then control#12,
   docs#181, docs#178;
3. confirms each `main` image scan has 0 HIGH and 0 CRITICAL;
4. sends you the three `main` SHAs.

### 7. Publish Identity, Control and Docs images (O-4, A-5C, A-5)

Unchanged (`image/<sha>` tag, `image-release` approval, scan before push). The Control image must
come from a `main` that contains control#14; Claude states the SHA and checks this.

### 8. Apply 1: Control C-1 together with the Identity pin and Identity MFA policy

| Field | Value |
| --- | --- |
| Where | munaxa-platform config PR (Claude), then "AWS Terraform" plan/apply |
| Command | Claude's PR: 1. sets the three Control digests (**no `operator_access`**); 2. sets the Identity api/migrate digests in `envs/nonprod.tfvars`, `envs/nonprod.stage-e-tasks.json` and the E-1 guard fixtures; 3. sets `identity_security_config.mfa_policy = "privileged"` with `mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]` in the tfvars **and** the Stage E manifest (`MFA_POLICY`, `MFA_PRIVILEGED_ROLES`); 4. adds `9a8c6ebd…`/`5f3bdcce…` to `withdrawn-images.tf`; 5. writes the declaration (33 creates plus the Identity task-definition replacements); 6. gets offline plan and CI green. Terraform refuses the PR if the MFA policy is `off` and `operator_access` is unset. Then you run plan, send the summary, and run apply |
| Inputs | item 7 outputs; decision D-OP-1 (MFA policy) |
| Expected | **33 add** (Control C-1) **plus the Identity task-definition replacements, 0 destroy**. The Identity replacement now also carries `MFA_POLICY=privileged` and `MFA_PRIVILEGED_ROLES`; no extra resource |
| Verification | Plan matches the declaration; apply run id; Claude reads the KMS **public** key (read-only, with your OK, as `MunaxaReadOnly` if item 2 is done) |
| Rollback | Previous tfvars: the 33 are removed (KMS key to pending deletion, cancellable) and Identity returns to the earlier revision (MFA policy `off`) |
| Cost / live impact | KMS key US$1 a month; nothing running |

### 9. Apply 2: Control C-2 together with Docs D-1

Unchanged from the sprint pack (C-2 0/3 replace/0; D-1 42 creates in the 19 Nov offline plan,
restated from a fresh offline plan). `control_operator_subjects` holds the Stage E operator subject:
Control now requires it in production because Access is not used.

### 9a. Allow your address for the operator console (new)

| Field | Value |
| --- | --- |
| Where | github.com → munaxa-platform → Settings → Environments → `aws-nonprod-session` → Variables |
| Command | Add variable `OPERATOR_CIDRS` = your current public IPv4 address as `/32` (for example `203.0.113.7/32`); several, comma-separated, at most three. Never `0.0.0.0/0` (Terraform refuses it) |
| Inputs | your public address (Claude never asks for it in the thread; you type it in GitHub only) |
| Expected | The session workflow logs "Operator source ranges: 1 (values masked)" at `up` |
| Verification | Item 10 step 5: from your address the operator host reaches the Identity sign-in; from any other address it answers 403 |
| Rollback | Delete the variable; the next `up` closes the operator host entirely |
| Cost / live impact | none; it only affects listener rules created at `up` |

### 10. Control session and the Docs credential

| Field | Value |
| --- | --- |
| Where | Actions → "AWS Testing session" `up`; Cloudflare DNS |
| Command | Claude operates after your yes: 1. `up` with identity 1, control-api 1, control-portal 1 and `hard_stop_utc`. 2. db-admin. 3. control-migrate. 4. Health checks. 5. **DNS (you, Cloudflare, G6):** CNAME `operator-test` → the ALB name Claude sends, **DNS only (grey cloud)**, plus the other session CNAMEs as before. 6. You open `https://operator-test.munaxa.com` from the address in 9a, sign in to Munaxa Identity; the first time Identity asks you to **enrol an authenticator app (TOTP)** and shows 10 recovery codes once (keep them offline); later sign-ins ask for the code. 7. In the Control portal, issue the Docs deployment credential (`mxc_…`), shown once; keep it for item 11 |
| Inputs | your sign-in, TOTP device |
| Expected | session creates 19 resources; db-admin and migrate exit 0; control-api healthy; operator host 403 from elsewhere; one credential id |
| Verification | run ids, exit codes, target health; Claude checks rule 39 answers 403 from the runner; the credential id (never its value) |
| Rollback | `down`; the 21:00 UTC backstop and 21:05 UTC cleanup stop everything anyway |
| Cost / live impact | **live session**, an estimated US$0.10 to 0.20 per hour (not measured). The database starts |

### 11 to 13

Unchanged from the sprint pack: 11 give Docs its Control credential and pin (CloudShell as
`MunaxaEngineering`), 12 Docs session (first customer-facing product in Testing), 13 `down` and
cleanup verification.

## How private infrastructure administration works now

- AWS console and CLI: Identity Center sessions (ReadOnly to look, Engineering for approved
  writes). No keys anywhere.
- Database and application administration: one-off ECS tasks started by the session workflow
  (db-admin, migrations, bootstrap, provisioning); no shell, no inbound port, no bastion.
- Logs and metrics: CloudWatch (log contents with Engineering).
- Secrets: owner custody scripts in CloudShell; values never shown to Claude.

## Work and School after this

Unchanged from the sprint pack. Neither needs Cloudflare Access; School's Cloudflare Workers demo
(`deploy-cloudflare.yml`) is an existing Cloudflare use and is not touched.
