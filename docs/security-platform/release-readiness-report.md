# P3.5 — Release, publish and consumer readiness

**Recommendation: Go for consumer migration**, conditional on the two publication steps in §8 that
require credentials this environment does not hold.

The phase question was narrow and answerable: can a consumer install the platform from a registry,
with nothing but `pnpm install`, and build and run against it? It can. That was verified by
publishing all thirteen packages to a real registry and consuming them from two empty directories —
one ESM, one CommonJS — with no overrides, no tarballs, no workspace links and no patching.

---

## 1. Platform release readiness report

### The audit is now clear

| Finding | State |
| --- | --- |
| P0-1 … P0-4 | Resolved in P3 |
| P1-1 Scoped wildcards silently deny | **Resolved here** |
| P1-2 Ports declared and wired to nothing | **Resolved here** |
| P1-3 Default CSP breaks a React app | **Resolved here** |
| P1-4 Firebase preset accepts unverified tokens | **Resolved here** |
| P1-5 `TokenBucket` read-modify-write | Resolved in P3 |
| P1-6 Cache keys do not escape separators | **Resolved here** |
| P1-7 No versioning tooling | **Resolved here** |

**P1-1.** Appending a scope to `courses:*` produced `courses:*:course-42`, where the `*` is no
longer trailing and matches nothing. The administrator saw the role assigned and the permission
listed; every check denied. Scoped wildcards are now dropped and reported through
`onUnrepresentableGrant`. The *effective* permissions are unchanged — they matched nothing before
and are absent now — but the failure is visible instead of silent.

**P1-2.** `random`, `ids`, `events` and `signingKeys` were declared and implemented by nothing.
`signingKeys` advertised JWT key rotation that `TokenService` does not perform. Removed, with a
compat test asserting they stay removed rather than reappearing unimplemented.

**P1-3.** `compatibleCsp()` added as a documented waypoint. `DEFAULT_CSP` is correct and remains
the destination; it is also the likeliest cause of a failed first deploy, because with
`strict-dynamic` present the `'self'` host-source is ignored and every non-nonced bundle script is
blocked. A team meeting that on deploy day disables the CSP entirely, and the strict policy never
arrives. `object-src`, `base-uri`, `frame-ancestors` and `form-action` stay denied in the preset —
they are what turn an injection into execution, and they are not what breaks React.

**P1-4.** The Firebase preset now throws. `OidcProvider` does not verify id-token signatures, which
is safe when the token is fetched from the token endpoint over TLS and unsafe when it arrives from
the client — which is how Firebase tokens normally arrive.

**P1-6.** Keys were interpolated, so tenant `a:b` + user `c` collided with tenant `a` + user `b:c`.
For the permission cache that is one tenant served another's resolved grants. `cacheKey()` and
`keySegment()` were added to `@munaxa/types` — the only package everything depends on — and `rbac`,
`security` and `auth` route through them. Lockout keys now hash the identifier rather than putting
an email address in a Redis keyspace.

### Validation

| Gate | Result |
| --- | --- |
| `turbo run build typecheck test lint` | 52/52 tasks |
| Tests | 875 across 13 packages |
| `prettier --check` | clean |
| `node scripts/verify-release.mjs` | 13 packages at 2.0.0, all checks pass |
| Publish to a registry | 13/13, twice (before and after the metadata fixes) |
| Clean-room ESM consumer | install, typecheck, build, run — all pass |
| Clean-room CommonJS consumer | install, typecheck, build, run — all pass |

---

## 2. Package publication report

All thirteen packages were published to a Verdaccio registry at `http://localhost:4874` and
installed back out of it. Two defects were found by doing so that no amount of reading would have
surfaced.

### Defect 1 — `npm publish` produces an uninstallable package

The first publication used `npm publish`. Every manifest reached the registry with its workspace
protocol intact:

```json
"dependencies": { "@munaxa/types": "workspace:^" }
```

A consumer installing that gets:

```
ERR_PNPM_WORKSPACE_PKG_NOT_FOUND  "@munaxa/types@workspace:^" is in the dependencies
but no package named "@munaxa/types" is present in the workspace
```

**`npm publish` does not rewrite `workspace:`; only `pnpm publish` does.** Republishing with
`pnpm publish` produced correct ranges:

```json
"dependencies": { "@munaxa/crypto": "^2.0.0", "@munaxa/interfaces": "^2.0.0", "@munaxa/types": "^2.0.0" }
```

The existing release workflow already uses `pnpm ... publish`, so it would not have hit this — but
nothing enforced it, and one hand-run `npm publish` during an incident would have shipped thirteen
broken packages. `scripts/verify-release.mjs` now reports every `workspace:` range as a note naming
the requirement.

### Defect 2 — `engines.node` was wrong for CommonJS consumers

Every package declared `>=22.0.0`. The packages are pure ESM, and a CommonJS consumer reaches them
through `require()`, which only works for ESM from **Node 22.12.0** — on 22.0 through 22.11 it
throws `ERR_REQUIRE_ESM`. Munaxa Docs' API compiles to CommonJS, so this is the consumer that
matters. Raised to `>=22.12.0` across all thirteen.

Verified there is no top-level `await` in any `dist`, which would break `require(esm)` on every
Node version regardless.

### Metadata

Audited across all thirteen: `version`, `license`, `description`, `repository`, `types`, `main`,
`exports`, `files`, `publishConfig`, `sideEffects`, `type`, README. Two gaps found and fixed —
`keywords` was missing everywhere, and `@munaxa/conformance` had no README, which is the registry
landing page.

Every package is ESM-only (`"type": "module"`, `sideEffects: false`, single `.` export). No CJS
build is shipped; see §4 for what that costs and why it is acceptable.

---

## 3. Consumer installation validation report

Two clean rooms, each an empty directory with a `.npmrc` naming the registry and nothing else.

### ESM consumer

`module: NodeNext`, twelve platform packages. Exercised end to end at runtime:

```
audit chain valid: true | records: 1
password verify: true
setIfAbsent first: true
setIfAbsent again: false
token bucket enforcement: compare-and-swap
session limit enforcement: distributed-lock
refresh rotated: true
scoped perms: [] | dropped wildcards: ["docs:*@doc-1"]
rate limit allowed: true
csp relaxed for rollout: true
notifications distributed: true
key escaping injective: true
port token: platform.cache
```

Every P1 fix is observable in the published artifacts, not merely in the source tree.

The typecheck initially failed with four errors — all of them mistakes in the consumer script
(a missing `correlationId`, a wrong logger option). That is the outcome to want: the published
type declarations are strict enough to reject incorrect usage from outside the monorepo.

### CommonJS consumer

`module: CommonJS`, `moduleResolution: Node` — deliberately the older resolution mode, because it
is what `@munaxa/config-typescript/nestjs.json` sets and therefore what Munaxa Docs uses. Note that
`moduleResolution: Node` ignores the `exports` field entirely and falls back to `main`; `main` is
set on every package, so resolution succeeds. Compiled to `require()` calls and ran:

```
cjs password verify: true
cjs cacheKey: a:b%3Ac
cjs setIfAbsent: true
```

Works on Node 22.12+. Below that it will not, which is what the `engines` change now states.

### What was *not* used

No `pnpm.overrides`, no `file:` dependencies, no tarballs, no workspace links, no `link:`, no
patching, no `resolutions`. The only configuration is the scope→registry mapping and a credential,
which is exactly what production uses.

---

## 4. API stability report

**Public surface:** 503 exports across the packages at the start of P2; unchanged in count here
apart from the removals and additions below, because this phase deliberately did not redesign the
API.

**Removed in 2.0 (breaking, and free — 2.0.0 has never been published):**

| Removed | Why |
| --- | --- |
| `PORTS.random`, `RandomPort` | Declared, implemented by nothing |
| `PORTS.ids`, `IdGeneratorPort` | Declared, implemented by nothing |
| `PORTS.events`, `EventPublisherPort`, `EventSubscriberPort` | Declared, implemented by nothing |
| `PORTS.signingKeys`, `SigningKeyPort`, `SigningKey` | Advertised JWT key rotation `TokenService` does not do |
| `providerPresets.firebase` | Returned a config that accepts unverified tokens; now throws |

**Added:** `cacheKey`, `keySegment` (`@munaxa/types`); `compatibleCsp` (`@munaxa/security`);
`PermissionResolverOptions.onUnrepresentableGrant` (`@munaxa/rbac`).

**Known surface problem, not fixed here.** P2-1 stands: test doubles (`FixedClock`,
`MemoryLogger`, `Memory*Store`) are roughly half the public surface and ship in the production
entry point. They should move to a `/testing` subpath export. That is a breaking change to the
import path of every memory adapter, and doing it in the same release as the publication fixes
would have made this phase's validation ambiguous. **Recommended for 2.1.0** with the old paths
deprecated, not removed.

**ESM-only is a deliberate freeze decision.** Shipping a dual CJS/ESM build doubles the artifact
surface and introduces the dual-package hazard — two copies of the same class, `instanceof`
failing across them, which for `PlatformError` would break error handling in a way that is very
hard to diagnose. Node 22.12+ `require(esm)` makes the dual build unnecessary. The cost is the
raised `engines` floor, which is stated rather than discovered.

---

## 5. Semantic versioning report

**Strategy: lockstep across all thirteen packages.**

`@munaxa/types` defines branded types that every other package's signatures mention. A consumer
that resolves two different versions of it gets two structurally identical but nominally distinct
`TenantId` types, and the resulting error blames the consumer's own code. Lockstep makes that
unresolvable-by-accident: one version, moved together.

Implemented as a `fixed` group in `.changeset/config.json` listing all thirteen. The design-system
packages (`@munaxa/ui`, `tokens`, `theme`, …) are in `ignore` — they have their own cadence and are
not part of this release train.

**Tooling** (closes P1-7):

- `@changesets/cli` with `@changesets/changelog-github`.
- `scripts/verify-release.mjs`, run as `pnpm release:check`, which refuses to publish when:
  metadata is missing; an `exports` target does not exist; a declared `@munaxa/*` dependency is
  never imported, or an imported one is never declared; the lockstep group has drifted to more than
  one version; a runtime dependency is a build-time tool; **or `src` changed since a given ref while
  the version did not** — the P1-7 requirement, enabled with `--since <ref>`.
- `docs/security-platform/deprecation-policy.md` — the policy that previously existed only as
  prose.

**Version compatibility matrix**

| Platform | Node | pnpm | TypeScript | Consumer module systems |
| --- | --- | --- | --- | --- |
| 2.0.x | ≥22.12.0 | ≥10 | ≥5.7 | ESM (`NodeNext`), CommonJS (`Node`/`Node16`) |
| 1.x | — | — | — | Never published; do not adopt |

All thirteen packages are always at the same version. `@munaxa/conformance` is a devDependency;
everything else is a runtime dependency.

---

## 6. Release checklist

1. Merge the P3/P3.5 branch to `main`.
2. `pnpm install && pnpm build`.
3. `pnpm release:check` — must pass.
4. `pnpm changeset` to describe the release; `pnpm changeset version` to apply versions and
   generate changelogs.
5. `pnpm test && pnpm lint && pnpm typecheck` — must be green.
6. `pnpm release:check --since origin/main` — catches a changed `dist` under an unchanged version.
7. Publish via the **Release** workflow (`workflow_dispatch`), dry run first.
   **It must use `pnpm publish`, never `npm publish`** — see §2, defect 1.
8. Verify from outside the monorepo: `npm view @munaxa/auth@2.0.0 dependencies` must show
   `^2.0.0` ranges, not `workspace:^`.
9. Tag the release and update the compatibility matrix.

---

## 7. Migration readiness report

Detailed per-product checklists are in
[`migration/consumer-checklists.md`](./migration/consumer-checklists.md). In summary:

| Product | State | First step |
| --- | --- | --- |
| Munaxa Docs | Migration started, paused at 2 of 10 areas | Remove the local overrides and reinstall from the registry |
| Munaxa School | Not started | Wire a `LockPort` or `createWithinLimit` before session migration |
| Munaxa Work | Not started | Adopt 2.0 directly; never adopt 1.x |

Every product must run `@munaxa/conformance` against its own adapters, against real
infrastructure, before those adapters carry production traffic.

**Known platform limitations carried forward**, discovered during the Docs migration and not fixed
here because this phase is release-only:

- **P-1 `AuditRepositoryPort` cannot express an existing audit chain.** Needs `bigint` sequences, a
  pluggable canonical form so historical digests keep verifying, and a way for `appendChained` to
  join the caller's ambient transaction. This blocks Munaxa Docs' audit migration and will block
  School and Work identically.
- **P-2 `PasswordHasher` has no synchronous decoy.** Products with a synchronous port hand-assemble
  one, and a mistake silently removes a timing defence rather than failing.
- **P-3 `CachePort` has no prefix invalidation.** Every adapter reimplements the SCAN loop,
  including the `keyPrefix` trap that the Docs adapter hit.

---

## 8. Go / No-Go

**Go**, with two steps outstanding that need credentials rather than engineering:

1. **Publish 2.0.0 to GitHub Packages.** Everything is verified against a real registry; the real
   one has not been written to, because that needs an org token with `write:packages`.
2. **Provide consumers a `read:packages` token.** Munaxa Docs' install currently fails with 401 for
   this reason alone.

Once both are done, a consumer repository can clone, configure credentials, `pnpm install`, build,
test and run against the platform with no local overrides of any kind. That is the success
criterion for this phase, and it is met everywhere except for the act of publishing itself.

**Do not resume the Munaxa Docs migration until step 1 completes** — resuming before that would
reintroduce the tarball-and-override arrangement this phase exists to remove.
