# 05 Cross-product readiness (Phase 6, Agent 6)

Date: 4 Nov 2026 (UTC). Scope: munaxa-identity, munaxa-control, munaxa-work, munaxa-school and munaxa-docs on
current `main`, against munaxa-platform `infra/aws` at `main` b6b4a0a (platform#39; #38 is 46dfbd9).
Repository protection and CI are in `05b-REPOSITORY-PROTECTION.md`.

No AWS call, no AWS MCP call, no Terraform apply, no image publication, no secret, no workflow dispatch and no
GitHub write was made. GitHub was read through the `mcp__github__*` read tools and one search call
(`search/repositories`). Two public, non-AWS HTTP sources were read: the RDS trust bundle URL the lead allowed
(truststore.pki.rds.amazonaws.com) and the Docker Hub registry (digests only, no pull). Mocked `terraform test`
ran locally on a copy, with no credentials.

Labels: [V-repo] repository evidence, [V-gh] GitHub workflow or API evidence, [V-aws] live AWS evidence (none
in this report), [E] inferred, [U] not verified, [O] owner action required.

Evidence folder: `phase6/a6/evidence/` (patches in `evidence/patches/`).

## 1. Heads verified

| Repo | `main` head | How it got there | CI on that code |
| --- | --- | --- | --- |
| munaxa-platform | b6b4a0a92fec (#39) | squash; #38 = 46dfbd9 | see 05b |
| munaxa-identity | 4001ed874ba8 (#5, squash, parent b97b3ab) | PR #5 merged 11:22:14Z by tam2om, 0 reviews | push CI run 41820307359 success on 4001ed8 [V-gh] |
| munaxa-work | f812dfe6bc16 (merge commit of #28: parents da84612, 246edc5) | PR #28 merged 11:22:19Z, 0 reviews | PR run 41818706797, 4 of 4 jobs success on 246edc5 [V-gh]; `git diff 246edc5 f812dfe` is empty, so main's tree is exactly the tested tree [V-repo] |
| munaxa-control | a24c5681f0ca (#7) | unchanged since Phase 5 | push CI 41122329528 success (Phase 5) |
| munaxa-school | 54cf3eb7b0e0 (#23) | unchanged since Phase 5 | PR CI 41069902465 success (Phase 5) |
| munaxa-docs | b8c7e252bb62 (#174) | unchanged since Phase 5 | push CI 41797643375 success (Phase 5) |
| munaxa (umbrella) | 9a48a95c85e9 (#273) | not part of the AWS stack | - |

Phase 5 said both TLS fixes were open PRs. **Both are now merged [V-gh]**: identity#5 as 4001ed8 and work#28 as
f812dfe. That clears the two Phase 5 "Blocked" verdicts.

Run 41887322394 (the G3 nonprod plan) ran on head_sha **46dfbd920c6ee7ac940f0b7ca05656aca461f777** [V-gh,
`list_workflow_jobs`]. The owner's brief cites "46df920c6ee7ac940f0b7ca05656aca461f777", which is the same SHA
with the two characters "bd" dropped.

## 2. Cross-cutting checks

### 2.1 RDS CA bundle (vendored bytes) [V-repo] [V-gh]

- I fetched `https://truststore.pki.rds.amazonaws.com/eu-central-1/eu-central-1-bundle.pem` on 4 Nov 2026. It
  returned HTTP 200 from S3 through CloudFront, last-modified 11 Sep 2024, 4600 bytes, sha256
  `56a0cae044b6cc433971d964347401692a92ea0294e392753a3ebdaee54d8b84`.
- `cmp` is byte-identical against both vendored copies:
  - `munaxa-identity/deploy/aws/rds-ca-eu-central-1.crt` (sha256 56a0cae0...4d8b84);
  - `munaxa-work/deploy/aws/rds-ca-eu-central-1.crt` (same).
- The bundle holds three roots:

  | Root | Expires | SHA-256 fingerprint |
  | --- | --- | --- |
  | ECC384 G1 | 2121-05-21 | AE:69:7D:08... |
  | RSA2048 G1 | 2061-05-21 | 3D:8B:08:A7... |
  | RSA4096 G1 | 2121-05-21 | 31:11:F3:22... |

  The full fingerprints are in `evidence/rds-bundle/fingerprints.txt`.
- The stack sets no `ca_cert_identifier` (`infra/aws/stack/data.tf` lines 78 onward), so RDS uses its default
  CA, rds-ca-rsa2048-g1 [E]. The bundle covers that CA and the other two.
- Wiring:
  - Identity: `apps/api/Dockerfile` lines 122-123 put `NODE_EXTRA_CA_CERTS` in the `runtime` stage only.
    That is enough, because `identity-bootstrap` runs the `identity_api` image (`infra/aws/stack/ops.tf` line
    268), and the `migrate` stage uses Prisma only.
  - Work: `apps/api/Dockerfile` lines 65-66 (`migrate`, which also runs `bootstrap-tenant.mjs`) and lines
    142-143 (`runtime`).
- node-postgres is used only by Identity (the three bootstrap scripts) and Work (the runtime and
  `bootstrap-tenant.mjs`) [V-repo, grep]. Control, School and Docs import no `pg` outside tests.

### 2.2 verify-full host name [V-repo]

- node-postgres reads `sslmode=require` as verify-full, so the host in `DATABASE_URL` and
  `DATABASE_MIGRATION_URL` must match the certificate SAN. That is the instance endpoint DNS name.
- `output "database_endpoint"` is `aws_db_instance.main.address`, a host name
  (`infra/aws/stack/outputs.tf` lines 19-22).
- README G4 tells the owner to build URLs from `<database_endpoint>` (`infra/aws/README.md` line 119).
  Neither README nor CONTRACT §6 (`infra/aws/CONTRACT.md` lines 121-124) says "never an IP address or alias".
  The Identity runbook does say it (`munaxa-identity/docs/runbooks/aws.md` lines 44-46). Work has no
  equivalent note.
- Status: **still open, documentation only** [O]. The patch adds the sentence to README G4 and CONTRACT §6.

### 2.3 "Strict TLS" on the migration jobs [V-repo] [E]

- Each `*-migrate` task runs `prisma migrate deploy`. These are Identity, Control, Work and School
  (`ops.tf` line 166; Control is `module.control_migrate`).
- The DB admin tasks use `psql`, with `PGSSLMODE=require` in `stack/scripts/db-bootstrap.sh` line 19 and
  `stack/docs.tf` line 352.
- No repository sets `sslaccept=strict`, `sslrootcert`, `sslmode=verify-full` or `PGSSLROOTCERT` [V-repo,
  grep over all six repositories].
- So the migration and db-admin connections are encrypted (RDS has `rds.force_ssl=1`, `data.tf` line 68), but
  they do not authenticate the server:
  - libpq `require` means no verification [V, libpq semantics];
  - Prisma's engine defaults to `sslaccept=accept_invalid_certs` [E, from Prisma documentation, not tested
    here].
- Risk: these tasks run inside the VPC against a private instance. An on-path attacker would already need a
  foothold in the VPC. Residual risk is Low.
- To make the jobs strict, which is optional and not a blocker:
  - db-admin and docs-db-admin: set `PGSSLMODE=verify-full` and `PGSSLROOTCERT=<bundle>`. The postgres image
    has no RDS bundle, so this needs a small derived image or a bundle copied in.
  - Prisma: add `sslmode=verify-full&sslrootcert=...` to each owner URL, and add the bundle to each migrate
    image (Control and School migrate images have none).
- I recommend leaving this as an accepted residual for Testing and revisiting it before Production [E].

### 2.4 Valkey and PostgreSQL images (platform `envs/nonprod.tfvars`) [V-repo] [V-registry]

- Neither image is set. `valkey_image` and `postgres_image` are absent from
  `infra/aws/stack/envs/nonprod.tfvars` lines 1-51. Only `docs_redis_image` is pinned (line 48).
  Effect of each gap:
  - `postgres_image` empty: no `db-admin` task (`ops.tf` line 104) and no `docs-db-admin` task (`docs.tf`
    line 324). No database or role can be created in a session.
  - `valkey_image` empty: Identity runs with no sidecar (`services.tf` lines 133 and 166), but its
    `REDIS_URL` is `redis://:<pw>@127.0.0.1:6379` (README line 125). Identity then starts against nothing,
    and REDIS_URL is required in production (Phase 5).
- **New finding: the `valkey_image` validation probably cannot be satisfied** [V-registry for Docker Hub;
  E for ECR Public].
  - `variables.tf` line 191 accepts only `public.ecr.aws/docker/library/valkey@sha256:...`.
  - Docker Hub has no official `library/valkey`: `hub.docker.com/v2/repositories/library/valkey/` returns
    404 and `valkey/valkey` returns 200.
  - ECR Public's `docker/library/*` namespace mirrors Docker Official Images [E]. Valkey publishes its own
    image at `public.ecr.aws/valkey/valkey` [E]. I did not query ECR Public, because that would be an AWS
    call.
  - [O] The owner should confirm in the ECR Public Gallery which path exists. The patch widens the regex to
    accept `public.ecr.aws/valkey/valkey@sha256:` as well.
- Candidate digests (multi-arch index digests from Docker Hub, read 4 Nov 2026; `evidence/dockerhub-digests-2026-11-04.txt`):

  | Image | Digest |
  | --- | --- |
  | `valkey/valkey:8-alpine` (= 8.1-alpine, VALKEY_VERSION 8.1.11, created 27 Oct 2026) | `sha256:2602ace2be6569bc2bbb06f873776516ab9089821525be34f4305c67eb9db02a` |
  | `postgres:16-alpine` | `sha256:0cefaabd882e42bcb2a2f3dc56d3ce4770560ba62fd7f197f1a2e008fd5731ab` |
  | `postgres:16` | `sha256:5db6dac2ef5dcff512f4f00a009c3c332b9f2f28f24277175bf3e4a3d02ef83a` |

  - ECR Public mirrors normally serve the same index digest as Docker Hub [E]. The owner must confirm the
    digest under the `public.ecr.aws` path before the tfvars PR [O].
  - The tasks run as `999:999` (`ops.tf` line 123; `services.tf` line 137), which needs no passwd entry for
    psql or valkey-server [E].
- **Status: open [O]; the patch adds a Terraform validation** that refuses a session with `identity_api` and
  no `valkey_image`.

### 2.5 Identity public keys and signing key id [V-repo]

- Platform defaults:
  - `identity_signing_kid = ""` (`variables.tf` lines 239-243);
  - `identity_public_keys = "[]"` (lines 245-254). Neither is set in `nonprod.tfvars`.
- Where products read them:
  - Identity refuses a key id shorter than 3 characters (`munaxa-identity/packages/config/src/environment.ts`
    lines 134-138). The stack passes `IDENTITY_SIGNING_KID` at `services.tf` line 117.
  - Work refuses an empty key array ("must be a JSON array holding at least one key",
    `munaxa-work/packages/config/src/platform-authentication.ts` line 175). It is fed from `services.tf`
    line 531.
  - Control needs `OPERATOR_AUTH_PUBLIC_KEYS` (`munaxa-control/apps/api/src/config/environment.ts` line 38;
    `services.tf` line 315).
- The private half is `IDENTITY_SIGNING_PRIVATE_KEY` in bundle `<env>/identity` (`data.tf` line 143). It is
  generated with `pnpm keys:generate` (README line 123).
- Nothing in Terraform checks that the kid is listed in the public keys. A mismatch is only found when Work or
  Control rejects every token.
- **Status: open [O]** (the owner generates the key and sets both by PR). The patch adds validations:
  - a session with Identity needs a kid of 3 or more characters that is listed in `identity_public_keys`;
  - a session with Work needs a non-empty key list.

### 2.6 Operator access (Cloudflare Access) and MFA [V-repo]

- `operator_access` is commented out (`nonprod.tfvars` lines 26-28), and `operator_cidrs = []` (line 24).
- Terraform refuses a Control image without `operator_access` (`variables.tf` lines 148-152). So Control
  images cannot even be merged until the Access application exists.
- `infra/aws/cloudflare-access.md`:
  - Status line 3 reads "design. Nothing here has been configured".
  - Three owner decisions are still open (lines 95-101). The MFA Require rule is described at lines 35-41.
  - The host table (lines 12-18) omits `docs.test.munaxa.com`, which is cosmetic.
- Identity issues no MFA claim: `mfaSatisfied: false` is hard-coded at session creation
  (`munaxa-identity/apps/api/src/auth/auth.service.ts` line 159).
- Control runs `OPERATOR_REQUIRE_MFA=false` (`services.tf` line 317). In production it requires a non-empty
  `OPERATOR_SUBJECT_ALLOWLIST` while MFA is off (`munaxa-control/apps/api/src/config/environment.ts` lines
  216-222), and Access settings (lines 225-243).
- Stale text: `munaxa-identity/docs/runbooks/aws.md` lines 126-127 still say the operator host "is limited
  to `operator_cidrs` at the load balancer until MFA exists". That predates the Cloudflare Access decision.
  The patch corrects it.
- **Status: open [O]**:
  - create the Access application, with the email allow-list and the MFA Require rule;
  - confirm in the Access logs that the MFA rule matched;
  - set `operator_access` by PR.
  - [U] Whether the owner's Cloudflare login method reports MFA.

### 2.7 Control licence key provisioning sequence [V-repo]

- The licence KMS key exists only once a Control image is defined (`aws_kms_key.licence`, `services.tf` lines
  192-193, count `local.defined.control_api`). Its ARN goes into `LICENCE_SIGNING_KMS_KEY_ID` (line 320).
- control-api refuses to start unless all of these are present:
  - a P-256 `LICENCE_SIGNING_PUBLIC_KEY` (`environment.ts` lines 281-298);
  - a non-empty `LICENCE_SIGNING_KID` (line 84);
  - `OPERATOR_ORGANISATION_ID` (line 45);
  - the subject allow-list (line 219).
- The stack passes them from `control_licence_public_key`, `control_licence_kid`,
  `control_operator_organisation_id` and `control_operator_subjects` (`services.tf` lines 316-322). All
  default to empty.
- README G7 (`infra/aws/README.md` lines 138-164) still brings services up at step 1 and sets the licence key
  at step 4. Phase 5 found this ordering problem, and **it is still unfixed on main** [V-repo]. On the first
  session control-api would crash-loop until the ECS circuit breaker stops it [E].
- The correct sequence, which the patch writes into README G7 as step 0:
  1. Set Control image digests with `services_enabled = false` and apply. The licence key is created and no
     task starts. The patch's new test `control_images_with_services_off_create_the_licence_key_first`
     passes [V-repo, mocked test].
  2. In CloudShell, run `aws kms get-public-key` and convert DER to PEM [O]. Set
     `control_licence_public_key` and `control_licence_kid` by PR.
  3. The first session runs `control-api` and `control-portal` at `desired_counts` 0. Identity steps 1 to 3
     produce the operator organisation id and subjects, which are set by PR. Then dispatch `up` again.
- The patch adds a validation that refuses a session running `control-api` above zero tasks until all five
  values exist. A new test proves that a desired count of 0 is still allowed.

### 2.8 Work role seeding [V-repo]

- `munaxa-identity/apps/api/scripts/seed-work-roles.mjs` exists. It reads `artifacts/work-permissions.json`
  (line 36). That file is copied into the runtime image at `/app/artifacts` (`apps/api/Dockerfile`, runtime
  `COPY --from=prune /app/artifacts`), so the identity-bootstrap task can run it as a command override.
- It is referenced in Identity `README.md` line 34 and `docs/runbooks/staging-provisioning.md` lines 171 and 249.
- **It is not in** the platform README G7, CONTRACT §6, or the Identity AWS runbook
  (`docs/runbooks/aws.md` steps 0-6, lines 89-111, cover Control roles only) [V-repo, grep].
- The identity-bootstrap task injects the one-run secret on every run (Identity runbook line 106). So
  seed-work-roles must run **before** that secret is deleted, followed by an `identity` restart (line 109).
- **Status: open, documentation only.** The patch adds it to README G7 step 3 in that order.

### 2.9 CONTROL_PLANE_TOKEN prerequisites [V-repo]

- The bundle keys are declared for Work (`data.tf` line 149), School (line 150) and Docs (`docs.tf` line 35).
- ECS secret injection fails when a declared key is missing, so the key must exist before the first task
  start [E, ECS behaviour; also Phase 5].
- **Minimum lengths differ by product. Phase 5 recorded only Work's.**

  | Product | Minimum length | Source |
  | --- | --- | --- |
  | Work | 20 | `munaxa-work/packages/config/src/environment.ts` line 119 |
  | School | 20 | `munaxa-school/apps/api/src/config/env.validation.ts` line 68 |
  | Docs | 32 | `munaxa-docs/apps/api/src/core/config/configuration.ts` line 635 |

- All three set `LICENSING_MODE=CONTROL_PLANE` in the stack (`services.tf` lines 533 and 626; `docs.tf` line
  71) and require the token in that mode.
- Real credentials have the form `mxc_<id>_<secret>` (`munaxa-control/apps/api/src/auth/service-credentials.ts`
  line 6). They can only be issued once Control runs.
- **Status: open [O].** The patch tells the owner, in README G4, to write a placeholder of at least 32
  characters or keep those services at 0 tasks until G7 step 4.

### 2.10 Docs image freshness and publication [V-gh]

- Tags in munaxa-docs: seven `image/*` tags and no releases (`list_tags`, `list_releases`).
- The last publish run is 40225272398 (25 Oct 2026 19:16Z, tag `image/f8a8bea6...`, success). Runs after it on
  that workflow: none.
- f8a8bea is an ancestor of main and **17 first-parent commits behind** b8c7e25. Since then, 85 files have
  changed under apps, packages and prisma (+3814/-162) [V-repo]. That includes:
  - #160 (subscriptions through the shared licensing contract);
  - #163 (production refuses NONE);
  - #164 (outbound TLS by host name);
  - #165;
  - #168 (publish workflow token and SHA pins).
- So the published image predates CONTROL_PLANE licensing. The stack sets `LICENSING_MODE=CONTROL_PLANE`
  (`docs.tf` line 71), so the old image would not enforce licensing [E, as Phase 5].
- The workflow (`munaxa-docs/.github/workflows/publish-images.yml`):
  - triggered by an `image/**` tag;
  - checks main ancestry (lines 95-105);
  - uses `image-release` (lines 119, 298, 453);
  - hard-codes the role `munaxa-docs/bootstrap/munaxa-docs-eu-prod-image-publisher` (line 58). That role is in
    the retained Docs bootstrap (`infra/terraform/bootstrap/ecr.tf`; #172 says "The Docs bootstrap is not
    touched").
  - [U] Whether that role and the `munaxa-docs/*` ECR repositories still exist (no AWS access).
- **Status: open [O].** After the tag protection in 05b exists, push `image/b8c7e252bb6292f74eba3cb88dcb8a1a5f24a6f9`
  and approve `image-release`, then set `docs_api`, `docs_web` and `docs_antivirus` digests by PR. I did not
  publish anything.

### 2.11 Work GHCR publishing workflow [V-repo] [V-gh]

- `munaxa-work/.github/workflows/publish-images.yml` exists for Render:
  - triggered by `push: tags: image/**` and `workflow_dispatch` with a free `commit` input (lines 18-27);
  - `packages: write`, with no `environment`;
  - the actions are **pinned by tag, not by SHA**: `actions/checkout@v6`, `docker/setup-buildx-action@v3`,
    `docker/login-action@v3` and `docker/build-push-action@v6` (lines 50, 63, 66, 76);
  - it passes `secrets.PLATFORM_PACKAGES_TOKEN` into the build (line 89);
  - it has no main-ancestry check, and its comment says on purpose that "a tag works from any commit"
    (lines 10-14).
- Identity's GHCR workflow has the same triggers, but its actions are SHA-pinned.
- Because both workflows trigger on `image/**`, **every ECR release tag in Work or Identity also runs this
  ungated GHCR job**. That puts a long-lived package token behind tag-pinned third-party actions.
- Last runs: Work 33634221986 (2 Sep 2026, dispatch); Identity 34323444447 (9 Sep 2026). Neither repository has
  any tag today (`list_tags` returns `[]`).
- **Status: [O]/[R].** The patch drops the `image/**` trigger from both GHCR workflows, leaving them
  dispatch-only until Render is retired. Alternatively, delete them once Render is gone.

### 2.12 School staging prerequisites [V-repo]

- `munaxa-school/.github/workflows/publish-images-ecr.yml` is dispatch-only (lines 27-28).
  - Its `production-gate` job (lines 44-58) runs `scripts/deploy-gate.mjs verify-environment image-release`.
    The script (lines 84-123) fails unless:
    - `image-release` exists and has required reviewers;
    - `can_admins_bypass` is false;
    - the deployment rule is exactly the tag rule `image/*`.
  - This is the strictest check in any of the repositories, and it encodes the protection the other products
    should match.
- Database name: School's `docs/ops/aws.md` line 30 says `school_db`, and CONTRACT §6 says `school`. Only the
  URLs decide the name, but both School bundles must use the same one [O] (Phase 5 finding, still open).
- The stack provides the bucket, task role and `AWS_S3_BUCKET` (`services.tf`, school-api: `AWS_S3_BUCKET`
  and the `tenants/*` policy), so School's storage prerequisites (`docs/ops/aws.md` lines 55-68) are met in
  code [V-repo].
- School bundle `<env>/school-api` needs `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (different values), the
  token from 2.9 (20 or more characters) and `RESEND_API_KEY` [O].
- The old Render workflows `deploy.yml` and `seed-environment.yml` remain, dispatch-only, using environments
  `staging` and `production`. [U] How those environments are protected. They are not used by AWS.
- School CI is PR-only with `paths-ignore` (`ci.yml` lines 7-12). That matters for required checks (see 05b).

## 3. Per-product checklist

Legend: Done = verified on main; Open = an unresolved prerequisite (owner unless noted); Patch = proposed in
`evidence/patches/`.

### Identity (main 4001ed8)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| I-1 | node-postgres trusts RDS roots, verification on | Done [V-repo] | `apps/api/Dockerfile` 115-123; bundle byte-identical to AWS (2.1); CI 41820307359 success [V-gh] |
| I-2 | Publish workflow to ECR (`image/<sha>` on main, `image-release`, SHA-pinned) | Done in code [V-repo]; never run (no tags) [V-gh] | `.github/workflows/publish-images-ecr.yml` 25, 52-54, 73-74, 80, 116 |
| I-3 | `AWS_IMAGE_PUBLISHER_ROLE_ARN` variable and `image-release` reviewers | Open [U] [O] | API not readable here |
| I-4 | `image/*` tag ruleset; `main` protection | Open [O] | 05b |
| I-5 | GHCR workflow also fires on `image/**` | Open [R], Patch | `.github/workflows/publish-images.yml` |
| I-6 | Signing key generated; `identity_signing_kid` and `identity_public_keys` set | Open [O], Patch (validation) | 2.5 |
| I-7 | `valkey_image` by digest (path question) | Open [O], Patch | 2.4 |
| I-8 | Bundle `<env>/identity` (5 keys), `<env>/identity-migrate` | Open [O] | `data.tf` 143; README G4 |
| I-9 | identity-bootstrap: steps 1-3 plus `seed-work-roles.mjs` before deleting the one-run secret | Open [O], Patch (runbook) | 2.8 |
| I-10 | DB URL host = endpoint DNS name | Open [O], Patch (docs) | 2.2 |
| I-11 | Runbook text on `operator_cidrs` stale | Patch | `docs/runbooks/aws.md` 126-127 |
| I-12 | MFA claim | Accepted gap [V-repo]: `auth.service.ts` 159 | Compensated by Access, allow-list and audit |
| I-13 | Base image `node:22-alpine` not digest-pinned | Open [R], not blocking | `apps/api/Dockerfile` 10, 111 |

### Control (main a24c568)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| C-1 | Publish workflow (tag, main check, `image-release`, SHA-pinned) | Done in code [V-repo]; never run [V-gh] | `.github/workflows/publish-images.yml` 71-72, 78, 110 |
| C-2 | `operator_access` set (Cloudflare Access app with MFA rule) | Open [O]; blocks even merging Control digests | `variables.tf` 148-152; `nonprod.tfvars` 26-28 |
| C-3 | Two-step licence key: services-off apply, read public key, set `control_licence_*` | Open [O]; runbook wrong on main | 2.7; README 161-162 |
| C-4 | Operator organisation id and subjects from Identity steps 1-3 | Open [O] | Identity runbook 95-111 |
| C-5 | Terraform guard against a control-api session without C-3 and C-4 | Patch | `variables.tf` patch; 6 new tests pass |
| C-6 | Bundle `<env>/control-api`, `<env>/control-migrate` | Open [O] | `data.tf` |
| C-7 | No non-root check step in publish (others have one) | Open [R] (Phase 5) | - |
| C-8 | `main` protection, `image/*` tag ruleset | Open [O] | 05b |

### Work (main f812dfe)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| W-1 | node-postgres trusts RDS roots in `runtime` and `migrate` | Done [V-repo] [V-gh] | `apps/api/Dockerfile` 65-66, 142-143; PR run 41818706797 4/4 success; merge tree = tested tree |
| W-2 | ECR publish workflow | Done in code; never run | `.github/workflows/publish-images-ecr.yml` 74-75, 81, 124 |
| W-3 | GHCR workflow: tag-pinned actions with `PLATFORM_PACKAGES_TOKEN`, fires on `image/**` | Open [R], Patch | 2.11 |
| W-4 | `identity_public_keys` non-empty before work-api runs | Open [O], Patch (validation) | 2.5 |
| W-5 | `CONTROL_PLANE_TOKEN` (20 or more characters) present before first start | Open [O], Patch (README) | 2.9 |
| W-6 | Identity Work roles seeded per organisation | Open [O] | 2.8 |
| W-7 | First tenant: work-migrate override running `bootstrap-tenant.mjs` (`deploy/aws/README.md` 25-32) | Open [O] | - |
| W-8 | DB URL host = endpoint DNS name | Open [O], Patch (docs) | 2.2 |
| W-9 | CI is PR-only with `paths-ignore` (incompatible with required checks) | Open [O] | `ci.yml` 4-8; 05b |

### School (main 54cf3eb)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| S-1 | ECR publish, dispatch-only, with `production-gate` | Done in code; never run (no tags) | 2.12 |
| S-2 | `image-release` exists, reviewers, admins cannot bypass, tag rule `image/*` | Open [U] [O]; the gate fails closed until it does | `scripts/deploy-gate.mjs` 84-123 |
| S-3 | Database name consistent (`school_db` or `school`) in both bundles | Open [O] | `docs/ops/aws.md` 30; CONTRACT §6 |
| S-4 | `CONTROL_PLANE_TOKEN` 20 or more characters before start | Open [O] | `env.validation.ts` 68 |
| S-5 | school-bootstrap one-run secret (README G7 step 3) | Open [O] | README |
| S-6 | CI PR-only with `paths-ignore` | Open [O] | `ci.yml` 7-12; 05b |

### Docs (main b8c7e25)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| D-1 | Fresh image from main (the last one, f8a8bea, is 17 commits behind and predates licensing) | Open [O] | 2.10 |
| D-2 | `docs_*` digests in `nonprod.tfvars` `images` | Open [O] | `nonprod.tfvars` 51 |
| D-3 | `CONTROL_PLANE_TOKEN` 32 or more characters in `munaxa-nonprod/docs-api` | Open [O] | `configuration.ts` 635 |
| D-4 | `TENANT_CATALOGUE`, `docs-operator`, `docs-provision/<slug>` values | Open [O] (Phase 5) | CONTRACT §5 |
| D-5 | `postgres_image` (docs-db-admin) | Open [O] | `docs.tf` 324 |
| D-6 | Publisher role and ECR repositories still exist after retirement | [U] (Docs bootstrap retained in code) | `publish-images.yml` 58 |
| D-7 | `main` and `image/*` tag rulesets | Done [V-gh, Phase 5]: rulesets 20906159 and 25664662 | 05b |

### Platform (main b6b4a0a), items that gate the products

| # | Item | Status |
| --- | --- | --- |
| P-1 | README G7 Control order, seed-work-roles and token placeholder | Open, Patch |
| P-2 | CONTRACT §6 endpoint host name | Open, Patch |
| P-3 | Validations: Valkey, signing kid and public keys, Work keys, Control licence and operators | Patch (20 of 20 mocked tests pass) |
| P-4 | `valkey_image` regex likely names a repository that does not exist | Patch; [O] confirm |
| P-5 | Raw `terraform apply` stdout in public logs | Patch (05b) |

## 4. Patches proposed (not applied, not pushed)

1. `evidence/patches/platform-a6-readiness-and-logs.patch` (munaxa-platform, 6 files, +179/-13).
   - `infra/aws/stack/variables.tf`:
     - accept `public.ecr.aws/valkey/valkey@sha256:`;
     - new cross-variable validations, all inert unless `services_enabled` is true and the relevant image is
       set: Valkey for Identity; a kid of 3 or more characters listed in the public keys; a non-empty key list
       for Work; licence public key, kid, operator organisation, subjects and Identity keys for control-api
       above 0 tasks.
     - The G3 plan (`services_enabled = false`, `images = {}`) is unaffected.
   - `infra/aws/stack/tests/stack.tftest.hcl`: file-level public test values and 6 new runs.
     `terraform fmt -check` and `validate` pass, and `terraform test` gives 20 passed, 0 failed (mocked
     provider, Terraform 1.16.5, no credentials; `evidence/terraform-test-patched.txt`).
   - `infra/aws/README.md`: G4 host-name and token-placeholder notes; G7 step 0 (two-step Control); step 3
     seed-work-roles before the secret is deleted; step 4 shortened.
   - `infra/aws/CONTRACT.md` §6: host name and TLS behaviour.
   - `.github/workflows/aws-terraform.yml` and `aws-session.yml`: see 05b.
2. `evidence/patches/work-ghcr-no-release-tag.patch`: munaxa-work `publish-images.yml` becomes dispatch-only.
3. `evidence/patches/identity-ghcr-no-release-tag-and-runbook.patch`: munaxa-identity `publish-images.yml`
   becomes dispatch-only, and `docs/runbooks/aws.md` 126-127 is corrected.

## 5. Not verified

- [U] GitHub environments (`image-release`, `aws-nonprod`, `aws-nonprod-session`): reviewers, admin bypass,
  deployment rules and variables. There is no read API available to this agent.
- [U] Whether `public.ecr.aws/docker/library/valkey` or `public.ecr.aws/valkey/valkey` exists, and the digests
  served there.
- [U] ECR repositories, publisher roles, and the Docs publisher role after the retirement (AWS).
- [U] Prisma's `sslmode=require` behaviour on Prisma 6.19.3 (documentation-based [E]).
- Product test suites were not run locally. The platform mocked tests were.
