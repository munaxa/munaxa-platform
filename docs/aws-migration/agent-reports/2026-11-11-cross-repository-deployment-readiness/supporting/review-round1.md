# Independent review, round 1

I reviewed each PR read-only from `git diff origin/main..HEAD`. Tests ran in clones under
`<audit-scratch>/review/`. No pushes, no GitHub comments, no AWS calls. No added line in any diff
contains a real email address, key or token (the only address is `ada@example.com` in a Platform
test fixture).

| PR | Head | Verdict |
|---|---|---|
| munaxa-identity#14 | a2ec0dbb70c443f009e9aba2fba3055e3e796450 | APPROVE |
| munaxa-platform#100 | cf537aa50843522e83f4bfbd34b3d4d45b627c05 (supersedes 614dc8e) | APPROVE (follow-up on Medium recommended) |
| munaxa-docs#175 | 6f1643faf08b6f744e94fc3a7d4b8c1335715b93 | APPROVE |
| munaxa-work#30 | b6c48e5ddb670bd38e73d75948db84ae2c775edc | APPROVE |
| munaxa-control#8 | 48c36c9c2a2f7fa6fb484b9d46a44f9f9f293664 | APPROVE |
| munaxa-school#25 | b3d560cda9f712540275e1208444d18f2f28edd4 | APPROVE |

No Critical or High findings.

---

## 1. munaxa-identity#14 @ a2ec0dbb: APPROVE

**What I checked**
- `safeReturnTo` (auth.controller.ts:289). It is the only gate for every redirect and page link:
  auth.controller.ts:76/308, mfa.controller.ts:72/87/380. The recovery-codes "Continue" link
  (mfa.page.ts:133) is built from the already-sanitised value.
  - Express 5.2.1 / encodeurl 2.0.0 in the lockfile. I confirmed that `encodeurl('/\\evil.example')`
    returns the string unchanged, so the comment "Express sends it in Location unencoded" is
    accurate. Tab becomes `%09` in `Location`, but is raw in an HTML `href`, where browsers strip
    it, so refusing control characters is necessary there.
  - The query/body value is already decoded, so `%5C` arrives as `\` and is refused. `%255C`
    decodes to a literal `%5C`, which browsers do not treat as a slash. `/%2F/x` is a path.
    `//`, `https:`, `javascript:` and a leading space all fail the existing checks. I found no
    bypass.
- Readiness: the MFA migration creates both tables and grants `identity_app`
  (migration.sql:78). So `information_schema.tables` shows them to the runtime role. CI applies
  every migration in order (ci.yml:102). The `missing` list was already exposed and holds only
  table names. Nothing else consumes `REQUIRED_TABLES`.
- CI secret grep: I ran the new regex locally and it matches nothing. `MFA_ENCRYPTION_KEYS=` is
  empty and `MFA_ENCRYPTION_KEYS_FILE` does not match. The YAML parses.
- Doc claims match the code: `_FILE` or plain variable both read, `IDENTITY_PASSWORD_RESET`
  defaults to `enabled`, `5277d71` exists and #7 to #13 come after it, and the GHCR workflow is
  dispatch-only.
- Tests: `return-to.test.ts` and the new readiness case pass (12/12). The only failure was the
  real-database readiness test, because this sandbox has no Postgres. The old predicate would
  fail the new tests.

**Findings**
- **Low**: auth.controller.ts:66 and mfa.controller.ts:66/81 (pre-existing, not introduced here).
  Express 5's default query parser returns an array for a repeated `?returnTo=a&returnTo=b`.
  `safeReturnTo` then calls `.startsWith` on an array, which throws a TypeError and gives a 500.
  This is not a redirect bypass. Fix: `typeof requested === 'string' &&` as the first conjunct.

## 2. munaxa-platform#100 @ cf537aa: APPROVE

**What I checked**
- tokens.ts:168-203:
  - A token without `exp`, or with a non-numeric one, is rejected.
  - An `iat` that is present must be finite. A missing `iat` still gives `NaN > now`, which is
    false, so it is allowed, which is correct for an optional claim.
  - An array payload has no `exp`, so it is rejected.
  - A string `aud` becomes `[aud]`. An array `aud` is compared element by element with `===`.
    Any other type becomes `[]`, so it is rejected when an audience is expected.
- Consumers. `issueAccessToken` always sets `exp`. I grepped every hand-minted JWT in
  identity, work, control, docs, school and platform. All include `exp`:
  - `cross-product-acceptance.mjs` re-signs real claims.
  - Work's `authentication-port.spec.ts` sets `exp: +900`.
  - Control's `harness.ts` sets `exp: +3600`.

  Machine tokens (`machine.ts`) are opaque and do not use this verifier. School and Docs have
  their own token services. I found no legitimate caller that issues tokens without `exp`.
- `MfaService.verifyRecoveryCode`. Identity's `verifier()` uses the *active* store view, which
  lists confirmed factors only, and its adapter already consumes recovery codes only while an
  active factor exists. So for Identity the only change is one extra `list` query. Docs has its
  own MFA service.
- release.yml. The workflow is `workflow_dispatch` only (no push or tag triggers). With
  `dry_run=false` on main the guard is skipped and Publish runs, so the normal path works.
  `pnpm release:check` passes locally ("all checks passed"). The YAML parses.
- Audit perf test (cf537aa). `peak === 3` proves the three sinks overlap, and `inFlight === 0`
  proves `record` awaits them. It passes and does not depend on wall-clock time.
- The full `pnpm build` and `pnpm test` pass at cf537aa (exit 0). `@munaxa/auth` passes 109/109.
- Doc claims match the code: 15-minute default TTL (tokens.ts:98), 30 s skew, `ver` checked only
  when `tokenVersion` is passed. `@munaxa/licensing` is 0.2.0, matching the README range.

**Findings**
- **Medium**: release.yml:29. The branch guard only stops accidents. `workflow_dispatch` runs
  the workflow file *as it exists on the chosen ref*. Anyone who can push a branch can therefore
  dispatch a copy of release.yml without the guard. They could also add any workflow with
  `packages: write`, and it would publish. This PR does not make that worse, but the PR text and
  comment should not present the guard as a control. Fix: put the publish job in a GitHub
  environment (for example `package-release`) whose deployment branch policy is `main` only,
  with required reviewers. Then GitHub enforces the rule server-side, whatever the workflow file
  on the branch says.
- **Low**: release.yml:32. `${{ github.ref }}` is interpolated into a shell script. Branch names
  can contain `$(...)`. The impact is negligible, since whoever names the branch already controls
  the file. Fix: `env: REF: ${{ github.ref }}`, then `"$REF"`.
- **Low**: mfa.ts:449. With a store that keeps one row per method (the platform memory store,
  stores.ts:320), `beginTotpEnrollment` overwrites the confirmed factor. A user who starts
  re-enrolment and abandons it now has neither a working TOTP nor working recovery codes.
  Before this PR the recovery codes still worked. Identity is unaffected because of its views.
  Fix: mention this in the changeset, or make `begin` not displace a confirmed enrollment in the
  reference store.
- **Info**: `nbf` is not checked, and `sub`/`tid` types are not validated. Both are
  pre-existing and out of scope.

## 3. munaxa-docs#175 @ 6f1643f: APPROVE

**What I checked**
- The check (configuration.ts:1072-1089) sits after `if (NODE_ENV !== 'production') return;`
  (line 961), so it applies in production only.
  - Both strings exactly match `.env.example`: line 74
    `replace-me-with-at-least-32-characters`, and lines 148/154
    `change-me-at-least-thirty-two-characters`.
  - `MFA_TOTP_SEALING_KEY` is empty in the example, and covering it does no harm.
  - Only those exact values are refused, so a real secret cannot collide in practice.
- Production-mode environments:
  - The release smoke (`scripts/release-smoke/run.sh:241-244`) uses `$(secret)` for all four.
  - CI uses `ci-only-secret-at-least-thirty-two-characters`, which is not in the set.
  - The Dockerfile only sets `NODE_ENV`.
  - No compose file or e2e setup uses a placeholder.
- `configuration.spec.ts` passes 67/67, including the new case. That case covers production and
  development behaviour.
- `STORAGE_CREDENTIALS_SOURCE` doc matches the enum, the default STATIC, and the R2 refusal
  (configuration.ts:187/766).
- `af58195` does not exist in history. `626173d` (#171) is the parent of stage 2 (`1f47ba4`), so
  the fix is correct. Nothing parses `retired.tf` comments. The eu-prod Terraform workflow is
  dispatch-only, so merging triggers no plan or apply.

**Findings**
- **Low**: .env.example:319. The commented placeholder
  `CONTROL_PLANE_TOKEN=<service credential, at least 32 characters — a secret>` is at least 32
  characters. Uncommented as-is, it would pass `min(32)` in production. Fix: also refuse values
  that start with `<` and end with `>`, or add it to the set.
- **Low**: infra/terraform/README.md:20. It says the roots "now hold only a backend, providers,
  variables and a `retired.tf` note". They also hold `versions.tf` and `expected-changes.json`,
  and `service/` keeps `launch.auto.tfvars`, `release.auto.tfvars` and its `.example`. It also
  says "#169 to #174", but #170 is not on main. Reword the sentence.

## 4. munaxa-work#30 @ b6c48e5: APPROVE

**What I checked**
- stored-tenant-settings.ts:58-79:
  - It runs `begin read only`, then `set_config('app.tenant_id', $tenant, true)` (local to the
    transaction), then the query, then `commit`. On error it rolls back, and it always releases
    the client.
  - The GUC name and form match `postgres-unit-of-work.ts:44` and the policy
    `tenant_id = app_current_tenant()` (foundation migration).
  - The context is the tenant being asked about, and the `where tenant_id = $1` filter stays. So
    no read can widen past that tenant. Because the setting is transaction-local, nothing leaks
    to the pooled connection's next user.
  - An empty tenant gives `nullif` → null → defaults. A non-UUID throws, as before, because the
    column is `uuid`.
- The integration test uses `fixture.application`, a login role that is NOSUPERUSER with grants
  on `tenant_settings`. The defaults have `timeZone: 'UTC'`, so the test fails without the fix.
  I did not run it here: there is no Postgres in this sandbox.
- ci.yml now triggers on `pull_request` and `push: [main]`. The job has `contents: read` and
  `packages: read` only, with no environment, no `id-token`, no publish or deploy step, and no
  `github.event.*` use that would break on push. None of the other workflows uses
  `workflow_run`, so this triggers nothing that deploys or publishes. `cancel-in-progress`
  evaluates per event, as intended.
- Docs: 34 migration directories and 187 `create table` statements, with no drops. Work calls
  `verifyAccessToken(token)` with no version (platform-token-authentication.ts:148). The new
  env variables all exist with matching defaults (`western`, `14`, `employee`).

**Findings**
- **Low**: docs/adr/0076-cross-product-authorization-contract.md:101. After the correction
  ("a revoked … token is still accepted by Work until it expires"), the retained "This is a
  property of the contract, not a defect" reads as dismissing it. Fix: say it is an accepted
  limit up to the token TTL, and point to the runbook.

## 5. munaxa-control#8 @ 48c36c9: APPROVE

Docs and comments only. ADR-0008 says Accepted, with owner approval on 2026-10-30. The paths it
names exist in munaxa-platform: services.tf:187-201 (the KMS licence key) and data.tf:137/151
(the `control-api` bundle).

**Findings**
- **Low**: docs/operations/recovery.md:9 still says "Infrastructure as code
  (`infra/terraform/`)". Update it to `munaxa-platform` `infra/aws/` to match secrets.md.

## 6. munaxa-school#25 @ b3d560c: APPROVE

**What I checked**
- `runtime-grants.sql` grants exactly what `app-role.sql` grants (schema usage, table DML,
  sequence usage/select, and both default privileges), minus the role creation, plus
  `REVOKE ALL ON _prisma_migrations`. The revoke is stricter, and no API code reads that table.
  - The grant step runs only after `prisma migrate deploy`, so `_prisma_migrations` exists.
  - Without the role, `GRANT` fails and `ON_ERROR_STOP=1` stops the job, as the comment says.
- deploy.yml and seed-environment.yml: triggers are unchanged (dispatch). The bash is valid, and
  the default shell is `bash -e`. Nothing echoes a secret: the error message names only the
  secret, and the seed script prints "(as provided)".
- Staging doc: `LICENSING_MODE` defaults to DATABASE, which production refuses
  (env.validation.ts:133). The https-only rule is at line 119, and the `mxc_` prefix matches
  Control's service-credentials.ts:12.

**Findings**
- **Medium (operational, outside the diff)**: any environment where the old deploy step already
  ran `app-role.sql` against a database that lacked the role now has `munaxa_app` with the
  password `munaxa_app_dev`. The PR prevents new cases but does not detect existing ones. Fix:
  check each deployed environment and `ALTER ROLE munaxa_app PASSWORD …` from the secret store
  where needed.
- **Low**: docs/deployment-staging.md:67. Step 4(b), the step the new deploy.yml comment points
  to, still says "Edit the password in infra/postgres/app-role.sql". That invites putting a real
  password in a tracked file. Fix: give a `CREATE ROLE … PASSWORD :'pw'` command using
  `psql -v`, then `runtime-grants.sql`.
- **Low**: seed-environment.yml:119. The comment above the step still says "Unset them so the
  script's own defaults apply". That is now true only for the email. Update the comment.

---

# Round 2 (new commits only)

| PR | New head | Verdict |
|---|---|---|
| munaxa-platform#100 | 2e2de2a3d5e03119d4b46300e6ebb7632b9ef4e9 | CHANGES REQUESTED (comment states a control that does not exist) |
| munaxa-docs#175 | 130b671d56886aa057501c203b3ec9d1dec7c3dc | APPROVE |
| munaxa-school#25 | 635264c48fb978fa0634dba6822eeebd690eb899 | APPROVE |
| munaxa-control#8 | f8b5b53025a2b2ec31d43ac3674d25ce7a319228 | APPROVE |

identity#14 (a2ec0dbb) and work#30 (b6c48e5) have not changed, so their round 1 verdicts stand.

## munaxa-platform#100 @ 2e2de2a: CHANGES REQUESTED

The diff is `git diff cf537aa..2e2de2a`, which touches release.yml only. The YAML parses. Passing
the ref through `env: REF` fixes the round 1 Low.

- **Medium**: release.yml:22-27. The new comment says that once `package-release` has a
  main-only branch policy, "GitHub then refuses the job from any other ref whatever the file
  says". That is not true.
  - An environment's branch policy and reviewers gate only jobs that *declare* that environment.
    A copy of release.yml on another branch can simply leave out `environment: package-release`,
    and its job then runs ungated.
  - The publish step authenticates with `secrets.GITHUB_TOKEN` and job-level
    `permissions: packages: write`. Neither comes from the environment, so such a copy can still
    publish.

  The environment is worth keeping as a speed bump and an approval record, but it is not the
  server-side control the comment describes. To make it real, the publish credential has to
  exist only inside the environment:
  1. Publish with a token stored as an **environment secret** of `package-release`, such as a
     GitHub App installation token or a fine-grained PAT. A job that does not declare the
     environment then has no publish credential.
  2. Stop this repository's `GITHUB_TOKEN` from writing the packages. In each package's
     settings, under "Manage Actions access", give the repository Read, not Write.

  Until that is done, the comment should say plainly that the environment adds approval but does
  not stop a branch copy of the workflow. This is the owner follow-up item.
- **Low**: release.yml:27. `environment:` is set on the whole job, so dry runs also go through it.
  Once the policy is main-only, a dry run from a branch will be refused, and with a required
  reviewer every dry run waits for approval. That contradicts the step comment "a dry run may use
  any ref". Fix: put the dry run (pack only) in a separate job without the environment, and keep
  the publish job in it.

## munaxa-docs#175 @ 130b671: APPROVE

- `CONTROL_PLANE_TOKEN` is added to the checked keys. `isExamplePlaceholder` trims the value,
  then refuses either a listed placeholder or a value that is wrapped in `<…>`. A generated secret
  (base64, hex, `mxc_…`) never starts with `<` and ends with `>`. The check still runs only in
  production.
- `configuration.spec.ts` passes 67/67 at 130b671, and the extended test includes the exact
  `.env.example:319` string.
- The README sentence is now accurate: #169 and #171 to #174, plus the files the roots keep
  (`launch.auto.tfvars` and `release.auto.tfvars` are image digests and launch settings, with no
  secret). The line wrap is slightly ragged but harmless.
- No findings.

## munaxa-school#25 @ 635264c: APPROVE

- Step 4(b) is correct:
  - The heredoc is quoted (`<<'SQL'`), so the shell does not expand anything inside it.
  - psql does interpolate `:'pw'` in script input read from stdin, and quotes it as a literal.
  - The role is created NOSUPERUSER and NOBYPASSRLS.
  - `runtime-grants.sql` follows, and `_prisma_migrations` exists after step (a).
  - The rotation note covers the existing-DB item.
- The seed workflow comment now matches the behaviour.
- **Low**: deployment-staging.md:70. `-v pw="$APP_DB_PASSWORD"` puts the password in psql's
  argument list, where other local users can see it in `ps` while it runs. A plaintext
  `CREATE ROLE … PASSWORD` can also be written to the server log if `log_statement` covers DDL.
  Acceptable for a one-off step from the operator's own machine. Tighter options are
  `\password munaxa_app` interactively, or passing a pre-computed SCRAM verifier.

## munaxa-control#8 @ f8b5b53: APPROVE

`recovery.md:9` now points to `munaxa-platform` `infra/aws/`. No `infra/terraform` reference is
left in the repo's Markdown. No findings.

---

# Round 3: munaxa-platform#100 @ a4d052feba177a8ba4e756705a09dd4a1aea7563: APPROVE

I read the whole release.yml at a4d052f. The only change since 2e2de2a is release.yml, 5 lines
added and 6 removed. The YAML parses.

- The trigger is still `workflow_dispatch` only, with `dry_run` defaulting to true. No push or tag
  trigger was added.
- `environment:` is gone, so a dry run from any ref runs ungated again. That resolves the round 2
  Low.
- The guard runs only when `dry_run` is false and the ref is not `refs/heads/main`. The ref is
  passed through `env: REF`, so nothing is interpolated into the shell.
- The normal path is unchanged: on main with `dry_run=false`, the guard is skipped and the steps
  run in order: Install, Build, Verify, `release:check`, then Publish with `GITHUB_TOKEN`.
- The new job comment is accurate. It says the guard is not a server-side control, that anyone
  who can push can publish, and that a real control needs an environment-only publish token plus
  package Actions access set to Read. That resolves the round 2 Medium; the remaining work is
  the owner's settings change.
- The rest of PR #100 is unchanged from cf537aa, which I reviewed in round 1. The full test suite
  and `release:check` pass there.

**Findings**
- **Low**: release.yml:32. The step comment still ends "it is not a control on its own, see the
  environment above", but there is no environment now. Fix: change it to "see the job comment
  above". This is cosmetic and does not block the merge.
