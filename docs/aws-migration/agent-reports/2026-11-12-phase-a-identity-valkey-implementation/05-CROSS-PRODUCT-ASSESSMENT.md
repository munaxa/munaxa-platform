# 05. Cross-product assessment

Source read at each product's main **[V]**; installs not possible (no GitHub Packages token in this
session), so no product test suite was run against 2.5.0 except Identity.

| Product (main) | Lockstep packages used | 2.5.0 changes it would receive | Needs 2.5.0? |
| --- | --- | --- | --- |
| Identity (`a1bf695`) | auth, security, cache, crypto, config, ... | #107 rate-limit and store-failure fixes, #100 auth hardening | **Yes**, the reason for the release; tested locally (03) |
| Work (`eabcc47`) | `@munaxa/auth` `TokenService.verifyAccessToken`, crypto ^2.4.1 | #100 token verification hardening | Optional, defense in depth: only Identity signs ES256 tokens Work verifies |
| Control (`1f58c90`) | `@munaxa/auth` `TokenService`, crypto ^2.4.1 | same as Work | Optional, same reason |
| School (`4c2b4a4`) | crypto `AsymmetricSigner` only | none (crypto source unchanged since 54bbf46) | No |
| Docs (`9d06698`) | crypto only, or none | none | No |
| munaxa site (`9a48a95`) | none of the 13 | none | No |

**[V]** Changed source between 2.4.1 and 2.5.0: auth (login, mfa, tokens), cache (counters, redis),
security (middleware, normalize, ratelimit). Crypto is byte-identical. Licensing 0.2.0 is already in
the product lockfiles.

**Infra effect on other products:** none. The new deployment inputs are null for every other service
(plans unchanged); the cache, its SGs and the ops topic exist only in production with `identity_cache`.
Info: Docs' own Redis sidecar has the same rolling-overlap property Identity had; Docs was out of
scope and not changed. **[R]** Consider 0/100 for Docs when it gets a sidecar-backed security store.

**[R]** Do not upgrade Work, Control, School or Docs in this phase (no demonstrated requirement).
Work and Control can adopt 2.5.0 later in ordinary dependency PRs.
