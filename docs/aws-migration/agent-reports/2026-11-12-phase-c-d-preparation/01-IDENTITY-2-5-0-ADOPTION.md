# 01. Identity 2.5.0 adoption (Phase C1 to C3)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

## Result

- The adoption PR is [munaxa-identity#18](https://github.com/munaxa/munaxa-identity/pull/18). It is a **draft** and **not merged**.
  - Branch: `claude/project-thread-1rsder`.
  - Head: `098df24`. Base: main `25823b1`.
- It must stay a draft until Platform 2.5.0 is published **[O]** and the lockfile is regenerated against the registry (below).

## C1. What Identity uses, verified in the repositories

**Identity main `25823b1`** **[V]**:

| Workspace package | `@munaxa/*` dependencies (all `^2.4.1` on main) |
| --- | --- |
| `apps/api` | audit, auth, cache, config, crypto, interfaces, rbac, security, session, types |
| `packages/config` | config, types |
| `packages/testing` | auth, conformance, crypto, interfaces, types |

- **12 of the 13 lockstep packages are used** **[V]**: types, interfaces, crypto, config, cache, logging (transitive, via audit), audit, rbac, session, security, auth, conformance.
- `@munaxa/notifications` is not used.
- `@munaxa/licensing` is not a dependency of Identity.
- The lockfile on main pins every one of them at 2.4.1 from `npm.pkg.github.com` **[V]**.

**Platform main `47ffd08`** (the candidate) **[V]**:
- `scripts/release-packages.mjs --versions` lists exactly 13 packages at `2.5.0`: types, interfaces, crypto, config, cache, logging, audit, rbac, session, security, notifications, auth, conformance.
- `@munaxa/licensing` stays at `0.2.0`.
- `pnpm release:check` passes: "all checks passed".
- No package file changed between the version PR `2bf78ac` and `47ffd08`. `47ffd08` is the docs-only report #113.

**What changed between 2.4.1 and 2.5.0** **[V]** (`git diff 54bbf46 47ffd08` on the 13 packages' `src`). Only 8 files in three packages:

| Package | File | Change | Source PR |
| --- | --- | --- | --- |
| auth | `tokens.ts` | `verifyAccessToken` refuses a missing or non-finite `exp`, a non-numeric `iat`, and reads a string `aud` as one value | #100 |
| auth | `mfa.ts` | `verifyRecoveryCode` returns false unless a confirmed factor exists | #100 |
| auth | `login.ts` | the lockout key uses the trimmed, lowercased identifier | #107 |
| cache | `redis.ts`, `counters.ts` | `increment` sets counter and expiry in one `EVAL` script; `hitWithHistory` | #107 |
| security | `ratelimit.ts`, `middleware.ts`, `normalize.ts` | see below | #107 |

The security changes are:
- stable counters, and the penalty as a separate block key;
- `onStoreFailure: 'deny'`, with 503 `SECURITY_RATE_LIMIT_UNAVAILABLE`;
- canonical route matching;
- IPv6 counted by /64 for every `ip` rule;
- a malformed counter value is treated as a store failure;
- rules are validated when they are constructed.

**[L]** The built output (`dist/`) of the other 10 packages is **byte-identical** between a local 2.4.1 build (`54bbf46`) and the 2.5.0 candidate. Only `package.json` versions differ. The 10 are types, interfaces, crypto, config, logging, audit, rbac, session, notifications and conformance. Only auth (6 files), cache (6) and security (7) differ.

### How Identity meets each change

| 2.5.0 change | Identity code path | Effect on Identity |
| --- | --- | --- |
| `verifyAccessToken` exp/iat/aud | `auth/principal.ts` (`resolvePrincipal`), `auth/token-introspection.ts` | **Gains** the hardening (new test below). Tokens Identity mints are unaffected: `issueAccessToken` always sets a numeric `exp` and `iat`, and `aud` is an array |
| `verifyRecoveryCode` needs a confirmed factor | `mfa/mfa-flow.service.ts` through `IdentityMfa` | Defence in depth. Identity's store already refuses to save or spend codes without an active factor (`mfa-store` test "cannot be saved or spent without an active factor") |
| lockout key trimmed | `LoginService` via `auth.service.ts` | Already closed in Identity (#16 trims before calling Platform). Still tested: whitespace variants share one lockout |
| `RedisCache.increment` via `EVAL` | `platform/cache.ts` (ioredis has `eval`) | Counter and expiry are written atomically. This closes N1 from Phase A. **[U]** `EVAL` on ElastiCache with the AUTH-token default user: expected to be allowed for the default user; to be verified in Phase E |
| `RateLimiter` stable counters, degraded reporting | `AuthEdgeLimiter`, introspection, password change and recovery limiters | Identity's own rules were already non-adaptive and evaluated one rule per limiter. All their tests pass unchanged |
| `ip` rules count IPv6 by /64 | Platform `RateLimiter` applies `addressSubject` on top of the subject Identity already computed | **[L]** Idempotent: Platform's `addressSubject` applied to Identity's output returns it unchanged for 14 inputs (IPv4, padded, IPv4-mapped, compressed and full IPv6, zone ids, `::1`, `::`, malformed). The two functions agree on every well-formed address (a malformed IPv6 with fewer than four groups and no `::` maps deterministically to a different /64 subject; the ALB-set client address cannot have that form). Script: `supporting/tools/idempotence.mjs`. The general `api-per-ip` and `introspect-per-ip` rules now count IPv6 by /64 (stricter) |
| `securityPipeline` 503 on a degraded refusal | `security/edge.middleware.ts` (general rules only) | The general rules keep the default `onStoreFailure` (allow), so the behaviour is unchanged. Credential routes are Identity's `AuthEdgeLimiter` (503 `AUTH_UNAVAILABLE`), unchanged |
| canonical routes in the baseline credential rules | Not used: Identity uses only `api-per-user` and `api-per-ip` from the baseline | none |

## C2. Local candidate, reproducible

All of this was done locally. Nothing was published, and no registry was written to.

1. **[L]** Platform main `47ffd08` was built: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm release:check`.
2. **[L]** The exact 13 packages were packed, using the release script's own filter list (`pnpm -r $(node scripts/release-packages.mjs --filters) exec pnpm pack`). The SHA-256 of each tarball is in `supporting/platform-2.5.0-candidate-SHA256SUMS.txt`.
3. **Tarball bytes are not reproducible; contents are.** Two packs of the same tree gave different SHA-256 for some tarballs. This also explains why the Phase A sums differ from these.
   - **[L]** Extracting the packs showed the only difference: the order of keys in the rewritten `dependencies` of `package.json`. pnpm rewrites `workspace:^` concurrently.
   - The `dist` files are identical.
   - `supporting/tools/content-digest.mjs` computes a digest over the sorted files, with `package.json` keys sorted. Two independent clean builds give the same 13 content digests (`supporting/platform-2.5.0-candidate-CONTENT-DIGESTS.txt`).
   - **[R]** After publication, compare the registry tarballs with these content digests, not with the byte hashes.
4. **[L]** The tarballs were served by a throwaway **read-only** registry on `127.0.0.1:4874` (`supporting/tools/local-registry.mjs`).
   - It serves only `@munaxa/*` at 2.5.0. It has no write endpoint, and PUT is refused.
   - It ran only inside this session's container.
   - Identity resolved against it with `--config.@munaxa:registry=http://127.0.0.1:4874/`. Every other package came from the public npm registry at the versions already locked.
5. **[L]** The 2.4.1 baseline was built the same way from Platform `54bbf46`, the 2.4.1 release commit, and served on `127.0.0.1:4873`.
   - **[V]** 5 of the 12 rebuilt 2.4.1 tarballs (auth, interfaces, security, session, types) are **byte-identical** to the published 2.4.1. Their `sha512` equals the integrity in Identity's committed lockfile.
   - The other 7 differ in bytes, which is consistent with the key-order effect above.
   - So the baseline is the published 2.4.1, not an approximation of it.

No dependency points at an unpublished or wrong version **[L]**:
- the lockfile diff is exactly the 12 `@munaxa` entries: specifiers, versions, resolutions and the transitive `@munaxa/*: 2.5.0` lines;
- no third-party package moved;
- `node_modules/.pnpm` holds only `@munaxa+*@2.5.0`.

## C3. The draft PR

| File | Change |
| --- | --- |
| `apps/api/package.json`, `packages/config/package.json`, `packages/testing/package.json` | `^2.4.1` to `^2.5.0` (17 references) |
| `pnpm-lock.yaml` | the 12 entries only (prettier-formatted, as the repository keeps it) |
| `packages/testing/src/token-introspection.integration.test.ts` | new test (below) |
| `apps/api/src/security/auth-edge-limits.ts` | header comment: re-tested on 2.5.0, why the rules stay Identity's own |
| `docs/rate-limits.md` | one paragraph: 2.5.0 fixed the Platform limiter; IPv6 /64 now also for the general rules |

What the PR leaves alone:
- `@munaxa/licensing` is not touched (Identity does not depend on it).
- No refactoring.
- `AuthEdgeLimiter`, the identity#16 edge limits and the identity#17 cache rules (READONLY reconnect, TLS, `ROLE` readiness, production `REDIS_URL` rules) are unchanged.

**The new test** ("a token with Identity's own signature but no usable expiry, issue time or exact audience is inactive"):
- It signs tokens with Identity's **real** test signing key and kid, for a **live** session, so only the claim checks can refuse them.
- Controls: the unmodified claims re-signed are accepted, and an exact string `aud` is accepted.
- Six variants are tested. Each must be inactive in introspection and must not resolve as a principal:
  1. no `exp`
  2. `exp` as a string
  3. `exp: null`
  4. `iat` not numeric
  5. `aud` `"not-munaxa-work-at-all"`
  6. `aud` `"munaxa-workshop"`

| Variant | 2.4.1 (baseline) | 2.5.0 |
| --- | --- | --- |
| 1, 2, 4, 5, 6 | **accepted** as active, principal resolves | refused |
| 3 (`exp: null`) | refused (null × 1000 = 0, so already expired) | refused |

**[L]** So 2.5.0 changes Identity's own security behaviour, and the change is a strict tightening.

**Exploitability on 2.4.1** **[R]**:
- Low. Only Identity holds the signing key, and Identity always mints a numeric `exp` and an array `aud`.
- The value is defence in depth against a minting bug, or against a token signed by another component sharing the key. Nothing else signs with it: the readiness probe signs a constant and never returns it **[V]**.

## Why the draft's CI fails, and the steps to make it ready

**[V]** The draft's 12 `resolution` entries name `http://127.0.0.1:4874/tarballs/...`.
- CI's `pnpm install --frozen-lockfile` cannot reach that address, so the job fails at Install. This is expected and fails closed.
- The integrity `sha512` is pinned per entry, so even a hostile server on that port could not substitute content.

After the owner-authorized publication **[O]**:

**Corrected in review round 1 (finding A1, Medium).** The commit message of `098df24` says to run
`pnpm install --lockfile-only`. **That does not work [L]:** pnpm keeps an existing entry that already
satisfies `^2.5.0`, so all 12 `127.0.0.1:4874` URLs stay. `pnpm update "@munaxa/*" --lockfile-only`
does not work either [L] (the version does not change, so the resolution is reused). Tested
procedure, run against a second local registry on another port as a stand-in for GitHub Packages [L]:

1. On the branch, with a `read:packages` token for `npm.pkg.github.com`:
   - `node drop-munaxa-resolutions.mjs pnpm-lock.yaml` (`supporting/tools/`): removes the 12 `@munaxa`
     entries from the lockfile's `packages:` section only;
   - `pnpm install --lockfile-only --fix-lockfile`;
   - `pnpm exec prettier --write pnpm-lock.yaml`.
   Locally this re-resolved all 12 from the other registry, left everything else unchanged, and a
   following `pnpm install --frozen-lockfile` installed 12 `@munaxa/*@2.5.0` packages.
2. Check, and stop if any fails:
   - `grep -c 127.0.0.1 pnpm-lock.yaml` is 0;
   - the diff against `098df24` touches only the 12 `@munaxa` `resolution:` blocks;
   - every `@munaxa` entry resolves from `npm.pkg.github.com`.
3. Compare the published bytes with the reviewed candidate (finding A2, Low):
   - the candidate's 12 `sha512` values are kept in `supporting/identity-18-lockfile-candidate-sha512.txt`;
   - published values may differ, because packing is not byte-reproducible (C2 above);
   - so download the 13 published tarballs (`npm pack @munaxa/<name>@2.5.0`), run
     `node content-digest.mjs *.tgz`, and compare with `supporting/platform-2.5.0-candidate-CONTENT-DIGESTS.txt`.
     All 13 must match; otherwise stop.
4. Rerun the full CI reproduction (`identity-ci-local.sh`), push, and require green CI on the final head.
   Then an independent review of that head, mark the PR ready, and merge (standing rule).
5. Identity image rebuild from the merge commit **[O]** (runbook 03).
