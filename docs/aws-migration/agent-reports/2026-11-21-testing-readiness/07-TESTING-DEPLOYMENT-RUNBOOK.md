# 07. Docs Testing deployment runbook (Session 2)

**Nothing here has been executed.** Starts when Alpine ships OpenSSL 3.5.10 and the image scans
pass. Each AWS, publish, DNS, secret or session step needs the owner's explicit yes **at that step**.
A merged PR is never permission to apply, publish or start anything.

Fixed facts: account `229251310592`, Region `eu-central-1`; operator organisation `munaxa-group`
(`071d3060-70ac-4017-9ff9-094ff715051e`), operator subject `ae62eef5-cf65-43c8-83e2-7786d2d5ae87`
(identifiers, not secrets); operator e-mail always `IDENTITY_OPERATOR_EMAIL`. Plans and applies:
munaxa-platform Actions → **AWS Terraform** (`environment=nonprod`, `action=plan`, then `apply`);
the apply refuses any plan that differs from `infra/aws/stack/envs/nonprod.expected-changes.json`.
Sessions: Actions → **AWS Testing session** (`up` with `hard_stop_utc`, `down`).

Who: **[C]** Claude (repository, under the standing merge rule), **[C+yes]** Claude operates after
the owner's yes, **[O]** owner only.

| # | Step | Who | Exact action | Expected | Stop if |
| --- | --- | --- | --- | --- | --- |
| 1 | Merge image remediation | C | identity#24, control#13, docs#182 ready → green → merge (pins adjusted if Alpine ships `-r1`) | each image job: Grype 0 HIGH / 0 CRITICAL | any HIGH/CRITICAL |
| 2 | Merge deployment PRs in order | C | control#14 → control#12 → docs#181 → docs#178 (each updated to `main`, re-run, merge on green) | `main` contains control#14 before any Control image build | a required check fails |
| 3 | Confirm `main` scans | C | read the `main` CI runs of identity, control, docs | 0 HIGH, 0 CRITICAL; run ids recorded | otherwise |
| 4 | Record SHAs | C | the three `main` commit SHAs; check control `main` contains #14 (`git merge-base --is-ancestor`) | three SHAs sent to the owner | |
| 5 | Publish images | C+yes / O approves | for each repo: push tag `image/<sha>` on that SHA (Claude after yes, or owner); owner approves the `image-release` environment in the run | Identity api, migrate; Control api, migrate, portal; Docs api, web, worker, migrate (+ antivirus); every digest recorded; scan before push passes | scan fails (nothing is pushed) |
| 6 | **Apply 1**: Control C-1 + Identity pin + Identity MFA | C (PR), O (plan/apply yes) | Claude's PR: Control digests; Identity api/migrate digests in `envs/nonprod.tfvars`, `envs/nonprod.stage-e-tasks.json` and E-1 fixtures; `identity_security_config = { mfa_primary_kid = "mfa-nonprod-2026-11", mfa_policy = "privileged", mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"] }` and the same `MFA_POLICY`/`MFA_PRIVILEGED_ROLES` in the Stage E manifest; `9a8c6ebd…` and `5f3bdcce…` to `withdrawn-images.tf`; declaration; offline plan; CI green; merge. Then plan → owner yes → apply | **33 add** (Control C-1) **+ Identity task-definition replacements, 0 destroy**; no `operator_access` | plan differs from declaration (workflow refuses) |
| 7 | **Apply 2**: Control C-2 + Docs D-1 | C (PR), O (yes) | PR: `control_licence_public_key` (read with ReadOnly after Apply 1) and kid `control-licence-nonprod-2026-11`; operator organisation and subject above; `db_bootstrap_products = ["identity","control"]`; Control bundle ids (Session 1 item 3) and Docs bundle ids (item 5); Docs digests; Stage E manifest update for the new db-admin revision; declaration from a fresh offline plan | C-2 0 add / 3 replace / 0 destroy; D-1 about 42 creates (exact number in the PR) | differs |
| 8 | `OPERATOR_CIDRS` | O | github.com → munaxa-platform → Settings → Environments → `aws-nonprod-session` → Variables → `OPERATOR_CIDRS` = your current public IPv4 as `/32` (for example `203.0.113.7/32`). Typed in GitHub only; never in chat or a repository; never `0.0.0.0/0` (Terraform refuses it) | `up` logs "Operator source ranges: 1 (values masked)" | |
| 9 | **Control session** | C+yes; O for DNS and sign-in | a. `up` with identity 1, control-api 1, control-portal 1, `hard_stop_utc` (same day, before 21:00 UTC). b. db-admin task. c. control-migrate. d. health checks. e. **[O] Cloudflare DNS**: CNAME `operator-test` → the ALB name Claude sends, **DNS only (grey)**, plus `id.test` and `control-api.test` as before. f. **[O]** open `https://operator-test.munaxa.com` from your address, sign in to Munaxa Identity; first time: enrol an authenticator app (TOTP), keep the 10 recovery codes offline (never send them). | session creates 19 resources; db-admin and migrate exit 0; control-api healthy; operator host answers 403 from any other address (Claude checks from the runner) | any non-zero exit; health fails |
| 10 | **Docs credential** | O | Control portal → issue the Docs deployment credential (`mxc_…`). Shown once. Do not send it to anyone; keep the browser tab until step 11 | one credential id (Claude records the id only) | |
| 11 | **Docs credential custody and pin** | O (CloudShell, Engineering), C (PR), O (yes) | `/bin/bash -p ./docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN` (type REPLACE, paste the credential at the hidden prompt) → `status` shows `control_token   mxc`; send the new docs-api `version_id`. Claude's PR pins it (declaration: one docs-api task-definition replacement); plan; owner yes; apply | plan = exactly the docs-api task-definition replacement | anything else |
| 12 | **Docs session** | C+yes; O for secrets and DNS | a. `up` with identity, control-api, docs-api, docs-web, docs-scanner and `hard_stop_utc`. b. **db-admin** (creates `edms_owner`/`edms_app`), exit 0. c. **docs-migrate**, exit 0. d. **[O]** `docs-testing-secrets.sh provision-create` (type CREATE; admin e-mail, name, password typed in CloudShell). e. **docs-provision** task: exit 0 (or 4 = already provisioned). f. **[O]** `provision-delete` (type DELETE) → `status` shows `provision … absent`. g. **[O]** Cloudflare CNAME `docs.test` → ALB, DNS only. h. Checks (Claude): `GET https://docs.test.munaxa.com/api/health/live` → 200; `GET /login` → 200; **[O]** sign in through Munaxa Identity; a licensed route returns 200 (not 402) = licence validated against Control; upload a test file → stored in the `munaxa-nonprod-*` bucket by the **task role** (no keys; docs#178 runbook) | all exits 0; health 200; sign-in works; licence 200; upload succeeds | any failure: go to 13 |
| 13 | **Shutdown and cleanup verification** | C (same yes as 12) | `down`; then read-only verification as `MunaxaReadOnly`: ECS desired 0 for every service, no running tasks, no ALB, RDS `stopping`/`stopped`, the one-run provision secret absent, H-20 schedules disarmed, cleanup state machine idle; **[O]** remove the session CNAMEs if wanted (they point at nothing after `down`) | all true; report attached to the session report | otherwise the 21:00 UTC backstop and the 21:05 cleanup still stop everything |

## Rollback per stage

| Stage | Rollback |
| --- | --- |
| Images | Nothing runs an image until a plan pins it; a bad digest goes into `withdrawn-images.tf` |
| Apply 1 | Previous tfvars: the 33 are removed (KMS key to pending deletion, cancellable); Identity returns to the earlier revision (MFA policy `off`) |
| Apply 2 | Previous tfvars; task definitions return to the earlier revision; secrets keep their versions |
| Docs pin | Re-pin the previous docs-api version (placeholder); revoke the credential in the Control portal |
| Sessions | `down`; the backstop (21:00 UTC) and cleanup (21:05 UTC) act regardless |
| `OPERATOR_CIDRS` | Delete the variable; the next `up` closes the operator host |

## Session hard stop

Every `up` needs `hard_stop_utc`; the H-20 gate refuses `up` unless the hard stop and cleanup are
armed. Plan each session for under three hours, ending before 21:00 UTC (the backstop). Estimated
cost while up: Control session about US$0.10 to 0.20 an hour, Docs session about US$0.15 to 0.30 an
hour [E]. Nothing is left running: step 13 is part of the same approval as step 12.

## Not in this deployment

Work and School are not started. Production is not touched. Cloudflare Access is not used.
