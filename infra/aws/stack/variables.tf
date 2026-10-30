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
    identity    = string # Identity's own origin: IDENTITY_BASE_URL, the token issuer
    control_api = string # products reach Control here; the admin API is refused on it
    operator    = string # Control portal + /api/auth/* (Identity), restricted to the operator network
    work        = string # Work admin, /api/v1/* (Work API), /api/auth/* (Identity): one origin (Identity ADR-0004)
    school      = string # School admin, /api/* (School API)
  })

  validation {
    condition     = alltrue([for h in values(var.hosts) : can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+munaxa\\.com$", h))])
    error_message = "Every host is a lowercase name under munaxa.com."
  }
}

variable "certificate_domains" {
  description = "Names on the environment's ACM certificate (DNS-validated; the validation records are an owner action in Cloudflare)."
  type        = list(string)
}

variable "operator_cidrs" {
  description = "Source ranges allowed to reach the operator host (Control ADR-0006). Empty refuses every request to it."
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
  })
  default = {}

  validation {
    condition = alltrue([
      for v in values(var.images) : v == "" || can(regex("^[0-9]{12}\\.dkr\\.ecr\\.eu-central-1\\.amazonaws\\.com/munaxa-[a-z]+/[a-z-]+@sha256:[0-9a-f]{64}$", v))
    ])
    error_message = "Every image is <account>.dkr.ecr.eu-central-1.amazonaws.com/munaxa-<product>/<name>@sha256:<64 hex>."
  }
}

variable "valkey_image" {
  description = "Identity's cache sidecar, by digest (public.ecr.aws/docker/library/valkey@sha256:…)."
  type        = string
  default     = ""

  validation {
    condition     = var.valkey_image == "" || can(regex("^public\\.ecr\\.aws/docker/library/valkey@sha256:[0-9a-f]{64}$", var.valkey_image))
    error_message = "valkey_image is public.ecr.aws/docker/library/valkey@sha256:<64 hex>."
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
}

variable "identity_public_keys" {
  description = "Identity's public signing keys as JSON [{kid, publicKey}], for Work (PLATFORM_AUTH_PUBLIC_KEYS) and Control (OPERATOR_AUTH_PUBLIC_KEYS). Public."
  type        = string
  default     = "[]"

  validation {
    condition     = can(jsondecode(var.identity_public_keys)) && !strcontains(var.identity_public_keys, "PRIVATE KEY")
    error_message = "identity_public_keys is a JSON array of public keys. A private key is refused."
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
