# @munaxa/audit

> A hash-chained record of who did what, to what, and whether it worked.

Tamper-evident audit trail: event schema, service, repository, decorators, middleware and exporters.

Part of the [Munaxa shared security platform](../../../docs/security-platform/README.md). This package
contains no product-specific logic and depends on no Munaxa application.

## Install

```jsonc
// package.json
"dependencies": {
  "@munaxa/audit": "workspace:^"
}
```

## Documentation

- [Architecture](../../../docs/security-platform/architecture.md)
- [Developer guide](../../../docs/security-platform/developer-guide.md)
- [API reference](../../../docs/security-platform/api.md#munaxaaudit)
- [Extension guide](../../../docs/security-platform/extension-guide.md)
- [Threat model](../../../docs/security-platform/threat-model.md)

## Verifying

```ts
// A whole chain, from genesis.
verifyChain(records, { formats });

// A batch, continuing from a head established elsewhere — a signed checkpoint, or the last
// record of the previous batch. `null` means genesis, so `checkpoint ?? null` is safe.
verifyChain(batch, { from: checkpoint, formats });
```

An intact chain returns `{ valid, checked }`. A failure adds `code` — `SEQUENCE_GAP`,
`LINK_MISMATCH`, `DIGEST_MISMATCH`, `UNKNOWN_FORMAT`, `MISSING_IDENTIFIER` — the broken record's
`brokenAt` position and `brokenAtId`, and the pair of values belonging to that code. Branch on
`code`; `reason` is prose and not an API.

The platform does not authenticate the head you supply, and cannot: sign the resume point and keep
the key outside the store holding the chain. See
[ADR-0021](../../../docs/security-platform/adr/0021-resumable-verification.md) and the
[audit evolution guide](../../../docs/security-platform/migration/audit-evolution.md).

## Guarantees

- **Deployment and cloud agnostic** — Node built-ins only; every external capability arrives
  through a port from `@munaxa/interfaces`.
- **Multi-tenant** — every entry point takes, or derives, a `TenantId`.
- **Secure by default** — the zero-argument configuration is the hardened one.
- **Backward compatible** — see the compatibility tests in `test/compat.test.ts`.
