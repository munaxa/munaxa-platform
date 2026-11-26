# Combined Testing rollout: Docs demo starter, Control tenant auto-fill, Identity sign-in redesign

Date: 25-26 Nov 2026. Environment: Testing (nonprod, eu-central-1). Owner approvals in the project thread.

## Result

**DONE.** Three Testing rollouts went out in one pin PR, one Terraform apply and one Testing session.
Tamer confirmed on 26 Nov at 12:33 UTC that the Docs demo starter configuration is visible.
Testing was shut down afterwards (see Shutdown).

| Rollout | Source | Live result |
|---|---|---|
| Docs demo starter configuration (seed:demo) | munaxa-docs#184 + #187, release `cec7bcc` | Dry run, then real run on tenant `munaxa-internal`: 52 created, 2 already present, 0 skipped |
| Control tenant auto-fill (tenant sightings) | munaxa-control#18 + #16, release `659c8b8` | control-migrate exit 0, `20261125200000_tenant_sighting` applied, grants applied; Docs entitlement checks answered 200 |
| Identity sign-in redesign | munaxa-identity#29, release `c721a8e` | Image deployed and healthy; page styling blocked by the Content-Security-Policy (finding F-2) |

## Timeline (UTC)

| When | Step |
|---|---|
| 25 Nov 20:41 | Owner created the `image/<sha>` pre-releases; publish runs Docs 45692480226, Control 45692524545, Identity 45692576016 succeeded |
| 25 Nov 21:2x | munaxa-platform#191 merged as `7005500` (8 image pins, D-SSL list, stage-e manifest, e1 task guard, declaration of 11 replacements) |
| 25 Nov 21:26 | Owner approved; apply run 45702381509; plan matched the 11 declared replacements exactly |
| 26 Nov 10:39 | Owner said go; H-20 armed (P `munaxa-nonprod-session-cleanup-p-20261126t1330`, S `...-s-20261126t1400`) |
| 26 Nov 10:41 | `up` run 45803649296 succeeded (6 services, new ALB) |
| 26 Nov 11:09 | Owner updated the 4 Cloudflare CNAMEs (id.test, control-api.test, operator-test, docs.test) |
| 26 Nov 11:xx | control-migrate RunTask exit 0; Docs seed dry run, then real run |
| 26 Nov 12:33 | Owner confirmed the demo; `down` run 45820793762 dispatched |

## Pinned images (all D-SSL Testing-only, listed in `dssl-exception.tf`)

| Key | Digest |
|---|---|
| identity_api | `sha256:d24ee375e3fced5f354b471548ee70ba686085cb90becd0e941545c60dce7277` |
| identity_migrate | `sha256:05487060aed34395fd0e32958d01b1382b38c63cd4ee2ef1e0a8ed95b2370eef` |
| control_api | `sha256:885e694f175a4b7b4fd320b96188422f425ebba66fe49eccdc8d67d9fc57e0e7` |
| control_migrate | `sha256:b871492f32224fabd144f5aeb38aab4c099b88415dd5319c0ddf4d3440a065f9` |
| control_portal | `sha256:030be8122e190c83eb5d085d55ab823880ee092e26465509f6baa29ec42df2b9` |
| docs_api | `sha256:9f8f474ae77f6655da697dddaa8cd18fec80ab592fa5d45105ed168192bbcedf` |
| docs_web | `sha256:b01dd00693778ca361f29e1e14ed31c387e3f8602ebcd6c1a5b6797f8293a061` |
| docs_migrate | `sha256:e174393d907f6202fe8457970ad2997601043033cffe1b01367c316fdf7d3f07` |

## Session checks

- Every ALB target group was healthy, verified through ELB target health. The container cannot reach `*.test.munaxa.com` because of the egress proxy.
- **control-migrate RunTask:** task definition `munaxa-nonprod-control-migrate`, run in public subnets with a public IP (the stack has no NAT), SG `migrate_groups.control`. It exited 0, and the log showed "All migrations have been successfully applied." and "grants applied".
- **Docs seed RunTask:** task definition `munaxa-nonprod-docs-api:5`, command `node apps/api/dist/seed-demo.js`, with DEMO_SEED_TENANT and DEMO_SEED_CONFIRM_TENANT set to `munaxa-internal`, DEMO_SEED_ENVIRONMENT=nonprod and QUEUE_CONSUMERS_ENABLED=false.
  - The dry run (DEMO_SEED_DRY_RUN=true) ran first and wrote nothing.
  - The real run created 52 items and kept the 2 that already existed.
- **Control entitlements:** the control-api log shows 44 answers of 200 for tenant `d75d9645-...` Docs entitlement requests.

## Findings

- **F-1 (process):** the ECR basic scan showed 0 findings for the new images, but grype in the publish workflows found the OpenSSL 3.5.9-r1 Highs. Every image therefore sits under the D-SSL exception, which expires 1 Dec 2026 00:00 UTC. Use the grype result, not the ECR basic scan, to decide D-SSL listing.
- **F-2 (Identity):** the redesigned sign-in pages render unstyled on Testing because the Content-Security-Policy blocks the stylesheet.
  - The fix is identity#31, with pin draft platform#196 owned by the Identity thread.
  - It is deferred to the next combined cycle, together with the Work pin and the Docs libraries-tree pin.
- **F-3 (access):** the AWS connector sign-in expired at the start of the session. The owner reconnected it in claude.ai Settings > Connectors.
- **F-4 (runbook):** Control's suggested "private subnets, no public IP" for migrate does not match the stack (no NAT). One-off tasks use the public subnets with a public IP, like the services.

## Shutdown

- `down` run 45820793762 was dispatched at 12:33 UTC and succeeded at 12:38 UTC.
- Verified through the AWS connector at 12:45 UTC:
  - cluster `munaxa-nonprod` has 0 services and 0 tasks
  - there is no load balancer
  - `munaxa-nonprod-pg` is `stopped`
- H-20 was disarmed at 12:52 UTC. The P schedule `...-p-20261126t1330` and the S schedule `...-s-20261126t1400` were deleted, so only `munaxa-nonprod-session-cleanup-daily` remains.
- At 12:41 UTC the coordinator asked to hold the shutdown for a Work credential and a Docs image. The shutdown had already finished by then. Tamer chose "No, next session" at 12:50 UTC.

## Next cycle (not part of this report)

The next combined pin will carry:

- the Identity CSP fix (identity#31, platform#196)
- the Docs libraries-tree image
- the Work Testing pin and its Work credential in Control

Each of these needs the owner's yes. The D-SSL exception expires on 1 Dec 2026 at 00:00 UTC.
