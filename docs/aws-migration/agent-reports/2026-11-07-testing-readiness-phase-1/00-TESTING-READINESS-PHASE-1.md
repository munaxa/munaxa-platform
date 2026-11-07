# Testing readiness phase 1: fresh audit and Identity, Control and Work image release preparation

- **Date:** 7 Nov 2026, from 09:01 UTC. **Author:** the lead of the thread "Prepare Identity, Control and Work image releases".
- **Brief:** the owner's "Munaxa — Non-Production Testing Readiness, Phase 1" (7 Nov 2026, 09:01 UTC).
- **Starting point:** platform `main` = `3337809` (PR #63 merged 07:49 UTC). Previous reports: [`../2026-11-05-testing-readiness/`](../2026-11-05-testing-readiness/) and [`../2026-11-06-nonprod-readiness/`](../2026-11-06-nonprod-readiness/).
- **Scope:** audit and preparation only. Identity, then Control (API and operator portal), then Work. School and Docs are out of scope; no dependency pulls them in (§8.4).
- **Labels:** **[V-gh]** verified from GitHub (API or job metadata) in this task; **[V-repo]** verified from the code at the commit named; **[V-local]** verified by a local run in this task (no AWS); **[V-prior]** verified by an earlier report, not re-read; **[O]** owner action; **[U]** unverified.

## AWS access in this task

**No AWS call was made.** The only AWS connector available to this session is signed in as the root user of `229251310592`, and the brief allows no root access and no credentials outside the approved process. So every AWS fact below is either historical ([V-prior], 6 Nov 21:21 UTC owner read) or inferred from GitHub evidence. A read-only owner script is prepared to refresh them: [`supporting/phase1-readonly-check.sh`](supporting/phase1-readonly-check.sh), sha256 `4e6aff7e4e9698f996ac29eb8a8d00a7ed15c17a574dc517af43ecdbec252d20`. It uses Describe, Get, List and Lookup calls only. It reads no secret value (only `list-secrets` and `list-secret-version-ids`), no state and no logs. The owner runs it in CloudShell, as in the 6 Nov phase.

GitHub environment protection, environment reviewers, repository variables, rulesets and secrets cannot be read from this session (no API for them here; earlier phases got 403). They are **[U]** below, with the owner check that settles each one.

---

## 1. Executive readiness verdict

# NOT READY FOR PRODUCT TESTING

**Image release readiness: READY TO PUBLISH, SUBJECT TO OWNER CONFIRMATIONS.**

- The three image workflows (Identity, Control, Work) are correct in code at the current reviewed `main` commits. Each builds from an `image/<40-hex SHA>` tag, checks that the SHA is on `main`, references an environment named `image-release` and pushes only to its own product's ECR repositories through GitHub OIDC [V-repo]. The workflows reference an environment named `image-release`. Actual environment protection settings, required reviewers, and deployment branch/tag restrictions remain unverified. *(Corrected 7 Nov 2026, see §12.)*
- **None has ever run** (0 runs, 0 tags in all three repositories) [V-gh]. So "functional" means correct on reading, not proven by a run. The first run is the proof.
- **No workflow defect was found, so no workflow-fix PR was opened.**

**Config A cannot be prepared yet.** It is blocked on the five image digests, `operator_access` (Cloudflare Access application), the Identity signing key id and public key, and the Valkey and PostgreSQL client digests (§8). A local mocked plan with placeholder values passes every stack validation for Config A (§8.3) [V-local].

**Still true from 6 Nov (not re-verified, no AWS access):** 0 product images in ECR, 10 secret containers with 0 versions, no Control licence KMS key, no Cloudflare Access application, no product DNS, no successful product deployment session. GitHub evidence agrees for images: no publish run and no `image/*` tag exist, so nothing can have been published through the approved path since 6 Nov [V-gh].

Nothing in this report means the environment is ready for testing. That needs a deployment and passing smoke tests.

---

## 2. Current repository and CI matrix

| Repository | `main` (full SHA) | Committed (UTC) | CI for that `main` | Open PRs | `image/*` tags |
|---|---|---|---|---|---|
| munaxa-platform | `3337809a08385bb2501d7e33996452a711d2be0c` (#63) | 7 Nov 07:48 | PR run [42351471247](https://github.com/munaxa/munaxa-platform/actions/runs/42351471247) **success** on head `6bbec9d`. No push run: #63 is Markdown only, and the push trigger ignores `**/*.md`. Last code commit `9cf45c0` push run 42298113353 success. Scheduled `aws-session` run 42352893329 at `3337809` success | 0 | n/a |
| munaxa-identity | `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (#6) | 5 Nov 08:12 | push run [41992700652](https://github.com/munaxa/munaxa-identity/actions/runs/41992700652) **success** | 0 | **0** |
| munaxa-control | `a24c5681f0ca98f446098444c79bc36cd4d9bc0c` (#7) | 30 Oct 20:20 | push run [41122329528](https://github.com/munaxa/munaxa-control/actions/runs/41122329528) **success** | 0 | **0** |
| munaxa-work | `b490b25792c4d35e5b489790508b2ae6489080cc` (#29) | 5 Nov 08:12 | Work CI runs on pull requests only. PR run [41983857218](https://github.com/munaxa/munaxa-work/actions/runs/41983857218) **success** on head `3ec54b5`. The squash commit `b490b25` has the **same tree** as `3ec54b5` (`b319a7d0…`) [V-local, `git rev-parse`], so the tested content is the content on `main` | 0 | **0** |

All [V-gh] unless noted. Recent merges: #60 (16:44 6 Nov), #61 (17:25), #62 (21:36), #63 (07:49 7 Nov), all merged; **#63 is no longer open** [V-gh].

**Local checks (no AWS):** the stack's own tests at `3337809` pass 25/25 with Terraform 1.16.5 and AWS provider 6.67.0, both sha256-checked against releases.hashicorp.com [V-local].

**Branch and tag protection:** the REST branch list reports `protected: false` for `main` in identity, control and work, but that flag does not reflect repository rulesets (platform `main` also shows `false` although ruleset 20906222 protects it). Whether the phase 7 rulesets (O-2 to O-6: product `main` rulesets, `image/*` tag rulesets) exist is **[U]**.

---

## 3. Image publishing readiness matrix

Common to all three [V-repo]:

- **Trigger:** push of a tag matching `image/**`.
- **Tag format:** `image/<40 lowercase hex commit SHA>`. The `source` job refuses any other name, refuses a tag that points at a different commit, and refuses a commit that is not an ancestor of `origin/main`.
- **Environment:** the `publish` job references an environment named `image-release` [V-repo]. Actual environment protection settings, required reviewers, and deployment branch/tag restrictions remain unverified [U]. The design intends a required reviewer. The publisher role's trust admits only `sub = repo:munaxa@311481412/munaxa-<product>@<repo id>:environment:image-release` with `ref` like `refs/tags/image/*` (`bootstrap/iam.tf` 559 to 585) [V-repo; trust verified live in phase 4, V-prior].
- **Role variable:** the job stops at its first step if `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` is empty.
- **Credentials:** OIDC only, `allowed-account-ids: 229251310592`, 1-hour session, every action pinned by commit SHA.
- **ECR tags written:** `<7-char short SHA>` and `sha-<full SHA>`. No `latest`. Repositories are tag-IMMUTABLE with scan on push (`bootstrap/main.tf` 102 to 115).
- **Expected output:** one line per image in the run summary, `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-<product>/<image>@sha256:<64 hex>`. That digest reference, never a tag, goes into Terraform.

| | **1. Identity** | **2. Control** | **3. Work** |
|---|---|---|---|
| Latest reviewed `main` SHA | `5277d7190b3dda496443c4bd7d80c78bd4d9174e` | `a24c5681f0ca98f446098444c79bc36cd4d9bc0c` | `b490b25792c4d35e5b489790508b2ae6489080cc` |
| CI for that SHA | success (run 41992700652) | success (run 41122329528) | success on the identical tree (run 41983857218) |
| Workflow (file, name) | `publish-images-ecr.yml`, "Publish images to ECR" (id 401557555) | `publish-images.yml`, "Publish images" (id 401364952) | `publish-images-ecr.yml`, "Publish images to ECR" (id 401370097) |
| Run history | **0 runs** | **0 runs** | **0 runs** |
| Images built | `munaxa-identity/api` (target `runtime`), `munaxa-identity/migrate` (target `migrate`), from `apps/api/Dockerfile` | `munaxa-control/api`, `/migrate`, `/portal` (targets of `./Dockerfile`) | `munaxa-work/api` (`runtime`), `/migrate` (`migrate`), from `apps/api/Dockerfile`; `munaxa-work/admin` from `apps/admin/Dockerfile` |
| Functional (by reading) | Yes | Yes | Yes |
| Owner approval required | Yes, if `image-release` has a required reviewer [U] (owner reported "done" on 4 Nov, phase 4 `MASTER-EXECUTION-STATUS.md` row 3) | same | same |
| Publisher role variable exists | owner-reported 4 Nov [U] | owner-reported 4 Nov [U] | owner-reported 4 Nov [U] |
| Expected variable value | `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher` | `…/munaxa-control-image-publisher` | `…/munaxa-work-image-publisher` |
| Role limited to that product's ECR | Yes: `push-own-images` lists only `munaxa-identity/api` and `/migrate` ARNs, plus `ecr:GetAuthorizationToken` [V-repo `iam.tf` 596 to 616; V-prior phase 4] | Yes: only the three `munaxa-control/*` ARNs | Yes: only the three `munaxa-work/*` ARNs |
| Build credential for `@munaxa/*` | BuildKit secret `npm_token` = `secrets.PLATFORM_PACKAGES_TOKEN`, **no fallback** | `node_auth_token` = `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN`, job has `packages: read` | `npm_token` = `PLATFORM_PACKAGES_TOKEN`, **no fallback** |
| Evidence that credential works | Identity CI uses the same secret with no fallback and passed on 5 Nov, so it was present and valid then [V-gh] | CI passes with the same expression | Work CI falls back to `GITHUB_TOKEN`, so its green run does not prove the secret. The secret existed on 2 Sep (GHCR publish run 33634221986 succeeded with it) [V-gh]; current validity [U] |
| Post-push checks | non-root user, no token in history or `.npmrc`, no dev toolchain in `runtime` | **digest recorded only**; no non-root or credential check after push (hardening gap, not a defect: the Dockerfile sets `USER node`) | non-root, no token in history or `.npmrc` |
| Exact action to publish | see §9 step 4 | see §9 step 5 | see §9 step 9 |

**Defects needing a code PR:** none. Not fixed, on purpose (not defects):

- Identity's ECR workflow header still says the GHCR workflow also runs on `image/*` tags. Since identity#6 the GHCR workflow is dispatch-only [V-repo]; the comment is stale and harmless.
- Control's publish job has no post-push non-root or credential check. Adding one would be a hardening change, not a fix. It is recorded as risk R-6.

---

## 4. ECR status

| Repository | Images | Source |
|---|---|---|
| `munaxa-identity/api`, `munaxa-identity/migrate` | 0 | [V-prior] owner read 6 Nov 17:23 and 21:21 UTC |
| `munaxa-control/api`, `/migrate`, `/portal` | 0 | [V-prior] |
| `munaxa-work/api`, `/admin`, `/migrate` | 0 | [V-prior] |

- **Since then [V-gh]:** 0 runs of any ECR publish workflow and 0 `image/*` tags in the three repositories. The publisher roles can be assumed only from those workflows (trust above), so no image can have reached these repositories through the approved path. Pushes by root are not excluded by this evidence; the owner script (§1) settles it.
- **Repository settings** (code): IMMUTABLE tags, scan on push, AES256, lifecycle "untagged after 7 days" and "keep the last 20" (`bootstrap/main.tf` 102 to 136) [V-repo].
- **Immutable-tag consequence:** if a matrix leg pushes and then fails a later step, re-running that leg fails with "tag already exists", because a rebuild produces a new digest under the same `<short>` tag. Recovery is a new reviewed `main` commit and a new tag, not a re-run (risk R-5).

---

## 5. Cloudflare Access owner instructions (`operator-test.munaxa.com`)

Source of truth: `infra/aws/cloudflare-access.md`, `stack/variables.tf` 132 to 155, `services.tf` 18 to 26, 167 to 172 and 397 to 427, Control `apps/api/src/config/environment.ts` 59 to 67 and 225 to 246 [V-repo]. **Nothing is created or changed in Cloudflare by this report.**

### 5.1 What the code requires

| Item | Requirement |
|---|---|
| Application type | **Self-hosted** application |
| Hostname | `operator-test.munaxa.com`, path **empty** (covers the portal and Identity's `/api/auth/*` on that host) |
| DNS record | CNAME `operator-test` to the session's ALB name, **proxied** (orange cloud). It is created only after the first `up` and changes every session, because the ALB is recreated each time (G6, finding DNS-H1) |
| Identity provider | One that enforces MFA **and reports it to Access**, so the "Authentication method: MFA" rule can match (or Cloudflare's own MFA for Access where the account offers it). One-time PIN alone is a single factor and must not satisfy the policy |
| MFA enforcement | In the Allow policy, a **Require** rule "Authentication method: MFA" |
| Access policy | Exactly one **Allow** policy. Include: the authorised operator email addresses, listed one by one. No email-domain rule, no "Everyone", no Bypass, no Service Auth policy |
| Allowed operator identities | Owner decision (cloudflare-access.md "Owner decisions" 2). For the first session: the owner's own staff address only. The same people must later be on Control's `control_operator_subjects` list (Identity `sub` values), which is a separate allow-list |
| Session duration | **8 hours or less** |
| CORS | Not needed |
| Edge TLS | **Full (strict)** for this hostname only, through a configuration rule, so other records in the zone are untouched. The origin certificate is the issued ACM certificate, which lists `operator-test.munaxa.com` |
| Unauthenticated request through Cloudflare | Redirect to the Access login at `https://<team>.cloudflareaccess.com`; the portal is never served |
| Request straight to the ALB with `Host: operator-test.munaxa.com` | Portal and every Control operator route answer **401** without a valid `Cf-Access-Jwt-Assertion` (RS256, issuer = team domain, audience = AUD tag, expiry, a person's email and subject), **503** if the team's keys cannot be read. `/healthz` answers 200 (load balancer health check only). Identity's `/api/auth/*` is reachable there, as it already is on `id.test.munaxa.com` |
| Before `operator_access` is set | The stack creates no rule for the operator host, so the ALB answers 403 on it (rule 39) |

### 5.2 Owner steps (Cloudflare Zero Trust dashboard) [O]

1. Zero Trust → Settings → Authentication: add the identity provider chosen above. Confirm it enforces MFA.
2. Zero Trust → Access → Applications → Add an application → **Self-hosted**.
   - Application name: `Munaxa operator (Testing)`.
   - Session duration: `8 hours` (or less).
   - Public hostname: subdomain `operator-test`, domain `munaxa.com`, path empty.
   - Identity providers: only the provider from step 1. Turn off one-time PIN for this application.
3. Policy: name `operators`, action **Allow**. Include → Emails → each operator address. Require → Authentication method → `mfa`. Save. Add no other policy.
4. After saving, open the application's Overview and copy the **Application Audience (AUD) Tag**. Copy the team domain from Settings → Custom Pages (or the team name): `https://<team>.cloudflareaccess.com`. **Both are public identifiers, not secrets**, and can be pasted into the thread.
5. Do **not** create the proxied DNS record yet. It needs the ALB name, which exists only during a session (§9 step 12).
6. Rules → Configuration Rules: when hostname equals `operator-test.munaxa.com`, set SSL to **Full (strict)**. This can wait until step 12 as well.
7. After the first session, sign in once through Access and confirm in Zero Trust → Logs → Access that the MFA requirement matched. If it did not, every login is refused, which is the safe failure.

### 5.3 Terraform input

In `infra/aws/stack/envs/nonprod.tfvars`, in the Config A PR:

```hcl
operator_access = {
  team_domain = "https://<team>.cloudflareaccess.com" # must match ^https://[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$
  audience    = "<AUD tag>"                           # must match ^[A-Za-z0-9]{32,128}$
}
operator_cidrs = [] # unchanged
```

Terraform refuses any Control image without `operator_access` (verified by the mocked test `config_a_without_operator_access_refused`, §8.3).

---

## 6. Identity and Control secret-key inventory (names only)

**No value is printed, stored or requested anywhere in this report.** Bundle names are `munaxa-nonprod/<name>` (`data.tf` 146 to 168). The 10 containers created at G3 are: `identity`, `identity-migrate`, `control-api`, `control-migrate`, `work-api`, `work-migrate`, `school-api`, `school-migrate`, `docs-api`, `docs-operator` (the two Docs bundles exist because `hosts.docs` is set). `identity-bootstrap` is **not** a Terraform container.

| Bundle | Managed by | JSON keys | Read by | Notes |
|---|---|---|---|---|
| `munaxa-nonprod/identity` | Terraform container (G3); values by owner | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` | `identity` service; Valkey sidecar (`REDIS_PASSWORD` only); `db-admin` (`DATABASE_URL` only, as `IDENTITY_APP_URL`) | Every key must be present before the `identity` task starts (ECS refuses a missing key) |
| `munaxa-nonprod/identity-migrate` | Terraform container; values by owner | `DATABASE_MIGRATION_URL` | `identity-migrate` task; `identity-bootstrap` task (as `DIRECT_DATABASE_URL`); `db-admin` (as `IDENTITY_OWNER_URL`) | |
| `munaxa-nonprod/identity-bootstrap` | **Owner creates and deletes it**, not Terraform | `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` | `identity-bootstrap` task only (`ops.tf` 250 to 288) | One run: create before §9 step 15, delete after the role step. Encrypt with `alias/munaxa-nonprod-data`. The task names it without the random suffix; the first run proves the name resolves (a `ResourceInitializationError` naming it means the platform must use the full ARN) |
| `munaxa-nonprod/control-api` | Terraform container; values by owner | `DATABASE_URL` | `control-api` service; `db-admin` (as `CONTROL_APP_URL`) | Everything else Control needs is plain configuration or the KMS key (§7.2) |
| `munaxa-nonprod/control-migrate` | Terraform container; values by owner | `DATABASE_MIGRATION_URL` | `control-migrate` task; `db-admin` (as `CONTROL_OWNER_URL`) | |

**Value formats** (from `README.md` G4, `scripts/db-bootstrap.sh`, product config) [V-repo]:

| Key | Format and rule | Generated by |
|---|---|---|
| `DATABASE_URL` / `DATABASE_MIGRATION_URL` | `postgresql://<role>:<password>@<database_endpoint>:5432/<database>?sslmode=require`. Host = the `database_endpoint` output exactly (node-postgres checks the name). Password `[A-Za-z0-9]{32,128}`: use `openssl rand -hex 32`. Both URLs of a product name the same database; the two roles must differ | Owner (passwords); endpoint from Terraform output |
| `IDENTITY_SIGNING_PRIVATE_KEY` | PEM, PKCS#8 (or SEC1) P-256 private key, at least 100 characters; a public key is refused | Owner (§7.1) |
| `IDENTITY_SIGNING_SECRET` | At least 32 characters (platform `secret()` minimum). Pepper for refresh-token hashes and CSRF signing. `openssl rand -hex 32` | Owner |
| `REDIS_PASSWORD` | Any strong value; `openssl rand -hex 32` | Owner |
| `REDIS_URL` | `redis://:<REDIS_PASSWORD>@127.0.0.1:6379`, the same password as above (the sidecar sets `requirepass` from `REDIS_PASSWORD`) | Owner (composed) |
| `IDENTITY_OWNER_EMAIL` | The first operator's email | Owner |
| `IDENTITY_OWNER_PASSWORD` | Must pass Identity's password policy (minimum 12 characters, breach check on) before anything is written | Owner |

**Database roles and permissions** (`db-bootstrap.sh`, run by `db-admin` as the RDS master user) [V-repo]:

| Product | Database (owner chooses; the URLs carry it) | Owner role | Runtime role | Created with |
|---|---|---|---|---|
| Identity | e.g. `identity` | `identity_owner` | `identity_app` | Owner: `LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS`. Runtime: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`. Database owned by the owner role; `CONNECT` revoked from PUBLIC; runtime gets `CONNECT, TEMPORARY` and schema `USAGE`; the owner role is granted the runtime role `WITH INHERIT FALSE, SET TRUE` |
| Control | e.g. `control` | `control_owner` | `control_app` | same; Control's `infra/sql/grants.sql` grants to `control_app` |

The role names are not free: each product's migrations and grants name them.

**Values AWS or the deployment creates:** the RDS master secret (`rds!db-…`, RDS-managed, read only by `db-admin`); the database endpoint (output `database_endpoint`); the bundle ARNs (output `secret_bundles`); the Control licence KMS key, its ARN and alias (Config A apply). The licence key ARN is injected by Terraform as `LICENCE_SIGNING_KMS_KEY_ID`; nobody copies it.

---

## 7. Signing-key preparation requirements

### 7.1 Identity access-token signing key (owner) [O]

- **Algorithm:** ES256 only (P-256). Identity refuses anything else; Work and Control verify only ES256.
- **Generation:** in a local checkout of munaxa-identity at `5277d71` (after `pnpm install`), run `node apps/api/scripts/generate-signing-key.mjs --kid identity-nonprod-2026-11` (or `pnpm keys:generate -- --kid …`). It writes nothing to disk and prints the private key, the kid and the public half to the terminal. Run it on the owner's own machine or in CloudShell, never in a shared or logged terminal, and never paste its output into a chat, issue or PR.
  - Without Node: `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out key.pem` and `openssl pkey -in key.pem -pubout`, then delete `key.pem` after writing the secret.
- **Key id:** at least 3 characters; convention `identity-<env>-<yyyy-mm>`. Proposed: `identity-nonprod-2026-11`. Public.
- **Where each half goes:**
  - private half → `munaxa-nonprod/identity` key `IDENTITY_SIGNING_PRIVATE_KEY` (Secrets Manager only);
  - kid → `identity_signing_kid` in tfvars (Identity's `IDENTITY_SIGNING_KID`);
  - public half → `identity_public_keys` in tfvars, a JSON array `[{"kid": "<kid>", "publicKey": "<SPKI PEM>"}]`. It reaches Control as `OPERATOR_AUTH_PUBLIC_KEYS` and later Work as `PLATFORM_AUTH_PUBLIC_KEYS`.
- **Terraform rules [V-repo, V-local]:** a session with Identity needs a kid of 3+ characters that is listed in `identity_public_keys`; a private key in `identity_public_keys` is refused.
- **tfvars form:** `.tfvars` cannot call functions, so write the JSON as a heredoc string, with `\n` inside the PEM (JSON escapes, kept literally by the heredoc):

  ```hcl
  identity_signing_kid = "identity-nonprod-2026-11"
  identity_public_keys = <<-EOT
    [{"kid":"identity-nonprod-2026-11","publicKey":"-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----"}]
  EOT
  ```

  The generator's `PLATFORM_AUTH_PUBLIC_KEYS=` line is already this JSON.

### 7.2 Control licence signing key (AWS KMS, created by Terraform)

- **Created by:** the Config A apply. `aws_kms_key.licence` exists only when `images.control_api` is set (`services.tf` 193 to 208, alias 283 to 288): `ECC_NIST_P256`, `SIGN_VERIFY`, 30-day deletion window, `prevent_destroy`, alias `alias/munaxa-nonprod-control-licence`. Its policy lets the account administer it (including `kms:GetPublicKey`) but **only** the `control-api` task role may `kms:Sign` (ECDSA_SHA_256, DIGEST), with explicit denies for any other signer and for `kms:CreateGrant` (`services.tf` 214 to 281).
- **Dependencies:** the Control API image digest (and so `operator_access`, which Terraform requires with any Control image); the `control-api` task role (created in the same apply). Cost about US$1 a month.
- **Deployer permissions:** the nonprod deployer's allow-list contains `kms:CreateKey` with own tags, `kms:PutKeyPolicy`, `kms:GetPublicKey`, alias management on own names (`bootstrap/iam_allow.tf` 38 to 41, 124 to 130, 218 to 221, 260 to 261) [V-repo]. **These Config A actions have never been simulated or exercised** (risk R-3).
- **Public-key export (owner, CloudShell, after the Config A apply) [O]:** the public half is not secret.

  ```bash
  aws kms get-public-key --key-id alias/munaxa-nonprod-control-licence --region eu-central-1 \
    --query PublicKey --output text | base64 -d | openssl pkey -pubin -inform DER -outform PEM
  ```

  Check that `KeySpec` is `ECC_NIST_P256` and `SigningAlgorithms` contains `ECDSA_SHA_256` (same command with `--query '{Spec:KeySpec,Alg:SigningAlgorithms}'`).
- **Configuration (Config B PR):** `control_licence_public_key` = that PEM (heredoc), and `control_licence_kid` (1 to 64 characters; proposed `control-nonprod-2026-11`). Control checks at startup that the key is a P-256 public key and that a probe signed by KMS verifies against it, so a wrong key stops the process.
- **Until then:** Control may run only at `desired_counts` 0. Terraform refuses a session with `control-api` above 0 without the public key, kid, operator organisation, subjects and Identity public keys (verified, §8.3).

---

## 8. Config A requirements and missing inputs

### 8.1 Exact inputs (`infra/aws/stack/envs/nonprod.tfvars`)

| Input | Format required by `variables.tf` | Status | Comes from |
|---|---|---|---|
| `images.identity_api` | `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:<64 hex>` | **Missing** | Identity publish run |
| `images.identity_migrate` | `…/munaxa-identity/migrate@sha256:…` | **Missing** | Identity publish run |
| `images.control_api` | `…/munaxa-control/api@sha256:…` | **Missing** | Control publish run |
| `images.control_migrate` | `…/munaxa-control/migrate@sha256:…` | **Missing** | Control publish run |
| `images.control_portal` | `…/munaxa-control/portal@sha256:…` | **Missing** | Control publish run |
| `valkey_image` | `public.ecr.aws/valkey/valkey@sha256:<64 hex>` (or `docker/library/valkey`, which does not exist) | **Missing** | To choose at PR time (a Valkey 8.x Alpine image), by digest |
| `postgres_image` | `public.ecr.aws/docker/library/postgres@sha256:<64 hex>`, a PostgreSQL 16 client | **Missing** | To choose at PR time, by digest. Without it `db-admin` is not registered (`ops.tf` 103 to 104: count 0) and nothing can create the databases |
| `operator_access` | `{ team_domain, audience }` (§5.3) | **Missing** | Owner, Cloudflare |
| `identity_signing_kid` | 3+ characters, listed in `identity_public_keys` | **Missing** (proposal `identity-nonprod-2026-11`) | Owner (§7.1) |
| `identity_public_keys` | JSON `[{kid, publicKey}]`, no private key | **Missing** | Owner (§7.1) |
| `desired_counts` | **The whole map of 10 keys**, with `control-api = 0` and `control-portal = 0`; others unchanged | Ready to write | Code indexes `var.desired_counts["<service>"]` directly, so a partial map breaks the plan |
| `db_bootstrap_products` | `["identity", "control"]` | Ready to write | |

Unchanged and already correct in `nonprod.tfvars` [V-repo]: `edge_enabled = false`, `services_enabled = false`, `hosts`, `certificate_domains`, `operator_cidrs = []`, `session_backstop_schedule`, `docs_redis_image`. `identity_operator_organisation` keeps its default (`munaxa-group`, "Munaxa Group"). `identity_default_organisation` stays empty (every sign-in names its organisation).

**Also needed in the same PR (not a tfvars input):** `envs/nonprod.expected-changes.json` listing every address the Config A plan creates. `aws-terraform.yml` enforces it exactly. Write it from the PR's real plan, never by hand from this report.

**Not part of Config A, needed later:** `secret_version_ids` (after the owner writes the bundles), `control_licence_public_key` and `control_licence_kid` (Config B), `control_operator_organisation_id` and `control_operator_subjects` (Config C).

### 8.2 What Config A creates (by code reading; exact count from the PR's plan)

With services off and the edge off [V-repo, V-local]:

- **Identity:** `module.identity` (task definition, execution role, task role, security group and its rules, log group; no ECS service while `services_enabled = false`); `module.migrate["identity"]` (run-only); `identity-bootstrap` execution role, policy and task definition.
- **Control:** `aws_kms_key.licence`, `aws_kms_key_policy.licence`, `aws_kms_alias.licence`; `module.control_api` (its Cloud Map service registration is created only in a session, with the ECS service; corrected 7 Nov 2026); `module.control_migrate`; `module.control_portal`. No `control_sweep` schedule (production only).
- **Shared:** the `db-admin` task definition (requires `postgres_image`).
- **Not touched:** RDS, VPC, subnets, the 10 bundles, the ACM certificate, the backstop. Any change or replace there is a stop condition.

### 8.3 Local validation (mocked provider, no AWS) [V-local]

[`supporting/config-a-mocked-plan.tftest.hcl`](supporting/config-a-mocked-plan.tftest.hcl), run against the real `envs/nonprod.tfvars` with placeholder digests and fake Access values and keys: **5 passed, 0 failed** at `3337809`.

| Test | Result |
|---|---|
| Config A, services off | Plans; creates the licence key and alias, Identity, Identity migrate (through `module.migrate`), Identity bootstrap, Control API, migrate and portal, `db-admin`; still no Work, no ALB, 10 bundles |
| Config A, session `up` (edge and services on, Control at 0) | Plans |
| `operator_access = null` with Control images | Refused |
| Session without `valkey_image` | Refused |
| Session with `control-api = 1` before the licence key and operator ids | Refused |

### 8.4 Discrepancies with the existing runbook (`2026-11-05-testing-readiness/03`)

| # | Runbook text | Current code | Effect |
|---|---|---|---|
| D-1 | §4 step 2 names `5277d71`, `a24c568`, `b490b25` "or newer reviewed mains" | Still the current mains, CI green (§2) | None. Still valid |
| D-2 | P-4 lists `desired_counts control-api = 0, control-portal = 0` | The map must be written whole (10 keys) | Write the full map |
| D-3 | 7.5: "placeholders in every other G3 bundle" | A task definition references only its own bundle; `db-admin` reads only the products in `db_bootstrap_products`. Work, School and Docs bundles are not read by any Config A task | Not needed for Identity and Control. Work's bundles are needed at Config D |
| D-4 | §5 lists `identity-bootstrap` as a bundle | It is not a Terraform container; the owner creates and deletes it | Clarified in §6 |
| D-5 | P-4 omits the declaration file | `aws-terraform.yml` requires `envs/nonprod.expected-changes.json` matching the plan exactly | Include it in the Config A PR |
| D-6 | §4 step 1 "confirm the image-release environment" | Still not readable from any session | Owner confirms (§9 step 1) |
| D-7 | 7.4 "Identity key pair" without format | tfvars cannot call `jsonencode`; use a heredoc JSON string | §7.1 |
| D-8 | §8 S-4: "Cloudflare Access login" | Also: straight to the ALB, the portal answers 401 and `/healthz` 200 | Add an S-4b smoke check (§9 step 17) |
| D-9 | Cost: "about US$11 to 12 a month idle" | Unchanged by this audit; Config A adds the licence key (about US$1 a month) | None |

School and Docs: no Config A resource depends on them. `CSRF_TRUSTED_ORIGINS` names the Work and operator hosts as strings only; nothing requires a Work image. Work comes at Config D.

---

## 9. Exact next actions, in dependency order

Each step names its gate. Nothing below is approved by this report.

| # | Action | Who | Gate | Done when |
|---|---|---|---|---|
| 1 | In GitHub, for **each** of munaxa-identity, munaxa-control, munaxa-work: Settings → Environments → `image-release`: required reviewer (preferably a second authorized person; see the self-review risk note under this table), deployment branches and tags = **tags only, pattern `image/*`**, admin bypass off. Settings → Secrets and variables → Actions → Variables: `AWS_IMAGE_PUBLISHER_ROLE_ARN` = the value in §3. Secrets: `PLATFORM_PACKAGES_TOKEN` present (read:packages on the munaxa org, not expired). Settings → Rules: an `image/*` tag ruleset limiting who can create tags (phase 7 `05` O-2 to O-6) | Owner | Read only | Reported in the thread |
| 2 | Run [`supporting/phase1-readonly-check.sh`](supporting/phase1-readonly-check.sh) in CloudShell and paste the log | Owner | Read only | ECR 0 images, roles as in code, 10 containers with 0 versions, no licence key, ACM ISSUED, nothing running |
| 3 | Approve Identity release at `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (or name a newer reviewed main) | Owner | **Release approval** | Recorded |
| 4 | Publish Identity: create and push the tag `image/5277d7190b3dda496443c4bd7d80c78bd4d9174e` on that commit (`git tag image/<sha> <sha> && git push origin image/<sha>`, or the GitHub UI), then approve the `image-release` deployment of "Publish images to ECR" | Owner (tag), owner (approval) | G5 | Both legs green; the 2 digests copied from the run summary |
| 5 | Publish Control: same with `image/a24c5681f0ca98f446098444c79bc36cd4d9bc0c`, workflow "Publish images" | Owner | G5 | 3 digests |
| 6 | Cloudflare Access application (§5.2 steps 1 to 4); paste the team domain and AUD tag | Owner | Cloudflare change | Both values in the thread |
| 7 | Generate the Identity key pair (§7.1); paste only the kid and the public half | Owner | Local | Public half in the thread |
| 8 | Write the bundle values for `identity`, `identity-migrate`, `control-api`, `control-migrate` (§6), one JSON version each | Owner | G4 | 4 bundles hold every key |
| 9 | Publish Work (`image/b490b25792c4d35e5b489790508b2ae6489080cc`) can wait for Config D; it does not block Config A | Owner | G5 | 3 digests |
| 10 | Config A PR (§8.1) with the declaration file, plus `secret_version_ids` for the 4 bundles if already pinned; plan in `aws-terraform.yml`; read; owner approves the apply (services off) | Lead prepares, owner approves | Infrastructure approval | Plan equals the declaration; licence key exists |
| 11 | Read the licence public key (§7.2); Config B PR (`control_licence_public_key`, `control_licence_kid`); apply services off | Owner, lead | Approval | |
| 12 | Session `up` (Identity runs; Control at 0); CNAMEs to the ALB: `id.test`, `control-api.test` DNS only, `operator-test` **proxied**; Full (strict) rule | Owner | G7, G6 | |
| 13 | `db-admin` task: exit 0 | Owner or workflow | G7 | Identity and Control databases and roles exist |
| 14 | `identity-migrate`, then `control-migrate`: each exit 0 | | G7 | |
| 15 | Create `munaxa-nonprod/identity-bootstrap`; run `identity-bootstrap` steps 1 to 3 (Identity `docs/runbooks/aws.md`); delete the secret; restart Identity | Owner | G7 | Organisation id and operator `sub` printed |
| 16 | `down`; Config C PR (`control_operator_organisation_id`, `control_operator_subjects`, control counts 1); apply services off; `up` | Lead, owner | Approval | Control healthy |
| 17 | Smoke tests S-1 to S-6 of the 5 Nov runbook, plus S-4b (straight to the ALB: portal 401, `/healthz` 200). Recheck ACM `InUseBy` and `RenewalEligibility` while the ALB exists. `down` | Owner, lead | G7 | All pass, session closed, database stopped |
| 18 | Then Work (Config D) per the 5 Nov runbook 7.10 to 7.13 | | | |

**Self-review risk (corrected 7 Nov 2026).** The original step 1 recommended turning GitHub's "Prevent self-review" off because there is one maintainer. That is not a routine setting. With it off, the person who pushes the `image/*` tag can also approve the deployment that publishes the image, so one person controls both steps and the separation of duties the environment is meant to give is lost. Prefer a second authorized reviewer on `image-release`. If no second reviewer is available, leaving self-review allowed needs the owner's explicit acceptance of this risk, recorded in the thread and limited to non-production Testing. This report changes no GitHub setting.

Run sessions in daytime UTC and finish before 19:00 UTC; the 21:00 UTC backstop is the last line (a state-changing stop by it has still not been observed).

---

## 10. Risks, blockers and owner approvals required

### 10.1 Blockers (all owner-side)

| # | Blocker | Clears at |
|---|---|---|
| BL-1 | No image in any of the 8 Identity, Control, Work ECR repositories (0 runs, 0 tags) | §9 steps 3 to 5 (and 9 for Work) |
| BL-2 | `image-release` reviewer, tag restriction, `AWS_IMAGE_PUBLISHER_ROLE_ARN` and `PLATFORM_PACKAGES_TOKEN` not readable [U] | Step 1 |
| BL-3 | No Cloudflare Access application (`operator_access`) | Step 6 |
| BL-4 | No Identity signing key (kid and public half) | Step 7 |
| BL-5 | 0 secret versions in the 4 Identity and Control bundles [V-prior] | Step 8 |
| BL-6 | Valkey and PostgreSQL client digests not chosen | Config A PR |
| BL-7 | No Control licence KMS key (created by Config A, then Config B) | Steps 10, 11 |
| BL-8 | No product DNS; ALB CNAMEs change every session | Step 12, every session |
| BL-9 | No successful deployment session or smoke test | Step 17 |
| BL-10 | No read-only AWS access for the lead other than the root connector; AWS state in this report is from 6 Nov | Step 2 |

### 10.2 Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | The workflows have never run; the first run may fail on something reading cannot show (OIDC claims, build) | Medium | First run is Identity (2 images). Failures stop before any push or fail closed. Whether a run waits for an `image-release` approval depends on environment settings that remain unverified [U] |
| R-2 | Work's (and Identity's) build uses `PLATFORM_PACKAGES_TOKEN` with no fallback; Work's current token validity is unproven | Medium | Step 1 confirms. A missing or expired token fails `pnpm install` (no publish) |
| R-3 | The deployer's permissions for Config A (KMS key create and policy, service roles, task definitions, Cloud Map service) were never simulated. G3 failed half-way on an unsimulated IAM pattern | High | Consider an owner-run read-only IAM simulation of the Config A actions before the apply; otherwise stop at the first AccessDenied, as in G3 recovery |
| R-4 | `identity-bootstrap` secret named without its suffix in the task definition | Low | First run proves it; the runbook says what to do if not |
| R-5 | Immutable ECR tags: a partially failed publish cannot be re-run for the same SHA | Low | New reviewed commit and tag. Never relax immutability |
| R-6 | Control's publish job does not verify non-root or credential absence after push | Low | Dockerfile sets `USER node`; consider a later hardening PR mirroring Identity and Work |
| R-7 | ACM certificate renewal eligibility INELIGIBLE while unattached [V-prior] | Low | Recheck at step 17 |
| R-8 | Backstop has not yet been seen stopping a running database or service | Medium | Finish sessions early; manual `down`; check CloudTrail after the first session |
| R-9 | Identity issues no MFA claim; operator MFA rests on Cloudflare Access plus the subject allow-list | Accepted for Testing (TD-3) | Access MFA Require rule and its log check (§5.2 step 7) |
| R-10 | The AWS connector available to sessions is signed in as root | High (standing) | Not used. Owner-run read-only scripts remain the approved path |

### 10.3 Owner approvals required (separately, each)

1. Release approval for each image (Identity, Control, later Work), and the `image-release` deployment approval in each run (only enforced if the environment's required reviewers are configured, which remains unverified).
2. Creating the Cloudflare Access application and, later, the per-session DNS records.
3. Writing the secret values (G4) and creating and deleting `identity-bootstrap`.
4. Merging and applying Config A (creates the KMS key, which `prevent_destroy` keeps), then Config B and Config C.
5. Each Testing session `up`, and each run-only task.

---

## 11. What this task did and did not do

- **Did:** read the four repositories and the two earlier reports; read GitHub CI, PR, tag, workflow and run metadata; ran Terraform locally with a mocked provider (no credentials, no backend); wrote this report, the read-only owner script and the mocked test.
- **Did not:** no AWS call of any kind (no plan, apply or read); no image publication, ECR write, tag creation or push; no Secrets Manager or KMS action; no Cloudflare or DNS change; no deployment or migration; no Render or Supabase change; no production action; no change to branch protection, environments, IAM or publisher permissions. CanteenHub was not inspected, searched or touched.
- **Pull requests:** this report only (documentation). No workflow-fix PR, because no workflow defect was found.

## 12. Corrections and process history (7 Nov 2026)

- **`image-release` wording (§1, §3, §9, §10).** Earlier text called `image-release` a protected environment and implied a run waits for its approval. The evidence shows only that the workflows reference an environment named `image-release`. Actual environment protection settings, required reviewers, and deployment branch/tag restrictions remain unverified. The publisher role trust (environment and tag conditions) is enforced in AWS IAM and was verified separately in phase 4; that does not establish the GitHub-side settings.
- **Self-review (§9).** The recommendation to turn "Prevent self-review" off is withdrawn as a routine step; see the risk note after the §9 table.
- **Process deviation.** The brief for this phase said not to merge this report's PR. PR #64 was merged on 7 Nov 2026 at 11:19 UTC (squash commit `56640a9`). This is recorded as a process deviation. The merge does not by itself change or invalidate the report's technical findings, which rest on the evidence cited in each section. GitHub records are unchanged.
- **§8.2 detail.** The Control API's Cloud Map service is created with its ECS service, so only in a session (`modules/service/main.tf` 321 to 322), not by the Config A apply.
- Follow-up verification: [`../2026-11-07-release-readiness-verification/`](../2026-11-07-release-readiness-verification/).
