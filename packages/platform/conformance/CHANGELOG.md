# @munaxa/conformance

## 2.0.0

**Breaking.** Platform 2.0 moves every at-most-once decision out of process memory and
into the store. See [the migration guide](../../../docs/security-platform/migration/platform-2.0.md)
and [distributed guarantees](../../../docs/security-platform/distributed-guarantees.md).

### Added

- New package. The executable specification of every port: `runCacheConformance`,
  `runAuditConformance`, `runRefreshTokenConformance`, `runResetTokenConformance` and
  `runSessionConformance`, plus the `race`/`tick`/`Seeded` harness they are built on.
- Takes the test runner as a parameter, so it depends on no test framework.
