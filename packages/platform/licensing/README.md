# @munaxa/licensing

> The part every Munaxa product and the central subscription service must agree on.

Subscription lifecycle states and transitions, entitlement snapshots and their evaluation, signed
offline licence documents, the outage policy and the licensing audit vocabulary. Pure rules and wire
formats — no key, no table, no HTTP client and no product vocabulary.

Part of the [Munaxa shared security platform](../../../docs/security-platform/README.md). Versioned
independently of the lockstep group: [ADR-0022](../../../docs/security-platform/adr/0022-licensing-contracts.md).

## Install

```jsonc
"dependencies": {
  "@munaxa/licensing": "^0.1.0"
}
```

## Use

```ts
import { checkQuota, resolveSnapshot, verifyLicense, licenseVerifier } from '@munaxa/licensing';

// SaaS: the snapshot comes from the central service, with the last one cached.
const { snapshot, cap } = resolveSnapshot(live, cached, new Date());
const decision = checkQuota(snapshot, 'users', { used, requested: 1 }, {
  now: new Date(), tenantId, product: 'my-product', cap,
});

// On premises: the snapshot comes from a licence file, checked with the public key only.
const result = verifyLicense(fileText, {
  verifier: licenseVerifier('ES256', [{ kid, publicKey }]),
  product: 'my-product', installationId, now: new Date(), lastObservedAt,
});
```

`checkQuota` is the decision, not the enforcement. Enforce a limit atomically in the transaction
that commits the growth.

### Revocation, offline

A licence an offline installation holds stays valid until it ends — unless a signed revocation list
names it. The issuing service publishes one cumulative list per product, numbered by a `sequence`
that only grows; the installation verifies it with the same public keys, persists the newest one it
accepted, and applies it on every check:

```ts
// Every licence check: the list file now (or null) and the text persisted last time (or null).
const r = resolveRevocationList(fileText, stored, { verifier, product: 'my-product', now: new Date() });
if (r.persist !== null) store(r.persist); // only ever replaced by a newer verified list
const snapshot = applyRevocation(result.snapshot, revocationOf(result.license, r.list));
```

A revoked licence is suspended (read-only under the default policy). An older list than the one
persisted is `STALE`; a list issued after the local clock is `CLOCK_ROLLBACK`; a list for another
product is `WRONG_PRODUCT`. A refused or missing list changes nothing — it never widens access.

## Guarantees

- **Access is a ceiling.** Nothing here grants what a product's own permissions deny.
- **No outage grants access.** A stale snapshot is capped; no snapshot grants nothing.
- **Asymmetric only.** Licences are ES256 or RS256; HMAC is refused at both ends.
- **Customers keep their records.** The default policy never goes below export-only.
- **Revocation only narrows.** A list can suspend a licence; no list, or a refused one, leaves the
  licence exactly as it was. A list and a licence cannot be replayed as each other.

## Documentation

- [API reference](../../../docs/security-platform/api.md#munaxalicensing)
- [ADR-0022](../../../docs/security-platform/adr/0022-licensing-contracts.md) — the decision and its known limits
