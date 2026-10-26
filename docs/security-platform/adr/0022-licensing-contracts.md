# ADR-0022 — Licensing is a shared contract, not a shared service

**Status:** proposed (unpublished; publication needs the owner's approval)

---

## The question

Munaxa School, Munaxa Work and Munaxa Docs are to be sold, renewed, suspended and installed on
customers' own servers through one Munaxa Group control plane. Each product must enforce its own
features and quotas, and every product must agree with the control plane — and with each other — on
what a subscription state means, what a licence file is, and what happens when the control plane
cannot be reached.

School already has a subscription model (`packages/domain/src/subscription.ts`, migration
`20260717120000_saas_subscription_platform`) with nine states and its own `canLogin`/`canMutate`.
Docs designed one (its doc 21, ADR-0012) and bound nothing. Work has none. Three products, three
answers, and a control plane that would have to translate between them: the second consumer has
arrived twice over.

## Decision

A new package, `@munaxa/licensing`, holding only what every party must agree on:

1. **One lifecycle** — seven states and an explicit transition table. Expiry (time passed,
   renewable), cancellation (a decision, terminal) and suspension (an immediate administrative act,
   reversible to the state it interrupted) are distinct.
2. **One evaluation** — an entitlement snapshot per tenant per product, and `checkOperation`,
   `checkFeature`, `checkQuota` over it. Product, feature and limit keys are opaque strings: the
   platform evaluates a catalogue it never learns the meaning of.
3. **Access is a ceiling, never a grant.** A product reaches an operation only when its own RBAC
   and tenant isolation allow it *and* the access mode does. Product policy can only tighten the
   default; no configuration gives a suspended tenant write access.
4. **No outage grants access.** `resolveSnapshot` degrades a cached snapshot by age
   (full → no growth → read-only → export) and grants nothing when no snapshot was ever obtained.
5. **Signed offline licences** — ES256 or RS256 only, refusing every symmetric algorithm, because a
   verifier holding an HMAC key holds a minting key. Domain-separated signing input, canonical JSON,
   installation binding, and clock-rollback detection against the last instant the installation
   observed.

What it deliberately does **not** hold: a private key, a table, an HTTP client, a catalogue of
plans, or anything that knows what a school or a document is. The authoritative records and the
signing key belong to the central service; the catalogue and the enforcement belong to each product.

## Versioning

Independent of the security lockstep group. The lockstep exists so a consumer never resolves two
copies of `@munaxa/types` and its branded identifiers; this package exports no branded type and
depends only on `@munaxa/crypto`'s stable signing surface. Joining the group would force a release
of thirteen packages for a change to none of them. It starts at `0.1.0`: the wire format is frozen
(`mxl1`, schema version 1), the TypeScript surface may still move before `1.0.0`.

## Known limits, stated rather than discovered

- **Offline revocation does not exist.** A licence that verifies keeps verifying until it ends. The
  mitigation is short terms with renewal, and online validation where the installation allows it.
- **Clock manipulation is detected, not prevented.** Rollback past the last observed instant, or
  before the licence was issued, is refused. A clock that was always wrong from first boot, and
  never moved back, is indistinguishable from a correct one.
- **Server replacement changes the installation id**, so a bound licence stops verifying. That is
  the intent; the recovery is a controlled reactivation — an `ActivationRequest` with reason
  `SERVER_REPLACEMENT`, answered by the central service with a licence that supersedes the old one.

## Alternatives considered

- **Each product keeps its own model** — the control plane becomes three translators, and "what
  does SUSPENDED mean" has three answers.
- **Put the logic in the central service and have products call it per request** — couples every
  request to a network hop and makes offline installations impossible.
- **Put School's model in the platform as-is** — it carries School vocabulary (`students`,
  `campuses`, JoFotara) and a READ_ONLY *state* where this contract has a READ_ONLY *mode*. School
  maps onto the contract instead (its own integration).
