# --- Where -------------------------------------------------------------------------------------

variable "environment" {
  description = "nonprod (on-demand Testing) or prod."
  type        = string

  validation {
    condition     = contains(["nonprod", "prod"], var.environment)
    error_message = "environment is nonprod or prod."
  }
}

variable "account_id" {
  description = "The AWS account this environment lives in. 229251310592 until member accounts exist (owner decision pending)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id is a 12-digit AWS account id."
  }
}

variable "region" {
  type    = string
  default = "eu-central-1"

  validation {
    condition     = var.region == "eu-central-1"
    error_message = "Munaxa is hosted in eu-central-1 only."
  }
}

variable "deployer_role_arn" {
  description = "The shared deployer (bootstrap/) that GitHub Actions assumes. Null only for local validate."
  type        = string
  default     = null
}

variable "deployer_session_name" {
  type    = string
  default = "terraform"

  validation {
    condition     = can(regex("^[\\w+=,.@-]{2,64}$", var.deployer_session_name))
    error_message = "deployer_session_name must be a valid STS session name."
  }
}

variable "vpc_cidr" {
  description = "A /16 that overlaps nothing else (Docs Production is 10.121.0.0/16)."
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && endswith(var.vpc_cidr, "/16") && var.vpc_cidr != "10.121.0.0/16"
    error_message = "vpc_cidr is a /16 other than Docs Production's 10.121.0.0/16."
  }
}

# --- Stages ------------------------------------------------------------------------------------
#
# The persistent layer (network, database, keys, secret containers, log groups, cluster) always
# exists. The two switches below are what an on-demand Testing session turns on and off.

variable "edge_enabled" {
  description = "The ALB, its listeners and the certificate validation wait. Off between Testing sessions."
  type        = bool
  default     = false
}

variable "services_enabled" {
  description = "Create the ECS services (desired counts below). Off between Testing sessions."
  type        = bool
  default     = false
}

variable "desired_counts" {
  description = "Tasks per service while services_enabled. Production runs at least two of each API."
  type        = map(number)
  default = {
    identity       = 1
    control-api    = 1
    control-portal = 1
    work-api       = 1
    work-admin     = 1
    school-api     = 1
    school-admin   = 1
  }
}

# --- Names -------------------------------------------------------------------------------------

variable "hosts" {
  description = "Public host names, each a CNAME in Cloudflare to the ALB (owner action; DNS is never changed here)."
  type = object({
    identity    = string           # Identity's own origin: IDENTITY_BASE_URL, the token issuer
    control_api = string           # products reach Control here; the admin API is refused on it
    operator    = string           # Control portal + /api/auth/* (Identity), restricted to the operator network
    work        = string           # Work admin, /api/v1/* (Work API), /api/auth/* (Identity): one origin (Identity ADR-0004)
    school      = string           # School admin, /api/* (School API)
    docs        = optional(string) # Docs web, /api/v1/preview/stream* (Docs API). Unset: no Docs in this environment
  })

  validation {
    condition     = alltrue([for h in values(var.hosts) : h == null || can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+munaxa\\.com$", h))])
    error_message = "Every host is a lowercase name under munaxa.com."
  }
}

variable "certificate_domains" {
  description = "Names on the environment's ACM certificate (DNS-validated; the validation records are an owner action in Cloudflare)."
  type        = list(string)
}

variable "operator_cidrs" {
  description = "Source ranges allowed to reach the operator host (Control ADR-0006). With operator_access unset, empty refuses every request to it; with it set, empty takes any source and the origin checks the Access token."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.operator_cidrs : can(cidrhost(c, 0)) && !contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "operator_cidrs are CIDR ranges, never the whole internet."
  }

  # An ALB rule takes five condition values. The Identity rule on the operator host spends one on
  # the host and one on the path, which leaves three for source ranges.
  validation {
    condition     = length(var.operator_cidrs) <= 3
    error_message = "operator_cidrs holds at most three ranges (the ALB's five condition values per rule)."
  }
}

variable "operator_access" {
  description = "Cloudflare Access in front of the operator host (../cloudflare-access.md): the team domain and the Access application's AUD tag. Public identifiers, not secrets. Control's API and portal verify the Access token with them; set, the operator host takes any source."
  type = object({
    team_domain = string
    audience    = string
  })
  default = null

  validation {
    condition = var.operator_access == null ? true : (
      can(regex("^https://[a-z0-9][a-z0-9-]*\\.cloudflareaccess\\.com$", var.operator_access.team_domain)) &&
      can(regex("^[A-Za-z0-9]{32,128}$", var.operator_access.audience))
    )
    error_message = "operator_access is { team_domain = \"https://<team>.cloudflareaccess.com\", audience = \"<AUD tag>\" }."
  }

  # Control refuses to run in production without Access (its OPERATOR_ACCESS_* settings).
  validation {
    condition     = var.operator_access != null || (var.images.control_api == "" && var.images.control_portal == "")
    error_message = "Control's API and portal need operator_access."
  }
}

# --- Images, by digest only --------------------------------------------------------------------

variable "images" {
  description = "Image references by digest from this account's ECR. An empty value leaves that service out."
  type = object({
    identity_api     = optional(string, "")
    identity_migrate = optional(string, "")
    control_api      = optional(string, "")
    control_migrate  = optional(string, "")
    control_portal   = optional(string, "")
    work_api         = optional(string, "")
    work_admin       = optional(string, "")
    work_migrate     = optional(string, "")
    school_api       = optional(string, "")
    school_admin     = optional(string, "")
    school_migrate   = optional(string, "")
    docs_api         = optional(string, "") # the existing munaxa-docs/* repositories (Docs bootstrap)
    docs_web         = optional(string, "")
    docs_antivirus   = optional(string, "")
    docs_migrate     = optional(string, "") # the `migrate` target of munaxa-docs, same commit as docs_api (DC-01)
  })
  default = {}

  validation {
    condition = alltrue([
      for v in values(var.images) : v == "" || can(regex("^[0-9]{12}\\.dkr\\.ecr\\.eu-central-1\\.amazonaws\\.com/munaxa-[a-z]+/[a-z-]+@sha256:[0-9a-f]{64}$", v))
    ])
    error_message = "Every image is <account>.dkr.ecr.eu-central-1.amazonaws.com/munaxa-<product>/<name>@sha256:<64 hex>."
  }

  # The migration task runs the migration image, never the API's (which has no OpenSSL 3 schema
  # engine and would fail every run). DC-01.
  validation {
    condition     = var.images.docs_migrate == "" || can(regex("/munaxa-docs/migrate@sha256:", var.images.docs_migrate))
    error_message = "images.docs_migrate is the munaxa-docs/migrate repository, by digest."
  }
}

variable "valkey_image" {
  description = "Identity's cache sidecar, by digest (public.ecr.aws/docker/library/valkey@sha256:…)."
  type        = string
  default     = ""

  validation {
    # Valkey is not a Docker Official Image (Docker Hub has valkey/valkey, no library/valkey), so
    # ECR Public's docker/library mirror has no valkey repository; Valkey publishes public.ecr.aws/valkey/valkey.
    condition     = var.valkey_image == "" || can(regex("^public\\.ecr\\.aws/(docker/library/valkey|valkey/valkey)@sha256:[0-9a-f]{64}$", var.valkey_image))
    error_message = "valkey_image is public.ecr.aws/valkey/valkey@sha256:<64 hex> (or the docker/library path)."
  }

  # Identity's REDIS_URL points at 127.0.0.1:6379: without the sidecar nothing listens there.
  validation {
    condition     = var.valkey_image != "" || var.images.identity_api == "" || !var.services_enabled
    error_message = "Identity runs only with its Valkey sidecar: set valkey_image before a session with images.identity_api."
  }
}

# --- Data --------------------------------------------------------------------------------------

variable "database_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "database_allocated_storage" {
  type    = number
  default = 20
}

variable "database_backup_retention_days" {
  description = "7 in Testing, 35 in Production."
  type        = number
  default     = 7
}

variable "database_deletion_protection" {
  type    = bool
  default = true
}

variable "log_retention_days" {
  description = "14 in Testing, 30 in Production."
  type        = number
  default     = 14
}

variable "secret_version_ids" {
  description = "Per-service bundle version pins (empty: the current version). Set once a bundle has its values."
  type        = map(string)
  default     = {}
}

# --- Product configuration (no secrets) --------------------------------------------------------

variable "identity_default_organisation" {
  description = "IDENTITY_DEFAULT_ORGANISATION. Not a secret."
  type        = string
  default     = ""
}

variable "identity_signing_kid" {
  description = "IDENTITY_SIGNING_KID: the key id Identity signs with; products' PLATFORM_AUTH_PUBLIC_KEYS must contain it."
  type        = string
  default     = ""

  # Identity refuses to start with a key id shorter than 3 characters, and Work and Control verify
  # only key ids listed in identity_public_keys.
  validation {
    condition = var.images.identity_api == "" || !var.services_enabled || (
      length(var.identity_signing_kid) >= 3 &&
      contains([for k in try(jsondecode(var.identity_public_keys), []) : try(k.kid, "")], var.identity_signing_kid)
    )
    error_message = "A session with Identity needs identity_signing_kid (3+ characters) listed in identity_public_keys."
  }
}

# AW-01 (report 2026-11-11-cross-repository-deployment-readiness; remediation report
# 2026-11-11-identity-aw01-remediation). An Identity image built from munaxa-identity main after the
# security hardening (identity#7 to #14) refuses to start with NODE_ENV=production unless it has the
# MFA key ring, the primary key id and IDENTITY_PASSWORD_RESET=disabled. Release 5277d71 knows none
# of them. So the hardened contract is switched on together with the image, never before:
#
#   null (default)  the task definition release 5277d71 runs, byte for byte as before;
#   set             the identity bundle gains MFA_ENCRYPTION_KEYS (a secret reference, never a
#                   value), and the plain environment gains MFA_ENCRYPTION_PRIMARY_KID, MFA_POLICY,
#                   MFA_PRIVILEGED_ROLES (only with privileged) and IDENTITY_PASSWORD_RESET=disabled.
#
# Set it in the same reviewed PR that pins a hardened image, after the key has been added to the
# bundle and secret_version_ids.identity names the version that holds it.
variable "identity_security_config" {
  description = "Hardened Identity (munaxa-identity main after identity#7 to #14) only: the non-secret MFA settings. Null keeps the release 5277d71 task definition unchanged. The MFA key ring is never here; it is MFA_ENCRYPTION_KEYS in the <env>/identity bundle."
  type = object({
    mfa_primary_kid      = string
    mfa_policy           = string
    mfa_privileged_roles = optional(list(string), [])
  })
  default = null

  # Identity's own rule for a kid (packages/config/src/mfa-keys.ts): it is written into every
  # ciphertext envelope, which is '.'-separated.
  validation {
    condition     = var.identity_security_config == null || can(regex("^[A-Za-z0-9_-]{1,64}$", var.identity_security_config.mfa_primary_kid))
    error_message = "identity_security_config.mfa_primary_kid is 1-64 characters of [A-Za-z0-9_-] (Identity's rule for an MFA key id)."
  }

  # Stricter than Identity on purpose: 32 bytes encode to 43 characters of base64url (44 with
  # padding). A kid of exactly that shape is far more likely the key pasted into the wrong field,
  # and this file is in a public repository.
  validation {
    condition     = var.identity_security_config == null || !can(regex("^[A-Za-z0-9_-]{43}$", var.identity_security_config.mfa_primary_kid))
    error_message = "identity_security_config.mfa_primary_kid has the shape of an encoded 32-byte key. The kid is a short name (e.g. nonprod-2026-11); the key itself belongs only in the <env>/identity bundle."
  }

  validation {
    condition     = var.identity_security_config == null || contains(["off", "privileged", "all"], var.identity_security_config.mfa_policy)
    error_message = "identity_security_config.mfa_policy is off, privileged or all (Identity's MFA_POLICY)."
  }

  # Identity refuses privileged with no roles. Roles with off or all would be ignored by Identity
  # and read as if they enforced something, so they are refused here too.
  validation {
    condition = var.identity_security_config == null || (
      var.identity_security_config.mfa_policy == "privileged"
      ? length(var.identity_security_config.mfa_privileged_roles) > 0
      : length(var.identity_security_config.mfa_privileged_roles) == 0
    )
    error_message = "identity_security_config.mfa_privileged_roles names at least one role key with mfa_policy = privileged, and none otherwise."
  }

  # MFA_PRIVILEGED_ROLES is one comma-separated variable: a role key holding a comma or a space
  # would be split or trimmed into a different key.
  validation {
    condition = var.identity_security_config == null || alltrue([
      for r in var.identity_security_config.mfa_privileged_roles : can(regex("^[A-Za-z0-9:._-]{1,128}$", r))
    ])
    error_message = "Each identity_security_config.mfa_privileged_roles entry is an existing Identity role key: 1-128 characters, no comma or whitespace."
  }
}

variable "identity_public_keys" {
  description = "Identity's public signing keys as JSON [{kid, publicKey}], for Work (PLATFORM_AUTH_PUBLIC_KEYS) and Control (OPERATOR_AUTH_PUBLIC_KEYS). Public."
  type        = string
  default     = "[]"

  validation {
    condition     = can(jsondecode(var.identity_public_keys)) && !strcontains(var.identity_public_keys, "PRIVATE KEY")
    error_message = "identity_public_keys is a JSON array of public keys. A private key is refused."
  }

  # Work refuses to start unless PLATFORM_AUTH_PUBLIC_KEYS holds at least one key.
  validation {
    condition     = var.images.work_api == "" || !var.services_enabled || length(try(jsondecode(var.identity_public_keys), [])) > 0
    error_message = "A session with work_api needs identity_public_keys (Work's PLATFORM_AUTH_PUBLIC_KEYS)."
  }
}

variable "control_operator_organisation_id" {
  description = "OPERATOR_ORGANISATION_ID: the Identity organisation Munaxa Group staff belong to."
  type        = string
  default     = ""
}

variable "control_operator_subjects" {
  description = "OPERATOR_SUBJECT_ALLOWLIST (Control ADR-0006): required while Identity issues no mfa claim."
  type        = list(string)
  default     = []
}

variable "control_licence_kid" {
  description = "LICENCE_SIGNING_KID for the KMS licence key (Control ADR-0008, proposed)."
  type        = string
  default     = ""
}

variable "control_licence_public_key" {
  description = "LICENCE_SIGNING_PUBLIC_KEY: the KMS key's public half, SPKI PEM. Public. Empty until the key exists and its public half is read."
  type        = string
  default     = ""

  validation {
    condition     = !strcontains(var.control_licence_public_key, "PRIVATE KEY")
    error_message = "control_licence_public_key holds a private key. Only the public half belongs here."
  }

  # control-api refuses to start without a licence key, its kid, the operator organisation, a
  # subject allow-list (while MFA is off) and Identity's public keys. Step one is a services-off
  # apply with the Control images set, which creates the KMS key whose public half goes here; the
  # first session runs control-api at desired count 0 until Identity has issued the operator ids.
  validation {
    condition = var.images.control_api == "" || !var.services_enabled || lookup(var.desired_counts, "control-api", 1) == 0 || (
      strcontains(var.control_licence_public_key, "BEGIN PUBLIC KEY") &&
      var.control_licence_kid != "" &&
      var.control_operator_organisation_id != "" &&
      length(var.control_operator_subjects) > 0 &&
      length(try(jsondecode(var.identity_public_keys), [])) > 0
    )
    error_message = "A session with control_api needs control_licence_public_key, control_licence_kid, control_operator_organisation_id, control_operator_subjects and identity_public_keys (README G7, two-step Control bring-up)."
  }
}

variable "postgres_image" {
  description = "PostgreSQL 16 client for the db-admin task, by digest (public.ecr.aws/docker/library/postgres@sha256:…)."
  type        = string
  default     = ""

  validation {
    condition     = var.postgres_image == "" || can(regex("^public\\.ecr\\.aws/docker/library/postgres@sha256:[0-9a-f]{64}$", var.postgres_image))
    error_message = "postgres_image is public.ecr.aws/docker/library/postgres@sha256:<64 hex>."
  }
}

variable "db_bootstrap_products" {
  description = "Products whose databases and roles the db-admin task creates; a product is listed once both its bundles hold their URLs."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for p in var.db_bootstrap_products : contains(["identity", "control", "work", "school"], p)])
    error_message = "db_bootstrap_products names identity, control, work or school."
  }
}

# --- Docs (docs.tf) ----------------------------------------------------------------------------

variable "docs_redis_image" {
  description = "The Docs API's Redis sidecar, by digest (public.ecr.aws/docker/library/redis@sha256:…), as Docs Production runs it."
  type        = string
  default     = ""

  validation {
    condition     = var.docs_redis_image == "" || can(regex("^public\\.ecr\\.aws/docker/library/redis@sha256:[0-9a-f]{64}$", var.docs_redis_image))
    error_message = "docs_redis_image is public.ecr.aws/docker/library/redis@sha256:<64 hex>."
  }
}

variable "docs_tenant" {
  description = "The one Docs tenant of this environment (database per tenant, Docs ADR-0015): docs-db-admin creates its database, docs-provision its first administrator."
  type = object({
    slug     = string
    name     = string
    database = string
  })
  default = {
    slug     = "munaxa-internal"
    name     = "Munaxa Internal"
    database = "edms_munaxa_internal"
  }

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,40}$", var.docs_tenant.slug)) && can(regex("^edms_[a-z0-9_]{1,50}$", var.docs_tenant.database))
    error_message = "docs_tenant.slug is lowercase letters, digits and hyphens; docs_tenant.database is edms_<lowercase letters, digits, underscores>."
  }
}

variable "docs_mail_from_address" {
  type    = string
  default = "docs@notify.munaxa.com"
}

variable "docs_outbound_http_allowlist_extra" {
  description = "Hosts the Docs API may call besides Control (OUTBOUND_HTTP_ALLOWLIST), lowercase, optionally with a leading dot."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for h in var.docs_outbound_http_allowlist_extra : can(regex("^\\.?([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", h))])
    error_message = "Each entry is a lowercase hostname, optionally with a leading dot."
  }
}

variable "identity_operator_organisation" {
  description = "The Identity organisation Munaxa Group operators belong to, created by the identity-bootstrap task."
  type = object({
    slug = string
    name = string
  })
  default = {
    slug = "munaxa-group"
    name = "Munaxa Group"
  }
}

variable "session_backstop_schedule" {
  description = "Nonprod only: when EventBridge Scheduler stops the database and scales every service to 0 (backstop.tf), in UTC. Empty turns the backstop off."
  type        = string
  # Off by default (owner decision D-4 = B, phase 7): G3 kept its 64 creates, and the backstop is a
  # separate apply after G3; envs/nonprod.tfvars sets "cron(0 21 * * ? *)" (nonprod readiness
  # phase, 6 Nov 2026). The first Testing session waits for its first verified run.
  default = ""

  validation {
    condition     = var.session_backstop_schedule == "" || can(regex("^(cron|rate)\\(.+\\)$", var.session_backstop_schedule))
    error_message = "An EventBridge Scheduler cron() or rate() expression, or empty."
  }
}

variable "identity_probe_source" {
  description = "The reviewed Identity session probe (identity-probe.tf): a munaxa-platform commit and the SHA-256 of infra/aws/stack/supporting/identity-session-probe.mjs at it. Empty: no probe task definition."
  type = object({
    commit = string
    sha256 = string
  })
  default = { commit = "", sha256 = "" }

  validation {
    condition = (
      (var.identity_probe_source.commit == "" && var.identity_probe_source.sha256 == "") ||
      (can(regex("^[0-9a-f]{40}$", var.identity_probe_source.commit)) && can(regex("^[0-9a-f]{64}$", var.identity_probe_source.sha256)))
    )
    error_message = "identity_probe_source is both empty, or a full 40-character lowercase commit and a 64-character lowercase SHA-256."
  }
}
