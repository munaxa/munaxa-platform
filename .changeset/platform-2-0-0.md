---
'@munaxa/types': major
'@munaxa/interfaces': major
'@munaxa/crypto': major
'@munaxa/config': major
'@munaxa/cache': major
'@munaxa/logging': major
'@munaxa/audit': major
'@munaxa/rbac': major
'@munaxa/session': major
'@munaxa/security': major
'@munaxa/notifications': major
'@munaxa/auth': major
'@munaxa/conformance': major
---

Platform 2.0: every at-most-once decision moves out of process memory and into the store.

Breaking: `AuditService` requires a repository and `resume()` is gone; `OtpService` is async;
`markRotated`, `markConsumed` and `appendChained` are required port members; the four unwired
ports (`random`, `ids`, `events`, `signingKeys`) are removed; `providerPresets.firebase` throws
rather than returning a config that accepts unverified tokens; `engines.node` is `>=22.12.0`.

Added: `@munaxa/conformance`, `compatibleCsp()`, `cacheKey()`/`keySegment()`,
`CachePort.compareAndSet`, and enforcement-mode reporting on sessions, token buckets, MFA replay
and notification dedupe.

See docs/security-platform/migration/platform-2.0.md.
