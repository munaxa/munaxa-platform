# Threat model

What the platform defends against, how, and — as importantly — what it does not.

## Assets

| Asset | Why an attacker wants it | Where it lives |
| --- | --- | --- |
| Passwords | Reused across services; the single highest-value credential | Never at rest: scrypt hashes only |
| Refresh tokens | Long-lived access without re-authenticating | Hashed, peppered, single-use |
| Session records | Access as a user without any credential | Product store, revocable |
| MFA secrets | Defeats the second factor permanently | Encrypted at rest via `protectSecret` |
| API keys | Machine access, often broadly scoped | Hashed, peppered, scoped, CIDR-limited |
| Signing keys | Mint any token for any user | `KeyRing`, product-supplied, rotatable |
| Audit trail | Erase evidence of an intrusion | Hash-chained, exported off-box |
| Personal data | Its own end, and regulatory exposure | Product-owned; the platform holds projections |

## Adversaries

1. **Remote unauthenticated attacker.** Credential stuffing, brute force, enumeration, injection,
   CSRF, XSS.
2. **Authenticated user seeking more.** Privilege escalation, cross-tenant access, horizontal
   access to another user's records.
3. **Attacker with a stolen credential.** A phished password, a token copied from a compromised
   device, an API key in a public repository.
4. **Attacker with read access to the database.** A leaked backup, a misconfigured replica.
5. **Malicious or compromised insider.** Legitimate credentials, working to leave no trace.

## Defences, by attack

### Credential stuffing and brute force

- Per-IP and per-account rate limits, adaptive: repeated violations widen the penalty window
  (`BASELINE_RATE_LIMIT_RULES`).
- Account lockout after N failures, checked *before* the KDF so a locked account is cheap to refuse.
- scrypt with N=16384 — around 16 MiB and 50–100 ms per attempt, making offline cracking expensive
  and online guessing slow.
- Breach-corpus rejection at password-set time, over k-anonymity so no live password's full hash
  leaves the process.
- The risk engine raises a credential-stuffing signal when one address attempts many accounts.

**Residual:** a low-and-slow distributed attack across many addresses and accounts stays under every
per-subject limit. Detecting it needs aggregate analytics the platform emits events for but does not
perform.

### Account enumeration

- One error code and one message for unknown account, wrong password, and an account with no
  password. Asserted in `auth/test/security.test.ts`.
- The unknown-account path verifies against a dummy hash, so response time does not answer the
  question either. Also asserted, as a timing ratio.
- Password reset returns the same result whether or not the address exists.
- Lockout is keyed by identifier, so a nonexistent account locks out exactly like a real one.

**Residual:** a registration form that says "this email is taken" re-opens all of it. That form
belongs to the product.

### Session hijacking and fixation

- Session ids are 80 bits of CSPRNG output behind a sortable prefix; a fresh one per login.
- Cookies are `httpOnly`, `Secure`, `SameSite`, and use the `__Host-` prefix, which browsers enforce
  cannot be set by a subdomain.
- Idle *and* absolute timeouts. A stolen session kept warm still dies at the absolute deadline.
- `tokenVersion` invalidates every session and token minted before a credential change, without
  having to find them.
- Optional IP binding, off by default because mobile networks rotate addresses.

**Residual:** an XSS in a product can act as the user for as long as the page is open. `httpOnly`
prevents theft of the cookie, not use of the session. The CSP is the control for that, and it is a
product's job not to weaken it.

### Refresh token theft

- Opaque, hashed with a server-side pepper, single-use.
- Rotation with reuse detection: presenting a rotated token revokes the entire family.
- Device binding: a token issued to one device is refused from another, and the family is revoked.

**Residual:** an attacker who steals a token and uses it *before* the legitimate client refreshes
gets one window of access. Detection happens on the legitimate client's next refresh — that is
inherent to rotation, and the alternative (no rotation) is worse in every case.

### CSRF

- Signed, session-bound double-submit tokens, so an attacker who can write cookies on the domain
  still cannot forge one for the victim's session.
- Origin and Referer checked against a trusted list before token work.
- `SameSite` on every cookie the platform issues.

**Residual:** a subdomain compromise plus a browser that ignores `SameSite` and does not send
`Origin` would get through. Every browser in current support sends `Origin` on state-changing
cross-origin requests.

### XSS

- A default CSP with no `unsafe-inline` and no `unsafe-eval`; inline script only by per-response
  nonce, with `object-src 'none'` and `base-uri 'none'` closing the two reliable escalation routes.
- Every browser capability denied by `Permissions-Policy`.
- Notification templates escape interpolated values in HTML and evaluate nothing.

**Residual:** the platform renders no product markup. A product that emits attacker-controlled HTML,
or adds `unsafe-inline` to make a third-party widget work, has an XSS the platform cannot prevent.
Threat scanning is a tripwire here, not a control.

### Injection (SQL, NoSQL, command, template)

- The platform issues no queries. Products use parameterised queries.
- Input normalization strips control, zero-width and bidirectional characters before comparison.
- Threat detectors record obvious probing as `security.threat.detected`.

**Residual:** pattern matching is trivially evaded. It is worth *recording*; a silent detector proves
nothing. This is stated at the top of `threats.ts` so nobody mistakes it for a WAF.

### Privilege escalation and cross-tenant access

- Deny by default; wildcards allowed in a grant and rejected in a check.
- Deny-overrides policy evaluation.
- Baseline policies: a machine principal cannot change security policy; nobody edits their own roles.
- Every store read asserts the tenant, and a cross-tenant read is indistinguishable from a miss.
- Role graphs are per-tenant, and cycles are rejected when the graph is built.

**Residual:** permission caching leaves a window between a revocation and the next `invalidateUser`.
The window is the cache TTL — 60 seconds by default — and every mutation path in the platform closes
it explicitly. A product mutating role assignments directly must do the same.

### Database compromise

- Passwords: scrypt, salted, per-record.
- Refresh, reset and API-key secrets: hashed with an optional server-side pepper the database does
  not contain.
- MFA secrets: encrypted with AES-256-GCM under a key the database does not contain.
- Device fingerprints: hashed.
- Audit records: chained, so undetected editing requires rewriting the chain.

**Residual:** an attacker with the database *and* the application's secrets has everything the
application has. Separating them — a KMS, a secret manager — is a deployment decision the
`SecretsPort` accommodates and does not make for you.

### Insider action

- Every security-relevant action produces an audit record with an actor, a target, an outcome and a
  correlation id.
- The chain is tamper-evident: `verifyChain` reports the sequence number where editing, deletion or
  reordering occurred.
- Exporters ship records off-box within seconds, which is the only defence against someone who can
  rewrite the whole chain.
- Impersonation has its own events (`auth.impersonation.started` / `.ended`).

**Residual:** tamper *evidence*, not tamper *prevention*. Someone with write access to the store and
to the exporter's destination can still cover their tracks. Append-only storage and off-box export
to a separately-controlled account are the deployment answers.

## Out of scope

The platform does not attempt these, and a product must not assume otherwise:

- **Network security.** TLS termination, certificate management, mTLS, network policy.
- **Denial of service at the network layer.** Volumetric attacks belong to a CDN or a load balancer.
  Rate limiting is an application control and fails open by design.
- **Supply chain.** Dependency scanning, provenance, lockfile review. The zero-dependency policy
  reduces the surface; it does not manage it.
- **Physical and endpoint security.** A compromised device holds a valid session, and no server-side
  control changes that.
- **Product authorization semantics.** The platform decides whether a principal has a permission. What
  permissions exist, and which resource each guards, is a product's design.
- **Data-at-rest encryption for product tables.** `@munaxa/crypto` provides field encryption; wiring
  it to specific columns is a product's decision.
- **SAML.** The port exists and the placeholder fails loudly. XML signature wrapping is a decades-old
  family of bypasses, and implementing it without a vetted library would be worse than not shipping it.

## Assumptions

1. TLS everywhere. Cookies are `Secure`; nothing works over plain HTTP, and that is intended.
2. `request.ipAddress` comes from a trusted edge, not from a raw `X-Forwarded-For`.
3. The application's secrets are not in the same store as its data.
4. Clocks are within the configured skew (30 seconds by default).
5. Products call `invalidateUser` after changing role assignments, and pass `tokenVersion` when
   validating sessions.

Assumptions 2 and 5 are the two most likely to be violated in practice, and both are documented at
the call sites that depend on them.
