# Munaxa security reports

Dated security reports across the Munaxa repositories (vulnerability remediation, image supply chain,
scanner evidence). Newest first. Each report also has a line in the single agent-report index,
`docs/aws-migration/agent-reports/README.md`, for review.

The security-platform package documentation lives separately in `docs/security-platform/`.

| Report | Date | Summary |
| --- | --- | --- |
| [2026-11-20-cross-repository-vulnerability-remediation.md](2026-11-20-cross-repository-vulnerability-remediation.md) | 20 Nov 2026 | Control, Work, School, Identity and Docs images moved to a pinned Alpine base with zlib 1.4-r0 and OpenSSL 3.5.9-r1, Node tooling removed, verified and scanned by Grype in CI with zero HIGH/CRITICAL (BUILD VERIFIED — REGISTRY SCAN PENDING); effect advisory fixed and verified in five repositories; 10 withdrawn digests refused by Terraform (87/87 tests). Docs worker NOT FIXED (unpublished); Identity Testing pin needs republish (owner). Repository work only, nothing merged or published. |
