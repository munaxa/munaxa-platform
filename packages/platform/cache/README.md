# @munaxa/cache

> One CachePort, several backings, no product-visible difference.

CachePort implementations (memory, Redis-compatible), namespacing, distributed counters, distributed locks and the storage primitives rate limiting is built on.

Part of the [Munaxa shared security platform](../../../docs/security-platform/README.md). This package
contains no product-specific logic and depends on no Munaxa application.

## Install

```jsonc
// package.json
"dependencies": {
  "@munaxa/cache": "workspace:^"
}
```

## Documentation

- [Architecture](../../../docs/security-platform/architecture.md)
- [Developer guide](../../../docs/security-platform/developer-guide.md)
- [API reference](../../../docs/security-platform/api.md#munaxacache)
- [Extension guide](../../../docs/security-platform/extension-guide.md)
- [Threat model](../../../docs/security-platform/threat-model.md)

## Guarantees

- **Deployment and cloud agnostic** — Node built-ins only; every external capability arrives
  through a port from `@munaxa/interfaces`.
- **Multi-tenant** — every entry point takes, or derives, a `TenantId`.
- **Secure by default** — the zero-argument configuration is the hardened one.
- **Backward compatible** — see the compatibility tests in `test/compat.test.ts`.
