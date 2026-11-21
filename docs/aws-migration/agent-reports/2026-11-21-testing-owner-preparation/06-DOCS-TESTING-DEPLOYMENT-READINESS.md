# 06. Docs Testing deployment readiness

**Nothing here has been executed. Deployment not started.** Each AWS, publish, DNS, secret or
session step needs the owner's explicit yes at that step; a merged PR never authorizes an apply,
publish or session. Work and School are not deployed. Production is not touched.

Fixed facts: account `229251310592`, `eu-central-1`; operator organisation `munaxa-group`
`071d3060-70ac-4017-9ff9-094ff715051e`, operator subject `ae62eef5-cf65-43c8-83e2-7786d2d5ae87`
(identifiers, not secrets); operator e-mail is always `IDENTITY_OPERATOR_EMAIL`.

## 1. Fresh offline plans (recalculated, not copied)

Terraform 1.16.5, hashicorp/aws 6.67.0, mocked provider, `-var-file=envs/nonprod.tfvars` on `main`
`6633c4e`, each applied run feeding the next. Test file and full address list:
[supporting/apply1-apply2-mocked.tftest.hcl](supporting/apply1-apply2-mocked.tftest.hcl),
[supporting/apply1-apply2-mocked-output.txt](supporting/apply1-apply2-mocked-output.txt) (`Success! 7 passed`).
All digests, bundle version ids and the licence key in it are placeholders.

| Step | Mocked plan | What the real plan and declaration show |
| --- | --- | --- |
| **Apply 1** (C-1 + Identity pin + MFA) | `Plan: 33 to add, 4 to change, 0 to destroy.` | **33 create** (Control api 12, migrate 8, portal 8, licence KMS key + alias + key policy, 2 ALB egress rules) and **4 replacements** `["delete","create"]`: `module.identity[0]` and `module.migrate["identity"]` task definitions, `aws_ecs_task_definition.identity_bootstrap[0]`, `aws_ecs_task_definition.identity_probe[0]`. **0 pure destroy.** |
| **Apply 2** (C-2 + D-1) | `Plan: 42 to add, 3 to change, 0 to destroy.` | **42 create** (Docs api 13, web 8, scanner 7, migrate 8, docs-db-admin and docs-provision task definitions, provision execution role + policy, 2 ALB egress rules) and **3 replacements**: `aws_ecs_task_definition.db_admin[0]`, Control api and Control migrate task definitions. 0 pure destroy |
| Docs credential pin (later) | `0 to add, 2 to change` | **2 replacements**: `module.docs_api[0]` and `aws_ecs_task_definition.docs_provision[0]` (both read docs-api). **Correction:** the previous runbook said one |
| Docs session `up` (not applied) | `28 to add` | ALB, 2 listeners, 3 refusal rules, certificate validation, and the identity, Control and Docs services/target groups; with `OPERATOR_CIDRS` set and no Cloudflare Access, the plan passes the MFA/allow-list validations |

Why "change" in the mock and "replace" in reality: a mocked provider does not run the AWS provider's
plan logic, and every `aws_ecs_task_definition` argument forces a new revision. The 13 Nov stage D
real plan (run 43509702203) showed exactly this: `4 replace` for the task definitions. A real summary therefore reads
about `Plan: 37 to add, 0 to change, 4 to destroy.` for Apply 1 and `45 to add, 0 to change, 3 to
destroy.` for Apply 2; the "destroy" there is only the deregistration of old task-definition
revisions (where `skip_destroy` is set they stay). The workflow's intent check compares actions per
address, so the declaration lists replacements as `["delete","create"]`.

These match the historical values (C-1 33, C-2 3 replacements, D-1 42).

## 2. The Apply 1 change set, built and tested

[supporting/apply1-repository-change-TEMPLATE.patch](supporting/apply1-repository-change-TEMPLATE.patch)
(placeholder digests `e1…`/`e2…` Identity, `c1…`/`c2…`/`c3…` Control; never merge as is). Tested in a
scratch worktree of `main`: **95 stack tests pass, 143 connector tests pass, declaration valid (37).**

| File | Change |
| --- | --- |
| `infra/aws/stack/envs/nonprod.tfvars` | Identity api/migrate digests (from the 3.5.10 build); Control api/migrate/portal digests; `identity_security_config = { mfa_primary_kid = "mfa-nonprod-2026-11", mfa_policy = "privileged", mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"] }` (D-OP-1) |
| `infra/aws/stack/envs/nonprod.stage-e-tasks.json` | the 5 Identity image references; identity container: `MFA_POLICY` = `privileged`, new `MFA_PRIVILEGED_ROLES` = `control-operator-admin,control-operator-viewer` (environment and environmentNames) |
| `scripts/aws/connector/e1-task-guard.py` | the embedded manifest, same edits (the test compares them) |
| `infra/aws/stack/withdrawn-images.tf` | withdraw `sha256:9a8c6ebd…3c3b` (identity/api 2db6ed9) and `sha256:5f3bdcce…4b874` (identity/migrate 2db6ed9) |
| `infra/aws/stack/tests/stack.tftest.hcl` | withdrawn count 10 → 12, two refusal runs |
| `infra/aws/stack/tests/stage-e-manifest.tftest.hcl` | `identity_security_config` = the D-OP-1 value |
| `infra/aws/stack/envs/nonprod.expected-changes.json` | 33 create + 4 replace, as above |

No PR is opened now on purpose: every value it needs (five digests) exists only after the 3.5.10
build and the owner's publish approval, and a placeholder PR would be mergeable by mistake. Claude
opens it from this template the same day the digests exist.

## 3. Apply 2 change set (prepared, values pending)

`nonprod.tfvars`: Docs `images` (`docs_api`, `docs_web`, `docs_antivirus`, `docs_migrate`, all one
Docs commit); `control_licence_kid = "control-licence-nonprod-2026-11"` and
`control_licence_public_key` (the **public** key, read as MunaxaReadOnly from the licence KMS key
after Apply 1); `control_operator_organisation_id` and `control_operator_subjects` (the ids above);
`db_bootstrap_products = ["identity", "control"]`; `secret_version_ids` + `control-api`,
`control-migrate` (Control bundles) and `docs-api`, `docs-operator`, `docs-migrate` (Docs bundles).
The Stage E manifest's db-admin family is updated for the new db-admin revision. Declaration: 42
create + 3 replace, from a fresh offline plan in that PR.

## 4. Runbook, Stages 1 to 7

Who: **[C]** Claude (repository, standing merge rule) · **[C+yes]** Claude after the owner's yes ·
**[O]** owner only.

### Stage 1: image readiness (after D-SSL clears)
1. [C] File 04 §3: bump PRs green with 0 HIGH / 0 CRITICAL, then control#14 → control#12 → docs#181 → docs#178.
2. [C] Confirm the `main` CI image jobs: Identity api + migrate; Control api, migrate, portal; Docs
   api, web, worker, migrate (+ antivirus, Ubuntu ClamAV, its own scan). Record run ids, `main`
   SHAs, and `git merge-base --is-ancestor <#14 merge> <control main>`.
3. [C+yes] / [O approves `image-release`] Publish (`image/<sha>` tag per repository). The workflow
   scans before every push; nothing is pushed on a failing scan. Record every immutable digest.
   **Docs migrate needs the Docs bootstrap apply (file 07 item 3a) first** (repository `munaxa-docs/migrate`).

### Stage 2: Apply 1
[C] PR from §2 with the real digests; CI green; merge. [O] Actions → AWS Terraform → `nonprod`,
`plan` → Claude checks it matches 33 create + 4 replace → [O] yes → `apply` (environment approval).
Stop if the plan differs (the workflow also refuses).

### Stage 3: Apply 2
[C] PR from §3 (licence public key read as ReadOnly; bundle ids from the owner's Session 1 output);
plan → [O] yes → apply. Expect 42 create + 3 replace.

### Stage 4: operator console
[O] github.com → `munaxa/munaxa-platform` → Settings → Environments → `aws-nonprod-session` →
Variables → `OPERATOR_CIDRS` = your current public IPv4 as `/32` (find it on any "what is my IP"
page; example format `203.0.113.7/32`). Type it **only in GitHub**: never in chat, never in a file.
Never `0.0.0.0/0` (Terraform refuses it). Unset = operator host closed. Expected in the next `up`
log: "Operator source ranges: 1 (values masked)".

### Stage 5: Control session
a. [C+yes] Actions → AWS Testing session → `up`, counts identity 1, control-api 1, control-portal 1,
   `hard_stop_utc` same day before 21:00 UTC (the H-20 gate refuses `up` otherwise).
b. [C+yes] db-admin task → exit 0. c. control-migrate → exit 0. d. health checks (Identity, Control API).
e. [O] Cloudflare DNS: CNAMEs `operator-test`, `id.test`, `control-api.test` → the ALB name Claude
   sends, **DNS only (grey cloud)**.
f. [O] Open `https://operator-test.munaxa.com` from your address; sign in with Munaxa Identity; first
   time: enrol an authenticator app (TOTP) and keep the recovery codes offline (never send them).
   Claude confirms from the runner that the operator host answers 403 from any other address.
g. [O] Issue the Docs deployment credential in the Control portal (shown once, never sent to anyone);
   store it with `replace-key CONTROL_PLANE_TOKEN` (file 03 §2); send the docs-api `version_id`.
h. [C+yes] `down` (or continue straight into Stage 6 the same day).

### Stage 6: Docs session
a. [C] PR pinning the new docs-api version (2 replacements); [O] yes → apply.
b. [C+yes] `up` with identity, control-api, docs-api, docs-web, docs-scanner and `hard_stop_utc`.
c. docs-db-admin → exit 0. d. docs-migrate → exit 0.
e. [O] `docs-testing-secrets.sh provision-create` (type CREATE; admin e-mail, name, password typed
   only in CloudShell). f. [C+yes] docs-provision task → exit 0 (4 = already provisioned).
g. [O] `provision-delete` (type DELETE) → `status` shows the provision secret absent.
h. [O] Cloudflare CNAME `docs.test` → ALB, DNS only.
i. Checks: [C] `GET https://docs.test.munaxa.com/api/health/live` → **200**; [C] `GET /login` → **200**;
   [O] sign in through Munaxa Identity; [C/O] a licensed route → **200, not 402** (licence validated
   against Control); [O] upload a small test file → stored in the `munaxa-nonprod-*` Docs bucket by
   the **ECS task role** (no keys; docs#178 runbook).
Any failure: go to Stage 7.

### Stage 7: shutdown (mandatory, same yes as Stage 6)
[C] `down`, then read-only verification (MunaxaReadOnly connector): ECS desired count 0 for every
service; no running tasks; no ALB; RDS `stopping`/`stopped`; one-run provision secret absent; H-20
schedules disarmed; cleanup state machine idle. Independent of Claude: the 21:00 UTC backstop and
the 21:05 UTC cleanup stop everything anyway. [O] Remove the session CNAMEs if wanted.

## 5. Rollback

| Stage | Rollback |
| --- | --- |
| Images | Nothing runs an image until a plan pins it; a bad digest goes into `withdrawn-images.tf` |
| Apply 1 | Previous tfvars: the 33 removed (licence key to pending deletion, cancellable); Identity task definitions back to the 2db6ed9 revisions only by explicit owner decision (those digests are withdrawn: they carry the OpenSSL HIGHs) |
| Apply 2 | Previous tfvars; task definitions return to the earlier revisions; secrets keep their versions |
| Docs pin | Re-pin the previous docs-api version (placeholder); revoke the credential in the Control portal |
| Sessions | `down`; the backstop (21:00 UTC) and cleanup (21:05 UTC) act regardless |
| `OPERATOR_CIDRS` | Delete the variable; the next `up` closes the operator host |

Cost estimates [E] (not billing): Control session about US$0.10-0.20 an hour, Docs session about
US$0.15-0.30 an hour; between sessions about US$6 a month, +about US$1 a month for the licence key.
