# Image exception guard: no resources, only checks. A plan whose inputs break a rule below fails at
# plan time, before anything is applied. Used by the stack for the temporary, Testing-only D-SSL
# OpenSSL exception (owner decision 22 Nov 2026; infra/aws/stack/dssl-exception.tf).
#
# Rules (fail closed):
#   P-1  production pins no product image while the exception exists: checked statically on every pull
#        request by infra/aws/stack/tests/test_dssl_exception.py (envs/prod.tfvars images = {}), so the
#        mocked production plans in tests/ keep working;
#   P-2  production never pins a digest listed as Testing-only;
#   E-1  from the expiry on, Testing cannot be started (services or edge on) with a Testing-only digest
#        pinned; a `down` plan (both switches off) still works, so cleanup is never blocked;
#   T-1  the expiry and the plan time must be valid RFC 3339 UTC, and the expiry no later than the
#        hard cutoff 2026-12-01T00:00:00Z.

locals {
  pinned_digests      = [for v in values(var.images) : try(regex("sha256:[0-9a-f]{64}$", v), "") if v != ""]
  pinned_testing_only = [for d in local.pinned_digests : d if contains(var.testing_only_digests, d)]
  expired             = timecmp(var.now_utc, var.expires_utc) >= 0
}

output "expired" {
  description = "True from the expiry on."
  value       = local.expired
}

output "pinned_testing_only_digests" {
  description = "Testing-only digests this plan pins (evidence for the plan summary)."
  value       = local.pinned_testing_only
}
