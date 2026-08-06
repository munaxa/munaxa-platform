# Consumer migration checklists

One checklist per product. Each assumes Platform 2.0.0 is published to GitHub Packages and the
environment holds a token with `read:packages` — without both, step 1 fails and nothing after it
matters.

Shared prerequisites, for every product:

```ini
# .npmrc — the scope mapping is committed; the credential never is
@munaxa:registry=https://npm.pkg.github.com
```

```
CI:    actions/setup-node registry-url + NODE_AUTH_TOKEN
Local: pnpm config set "//npm.pkg.github.com/:_authToken" <token>
```

**Node ≥22.12.0.** The packages are ESM-only. A CommonJS consumer reaches them through
`require()`, which only works for ESM from 22.12 — below that it throws `ERR_REQUIRE_ESM`. Both
Munaxa Docs and Munaxa Work compile to CommonJS.

---

## Munaxa Docs

**State:** migration started and paused. Two of ten areas landed (password hashing, a conformant
Redis `CachePort`); the rest are open. See the product's own
`docs/platform-migration/README.md`.

### Required package versions

All thirteen at `^2.0.0`, versioned in lockstep. `@munaxa/conformance` as a devDependency.
`apps/api/package.json` already declares them.

### First step — remove the scaffolding

The paused migration resolves the platform through locally packed tarballs and `pnpm.overrides`.
Delete both, then reinstall from the registry:

- [ ] Remove `pnpm.overrides` from the root `package.json` (it is currently uncommitted).
- [ ] `rm -rf node_modules pnpm-lock.yaml && pnpm install` — the lockfile must be regenerated,
      because the local one references `/tmp` paths and was deliberately never committed.
- [ ] Confirm no `file:` or `link:` specifier for any `@munaxa/*` package survives.
- [ ] `pnpm typecheck && pnpm test && pnpm build`.

### Breaking changes that apply

- `providerPresets.firebase` now throws. Docs does not use it — confirm before upgrading.
- `PORTS.random`, `.ids`, `.events`, `.signingKeys` were removed. Docs does not inject them.
- Lockout cache keys changed shape (hashed identifier, escaped segments). **Existing lockout
  counters and locks are orphaned by the upgrade** — they expire on their own TTL, and the
  practical effect is that anyone locked out at deploy time is silently unlocked. Deploy outside
  an active credential-stuffing incident.

### Required schema updates

None for what has landed. For the areas still open:

- [ ] Refresh tokens: add `replaced_by`, `token_version`, and a token-level `revoked_at`.
      Additive; no data rewrite. `RefreshToken.usedAt` already is the platform's `rotatedAt`.
- [ ] Sessions: implement `createWithinLimit` in the Prisma store, or wire a `LockPort`.

### Required configuration

- [ ] `MfaService.replayGuard`, `OtpService.cache` and `NotificationService.dedupeStore` must all
      receive the shared Redis `CachePort`. Without them those protections are per-process, and a
      stolen TOTP code is worth one sign-in per pod.
- [ ] Log the enforcement modes at startup: `SessionManager.limitEnforcement`,
      `TokenBucket.enforcement`, `MfaService.distributed`, `NotificationService.distributed`.
      Alert on `best-effort` in anything running more than one replica.
- [ ] CSP: adopt `compatibleCsp()` in report-only, then enforcing, before `DEFAULT_CSP`. The strict
      policy blocks every non-nonced bundle script, and the web app is React.

### Known limitations

- **The audit chain cannot migrate.** Docs is on its third versioned digest and its audit table
  refuses `UPDATE` to every role, so historical rows cannot be rehashed against the platform's
  canonical form. It also uses `bigint` sequences and commits the audit row inside the business
  transaction. Blocked on platform follow-up P-1. Keep the local chain.
- `LegacyScryptVerifier` must stay until no `scrypt$`-prefixed credential rows remain.

### Verification

- [ ] `pnpm install` with no overrides, from a clean `node_modules`.
- [ ] Full suite green — the baseline was 842 tests, and was 859 when the migration paused.
- [ ] Integration suite against PostgreSQL. **Never yet run against the migrated code**; several of
      its 33 files were edited during the paused migration.
- [ ] `runCacheConformance` against the real Redis — 13/13.
- [ ] Sign in with a pre-migration password and confirm the hash is rewritten to PHC format.

### Rollback

Revert the application commits. No schema change has shipped, so there is nothing to undo in the
database. Password hashes written after the upgrade are PHC-format and the reverted code cannot
read them — so anyone who signed in during the window must reset. Keep the window short, or leave
the platform hasher registered while reverting everything else.

---

## Munaxa School

**State:** not started.

- [ ] Confirm Node ≥22.12.0 and the registry credential.
- [ ] Add `@munaxa/*@^2.0.0`; adopt 2.0 directly and never 1.x.
- [ ] **Wire session concurrency first.** School relies on session limits, and without either
      `createWithinLimit` or a `LockPort` the limit is a hint — with six replicas it demonstrably
      overshoots. `limitEnforcement` will report `best-effort`; treat that as a release blocker.
- [ ] Wire the shared cache to MFA, OTP and notification dedupe.
- [ ] **Check for scoped wildcard role assignments before upgrading.** P1-1 changed these: a
      wildcard on a scoped assignment is now dropped and reported rather than resolved into a
      permission that matched nothing. Effective access is unchanged, but
      `onUnrepresentableGrant` will start firing, and each occurrence is a role that never worked
      as its administrator believed.
- [ ] Run `runSessionConformance` and `runCacheConformance` against real infrastructure.
- [ ] Same audit-chain limitation as Docs if School has an existing chain (P-1).

**Rollback:** no schema change is required to adopt; revert application commits.

---

## Munaxa Work

**State:** not started. Least constrained of the three — adopt 2.0 directly.

- [ ] Confirm Node ≥22.12.0 and the registry credential.
- [ ] Add `@munaxa/*@^2.0.0`.
- [ ] Wire the shared cache to MFA, OTP and notification dedupe from the start.
- [ ] Choose the session-limit mechanism at design time rather than discovering `best-effort` later.
- [ ] Adopt `DEFAULT_CSP` directly if the front end is new; there is no legacy policy to unwind.
- [ ] Run the conformance suites for every adapter written, against real infrastructure.

**Rollback:** nothing to roll back before first adoption.

---

## Verification common to all three

| Check | Command |
| --- | --- |
| Installs from the registry alone | `rm -rf node_modules && pnpm install` |
| No local resolution survives | `grep -rn '"@munaxa/' package.json apps/*/package.json \| grep -E 'file:\|link:\|workspace:'` — must be empty |
| Published ranges are real | `npm view @munaxa/auth@2.0.0 dependencies` — `^2.0.0`, never `workspace:^` |
| Adapters honour their contracts | The `@munaxa/conformance` suites, against real infrastructure |
| Enforcement modes are known | The startup log line from the configuration checklist |
