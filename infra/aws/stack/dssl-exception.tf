# TEMPORARY: owner decision D-SSL (22 Nov 2026), Testing-only acceptance of the OpenSSL 3.5.9-r1 HIGH
# findings (CVE-2026-107493, -107494, -121482, -124709, -84786 in libssl3/libcrypto3) for the first
# Docs Testing deployment and its dependencies (Identity, Control, Docs). Expires 2026-12-01T00:00:00Z.
# The product repositories' scan wrapper (.github/scripts/scan-image-testing.sh) decides which images
# may be published under it; this file keeps those images out of production and fails closed on expiry:
#
#   P-1  production pins no product image while this file exists (tests/test_dssl_exception.py, CI);
#   P-2  production never pins a digest listed below;
#   E-1  from the expiry on, a Testing `up` with a listed digest is refused (a `down` still plans);
#   T-1  the plan time (plantimestamp()) must be valid and not before the decision.
#
# Add every digest published under the exception here, with its source commit, in the same PR that pins
# it in envs/nonprod.tfvars. Removal (after OpenSSL 3.5.10 images pass the permanent gate): move every
# digest below to withdrawn-images.tf, then delete this file and modules/image-exception-guard, in one
# reviewed PR (report 2026-11-22-testing-temporary-openssl-acceptance, file 02).
locals {
  dssl_exception_expires_utc = "2026-12-01T00:00:00Z"

  dssl_testing_only_image_digests = {
    # "sha256:<64 hex>" = "munaxa-docs/api <commit>: D-SSL Testing-only"
  }
}

module "dssl_exception_guard" {
  source = "../modules/image-exception-guard"

  environment          = var.environment
  expires_utc          = local.dssl_exception_expires_utc
  now_utc              = plantimestamp()
  sessions_running     = var.services_enabled || var.edge_enabled
  testing_only_digests = keys(local.dssl_testing_only_image_digests)
  images               = { for k, v in var.images : k => v }
}
