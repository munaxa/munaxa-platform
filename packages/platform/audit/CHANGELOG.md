# @munaxa/audit

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Changed

- `AuditService` now requires `repository: AuditRepositoryPort`. The chain head lives in the
  store, so two replicas can no longer seal against the same head and produce a chain that
  `verifyChain` reports as tampering.
- `sinks` is optional and now means "also mirror to these". The repository is the chain.
- Conflicts from optimistic adapters are retried up to `maxChainAttempts` (default 5) and counted
  on `conflictCount`.
- A failed chain append fails the caller. A failed sink still does not.

### Removed

- `AuditService.resume()`. There is nothing to resume, and forgetting it used to produce a broken
  chain that nothing in the code path could tell you about.

### Unchanged

- The canonical form. A chain written by 1.0 verifies under 2.0 and vice versa.
