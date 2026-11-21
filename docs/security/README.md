# Munaxa security reports

Dated security reports across the Munaxa repositories (vulnerability remediation, image supply chain,
scanner evidence). Newest first. Each report also has a line in the single agent-report index,
`docs/aws-migration/agent-reports/README.md`, for review.

The security-platform package documentation lives separately in `docs/security-platform/`.

| Report | Date | Summary |
| --- | --- | --- |
| [../aws-migration/agent-reports/2026-11-21-autonomous-pr-integration-and-testing-readiness/](../aws-migration/agent-reports/2026-11-21-autonomous-pr-integration-and-testing-readiness/) | 21 Nov 2026 | **D-SSL (new):** Grype DB of 21 Nov reports 5 HIGH advisories on libssl3/libcrypto3 3.5.9-r1 (CVE-2026-124709, -107494, -121482, -84786, -107493) with no fixed version; every Alpine image scan in Identity, Control, Work, School and Docs now fails closed (first seen on docs#178, run 44892115358). No exception added; owner decision, recommended: wait for the Alpine fix, then one pin bump per repo. Image controls re-verified on every main (pinned base, exact zlib/OpenSSL, no Node tooling at run time, non-root, scan before push, 10 withdrawn digests). Images still to publish listed in file 00 |
| [2026-11-20-autonomous-pr-integration-report.md](2026-11-20-autonomous-pr-integration-report.md) | 20 Nov 2026 | Owner-authorized merges: identity#21 7615589, control#11 7b607e0, work#33 a93c642, school#26 0011680, docs#180 f1fca8f, platform#146 9e3721e; main CI green; nothing published or deployed; owner actions O-2, O-3, D-I1, O-5, O-8. |
| [2026-11-20-security-remediation-and-testing-readiness.md](2026-11-20-security-remediation-and-testing-readiness.md) | 20 Nov 2026 | Docs worker moved off Debian to the scratch Alpine runtime (started and scanned clean in CI); Docs CI 429 fixed with mirror.gcr.io (the Docker Hub login was already set); Next.js 15.5.29; School GHCR push gated; withdrawn digests 87/87; RDS rotation and Stage E P-1 pending the AWS connector sign-in; Identity republish before Stage E recommended (D-I1); publication checklist and Testing sequence. |
| [2026-11-20-cross-repository-vulnerability-remediation.md](2026-11-20-cross-repository-vulnerability-remediation.md) | 20 Nov 2026 | Control, Work, School, Identity and Docs images moved to a pinned Alpine base with zlib 1.4-r0 and OpenSSL 3.5.9-r1, Node tooling removed, verified and scanned by Grype in CI with zero HIGH/CRITICAL (BUILD VERIFIED — REGISTRY SCAN PENDING); effect advisory fixed and verified in five repositories; 10 withdrawn digests refused by Terraform (87/87 tests). Docs worker NOT FIXED (unpublished); Identity Testing pin needs republish (owner). Repository work only, nothing merged or published. |
