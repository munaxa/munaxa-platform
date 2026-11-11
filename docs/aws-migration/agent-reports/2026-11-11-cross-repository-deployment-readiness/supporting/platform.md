# munaxa-platform: shared packages and consumer compatibility audit (PL-)

Date 11 Nov 2026. Auditor scope: `packages/`, `tooling/`, `scripts/`, `.github/`, package docs. Not infra/ and
not docs/aws-migration/. No AWS calls, no pushes, no workflow dispatch.

## 0. Repo facts

- Repo: `munaxa/munaxa-platform` (git remote; `repository.url` in every manifest agrees). Visibility: not determinable
  from code; all packages publish with `publishConfig.access: "restricted"` to `https://npm.pkg.github.com`.
- main SHA audited: `0ae17f9`. Local branch `claude/project-thread-8chfj0` now 4 commits ahead (below), not pushed.
- Recent merged PRs relevant to packages and deployment: #23 `354b4d6` licensing 0.2.0 (signed revocation lists),
  #22 `c9abccd` dev-dependency advisories plus `pnpm audit --audit-level high` in CI, #21 `9cbe87e` licensing 0.1.0,
  #20 `97d65ab` platform 1.7.0 (Docs v2 theme). After those, #63 to #99 are infra/aws and agent-report docs
  (#99 `0ae17f9`, #96, #97, #94, #95, #93 identity probe, #92 identity-probe task def, #90, #91, #86). None of them
  touches `packages/`.
- CI workflows:
  - `ci.yml` (PR to main, and push to main): install (frozen) -> lint -> typecheck -> test -> build -> validate ->
    format:check -> `pnpm audit --audit-level high`; accessibility job (Storybook build plus Playwright a11y);
    facades job (regenerates `packages/{ui,...}` and fails on drift).
  - `release.yml` (workflow_dispatch only, `dry_run` default true): install -> build -> test plus validate ->
    `pnpm -r --filter './packages/**' --filter './tooling/**' publish` with `GITHUB_TOKEN`
    (`permissions: contents: read, packages: write`).
  - `aws-session.yml`, `aws-terraform.yml`: infra, owned by the infra agent, not reviewed.
- Packages and versions on main (= published; see PL-11):

| Package | Version on main | Last version bump | Changes since bump |
|---|---|---|---|
| @munaxa/types, interfaces, crypto, config, cache, logging, audit, rbac, session, security, notifications, auth, conformance (changesets `fixed` lockstep group) | 2.4.1 | `54bbf46` (7 Aug) | only `c9abccd` devDependency bumps (vitest), no `src` change |
| @munaxa/licensing (independent, ADR-0022) | 0.2.0 | `354b4d6` (29 Oct) | none |
| @munaxa/platform (UI implementation) | 1.7.0 | `97d65ab` (15 Oct) | devDeps and eslint config only |
| @munaxa/ui, theme, tokens, icons, typography, utils (facades) | 1.1.1 | `7549319` (12 Aug) | none |
| @munaxa/config-eslint, config-typescript (tooling) | 1.0.0 | | |

Evidence that these versions are published: every consumer lockfile resolves them from
`https://npm.pkg.github.com/download/@munaxa/...` (e.g. munaxa-work/pnpm-lock.yaml:2155), and the integrity hashes
of auth 2.4.1, crypto 2.4.1, licensing 0.2.0, types 2.4.1 and interfaces 2.4.1 are identical in every consumer
lockfile (`sha512-SPxoJtZp...`, `sha512-lwpqkVxa...`, `sha512-Frrz+wsb...`, `sha512-2r4zSkoT...`, `sha512-e/tEr/mY...`).
The registry itself returns 401 in this session, so the tarball content could not be compared to main. A local
`pnpm pack` does not reproduce those hashes, as expected, because `c9abccd` changed `devDependencies` in each
manifest after publishing.

## 1. Consumer matrix

Declared range = resolved version in every case below (lockfiles checked).

| Consumer | @munaxa/* server packages | UI packages |
|---|---|---|
| munaxa-identity `c3928e8` | audit, auth, cache, config, conformance, crypto, interfaces, rbac, security, session, types (logging transitively): all ^2.4.1 -> 2.4.1 | none |
| munaxa-work `b490b25` | apps/api: auth ^2.4.1, crypto ^2.4.1, licensing ^0.2.0 (interfaces, types transitively) | platform ^1.6.1 -> 1.6.1, theme/ui ^1.1.1 |
| munaxa-docs `b8c7e25` | apps/api: licensing ^0.2.0, crypto ^2.4.1 | platform ^1.7.0 -> 1.7.0, icons/theme/tokens/ui ^1.1.1 |
| munaxa-control `a24c568` | apps/api: auth ^2.4.1, crypto ^2.4.1, licensing ^0.2.0 | portal: platform ^1.7.0, icons/theme/ui ^1.1.1 |
| munaxa-school `9671bcb` | apps/api: licensing ^0.2.0, crypto ^2.4.1 | admin: platform ^1.5.2 -> 1.5.2; munaxademo: platform ^1.3.0 -> 1.3.0; theme/tokens/ui ^1.1.1 |

API existence check: a script (`<audit-scratch>/pl/scripts/imports.mjs`) extracted every named import from server
packages across all five consumers (Identity 17 auth, 14 crypto, 19 types, 28 interfaces, 16 config and others;
Work 30 licensing names; Docs 31; Control 24; School 28). Each name was then re-exported from the built 2.4.1 / 0.2.0
`dist` and the result run through `tsc --noEmit`. **Result: exit 0. Every imported symbol exists in the resolved
version.** Because no `src` changed after the version bumps, main and the published versions have the same API.

## 2. Findings

| ID | Sev | Location | Evidence | Impact | Remediation | Blocks | Status |
|---|---|---|---|---|---|---|---|
| PL-01 | Medium | munaxa-platform:packages/platform/auth/src/tokens.ts:169 (pre-fix) | `if (claims.exp * 1_000 + this.#skew < now)`; with no `exp`, or a non-numeric one, this is `NaN < now`, which is false. Probe against built 2.4.1: `no-exp ACCEPTED`, `exp-string ACCEPTED` | A token signed by a trusted key but without `exp` never expires. Identity always sets a numeric `exp`, so this is defence in depth, but it is the only expiry check Work and Control have | Require `exp` to be a finite number, and `iat` too when present | neither | fixed-in-local-commit 67691c2 (on main only; consumers get it at the next auth release) |
| PL-02 | Low | same file:181 (pre-fix) | `const actual = claims.aud ?? []; ... actual.includes(entry)`. A string `aud` uses `String.includes`, so `aud: "munaxa-work-admin"` passes for audience `munaxa-work` (probe: `aud-string-superset ACCEPTED`) | Audience confusion if an issuer ever mints string audiences. Identity mints arrays | Read a string `aud` as `[aud]`, matched exactly | neither | fixed-in-local-commit 67691c2 |
| PL-03 | High | munaxa-platform:.github/workflows/release.yml:7-12, 49-53 | `on: workflow_dispatch` with no ref condition; Publish step `if: ${{ !inputs.dry_run }}` only | Anyone with write access can dispatch a real publish from any branch or tag. That puts unreviewed code into GitHub Packages under a version that can never be replaced, and every consumer's caret range picks it up | Fail a non-dry-run unless `github.ref == 'refs/heads/main'` | prod | fixed-in-local-commit 7763456 |
| PL-04 | Medium | release.yml:46-53; package.json `"release": "pnpm release:check && changeset publish"` | The workflow publishes with `pnpm -r publish`, so `scripts/verify-release.mjs` (exports targets, lockstep agreement, no build-time runtime deps) never runs in the release path | A broken manifest can be published | Run `pnpm release:check` in the workflow | neither | fixed-in-local-commit 7763456 |
| PL-05 | Medium | Cross-repo: munaxa-work/apps/api/src/identity/authentication-port.ts:51-59; munaxa-control/apps/api/src/auth/authentication.guard.ts:63-71,144-176; platform tokens.ts:187 | `verifyAccessToken` checks `ver` only when the caller passes `options.tokenVersion`; neither Work nor Control can (public keys only, no Identity directory), and Identity exposes no introspection or revocation feed (no route found under munaxa-identity/apps/api/src). Control requires `sid` to be present but never checks that the session is live | After logout, session revocation, password change, account lockdown or refresh-reuse detection, an access token keeps working in Work and Control until `exp` plus skew: `ACCESS_TOKEN_TTL` (default 900000 ms, munaxa-identity/packages/config/src/environment.test.ts:43) plus 30 s. Identity itself checks the session and `ver` (munaxa-identity/apps/api/src/auth/principal.ts:60-70) | Accept and document the window (done in threat-model), keep `ACCESS_TOKEN_TTL` short for operator tokens, or add an Identity introspection or revocation endpoint (product change, out of scope) | prod (operator plane) | open; docs corrected in c1d47c0 |
| PL-06 | Medium | munaxa-identity/apps/api/src/platform/signing.ts:13-34; munaxa-work/packages/config/src/environment.ts:101-106; munaxa-control/apps/api/src/config/environment.ts:33-35 | No JWKS anywhere. The platform has no JWKS client (`providers.ts:270`: "Until the platform ships JWKS verification"). Identity publishes no key endpoint, and an operator copies `publicKeyPem` into `PLATFORM_AUTH_PUBLIC_KEYS` (Work) and `OPERATOR_AUTH_PUBLIC_KEYS` (Control) | Rotating the Identity key means redeploying every verifier with both keys first, then rotating Identity. Nothing is cached, so the "JWKS caching" question does not apply. Verifiers already accept a key ring by `kid` | Document the rotation runbook. Optionally add a JWKS endpoint plus a cached fetch in @munaxa/auth (feature, out of scope) | neither (prod operational) | open |
| PL-07 | Medium | munaxa-identity/packages/config/src/environment.ts:83; platform tokens.ts:115 | One `aud` list per Identity deployment (`IDENTITY_AUTH_AUDIENCE`, comma list) is stamped on every token | If the list names more than one product (e.g. `munaxa-work,munaxa-control`), every token is valid at every listed product. Control mitigates with `tid == OPERATOR_ORGANISATION_ID`, `sid`, optional MFA and an allow-list. Work does not | Keep Work's and Control's audiences out of the same Identity deployment's list, or mint per-audience tokens (Identity change) | prod | open |
| PL-08 | Medium | munaxa-work/apps/api/src/identity/platform-token-authentication.ts (principalFrom, "`tid` is not read"); munaxa-work/apps/api/src/tenancy/tenant.middleware.ts:97 | Work ignores `tid` and applies the token's `perms` (resolved by Identity in the `tid` organisation) inside whichever Work tenant the stored membership selects | A person with memberships in two Work tenants carries one permission set into both. Needs confirmation by the Work agent that Identity org and Work tenant are 1:1 | Confirm, or scope grants per membership | prod (multi-tenant) | open (cross-repo, Work owner) |
| PL-09 | Medium | platform auth/src/mfa.ts:441-443 (pre-fix) | `verifyRecoveryCode` went straight to `store.consumeRecoveryCode`, with no enrollment check | With the platform's memory store, or any adapter that does not check: codes survive `remove()` and still pass as a factor | Return false unless `isEnrolled()` | neither (Identity already mitigates, see PL-10) | fixed-in-local-commit 614dc8e |
| PL-10 | Low | platform auth/src/mfa.ts:416 (`codes.map((value) => sha256Hex(value))`), :467-470 (`remove` deletes only the enrollment), :378-392 (`beginTotpEnrollment` saves over the method's record); interfaces/src/identity.ts:76-89 (no delete-recovery-codes method) | Still present on main: recovery codes are bare SHA-256 with no pepper; `remove()` leaves recovery codes; `beginTotpEnrollment` replaces a confirmed record with an unconfirmed one (memory store `save` filters by method, stores.ts:321-328) | **Only Identity uses MfaService** (munaxa-identity/apps/api/src/mfa/mfa-runtime.ts:1). Its adapter neutralises all four: HMAC over the platform hash with a key-ringed subkey (mfa-keys.ts:98-101); active-factor check in `consumeRecoveryCode` (mfa-enrollment-store.adapter.ts:259-275); `remove` deletes codes when no active factor remains (:189-195); separate active and pending views, so a new enrollment cannot overwrite the live one (:12-22). Docs has its own MFA (below) | Fixing these in the platform needs a port change (delete codes) or a semantic change, and both would break adapters. Keep as known issues; document them in the auth README for future adopters | neither | open (recovery-code check fixed 614dc8e) |
| PL-11 | Low | — | Unreleased on main: only devDependency bumps since each package's last version. The four local commits add a pending `.changeset/auth-verify-claim-shapes.md` (patch, lockstep group). `release.yml` does not run `changeset version`, so a person must version and commit before dispatching | No consumer is behind main. The fixes above reach consumers only after `pnpm release:version` plus a merged PR plus a release dispatch | Normal release process | neither | open |
| PL-12 | Low | munaxa-control/apps/api/src/entitlements/products.controller.ts:58-63; platform licensing/src/control-plane.ts:59-62 | Control answers 304 to `If-None-Match`. `readEntitlementResponse` treats every non-200, non-404 status as UNAVAILABLE (`CONTROL_PLANE_HTTP_304`) | No product sends `If-None-Match` today (grep shows none), so this is latent. If one starts, each 304 counts as an outage and the snapshot degrades to NO_GROWTH after 1 h | Never send conditional requests, or handle 304 in the contract (minor, additive) | neither | open |
| PL-13 | Low | platform licensing/src/control-plane.ts (whole file) | The SaaS entitlement snapshot from Control is unsigned JSON. Only offline licences and revocation lists are signed (ES256/RS256, HMAC refused, license.ts:57, revocation.ts:118) | SaaS integrity relies on TLS plus the bearer service credential. It is consistent with ADR-0022, but worth stating to reviewers | Accept | neither | open |
| PL-14 | Low | munaxa-docs/apps/api/src/modules/identity/infrastructure/jwt.token-service.ts:24-49; domain/totp.ts:167-168; scrypt-password-hasher.ts; munaxa-school/apps/api/src/auth/services/token.service.ts:25-49 | Duplicate implementations: Docs has its own HS256 JWT, TOTP, recovery codes (`sha256("munaxa-docs:mfa-recovery:"+code)`, no secret pepper), scrypt hasher and refresh tokens. School has its own `@nestjs/jwt` HS256 with `JWT_ACCESS_SECRET`. Neither depends on @munaxa/auth, and Identity publishes no OIDC discovery or JWKS to federate against | No single sign-on contract exists for Docs or School; both are separate identity silos. Docs and School are outside the Identity token contract, so they have no compatibility break with it | Product roadmap decision; not a deploy blocker per se | neither | open |
| PL-15 | Low | Docs `core/prisma/tenant-database.ts`, School `apps/api/src/prisma/tenant.helpers.ts`, Identity `persistence/prisma.service.ts`, Work `packages/persistence/src/postgres-unit-of-work.ts` | Each product has its own RLS `set_config` helper; the platform ships none (no `set_config` in packages/) | Four implementations of tenant-context setting; per-repo agents must verify each one (transaction-local `true` flag, pooled connections) | Consider a shared helper later; no change now | neither | open |
| PL-16 | Low | pnpm audit | `pnpm audit --audit-level high` exit 0. Two moderate advisories: glob (GHSA-g3hv-75wg-m249) and minimatch, both via `@storybook/react-vite` (dev only). `--prod` shows minimatch via `tooling/config-eslint` -> typescript-eslint (a lint-config package) | No runtime exposure for published server packages; @munaxa/auth, crypto and licensing have no third-party runtime dependencies | Bump when upstream releases | neither | open |
| PL-17 | Low | auth/test/security.test.ts:27-47 ("spends comparable work"), conformance/test/benchmark.test.ts ("refresh rotation") | Timing assertions failed once each under parallel turbo load (`ratio 6.54 < 5`; a 5000 ms timeout), then passed on three isolated re-runs, including against the unmodified source | Flaky CI risk, not a functional defect | Run them in a separate serial job or relax the bounds | neither | open |

## 3. Specific checks requested

- **JWT verification (@munaxa/auth TokenService.verifyAccessToken)**:
  - alg: taken from the signer, never the header; `alg:none` and HMAC/RSA confusion are rejected (tokens.ts:158-163, test/security.test.ts).
  - Signature: `AsymmetricSigner` ES256 uses `ieee-p1363` (crypto/src/signing.ts:147-151). Unknown `kid` fails.
  - iss: exact string equality, `iss` = Identity's `IDENTITY_BASE_URL` (a trailing slash must match exactly).
  - aud: checked only if the verifier has an audience; Work requires `PLATFORM_AUTH_AUDIENCE` (packages/config/src/platform-authentication.ts:78-80,198), and Control defaults to `munaxa-control`. A verifier without an audience accepts any `aud` (probe confirmed).
  - exp / iat: checked with clock skew, default 30 s (Work `PLATFORM_AUTH_CLOCK_SKEW_MS` 0 to 300000, Control `OPERATOR_AUTH_CLOCK_SKEW_MS`). Missing or invalid `exp` was accepted; fixed in 67691c2.
  - No `nbf` support.
- **JWKS source and caching**: none (PL-06). Keys are static PEMs from the environment.
- **Revocation / tokenVersion for consumers**: not available offline (PL-05). Identity enforces it on its own routes.
- **Claims contract**: Identity issues `sub, tid, sid, iss, aud[], iat, exp, jti, ver, amr, mfa, perms` (auth.service.ts:392-401; refresh keeps the session's `amr`/`mfa`, :321-326). Work reads `sub`, `iss` and `perms`. Control reads `tid`, `sid`, `mfa`, `sub` and `perms`. Nothing a consumer requires is missing.
- **Licensing modes**: the package has no mode. It has access modes FULL > NO_GROWTH > READ_ONLY > EXPORT_ONLY > NONE (access.ts), and product policy can only tighten them.
  - Product `LICENSING_MODE`: Work and Docs offer `NONE | LICENSE_FILE | CONTROL_PLANE`, default `NONE`, refused in production (munaxa-work/packages/config/src/licensing.ts:53-62; munaxa-docs configuration.ts:983-988). School offers `DATABASE | LICENSE_FILE | CONTROL_PLANE`, default `DATABASE`, refused in production (env.validation.ts:133-139). Control is the issuer.
- **Control unavailable**: `resolveSnapshot` (availability.ts:56-80). A live answer wins. A cached snapshot gives FULL for 1 h, then NO_GROWTH to 24 h, READ_ONLY to 7 d, then EXPORT_ONLY. With no snapshot ever: NONE.
  - 401, 403, 5xx, an unparseable body or a subject mismatch count as UNAVAILABLE, never as a cancellation; 404 means NONE (control-plane.ts:59-81).
  - Work and School persist the last good state (`LicensingStateStore`), so a restart during an outage does not drop to NONE.
- **Signatures (ADR-0008)**: licences and revocation lists are ES256 or RS256 only.
  - Control `KmsLicenceSigner` (munaxa-control/apps/api/src/licensing/licence-signer.ts) runs the shared contract twice to bridge the synchronous `Signer` to asynchronous KMS `Sign` over a SHA-256 digest. It converts DER to P1363 (`derToP1363`) and verifies each signature against the published public key before releasing it.
  - Verifiers use `licenseVerifier('ES256', keys)` from the same 0.2.0 package, so the wire format is compatible by construction.
  - `LICENCE_SIGNING_BACKEND` must be explicit in production, but `FILE` is still allowed there (Control agent's call).

## 4. Complete / partial / missing

- Complete:
  - Lockstep security packages 2.4.1 and licensing 0.2.0 are published and consumed at those exact versions, and every consumer import resolves.
  - CI gates lint, typecheck, test, build, contract, format and audit.
  - Licensing outage semantics and KMS-compatible signing.
- Partial:
  - Release pipeline: now guarded locally (PL-03, PL-04); versioning is manual.
  - MFA service: known issues mitigated only in Identity's adapter (PL-10).
  - Token verifier claim hardening: fixed locally, not yet released.
- Missing: JWKS / key discovery, consumer-side revocation or introspection, shared RLS helper, and Identity federation for Docs and School.

## 5. Env var names (no values)

- Identity (issuer): `IDENTITY_SIGNING_ALGORITHM`, `IDENTITY_SIGNING_KID`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_BASE_URL` (= `iss`), `IDENTITY_AUTH_AUDIENCE`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `IDENTITY_SIGNING_SECRET` (refresh pepper), `MFA_ENCRYPTION_KEYS`, `MFA_ENCRYPTION_PRIMARY_KID`, `REDIS_URL`.
- Work: `PLATFORM_AUTH_ISSUER`, `PLATFORM_AUTH_AUDIENCE`, `PLATFORM_AUTH_ALGORITHM`, `PLATFORM_AUTH_PUBLIC_KEYS`, `PLATFORM_AUTH_CLOCK_SKEW_MS`, `LICENSING_MODE`, `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_ALGORITHM`, `LICENSE_INSTALLATION_ID`, `LICENSE_REVOCATION_PATH`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`.
- Control: `OPERATOR_AUTH_ISSUER`, `OPERATOR_AUTH_AUDIENCE`, `OPERATOR_AUTH_ALGORITHM`, `OPERATOR_AUTH_PUBLIC_KEYS`, `OPERATOR_AUTH_CLOCK_SKEW_MS`, `OPERATOR_ORGANISATION_ID`, `OPERATOR_REQUIRE_MFA`, `OPERATOR_SUBJECT_ALLOWLIST`, `LICENCE_SIGNING_BACKEND`, `LICENCE_SIGNING_KMS_KEY_ID`, `LICENCE_SIGNING_PUBLIC_KEY`, `LICENCE_SIGNING_PRIVATE_KEY_FILE`, `LICENCE_SIGNING_KID`, `LICENCE_SIGNING_ALGORITHM`, `LICENCE_PREVIOUS_PUBLIC_KEYS`, `ENTITLEMENT_CACHE_SECONDS`.
- Docs and School licensing: same `LICENSING_MODE` / `LICENSE_*` / `CONTROL_PLANE_*` family; Docs also `LICENSING_REFRESH_SECONDS`.

Secret names:
- Release: `GITHUB_TOKEN` (packages: write).
- Consumers: a `read:packages` token (`NODE_AUTH_TOKEN`, Docker BuildKit secret `github_token`).
- Identity: `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `MFA_ENCRYPTION_KEYS`.
- Products: `CONTROL_PLANE_TOKEN`.
- Control: the licence key file or KMS key ARN.

Startup dependencies, health checks and failure behaviour are package-level only here:
- Verifiers are synchronous and offline, with no startup fetch. Work refuses to start on a partial auth configuration; with no auth configuration it answers 401 to everything.
- Licensing never gates health or readiness (access.ts:41-44). On a Control outage it degrades as described in section 3.

## 6. Commands run (munaxa-platform unless noted)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `pnpm build` | pass, 21/21 tasks |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` (main 0ae17f9) | pass, 27/27 tasks, 1655 tests (platform 621, auth 104, rbac 81, security 99, config 98, conformance 94, audit 93, session 71, licensing 66, notifications 64, cache 59, crypto 57, logging 56, types 51, interfaces 41) |
| `pnpm validate`, `pnpm format:check`, `pnpm release:check` | pass |
| `pnpm audit --audit-level high` | exit 0, 2 moderate (PL-16) |
| `pnpm outdated -r` | only minor or patch updates (storybook 10.6.7, radix minors, tailwind 4.3.5); none in server runtime deps |
| Export-existence `tsc --noEmit` over all consumer imports (`<audit-scratch>/pl/exportcheck`) | pass |
| `node probe.mjs` (verifier edge cases against built 2.4.1) | confirmed PL-01, PL-02, plus no-audience acceptance |
| After fixes: `pnpm --filter @munaxa/auth test` | 109/109 (3 runs). The new tests fail against the old source (3 + 1 failures shown) |
| After fixes: `pnpm turbo run test --concurrency=1 --force` | all packages pass except one timing flake (PL-17); auth re-run 3x 109/109; conformance 94/94 |
| After fixes: build, typecheck, lint, validate, format:check, release:check, audit | pass |

Not run:
- Consumer installs against packed tarballs: the APIs were already proven identical to the published versions, and the consumer agents own those suites.
- Docker builds.
- No Postgres or Redis needed (ports 55432 and 56382 unused).

## 7. Local commits (branch claude/project-thread-8chfj0, not pushed)

1. `67691c2` fix(auth): reject access tokens without a numeric exp; match a string aud exactly (adds 4 tests and a changeset)
2. `7763456` ci(release): publish only from main, and run the release manifest check
3. `c1d47c0` docs(security-platform): state the offline-verifier revocation window; licensing README install range
4. `614dc8e` fix(auth): honour MFA recovery codes only while a confirmed factor exists (adds 1 test, extends the changeset)

None changes a public signature. They narrow only invalid inputs: tokens without `exp`, string-substring audiences,
and recovery codes with no confirmed factor. No version bump.

## 8. Proposed decision

**READY FOR NON-PRODUCTION** for the shared packages as consumed:
- The published versions match main.
- Every consumer import resolves.
- The full suite, typecheck, lint and high-level audit are green.
- Token and licensing contracts are compatible between Identity, Work and Control, and between the Control issuer and every product.

**Not ready for production** until:
1. PL-03 and PL-04 are merged (release guard).
2. PL-01, PL-02 and PL-09 are released as auth 2.4.2 and consumers bump.
3. The PL-05 revocation window is explicitly accepted, or shortened, for the operator plane.
4. PL-07 and PL-08 audience and tenant scoping are confirmed by the Identity and Work owners.
5. A key-rotation runbook exists for PL-06.
