# Changelog

All notable changes to `@munaxa/licensing`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-10-28

The first release: the contracts every Munaxa product and the central subscription service
(`munaxa-control`) share, so that a subscription means the same thing in each (ADR-0022). The
package holds no key, no table and no product vocabulary.

### Added

- **Subscription lifecycle.** States, the legal transitions between them, and the status a term's
  dates imply at an instant.
- **Entitlement snapshots and their evaluation.** `parseEntitlementSnapshot`, feature and limit
  checks, and `DEFAULT_ACCESS_POLICY`: what each status allows per `OperationKind` (`READ`, `WRITE`,
  `GROWTH`, `EXPORT`). A cancelled subscription is export-only; a suspension defaults to read-only.
- **Signed offline licences (`mxl1`).** `licenseVerifier` and `verifyLicense`, bound to a product and
  an installation, verified with public keys only, and refusing a term that ended before the latest
  instant already observed (clock rollback). `issueLicense`/`armorLicense` for the service, which
  supplies its own signer, and `encodeActivationRequest`/`decodeActivationRequest` for offline
  activation.
- **Outage policy.** `SAAS_AVAILABILITY_POLICY` and `resolveSnapshot`: the last good snapshot,
  degraded by age — full for an hour, no growth for a day, read-only for a week, then nothing.
- **The central service's product-facing wire format.** `entitlementsPath`, `usagePath`,
  `UsageBatch`, `USAGE_BATCH_MAX`, `unreachable` and `readEntitlementResponse`, the one reading of
  an answer: a `404` is "no subscription", a `401`/`403` or a malformed body is an outage.
- **Licensing audit vocabulary**, shared by the service and the products.
