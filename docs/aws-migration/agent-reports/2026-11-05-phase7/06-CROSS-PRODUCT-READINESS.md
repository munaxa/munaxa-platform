# 06 Cross-product readiness (Phase 7, Agent 6)

> **Lead note (Phase 7 consolidation).** The two GHCR dispatch-only patches named below were merged by the lead as code-only PRs: [munaxa-identity#6](https://github.com/munaxa/munaxa-identity/pull/6) (`5277d71`) and [munaxa-work#29](https://github.com/munaxa/munaxa-work/pull/29) (`b490b25`). Neither can publish on merge, because their only trigger is now `workflow_dispatch` [V-repo]. Findings F-1 to F-4 (README G7 order, config PRs needing their own services-off apply, the Work role assignment, stale text) are not fixed yet. They are listed in `09-OWNER-ACTIONS.md` as follow-up code work. PR #43 is merged as `6b8997a`.


Date: 5 Nov 2026 (UTC). Scope: the a6 part of munaxa/munaxa-platform#43 (head e78aa92), the two Phase 6
product patches for Identity and Work, and the prerequisites of Docs, Work, School, Identity and Control
for the first Testing session in the shared stack.

What I did not do: no AWS call (no AWS MCP, no aws CLI, no credentials), no GitHub write, no image
publication, no secret, no DNS, no migration, no workflow dispatch. GitHub was read with the
`mcp__github__*` read tools and one `gh api -X GET search/issues` call. I read the anonymous public
registry API at `public.ecr.aws` (token endpoint, tag lists and manifest HEADs, no credentials, no pull).
Blob downloads were blocked by the sandbox proxy. Local `terraform test` ran with the mocked provider.
A local Terraform test is not an AWS IAM simulation and proves nothing about live AWS behaviour.

Labels: [V-repo] repository evidence, [V-gh] GitHub API evidence, [V-aws] live AWS evidence (none here),
[L] local run or anonymous public-registry query from this sandbox, [E] inference, [U] unverified,
[O] owner action required.

Working copies: platform worktree `/tmp/claude-0/phase7/a6/wt` (detached at e78aa92); product trees
exported from `origin/main` into `/tmp/claude-0/phase7/a6/main/<product>`; patch-check clones
`/tmp/claude-0/phase7/a6/chk-identity` and `chk-work`. No clone under `/home/claude` was modified.

## 1. Repository heads

`git fetch origin main` then `git rev-parse origin/main`, 5 Nov 2026 about 06:40 UTC [V-repo].

| Repository | origin/main | Note |
| --- | --- | --- |
| munaxa-platform | 7cd448d733790eb0b57a3800d71185831f659182 | PR #43 head e78aa926000eb1830479a3ca81d39307f509d2f1 |
| munaxa-identity | 4001ed874ba8a39a9a49880d341793976c8a7436 | unchanged since Phase 6 (#5) |
| munaxa-control | a24c5681f0ca98f446098444c79bc36cd4d9bc0c | unchanged since Phase 5 (#7) |
| munaxa-work | f812dfe6bc16c8a30fdc2b389b260018102854dc | unchanged since Phase 6 (#28) |
| munaxa-school | 54cf3eb7b0e07a1b8a08d261cd324fa6f30d9687 | unchanged since Phase 5 (#23) |
| munaxa-docs | b8c7e252bb6292f74eba3cb88dcb8a1a5f24a6f9 | unchanged since Phase 5 (#174) |

## 2. Open pull requests

`list_pull_requests state=open` per repository, cross-checked with `search/issues q=org:munaxa is:pr
is:open` (total_count 1) [V-gh].

| Repository | Open PRs |
| --- | --- |
| munaxa-platform | #43 "fix(aws): phase 6 security and shutdown patches (p6-01, p6-02, P1-P4, a6), backstop off for G3", head e78aa92 |
| munaxa-identity | none |
| munaxa-control | none |
| munaxa-work | none |
| munaxa-school | none |
| munaxa-docs | none |

Tags [V-gh, `list_tags`]: Identity, Control, Work and School have no tags at all, so **no ECR image has
ever been published for them**. Docs has seven `image/*` tags. Its last publish run is still 40225272398
(25 Oct 2026, tag `image/f8a8bea6...`, success). School's `publish-images-ecr.yml` has 0 runs.

## 3. Review of the a6 part of PR #43

### 3.1 Is the patch in the PR?

- `git apply --check -R` of `platform-a6-readiness-and-logs.patch` on e78aa92 fails only in
  `stack.tftest.hcl` and `aws-session.yml`, because other Phase 6 patches touch the same hunks. I compared
  the remaining hunks by hand: `variables.tf`, `README.md`, `CONTRACT.md` and `aws-terraform.yml` match the
  patch exactly, and the a6 lines in `aws-session.yml` (apply stdout to `/dev/null`) are present [V-repo].
- `terraform test` in `infra/aws/stack` on e78aa92: **24 passed, 0 failed** (Terraform 1.16.5, mocked
  provider, no credentials) [L]. This matches the lead's result.

### 3.2 Does it publish, write secrets or deploy?

No [V-repo].

- `variables.tf`, `stack.tftest.hcl`, `README.md` and `CONTRACT.md` are validations, tests and text.
  They do not add resources, data sources or outputs.
- `aws-terraform.yml`: the `paths` filter on `pull_request` is removed. The only job that runs on a PR is
  `static` (`if: github.event_name == 'pull_request'`, no `id-token`, no environment). `plan` and `apply`
  still need `workflow_dispatch` on `main` and the `aws-<env>` environment. The `terraform apply` stdout now
  goes to `/dev/null`. Errors still go to stderr, and the exit code is kept.
- `aws-session.yml` (a6 part): the same stdout redirect, plus a summary line. Nothing new is triggered.
- [E] Merging #43 does turn on the two new P1 crons (`17 19 * * *`, `47 1 * * *`), and they run `down`
  every day. That is P1, not a6. Until the nonprod state exists, `down` stops at "not applied yet".

### 3.3 Each validation against the product code

| Validation (stack `variables.tf`) | Product requirement | Verdict |
| --- | --- | --- |
| `valkey_image` must be set when `images.identity_api` is set and `services_enabled` | The stack sets `NODE_ENV=production` for Identity (`services.tf` identity env). Identity refuses an empty `REDIS_URL` in production (`munaxa-identity/packages/config/src/environment.ts`, refine, "REDIS_URL is required in production"). `openCache` creates ioredis with `lazyConnect` and then `await client.connect()` (`apps/api/src/platform/cache.ts` lines 50-51), so startup fails when nothing listens on 127.0.0.1:6379. Readiness also checks the cache (`health.controller.ts`) | Correct [V-repo] |
| `valkey_image` regex accepts `public.ecr.aws/valkey/valkey@sha256:` | See 3.4 | Correct. The `docker/library/valkey` branch can never be satisfied, so it is dead but harmless |
| `identity_signing_kid` is 3 or more characters and listed in `identity_public_keys` | `IDENTITY_SIGNING_KID: string({ minLength: 3 })` (Identity `environment.ts`). Work selects keys by `kid` (`munaxa-work/packages/config/src/platform-authentication.ts`), and Control needs `kid` per key (`munaxa-control/apps/api/src/config/environment.ts` lines 144-163). `pnpm keys:generate` prints `PLATFORM_AUTH_PUBLIC_KEYS=[{kid, publicKey}]` (`apps/api/scripts/generate-signing-key.mjs` line 42), the shape the validation reads | Correct [V-repo] |
| `identity_public_keys` must not be empty when `work_api` runs | The stack always sets `PLATFORM_AUTH_ISSUER`, `_AUDIENCE` and `_ALGORITHM` for work-api, so `PLATFORM_AUTH_PUBLIC_KEYS="[]"` counts as supplied. `readKeys` then fails with "must be a JSON array holding at least one key", and `loadEnvironment` refuses to start (`platform-authentication.ts` lines 172-175, 231-245; `environment.ts` `refineEnvironment`) | Correct [V-repo] |
| control-api above 0 tasks needs `control_licence_public_key` (PEM), `control_licence_kid`, `control_operator_organisation_id`, `control_operator_subjects` and `identity_public_keys` | Control `environment.ts`: `LICENCE_SIGNING_PUBLIC_KEY` is required when `LICENCE_SIGNING_BACKEND=KMS` and must be a P-256 SPKI PEM (lines 281-298); `LICENCE_SIGNING_KID` min 1, max 64 (line 84); `OPERATOR_ORGANISATION_ID` min 1 (line 45); the allow-list is required in production while MFA is off (lines 219-222); `OPERATOR_AUTH_PUBLIC_KEYS` must hold at least one key (line 196). The stack sets `NODE_ENV=production`, `OPERATOR_REQUIRE_MFA=false` and `LICENCE_SIGNING_BACKEND=KMS` | Correct [V-repo]. Two small gaps: Terraform does not check kid length 64 or less, and it does not check the P-256 curve. Control still refuses both at startup |
| (existing) Control images need `operator_access` | Control requires `OPERATOR_ACCESS_TEAM_DOMAIN` and `_AUDIENCE` in production (lines 225-243) | Correct [V-repo] |
| README: `CONTROL_PLANE_TOKEN` at least 20 characters (Work, School) and 32 (Docs) | Work `z.string().min(20)` (`packages/config/src/environment.ts` line 119); School `min(20)` (`apps/api/src/config/env.validation.ts` line 68); Docs `min(32)` (`apps/api/src/core/config/configuration.ts` line 635). All three are in `LICENSING_MODE=CONTROL_PLANE` in the stack | Correct [V-repo] |
| README: `seed-work-roles` from the identity-bootstrap task, then restart `identity` | Script `apps/api/scripts/seed-work-roles.mjs` takes `--organisation` and reads `DIRECT_DATABASE_URL`, which the task injects. The runtime `WORKDIR` is `/app/apps/api`, so `node scripts/seed-work-roles.mjs` resolves, and `/app/artifacts` is copied in (Dockerfile lines 141, 144). The script itself prints "RESTART IDENTITY BEFORE THESE ROLES TAKE EFFECT" (line 143) | Correct [V-repo]. Incomplete, see F-3 |
| CONTRACT §6 and README: host must be the endpoint DNS name | Identity runbook `docs/runbooks/aws.md` "TLS to the database"; both Dockerfiles use `NODE_EXTRA_CA_CERTS` | Correct [V-repo] |

### 3.4 The valkey path claim

Anonymous queries to the ECR Public registry API, 5 Nov 2026 06:53 UTC [L]:

- `public.ecr.aws/v2/docker/library/valkey/tags/list` answers `NAME_UNKNOWN: The repository with name
  'library/valkey' does not exist in the registry with id 'docker'`. **The old regex named a repository
  that does not exist.**
- `public.ecr.aws/v2/valkey/valkey/tags/list` answers 200 with 203 tags.
- Index digests read from the manifest HEADs:

  | Reference | Index digest |
  | --- | --- |
  | `public.ecr.aws/valkey/valkey:8-alpine` = `8.1-alpine` = `8.1.11-alpine` | `sha256:2602ace2be6569bc2bbb06f873776516ab9089821525be34f4305c67eb9db02a` |
  | `public.ecr.aws/valkey/valkey:8` = `8.1` (Debian) | `sha256:8f836008e0986c36adf50da714c7060cf689dbb335f61fe077939d90fa650809` |
  | `public.ecr.aws/docker/library/postgres:16-alpine` | `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab` |
  | `public.ecr.aws/docker/library/postgres:16` | `sha256:5db6dac2ef5dcff512f4f00a009c3c332b9f2f28f24277175bf3e4a3d02ef83a` |
  | `public.ecr.aws/docker/library/redis@sha256:c6eabf74...` (the pinned `docs_redis_image`) | exists (HTTP 200) |

  These match the Docker Hub digests that Phase 6 recorded, so the ECR Public mirrors serve the same index
  digests.
- [U] The image config (user 999, `sh`, `valkey-cli`) could not be read, because blob downloads through
  CloudFront were refused by the proxy. The sidecar runs as `999:999` with `sh -c` and `valkey-cli`
  ([E]: present in both the Alpine and Debian variants).
- [O] Before the tfvars PR, the owner should confirm the digest once more in the ECR Public Gallery. Tags
  move, so re-read the digest on the day of the PR.

### 3.5 Findings on the a6 text (none blocks merging #43)

- **F-1 (Medium, documentation ordering).** README G7 step 0b lists `operator_access` among the values set
  *after* the services-off apply. But the existing validation "Control's API and portal need
  operator_access" fires whenever a Control image is set, even with `services_enabled = false`
  (`variables.tf` operator_access, second validation). `nonprod.tfvars` already says "Required before any
  Control image is set". So step 0a cannot be merged until `operator_access` is set. Fix: move
  `operator_access` into step 0a.
- **F-2 (Medium, documentation ordering).** Steps 0b and 0c say "set by PR ... then dispatch `up` again".
  Every such value (`control_licence_*`, `control_operator_*`, `identity_*`, `secret_version_ids`, image
  digests) changes an `aws_ecs_task_definition`. Task definitions exist even with services off
  (`modules/service/main.tf` line 212 has no count). The session workflow refuses any change outside
  `aws_lb*`, `aws_acm_certificate_validation`, `aws_ecs_service` and `aws_service_discovery_service`
  (`aws-session.yml`, "unexpected" jq filter). So each of those PRs needs its own `aws-terraform.yml`
  apply with services off and an updated `envs/nonprod.expected-changes.json`, before `up`. Otherwise `up`
  stops at the plan check. That is safe, because it fails closed, but the runbook should say it.
- **F-3 (Low, incomplete).** For Work sign-in, `seed-work-roles` is not enough on its own. The script grants
  no assignment ("Grant a role to an account with db:bootstrap-account --role", line 143). Work's own
  runbook (`munaxa-work/deploy/aws/README.md` "The first tenant on a fresh database") also needs:
  - a `work-migrate` command override running `bootstrap-tenant.mjs --platform-user-id <sub>`;
  - linking the tenant id to a customer as `tenantRef` in Control, with a subscription;
  - assigning a `work:*` role in Identity.
  None of these are in platform README G7.
- **F-4 (Low, stale text).** The `valkey_image` description still says
  `public.ecr.aws/docker/library/valkey@sha256:…`. README G7 step 5 says the operator host "answers 403
  from outside `operator_cidrs`", but with `operator_access` set the host takes any source and Access
  decides. Step 6 says "The 20:00 UTC schedule", but the crons are now 19:17 and 01:47, plus the AWS
  backstop at 21:00 once it is enabled. README has no "### G6" heading. DNS validation is only mentioned in
  G3 step 3 and G7 step 2.
- **F-5 (Info).** The Identity validation ignores `desired_counts.identity = 0`, which makes it stricter than
  it needs to be. The control-api validation uses `lookup(..., 1) == 0` and only looks at `control-api`.
  `control-portal` needs no Control-specific values, so that is fine.

## 4. Phase 6 product patches (Identity and Work GHCR workflows)

Checked on fresh clones of `origin/main` (Identity 4001ed8, Work f812dfe) [V-repo]:

| Patch | `git apply --check` | Still needed? |
| --- | --- | --- |
| `identity-ghcr-no-release-tag-and-runbook.patch` | applies cleanly | Yes. `publish-images.yml` still has `push: tags: image/**`, the same trigger as `publish-images-ecr.yml` |
| `work-ghcr-no-release-tag.patch` | applies cleanly | Yes. Same double trigger. Work's GHCR job also uses tag-pinned actions (`actions/checkout@v6` and others) |

What they change: they remove the `push: tags: image/**` trigger from the GHCR workflow and keep
`workflow_dispatch`. The Identity patch also corrects the runbook's MFA paragraph, which still said the
operator host is limited to `operator_cidrs`. That matches `infra/aws/cloudflare-access.md` lines 35-41,
the MFA Require rule.

Why it matters: both GHCR workflows have `packages: write`, no `environment`, and pass
`secrets.PLATFORM_PACKAGES_TOKEN` into the build. As things stand, the first ECR release tag pushed in
Identity or Work also runs this ungated job and publishes to GHCR (a legacy hosting path, otherwise out of
scope here).

Safe on merge: yes [V-repo]. Both files are workflow-trigger and documentation changes only. After the
change, `yaml.safe_load` shows the only trigger is `workflow_dispatch`. Merging to `main` starts neither
workflow (no `push: branches` trigger). Nothing is published, and no secret is read or written.

Adjustments: the original patches left header comments that contradict the new trigger. Identity's says
"a tag, or a dispatch". Work's says "Tag-triggered, not push-triggered ... A tag works from any commit".
Identity's runbook also says the GHCR workflow "is unchanged". I produced final versions that also fix those
comments. Both apply cleanly to `origin/main`:

- `/tmp/claude-0/phase7/a6/identity-ghcr-dispatch-only.patch` (2 files, +9/-6): workflow trigger, header
  comment, runbook line 22 and the MFA paragraph.
- `/tmp/claude-0/phase7/a6/work-ghcr-dispatch-only.patch` (1 file, +7/-8): workflow trigger and the header
  paragraph.

Use these instead of the Phase 6 versions. Not reviewed: the legacy hosting documents that may tell
someone to push a tag to run the GHCR job. They are out of scope.

Related, not patched: Control (`publish-images.yml`) and Docs (`publish-images.yml`) trigger on `image/**`,
but both are ECR-only, behind `image-release`, with a main-ancestry check [V-repo]. School's ECR workflow is
dispatch-only with `production-gate` [V-repo].

## 5. Per-product checklist for the first Testing session

Status: Done = verified in code on main; Open = unresolved; [O] = owner action.

### Identity (4001ed8)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| I-1 | RDS roots trusted, verification on | Done [V-repo] | Dockerfile runtime stage `NODE_EXTRA_CA_CERTS`; Phase 6 bundle check |
| I-2 | ECR publish workflow (`image/<sha>` on main, `image-release`) | Done in code; never run, no tags [V-gh] | `publish-images-ecr.yml` lines 73-80 |
| I-3 | GHCR workflow also fires on `image/**` | Open; patch ready (section 4) | `publish-images.yml` lines 13-16 |
| I-4 | `AWS_IMAGE_PUBLISHER_ROLE_ARN` variable, `image-release` reviewers, `image/*` tag ruleset | [U] [O] | no read API for environments |
| I-5 | Signing key (`pnpm keys:generate`); `identity_signing_kid` (3 or more characters) and `identity_public_keys` by PR | Open [O]; validation in #43 | 3.3 |
| I-6 | `valkey_image` = `public.ecr.aws/valkey/valkey@sha256:...` by PR | Open [O]; path verified [L] | 3.4 |
| I-7 | Bundles `munaxa-nonprod/identity` (5 keys, with `REDIS_URL=redis://:<pw>@127.0.0.1:6379` and the same `REDIS_PASSWORD`), `identity-migrate` | Open [O] | `data.tf` 143-145 |
| I-8 | identity-bootstrap steps 0-6, plus `seed-work-roles` and a Work role assignment, then restart | Open [O] | Identity `docs/runbooks/aws.md` 82-111; F-3 |

### Control (a24c568)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| C-1 | ECR publish workflow | Done in code; never run, no tags [V-gh] | `publish-images.yml` |
| C-2 | Cloudflare Access application with the MFA rule; `operator_access` by PR | Open [O]; **blocks merging any Control digest** | `variables.tf` operator_access validation 2 |
| C-3 | Two-step licence key: Control digests with services off, then G3-workflow apply, then `aws kms get-public-key` (DER to PEM), then `control_licence_public_key` and `control_licence_kid` by PR, then apply again | Open [O]; runbook fixed in #43 (with F-1, F-2) | 3.3 |
| C-4 | `control_operator_organisation_id` and `control_operator_subjects` from Identity steps 1-3, by PR, then apply | Open [O] | Identity runbook step 6 |
| C-5 | First session runs control-api and control-portal at `desired_counts` 0 (tfvars PR) | Open [O] | #43 test `the_first_session_runs_control_at_zero...` |
| C-6 | Bundles `control-api` (`DATABASE_URL`), `control-migrate` | Open [O] | `data.tf` 144, 146 |

### Work (f812dfe)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| W-1 | RDS roots trusted (runtime and migrate) | Done [V-repo] | Phase 6 |
| W-2 | ECR publish workflow | Done in code; never run, no tags [V-gh] | `publish-images-ecr.yml` |
| W-3 | GHCR workflow on `image/**` with tag-pinned actions and the package token | Open; patch ready | section 4 |
| W-4 | `identity_public_keys` non-empty | Open [O]; validation in #43 | 3.3 |
| W-5 | Bundle `work-api`: `DATABASE_URL`, `PII_MATCH_SECRET` (not the default, 32 or more characters), `CONTROL_PLANE_TOKEN` placeholder of 20 or more characters (32 recommended) | Open [O] | Work `environment.ts` 86, 119 |
| W-6 | First tenant: `work-migrate` override with `bootstrap-tenant.mjs --platform-user-id <sub> --allow-production`, Control `tenantRef` and subscription, Identity Work role | Open [O]; not in platform G7 | `munaxa-work/deploy/aws/README.md` 21-48 |

### School (54cf3eb)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| S-1 | ECR publish, dispatch-only, `production-gate` | Done in code; 0 runs [V-gh] | `publish-images-ecr.yml` |
| S-2 | `image-release` with reviewers, no admin bypass, tag rule `image/*` (the gate fails closed otherwise) | [U] [O] | `scripts/deploy-gate.mjs` |
| S-3 | Database name: School `docs/ops/aws.md` line 30 says `school_db`, CONTRACT §6 says `school`. `db-bootstrap.sh` takes the name from the URLs and refuses two different names (line 52) | Open [O]; low risk | [V-repo] |
| S-4 | Bundle `school-api`: different JWT secrets, `CONTROL_PLANE_TOKEN` of 20 or more characters, `RESEND_API_KEY` | Open [O] | `env.validation.ts` 68 |
| S-5 | One-run secret `munaxa-nonprod/school-bootstrap` | Open [O] | README G7 step 3 |

### Docs (b8c7e25)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| D-1 | Fresh image. The last one (f8a8bea) is 17 first-parent commits behind main (85 files, +3814/-162 under apps, packages, prisma) and predates CONTROL_PLANE licensing | Open [O] | [V-repo] `git rev-list`; [V-gh] run 40225272398 |
| D-2 | Publisher role `munaxa-docs/bootstrap/munaxa-docs-eu-prod-image-publisher` (hard-coded, workflow line 58) and `munaxa-docs/{api,web,antivirus}` ECR repositories still exist after the eu-prod retirement (#171-#174) | [U] | Docs `infra/terraform/bootstrap/ecr.tf` is still on main [V-repo] |
| D-3 | All three of `docs_api`, `docs_web`, `docs_antivirus` plus `docs_redis_image` are needed, or no Docs service is defined | Open [O] | `docs.tf` 22-24 |
| D-4 | Bundle `docs-api` (11 keys, with `CONTROL_PLANE_TOKEN` of 32 or more characters), `docs-operator`, one-run `docs-provision/munaxa-internal` | Open [O] | `docs.tf` 32-38; Docs `configuration.ts` 635 |
| D-5 | `postgres_image` (docs-db-admin and db-admin) | Open [O]; digest available [L] | 3.4 |

## 6. Deployment order for the first Testing session

Each step names its gate. Nothing here is authorised by this report.

1. **Merge platform #43** (code only; lead and review). [V-gh] open, head e78aa92.
2. **G3 persistent layer** (owner G3 approval): declaration PR with the 64 creates, dispatch
   `aws-terraform.yml` apply, then `aws-session.yml down`. **G6 DNS validation records within 72 h** (owner).
   Then the separate backstop apply (D-4 = B, 13 creates).
3. **Product code PRs** (lead opens, owner merges): the two GHCR dispatch-only patches (section 4). They
   must merge **before** the first `image/*` tag is pushed in Identity or Work.
4. **Repository protection** [O]: `image/*` tag rulesets and `image-release` reviewers in each product
   repository; `AWS_IMAGE_PUBLISHER_ROLE_ARN` set from the bootstrap `image_publisher_role_arns` output
   (05b, [U]).
5. **Cloudflare Access** [O]: the Access application with the MFA Require rule, then record team domain and
   AUD (needed before any Control digest).
6. **Publish images** [O, `image-release` approval each]: tag `image/<main sha>` in Identity
   (`api`, `migrate`), Control, Work (`api`, `migrate`, `admin`) and Docs (b8c7e25). Dispatch School's ECR
   workflow. Record each digest from the run summary.
7. **Secrets G4** [O, console or CloudShell, never in git or chat]: every bundle in `secret_bundles` with
   its keys. `CONTROL_PLANE_TOKEN` placeholders: 20 or more characters for Work and School, 32 or more for
   Docs; one `openssl rand -hex 16` value satisfies all three. Identity key pair from `pnpm keys:generate`.
   Then a PR pinning `secret_version_ids`.
8. **Config PR A + apply, services off** (lead PR, owner approves apply with an updated expected-changes
   declaration). It sets:
   - all `images` digests, `valkey_image` and `postgres_image`;
   - `operator_access`;
   - `identity_signing_kid` and `identity_public_keys`;
   - `secret_version_ids`;
   - `desired_counts` with control-api = 0 and control-portal = 0.
   The apply creates the task definitions, the licence KMS key and the alias. No task starts.
9. **Licence public half** [O, CloudShell]: `aws kms get-public-key` on `control_licence_key_arn`, DER to
   PEM. Then **config PR B + apply, services off**: `control_licence_public_key`, `control_licence_kid`.
10. **Session `up`** (dispatch). Identity, Work, School and Docs start. Control stays at 0. Work, School and
    Docs licence checks fail with the placeholder token, which is expected.
11. **DNS** [O]: CNAMEs to `alb_dns_name` (DNS only), first session only.
12. **Run-only tasks** [O, `aws ecs run-task`, one at a time, each exits 0]:
    1. `db-admin`;
    2. `identity-migrate`, `control-migrate`, `work-migrate`, `school-migrate`;
    3. `school-bootstrap` (one-run secret; delete it after);
    4. `identity-bootstrap` steps 1-3 (one-run secret);
    5. `seed-work-roles --organisation <work org slug>`;
    6. `bootstrap-account --role <work role>` for the Work user (F-3);
    7. delete the `identity-bootstrap` secret, then restart `identity`;
    8. `docs-db-admin`, then `docs-provision` (one-run secret; delete it after);
    9. the `work-migrate` override with `bootstrap-tenant.mjs`.
13. **Config PR C + apply** (F-2: services must be down, or the session plan check refuses): set
    `control_operator_organisation_id` and `control_operator_subjects`, and `desired_counts` control-api and
    control-portal = 1. Then `up` again.
14. **Control step 4** [O]: in the operator portal, create the Work, School and Docs deployments, link the
    Work `tenantRef`, issue `mxc_` credentials, write them into the three bundles, re-pin
    `secret_version_ids` (PR + apply), and restart.
15. **Smoke** (README G7 step 5), then **`down`**.

## 7. Blockers (each with evidence)

| # | Blocker | Evidence |
| --- | --- | --- |
| B-1 | No ECR image exists for Identity, Control, Work or School (no tags; School 0 runs) | [V-gh] `list_tags` empty; `list_workflow_runs` total 0 |
| B-2 | Docs image is 17 commits stale and predates CONTROL_PLANE licensing; the publisher role and repositories after the retirement are [U] | [V-gh] run 40225272398; [V-repo] rev-list |
| B-3 | `operator_access` unset; it blocks any Control digest | [V-repo] `variables.tf`, `nonprod.tfvars` |
| B-4 | `valkey_image` and `postgres_image` unset (the valkey path is now valid) | [V-repo] `nonprod.tfvars`; [L] registry |
| B-5 | Identity signing key, kid and public keys unset | [V-repo] defaults `""` and `"[]"` |
| B-6 | GHCR double-trigger in Identity and Work must be removed before the first tag | [V-repo] section 4 |
| B-7 | Runbook ordering gaps F-1 and F-2 (a config PR needs a services-off G3-workflow apply, not `up`) | [V-repo] `aws-session.yml` filter; `modules/service/main.tf` 212 |
| B-8 | G3 and G6 not yet approved; the first session depends on them | 09 gate table |
| B-9 | `image-release` and tag rulesets per product repository not readable | [U] |

## 8. Owner actions

1. Approve and merge the two GHCR dispatch-only PRs (patches in section 4) before any `image/*` tag in
   Identity or Work.
2. Create the Cloudflare Access application with the MFA rule. Confirm the rule matched in the Access logs.
   Give the lead the team domain and AUD.
3. Confirm `image-release` reviewers, no admin bypass and the `image/*` tag rulesets in every product
   repository. Set `AWS_IMAGE_PUBLISHER_ROLE_ARN` per repository.
4. Confirm, with the console only, that the Docs publisher role and the `munaxa-docs/*` repositories still
   exist [U].
5. Push or approve the image tags and the School dispatch (step 6).
6. Generate the Identity key pair. Write every G4 bundle value, including the `CONTROL_PLANE_TOKEN`
   placeholders. Create and delete the one-run secrets at the right moment.
7. Read the KMS licence public key in CloudShell after config PR A is applied.
8. Re-read the valkey and postgres digests on the day of the PR. Candidates are in 3.4.
9. Decide the School database name (`school` per CONTRACT, or `school_db`) and use it in both School URLs.

## 9. Not verified

- [U] Valkey image user 999 and the binaries in the image (blob download blocked).
- [U] GitHub environments, variables and tag rulesets (no read API).
- [U] Anything in AWS: ECR repositories, publisher roles, the KMS key behaviour, the ECS secret-injection
  failure mode (from AWS documentation and earlier phases, [E]).
- Product test suites were not run. Only the platform mocked tests were.
