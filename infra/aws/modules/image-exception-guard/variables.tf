variable "environment" {
  description = "nonprod or prod."
  type        = string

  validation {
    condition     = contains(["nonprod", "prod"], var.environment)
    error_message = "environment is nonprod or prod."
  }
}

variable "expires_utc" {
  description = "The exception's expiry, RFC 3339 UTC. Never later than the hard cutoff."
  type        = string

  validation {
    condition = (can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.expires_utc))
    && can(timecmp(var.expires_utc, "2026-12-01T00:00:00Z")) && try(timecmp(var.expires_utc, "2026-12-01T00:00:00Z") <= 0, false))
    error_message = "T-1: expires_utc must be RFC 3339 UTC (YYYY-MM-DDTHH:MM:SSZ) and no later than 2026-12-01T00:00:00Z."
  }
}

variable "now_utc" {
  description = "The plan time: plantimestamp() in the stack; a fixed value only in tests."
  type        = string

  validation {
    condition     = can(timecmp(var.now_utc, "2026-11-22T00:00:00Z")) && try(timecmp(var.now_utc, "2026-11-22T00:00:00Z") >= 0, false)
    error_message = "T-1: the plan time cannot be evaluated reliably (not RFC 3339, or before the owner's decision of 22 Nov 2026)."
  }
}

variable "sessions_running" {
  description = "True when the plan turns services or the edge on (a session `up`)."
  type        = bool
}

variable "testing_only_digests" {
  description = "Digests published under the temporary exception: Testing-only, never production."
  type        = list(string)

  validation {
    condition     = alltrue([for d in var.testing_only_digests : can(regex("^sha256:[0-9a-f]{64}$", d))])
    error_message = "Every Testing-only digest is sha256:<64 hex>."
  }
}

variable "images" {
  description = "The stack's var.images."
  type        = map(string)

  validation {
    condition     = var.environment != "prod" || length([for v in values(var.images) : v if v != "" && contains(var.testing_only_digests, try(regex("sha256:[0-9a-f]{64}$", v), ""))]) == 0
    error_message = "P-2: a Testing-only image (published under the temporary D-SSL exception) can never be pinned in production."
  }

  validation {
    condition     = !(var.sessions_running && try(timecmp(var.now_utc, var.expires_utc) >= 0, true)) || length([for v in values(var.images) : v if v != "" && contains(var.testing_only_digests, try(regex("sha256:[0-9a-f]{64}$", v), ""))]) == 0
    error_message = "E-1: the temporary D-SSL exception has expired; Testing cannot start with an image published under it. Pin OpenSSL 3.5.10 images that pass the permanent gate (a `down` still works)."
  }
}
