# Image digests that were published to ECR and must never be pinned again, in Testing or production.
# ECR tags are immutable, so the images stay in their repositories; this list is what keeps them out
# of a plan. var.images refuses any of them (variables.tf), whatever repository path names them.
#
# Add a digest here the moment its scan or an owner decision withdraws it, with the reason, and add
# a run to tests/stack.tftest.hcl that proves it is refused. Remove one only by an owner decision.
#
# Sources: ECR scans and digests in agent reports 2026-11-08-first-testing-release-preparation
# (sections 13 to 15), 2026-11-12-identity-image-publication, 2026-11-13-identity-cve-2026-4738-
# remediation and 2026-11-20-rds-rotation-and-docs-first-approvals (file 04), and the security
# report docs/security/2026-11-20-cross-repository-vulnerability-remediation.md.
locals {
  withdrawn_image_digests = {
    # munaxa-control a24c568 (8 Nov): node:22-bookworm-slim, 7 HIGH each in apt, util-linux, zlib and
    # glibc; no Debian fix (control#11 moves Control to the Identity Alpine base).
    "sha256:d6bf8c3c9bdd9b2d6bf67e16412f9a1bfdda19fdf67ff47cee627c63c41b7ce1" = "munaxa-control/api a24c568: 7 HIGH"
    "sha256:203079c9ecda08a16803a9fc9785f51aa5930706dd1c119a7edc3aceb2822c18" = "munaxa-control/migrate a24c568: 7 HIGH"
    "sha256:5a76933c875444c7f6a4067c6219eef4c25698b4e6e924a9b2a5fd69e89c63b1" = "munaxa-control/portal a24c568: 7 HIGH"

    # munaxa-work b490b25 (8 Nov): the floating node:22-alpine tag with zlib 1.3.2-r1, CVE-2026-4738
    # CRITICAL in the api scan. admin and migrate were built FROM the same tag in the same run, so
    # they carry the same zlib; withdrawn with the api (work#33 pins the base with zlib 1.4-r0).
    "sha256:39a89a6fa02c556a7c135c6b5fd801ba563c0bc62883ab2f8cd863db929e3d2e" = "munaxa-work/api b490b25: CVE-2026-4738 CRITICAL"
    "sha256:c06bb7ef50f21f857ddab1f762f8500110d7c90b03b616347a53f3afdb731fdf" = "munaxa-work/admin b490b25: zlib 1.3.2-r1 (CVE-2026-4738)"
    "sha256:ca8c02d9e67cb703b85da4f91e3042234052529c85e7c9f42e0a4966613350fe" = "munaxa-work/migrate b490b25: zlib 1.3.2-r1 (CVE-2026-4738)"

    # munaxa-identity 5a5994f (12 Nov): zlib 1.3.2-r1, CVE-2026-4738 CRITICAL; replaced by 2db6ed9.
    "sha256:848d33c086ae72f6b478bc605b97e64628dcae00477e751a170847b7ea565c97" = "munaxa-identity/api 5a5994f: CVE-2026-4738 CRITICAL"
    "sha256:df44505d9ec562020c659b47c58289ef88d7533aa7e9ed23d74f237a0d6c3ada" = "munaxa-identity/migrate 5a5994f: CVE-2026-4738 CRITICAL"

    # munaxa-identity 5277d71 (8 Nov): before the security hardening (identity#7 to #17), owner decision.
    "sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156" = "munaxa-identity/api 5277d71: pre-hardening"
    "sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820" = "munaxa-identity/migrate 5277d71: pre-hardening"

    # munaxa-identity 2db6ed9 (13 Nov): OpenSSL 3.5.9-r1, 5 HIGH (D-SSL); replaced in Apply 1.
    "sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b" = "munaxa-identity/api 2db6ed9: OpenSSL 3.5.9 HIGH"
    "sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874" = "munaxa-identity/migrate 2db6ed9: OpenSSL 3.5.9 HIGH"
  }
}
