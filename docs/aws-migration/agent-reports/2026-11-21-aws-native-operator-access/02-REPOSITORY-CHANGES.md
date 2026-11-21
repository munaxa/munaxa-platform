# 02. Repository changes and reference classification

## 1. Pull requests from this task

| Repository | PR | Content | State at writing |
| --- | --- | --- | --- |
| munaxa-control | [#14](https://github.com/munaxa/munaxa-control/pull/14) | Code: Cloudflare Access optional in the API and portal; production without it requires `OPERATOR_REQUIRE_MFA=true` and `OPERATOR_SUBJECT_ALLOWLIST`; docs and `.env.example` | Open. Verify job green; image job red on D-SSL only (see 04) |
| munaxa-identity | [#25](https://github.com/munaxa/munaxa-identity/pull/25) | Docs: `docs/runbooks/aws.md` MFA paragraph | **Merged** `d6225ff` |
| munaxa-platform | [#154](https://github.com/munaxa/munaxa-platform/pull/154) | Terraform validation and Control env, mocked tests, session workflow `OPERATOR_CIDRS`, workflow test, `OPERATOR-ACCESS.md`, README/CONTRACT/ACCESS-POLICY/cloudflare-access.md, tfvars comments, this report and the index entry | This PR; merged once CI is green (see 04) |

munaxa-docs, munaxa-work and munaxa-school: **no change needed** (no Cloudflare Access dependency;
§3).

## 2. What each change does

### munaxa-control (#14)

| File | Change |
| --- | --- |
| `apps/api/src/config/environment.ts` | Production without `OPERATOR_ACCESS_*` no longer fails "required in production (Cloudflare Access)"; it fails unless `OPERATOR_REQUIRE_MFA=true` **and** a non-empty `OPERATOR_SUBJECT_ALLOWLIST`. Half a configuration still fails. With Access set, unchanged |
| `apps/portal/src/lib/access.ts` | No settings = Access off in production too (was 503). Half a configuration still answers 503 |
| `apps/portal/src/middleware.ts`, `apps/api/src/auth/authentication.guard.ts`, `apps/api/src/auth/cloudflare-access.ts` | Comments: Access optional |
| `apps/api/src/config/environment.spec.ts` | Two new refusals (no Access + no MFA; no Access + no allow-list) and one acceptance test |
| `apps/portal/src/lib/access.spec.ts`, `apps/portal/src/middleware.spec.ts` | Production without Access goes to the Identity session check; half-configured Access still 503 |
| `.env.example`, `docs/operations/deployment.md` | Access marked optional; new section "Operator access (AWS-native default)" |

### munaxa-platform (#154)

| File | Change |
| --- | --- |
| `infra/aws/stack/variables.tf` | `operator_access` validation: Control without Access now needs `identity_security_config.mfa_policy` `privileged`/`all` (was: always needs Access). Descriptions of `operator_access`, `operator_cidrs`, `control_operator_subjects` |
| `infra/aws/stack/services.tf` | `local.control_require_mfa`; Control API `OPERATOR_REQUIRE_MFA` follows it (was hard-coded `"false"`); comments |
| `infra/aws/stack/tests/stack.tftest.hcl` | `control_without_access_or_identity_mfa_is_refused`, `control_with_identity_mfa_off_and_no_access_is_refused`, `control_runs_aws_native_without_cloudflare_access` |
| `infra/aws/stack/envs/nonprod.tfvars` | Comments only (no value changed) |
| `.github/workflows/aws-session.yml` | "Plan the switches" passes `-var operator_cidrs=[…]` from `vars.OPERATOR_CIDRS` (masked), only when set |
| `scripts/aws/connector/test_session_cleanup_gate_workflow.py` | Test: ranges come from the variable, are masked, never from the repository; tfvars keeps `operator_cidrs = []`; the workflow names no Cloudflare setting |
| `infra/aws/OPERATOR-ACCESS.md` | New: the operator access model and procedures |
| `infra/aws/README.md`, `CONTRACT.md`, `ACCESS-POLICY.md`, `cloudflare-access.md` | Updated to the new model; Cloudflare Access file kept, marked OPTIONAL |

**Plan impact for the current nonprod configuration: none.** No Control image is set in
`nonprod.tfvars`, so the Control module (the only consumer of `OPERATOR_REQUIRE_MFA`) is not
instantiated; listener rules 30/31 exist only during a session with ranges; tfvars values are
unchanged. The Stage E manifest test (`stage-e-manifest.tftest.hcl`) still passes. The nightly
scheduled `down` runs without `OPERATOR_CIDRS`, which is the old behaviour byte for byte.

## 3. Classification of every Cloudflare Access reference (before this task)

Search terms: Cloudflare Access, Zero Trust, operator-test.munaxa.com, CLOUDFLARE_ACCESS, CF_ACCESS,
Access AUD, team domain, Cloudflare tunnel, cloudflared, `Cf-Access-Jwt-Assertion`,
`OPERATOR_ACCESS_*`, `cloudflareaccess`, operator access. Agent reports excluded (historical).

| Where | Reference | Class | Action |
| --- | --- | --- | --- |
| control `config/environment.ts` | Production refused to start without `OPERATOR_ACCESS_*` | **Mandatory deployment dependency** | Made optional with stricter Identity rules (#14) |
| control portal `lib/access.ts`, `middleware.ts` | Production portal answered 503 without Access | **Mandatory deployment dependency** | Made optional (#14) |
| control `auth/cloudflare-access.ts`, guard, `app.module.ts`, harness, e2e and unit specs, `lib/api.ts` (header forwarding) | Token verifier and its wiring | Optional access feature | Kept; still tested |
| control `.env.example`, `docs/operations/deployment.md` | "Required in production" | Mandatory (documented) | Rewritten as optional |
| platform `stack/variables.tf` validation "Control's API and portal need operator_access" | Terraform refused any Control image without Access | **Mandatory deployment dependency** | Replaced (#154) |
| platform `stack/services.tf` `operator_access_environment`, rule source ranges | Passes Access settings when set | Optional access feature | Kept |
| platform tests (`stack`, `identity-cache`) using `operator_access` | Fixtures | Optional access feature | Kept; new tests added |
| platform `envs/nonprod.tfvars` comments; `README.md` G6/G7; `CONTRACT.md` | "Proxied", "required before any Control image" | Mandatory (documented) | Rewritten |
| platform `infra/aws/cloudflare-access.md` | The 29 Oct design | Optional feature / historical | Marked OPTIONAL with a banner |
| sprint pack `05-OWNER-EXECUTION-PACK.md` item 2, items 8 and 10 | Owner action: create Access app, send team domain and AUD; sign in through Access | **Mandatory owner action** | Superseded by file 05 here (the old report is not edited) |
| platform `docs/security/2026-11-20-…md` line 389 | "A-7 (Cloudflare Access, C-1)" | Historical | Kept |
| identity `docs/runbooks/aws.md` | "operator host sits behind Cloudflare Access" | Mandatory (documented) | Rewritten (#25) |
| platform `scripts/aws/connector/e1-task-guard.py`, `envs/nonprod.stage-e-tasks.json`, probe `identity-session-probe.mjs` and tests, `envs/nonprod.tfvars` `hosts.operator`, `certificate_domains` | The hostname `operator-test.munaxa.com` (probe host, CSRF origin, certificate) | Not an Access dependency (hostname only) | Kept; name stays on the issued certificate |
| school `deploy-cloudflare.yml`, `munaxademo/` (Workers) | School public demo on Cloudflare Workers | Existing Cloudflare functionality | Not touched |
| docs storage (`s3.adapter.ts`, config) | Cloudflare R2 compatibility | Existing Cloudflare functionality | Not touched |
| work `docs/verification/*`, prompts | "access audit" (false match) | Not related | none |
| GitHub Actions (all six repositories) | No Cloudflare Access token, secret or step anywhere | n/a | none needed |

No Cloudflare tunnel (`cloudflared`) exists in any repository. No Cloudflare Access credential,
token, team domain or AUD is stored as a secret or variable by any workflow.

## 4. After the change

Re-run of the same search: the remaining matches are the optional feature (Control's verifier and
its tests, Terraform's optional `operator_access`), documents that now call it optional
(`cloudflare-access.md`, `OPERATOR-ACCESS.md`, README, CONTRACT, ACCESS-POLICY, tfvars comment,
Control deployment doc, Identity runbook), and the historical security report. **No mandatory
deployment path, workflow, owner step or startup check requires Cloudflare Access.**
