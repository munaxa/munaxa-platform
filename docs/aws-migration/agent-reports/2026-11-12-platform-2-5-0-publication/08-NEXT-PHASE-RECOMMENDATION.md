# 08. Next phase recommendation

Nothing below has started. Each item needs its own owner authorization.

## Recommended next authorization

**Build and publish the Identity API and migration images from the Identity merge commit `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`.**

- Mechanism: `publish-images-ecr.yml`, triggered by the tag `image/5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`.
  - It runs in the protected `image-release` environment and assumes the image publisher role through OIDC.
  - It pushes `munaxa-identity/api` and `munaxa-identity/migrate` with immutable tags and records their digests.
- Before tagging, confirm that the repository variable `AWS_IMAGE_PUBLISHER_ROLE_ARN` is set and that the environment reviewer is in place. These are read-only checks.
- Be aware: images built from this commit include identity#7. In production mode they refuse to start without a dedicated MFA key secret. Runbook 03 of `2026-11-12-phase-c-d-preparation` stage C prepares that key.

## Testing deployment stages that follow (each separately authorized)

From `2026-11-12-phase-c-d-preparation/03-NONPROD-DEPLOYMENT-RUNBOOK.md`:

1. R: read-only pre-checks.
2. C: MFA key bundle preparation.
3. D: at-rest Terraform plan and apply (+1/~1 docs-migrate delta plus the new image pin).
4. E: Testing session, then verification, then shutdown.

## Owner hardening items (from this run's review)

- **L2:** move `PLATFORM_PACKAGES_TOKEN` (Identity, and the equivalents in Work and Control) into a protected environment limited to `main`. Today anyone who can push a branch can run a workflow that reads it.
- **I1 (optional):** delete the logs of Identity run 43286188504. They hold base64 copies of the 13 `restricted` tarballs, which are builds of public source.
- Earlier release-workflow note, still open: who can publish is anyone who can push to munaxa-platform. A real control needs the publish token held in an environment secret with a reviewer.

## Not recommended now

Upgrading Work, Control, School or Docs to 2.5.0 is out of scope here. The earlier assessment found Work and Control need no change now.
