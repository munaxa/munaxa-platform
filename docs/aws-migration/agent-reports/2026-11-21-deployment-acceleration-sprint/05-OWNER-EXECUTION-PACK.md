# 05. Owner execution pack: 13 ordered actions to Control and Docs in Testing

**Nothing in this file has been executed.** Each item needs the owner's yes when it is reached.
Some items are owner-only (CloudShell, Cloudflare, GitHub settings); for the rest Claude operates
once the owner has said yes. A merged PR is not permission to apply, publish or start anything.

The actions fall into two sessions:
- **Session 1, available now (items 1 to 6).** None of these needs a new image, so this work
  can happen before 1 Dec.
- **Session 2, after Alpine ships OpenSSL 3.5.10 (items 7 to 13).** The critical path to the
  first Testing deployment.

Shared facts used below:
- Account `229251310592`, Region `eu-central-1`.
- Stage E organisation `munaxa-group` (`071d3060-70ac-4017-9ff9-094ff715051e`) and operator
  subject `ae62eef5-cf65-43c8-83e2-7786d2d5ae87`. These are identifiers, not secrets.
- Operator e-mail: always `IDENTITY_OPERATOR_EMAIL`. It is never written in a repository.
- Plans run through munaxa-platform **Actions → "AWS Terraform"** (`aws-terraform.yml`) with
  `environment=nonprod` and `action=plan`, then `action=apply`. Each plan must match the
  committed `infra/aws/stack/envs/nonprod.expected-changes.json` declaration, or the workflow refuses it.
- Custody scripts run in **AWS CloudShell as root**. The script is downloaded from `main` and its
  sha256 checked before running (values below are on `main` after this PR merges):

  | Script | sha256 |
  | --- | --- |
  | `control-testing-secrets.sh` | `6e55c6bd1dc545d18472706f7b97201a9291ed9e0cd2b618f6103bab16fc28db` |
  | `docs-testing-secrets.sh` | `3cd8b9665118880565ab45f0d86650ef0019c1fb1e1744b305259238fa269e70` |
  | `work-testing-secrets.sh` | `717ef776c8a649365e1a08e4fd4b333fff8f9e946513acbe509e0fb14537c5ae` |

  Each script reads values only from stdin or generates them, and prints only version ids.
  Claude never sees a secret value.

---

## Session 1: available now

### 1. GitHub Packages read grant (optional, not on the critical path)

| Field | Value |
| --- | --- |
| Where | github.com → organisation `munaxa` → Packages → each of the 20 `@munaxa/*` packages (file 02) → Package settings → "Manage Actions access" |
| Command | Add repository: `munaxa-identity`, `munaxa-control`, `munaxa-work`, each with role **Read** |
| Inputs | none |
| Expected | Claude re-runs identity#19, control#9 and work#32, and the image jobs install without `ERR_PNPM_FETCH_403` |
| Verification | Claude reports the green run ids, then merges under the standing rule |
| Rollback | Remove the repository from "Manage Actions access" |
| Cost / live impact | none; GitHub settings only. Afterwards `PLATFORM_PACKAGES_TOKEN` can be deleted (a separate yes) |

### 2. Cloudflare Access application for the Control operator host (A-7)

| Field | Value |
| --- | --- |
| Where | Cloudflare Zero Trust → Access → Applications → Add → Self-hosted |
| Command | Application domain `operator-test.munaxa.com`. Policy: Allow, Include "Emails" = `IDENTITY_OPERATOR_EMAIL` (your own address). Session 24 h. Create no DNS record now: item 10's session creates the ALB and the record is a later step |
| Inputs | team domain (`<team>.cloudflareaccess.com`) and the application **AUD** tag, from Overview. Neither is a secret |
| Expected | the application is listed; nothing reaches it yet |
| Verification | Send Claude the team domain and AUD. Claude puts them in `operator_access` in the C-1 PR; the Terraform validation refuses an empty or malformed value |
| Rollback | Delete the application |
| Cost / live impact | US$0 on the Zero Trust free plan; no traffic change |

### 3. Control secret bundles (A-4C)

| Field | Value |
| --- | --- |
| Where | AWS CloudShell, root; munaxa-platform `scripts/aws/owner/control-testing-secrets.sh` |
| Command | `/bin/bash -p ./control-testing-secrets.sh bundles` then `/bin/bash -p ./control-testing-secrets.sh status` |
| Inputs | none; both database passwords are generated inside the script |
| Expected | one version in `munaxa-nonprod/control-migrate` and one in `munaxa-nonprod/control-api`; the script prints the two version ids |
| Verification | send Claude the two version ids (not values); `status` shows AWSCURRENT on each |
| Rollback | the bundles are only read when a session runs; to restart, delete the version (the script's header lists the exact command) and run `bundles` again |
| Cost / live impact | the secrets already exist in Terraform (`data.tf`), so the cost is unchanged; no service reads them yet |

### 4. Docs bootstrap: migrate image repository (A-3)

| Field | Value |
| --- | --- |
| Where | AWS CloudShell, root; munaxa-docs `infra/terraform/bootstrap` (state in the existing S3 backend) |
| Command | `git clone https://github.com/munaxa/munaxa-docs && cd munaxa-docs/infra/terraform/bootstrap && terraform init && terraform plan -out=b.tfplan`. Then **paste the plan summary to Claude before applying**, then `terraform apply b.tfplan` and `rm b.tfplan` |
| Inputs | the private `terraform.tfvars` used for the last Docs bootstrap (budget e-mail addresses; not committed) |
| Expected | plan: +1 ECR repository `munaxa-docs/migrate`, +1 lifecycle policy, an in-place update of the image publisher policy, **0 destroy** |
| Verification | Claude checks the plan text against this line; after the apply, Claude checks read-only (with your OK) that `munaxa-docs/migrate` exists with scan-on-push on |
| Rollback | `terraform apply` with the previous commit's bootstrap. The repository is empty, so removing it loses nothing |
| Cost / live impact | US$0 until images are pushed (ECR storage about US$0.10 per GB-month) |

### 5. Docs secret bundles and the Resend decision (A-4, A-6)

| Field | Value |
| --- | --- |
| Where | AWS CloudShell, root; `scripts/aws/owner/docs-testing-secrets.sh` |
| Command | `/bin/bash -p ./docs-testing-secrets.sh bundles`, then `status` |
| Inputs | **Decision A-6:** either paste a Resend API key with sending access only (then `notify.munaxa.com` must be verified in Resend), or press Enter for a marked placeholder. With the placeholder, Docs runs and mail is dead-lettered after 5 retries. **Recommended for the first Testing run: the placeholder.** `CONTROL_PLANE_TOKEN` is always a placeholder here; item 11 replaces it |
| Expected | one version each in `docs-operator`, `docs-migrate` and `docs-api`; three version ids printed |
| Verification | send Claude the three ids; `status` shows the placeholder markers |
| Rollback | as item 3 |
| Cost / live impact | none beyond the existing secrets |

### 6. RDS restart stop (optional; not enabled)

| Field | Value |
| --- | --- |
| Where | bootstrap: CloudShell root, munaxa-platform `infra/aws/bootstrap`; then stack: Actions → "AWS Terraform" |
| Command | Exact steps in [supporting/rds-restart-stop-enablement.md](supporting/rds-restart-stop-enablement.md). Bootstrap `plan`/`apply` with `-var testing_session_cleanup=true -var testing_rds_restart_stop=true`. Then a Claude PR sets `rds_restart_stop_enabled = true` in `envs/nonprod.tfvars` with the committed declaration. Then stack plan and apply |
| Inputs | none |
| Expected | bootstrap: **2 add, 2 change, 0 destroy**. Stack: **8 add, 1 change, 0 destroy** |
| Verification | read-only checks in that document (rule, target, state machine, alarm, topic policy) |
| Rollback | stack first (8 destroy, 1 update), then bootstrap (2 destroy, 2 update) |
| Cost / live impact | a few cents a month (at most US$0.10 a month for the alarm). Each AWS 7-day automatic restart of the stopped database is stopped again after about 2 hours, if no session is running. The next automatic restart is around 28 Nov 10:45 UTC |

---

## Session 2: after OpenSSL 3.5.10 is in Alpine (Claude watches for it and tells you)

Before item 7, Claude:
1. Merges the bump PRs (identity#24, control#13, docs#182; work#35 and School follow).
2. Merges control#12, docs#181 and docs#178.
3. Confirms each `main` CI image scan has 0 HIGH and 0 CRITICAL.
4. Sends you the three `main` commit SHAs.

### 7. Publish Identity, Control and Docs images (O-4, A-5C, A-5)

| Field | Value |
| --- | --- |
| Where | `publish-images-ecr.yml` (identity) and `publish-images.yml` (control, docs), each triggered by an `image/<sha>` tag and held at the `image-release` environment |
| Command | For each repository: `git tag image/<sha> <sha> && git push origin image/<sha>` (you, or Claude after your yes). Then open the run → "Review deployments" → approve `image-release` |
| Inputs | the three `main` SHAs Claude sends |
| Expected | Each workflow checks the commit is on `main`, then builds, verifies and scans (failing on HIGH), and only then pushes. Identity: api and migrate. Control: api, migrate, portal. Docs: api, web, worker, migrate, antivirus |
| Verification | Claude records the run ids and every digest, and (with your OK, read-only) the ECR scan of each digest |
| Rollback | Nothing runs an image until a plan pins it. A bad digest is added to `withdrawn-images.tf`, which makes Terraform refuse it |
| Cost / live impact | ECR storage only (cents); nothing running |

### 8. Apply 1: Control C-1 together with the Identity pin (O-4)

| Field | Value |
| --- | --- |
| Where | munaxa-platform config PR (Claude), then "AWS Terraform" plan/apply |
| Command | Claude's PR does five things:<br>1. Sets the three Control digests and `operator_access` (from item 2).<br>2. Sets the Identity api/migrate digests in `envs/nonprod.tfvars`, `envs/nonprod.stage-e-tasks.json` and the E-1 guard fixtures.<br>3. Adds `9a8c6ebd…`/`5f3bdcce…` to `withdrawn-images.tf`.<br>4. Writes the declaration: 33 creates plus the Identity task-definition replacements.<br>5. Gets offline plan and CI green.<br>Claude merges it under the standing rule. Then you run plan, send Claude the plan summary, and run apply |
| Inputs | item 2 and item 7 outputs |
| Expected | **33 add** (KMS licence key, alias and policy; control-api, -migrate and -portal roles, policies, log groups, SGs and task definitions; no service, no ALB) **plus the Identity task-definition replacements, 0 destroy** |
| Verification | the plan matches the declaration (the workflow refuses it otherwise); apply run id; Claude reads the KMS **public** key (`kms get-public-key`, read-only, with your OK) for item 9 |
| Rollback | apply the previous tfvars: the 33 are removed (the KMS key goes to pending deletion for 7 to 30 days, cancellable), and the Identity task definitions return to the earlier revision |
| Cost / live impact | KMS key US$1 a month; everything else is free while services are at 0 |

### 9. Apply 2: Control C-2 together with Docs D-1

| Field | Value |
| --- | --- |
| Where | munaxa-platform config PR (Claude), then "AWS Terraform" plan/apply |
| Command | Claude's PR sets:<br>- `control_licence_public_key` and kid `control-licence-nonprod-2026-11`;<br>- the operator organisation and subject (the Stage E values above);<br>- `db_bootstrap_products = ["identity","control"]` (Docs has its own db-admin path, `edms_owner`/`edms_app`);<br>- the Control and Docs bundle version ids (items 3 and 5) and the Docs digests (item 7);<br>- the `nonprod.stage-e-tasks.json` update for the new db-admin revision;<br>- the declaration.<br>Then plan and apply, as item 8 |
| Inputs | items 3, 5, 7 and 8 |
| Expected | C-2 **0 add / 3 change (replace) / 0 destroy** (db_admin, control_api, control_migrate) plus D-1 (**42 creates** with services off in the 19 Nov offline plan; Claude restates the exact count from the fresh offline plan in the PR) |
| Verification | as item 8 |
| Rollback | previous tfvars; task definitions return to the earlier revision; secrets keep their versions |
| Cost / live impact | nothing running; Docs bucket and log groups cost cents |

### 10. Control session and the Docs credential

| Field | Value |
| --- | --- |
| Where | Actions → "AWS Testing session" (`aws-session.yml`), `up` |
| Command | Claude operates after your yes. Steps:<br>1. `up` with identity 1, control-api 1, control-portal 1 and `hard_stop_utc` set.<br>2. db-admin.<br>3. control-migrate.<br>4. Health checks.<br>5. You sign in at `operator-test.munaxa.com` through Cloudflare Access and Identity MFA, and issue the Docs deployment credential (`mxc_…`). It is shown once; keep it for item 11 |
| Inputs | your sign-in and MFA |
| Expected | session creates 19 resources; db-admin and migrate exit 0; control-api healthy; one credential id |
| Verification | run ids, task exit codes, target health; the credential id (never its value) recorded |
| Rollback | `down`; the 21:00 UTC backstop and the 21:05 UTC cleanup stop everything in any case |
| Cost / live impact | **live session**: the ALB, Fargate tasks and RDS while up, an estimated US$0.10 to 0.20 per hour (not measured). The database starts |

### 11. Give Docs its Control credential, then Apply 3 (pin)

| Field | Value |
| --- | --- |
| Where | CloudShell, `docs-testing-secrets.sh`; then a Claude config PR and "AWS Terraform" |
| Command | `/bin/bash -p ./docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN` (paste the `mxc_` credential, hidden input). Claude then pins the new docs-api version id (declaration: a docs-api task-definition replacement); plan; apply |
| Inputs | the credential from item 10 |
| Expected | one new docs-api version id; the plan shows exactly the docs-api task-definition replacement |
| Verification | `status` shows the token is no longer the placeholder; the plan matches the declaration |
| Rollback | re-pin the previous version id (the placeholder); revoke the credential in the Control portal |
| Cost / live impact | none (between sessions) |

### 12. Docs session: first customer-facing product in Testing

| Field | Value |
| --- | --- |
| Where | "AWS Testing session" `up`; CloudShell for the one-run provisioning secret |
| Command | Claude operates after your yes. Steps:<br>1. `up` with identity, control-api and docs services.<br>2. db-admin (creates `edms_owner`/`edms_app`).<br>3. docs-migrate.<br>4. You run `docs-testing-secrets.sh provision-create` (admin e-mail, name and password, typed).<br>5. The docs-provision task (exit 0, or 4 if already provisioned).<br>6. You run `provision-delete`.<br>7. Docs services up |
| Inputs | your first-admin details (typed into CloudShell only) |
| Expected | api `/api/health/live` 200, web `/login` 200, sign-in works, a licensed route returns 200 not 402, S3 upload works with the task role |
| Verification | run ids, exit codes, target health, one licensed request; the one-run secret is shown as deleted |
| Rollback | `down`; data stays in the stopped database; pins revert through tfvars |
| Cost / live impact | **live session**, an estimated US$0.15 to 0.30 per hour while up (not measured) |

### 13. Close the session and verify cleanup

| Field | Value |
| --- | --- |
| Where | "AWS Testing session" `down` (Claude, under the same yes as item 12) |
| Command | `down`; then Claude's read-only cleanup verification |
| Inputs | none |
| Expected | ECS desired 0 everywhere, no ALB, RDS stopping or stopped |
| Verification | Claude's verification output, attached to the session report |
| Rollback | n/a; the backstop and cleanup R act anyway at 21:00 and 21:05 UTC |
| Cost / live impact | returns to idle cost |

## Work and School after this

**Work** follows the same pattern once Control issues its credential:
1. `work-testing-secrets.sh bundles` (W-3, on `main` with this PR).
2. Work release (work#35 first).
3. Pin apply with `db_bootstrap_products` adding `"work"`.
4. Session with the W-4 tenant binding.

**School** is on Render and stays there until you decide otherwise (file 04). School's Identity sign-in (school#29) needs one yes from you before it can merge: setting `SCHOOL_LOCAL_AUTH=enabled` on the Render production API. This is a production configuration change, so Claude has not made it.
