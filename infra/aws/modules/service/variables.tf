variable "prefix" {
  description = "Environment prefix, e.g. munaxa-nonprod."
  type        = string
}

variable "name" {
  description = "Service name within the environment, e.g. identity, control-api, work-admin."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.name))
    error_message = "name is lowercase letters, digits and hyphens, 2-31 characters."
  }
}

variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "image" {
  description = "Container image by digest: <registry>/<repository>@sha256:<64 hex>. Tags are refused."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+(:[0-9]+)?/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$", var.image))
    error_message = "image must be referenced by digest (…@sha256:<64 hex>)."
  }
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64, matching the image."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture is X86_64 or ARM64."
  }
}

variable "port" {
  description = "Container port. Null for a run-only task (a migration) with no listener."
  type        = number
  default     = null
}

variable "command" {
  description = "Overrides the image CMD (e.g. a migration or sweep entry point). Null keeps the image's."
  type        = list(string)
  default     = null
}

variable "environment" {
  description = "Plain environment values. Never a secret."
  type        = map(string)
  default     = {}
}

variable "secret_arn" {
  description = "The service's Secrets Manager bundle. Null when the service reads no secret."
  type        = string
  default     = null
}

variable "secret_keys" {
  description = "JSON keys of the bundle injected as environment variables. A missing key stops the task at start."
  type        = list(string)
  default     = []
}

variable "secret_aliases" {
  description = "Environment variable name => JSON key, for bundles whose keys are not the variable names (the RDS master secret's username and password)."
  type        = map(string)
  default     = {}
}

variable "secret_version_id" {
  description = "Pins every secret reference to one bundle version (empty: the current version)."
  type        = string
  default     = ""
}

variable "secrets_kms_key_arn" {
  description = "The environment data key that encrypts the bundles; the execution role may decrypt with it through Secrets Manager only."
  type        = string
  default     = null
}

variable "readonly_root_filesystem" {
  description = "True for the APIs. Next.js servers write their cache and keep a writable root."
  type        = bool
  default     = true
}

variable "sidecars" {
  description = "Extra containers in the task (Identity's Valkey). Written as ECS container definitions."
  type        = list(any)
  default     = []

  # A sidecar serves its own task only (127.0.0.1 in awsvpc mode). A port mapping is what would
  # let the task's security group or a load balancer reach it, so none is accepted.
  validation {
    condition     = alltrue([for c in var.sidecars : length(try(c.portMappings, [])) == 0])
    error_message = "A sidecar has no portMappings: it serves its own task over loopback only."
  }
}

variable "depends_on_sidecars" {
  description = "Containers the main container waits for (condition HEALTHY)."
  type        = list(string)
  default     = []
}

variable "health_check_command" {
  description = "In-container health check (ECS does not read the image's HEALTHCHECK). Null for none."
  type        = list(string)
  default     = null
}

variable "health_check_start_period" {
  description = "Seconds the container health check waits before counting failures (the Docs scanner needs 300 for its first signature download)."
  type        = number
  default     = 60
}

variable "task_role_policy_json" {
  description = "Inline policy for the task role (e.g. kms:Sign on Control's licence key). Null for no task role."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 14
}

# --- Networking and service (ignored for run-only tasks) -----------------------------------------

variable "create_service" {
  description = "False registers the task definition only (run by hand or by a schedule)."
  type        = bool
  default     = true
}

variable "cluster_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Public subnets; tasks get a public IPv4 address and no inbound path but the security groups (no NAT)."
  type        = list(string)
}

variable "desired_count" {
  type    = number
  default = 1
}

# ECS rolling-deployment bounds. Null (the default) leaves ECS's own defaults, 100 % minimum healthy
# and 200 % maximum, so every service that does not set them is planned exactly as before.
#
# A service whose tasks each hold their own state store (Identity with its Valkey sidecar) sets
# 0 and 100: ECS then stops the old task before it starts the new one, so two tasks with two
# independent stores never serve at the same time. That costs the service's downtime during each
# replacement (README, "Identity in Testing: deployments").
variable "deployment_minimum_healthy_percent" {
  description = "ECS minimumHealthyPercent, 0-100. Null keeps the ECS default (100)."
  type        = number
  default     = null

  validation {
    condition     = var.deployment_minimum_healthy_percent == null || (try(floor(var.deployment_minimum_healthy_percent) == var.deployment_minimum_healthy_percent, false) && var.deployment_minimum_healthy_percent >= 0 && var.deployment_minimum_healthy_percent <= 100)
    error_message = "deployment_minimum_healthy_percent is a whole number from 0 to 100, or null."
  }
}

variable "deployment_maximum_percent" {
  description = "ECS maximumPercent, 100-200. Null keeps the ECS default (200)."
  type        = number
  default     = null

  validation {
    condition     = var.deployment_maximum_percent == null || (try(floor(var.deployment_maximum_percent) == var.deployment_maximum_percent, false) && var.deployment_maximum_percent >= 100 && var.deployment_maximum_percent <= 200)
    error_message = "deployment_maximum_percent is a whole number from 100 to 200, or null."
  }

  # A deployment needs room either to start a task early (maximum above 100) or to stop one early
  # (minimum below 100). 100/100 can never replace a task: the deployment hangs until the circuit
  # breaker fails it. The effective values are compared, with ECS's defaults standing in for null.
  validation {
    condition     = coalesce(var.deployment_minimum_healthy_percent, 100) < coalesce(var.deployment_maximum_percent, 200)
    error_message = "deployment_minimum_healthy_percent must be below deployment_maximum_percent (with ECS's defaults 100 and 200 for null); otherwise no deployment can replace a task."
  }
}

# What 0 % / 100 % does and does not guarantee (AWS documentation, read 12 Nov 2026; report
# 2026-11-12-phase-c-d-preparation/04): maximumPercent bounds the tasks in the RUNNING or PENDING
# state, and a task being stopped is first DEACTIVATING (load balancer deregistration) and then
# STOPPING (SIGTERM). The documentation does not say whether a DEACTIVATING or STOPPING task counts,
# so a replacement may start while the old task is still draining: two tasks, two stores, for up to
# the deregistration delay plus the stop. What holds is that the load balancer sends no new request
# to a deregistering target and none to a new one before it passes its health checks, so at most
# one store receives new requests at a time. That only holds if the load balancer is the one way in:
# hence no service-discovery name (callers would resolve both tasks) and no private callers.
variable "single_task_store" {
  description = "Every task holds its own state store (a sidecar). The service must then run at most one task, deploy with percentages 0 and 100 (the old task is deregistered from the load balancer before a new one can start), and be reachable only through the load balancer."
  type        = bool
  default     = false

  validation {
    condition = !var.single_task_store || (
      var.desired_count <= 1 &&
      var.deployment_minimum_healthy_percent == 0 &&
      var.deployment_maximum_percent == 100
    )
    error_message = "A service with a per-task state store runs at most one task with deployment percentages 0 (minimum healthy) and 100 (maximum): two tasks would serve from two independent stores."
  }

  validation {
    condition     = !var.single_task_store || (!var.register_discovery && length(var.ingress_security_group_ids) == 0)
    error_message = "A service with a per-task state store is reached through its load balancer only (no register_discovery, no ingress_security_group_ids): during a replacement the old task may still run, and only the load balancer stops sending it requests before the new one serves."
  }
}

variable "extra_security_group_ids" {
  description = "Security groups added to the ECS service's tasks only (never to the task definition, so a task run by hand from it does not get them). Identity's cache-client group."
  type        = list(string)
  default     = []
}

variable "alb_security_group_id" {
  description = "Admitted on the container port when the service is routed from the ALB."
  type        = string
  default     = null
}

variable "ingress_security_group_ids" {
  description = "Other tasks admitted on the container port over the private network (portal to API)."
  type        = map(string)
  default     = {}
}

variable "database_security_group_id" {
  description = "The shared RDS security group. The service may reach it on 5432, and it admits the service."
  type        = string
  default     = null
}

variable "listener_arn" {
  description = "The ALB HTTPS listener. Null when the edge is down (on-demand Testing) or the service is not routed."
  type        = string
  default     = null
}

variable "routes" {
  description = "Listener rules to this service: host names, optional path patterns, a unique priority each."
  type = list(object({
    priority = number
    hosts    = list(string)
    paths    = optional(list(string), [])
    # Source ranges a request must come from (the operator host, Control ADR-0006).
    source_ips = optional(list(string), [])
  }))
  default = []
}

variable "health_check_path" {
  description = "Target-group health check path."
  type        = string
  default     = "/"
}

variable "discovery_namespace_id" {
  description = "Cloud Map private namespace; the service registers as <name>.<namespace> for private callers."
  type        = string
  default     = null
}

variable "tags" {
  type    = map(string)
  default = {}
}

# Booleans decide what is created: the ARNs and IDs above may be unknown until apply, and a count
# or for_each cannot depend on an unknown value.

variable "admit_alb" {
  description = "Admit alb_security_group_id on the container port, whether or not the edge is up (a routable service)."
  type        = bool
  default     = false
}

variable "routed" {
  description = "Create a target group and listener rules behind listener_arn."
  type        = bool
  default     = false
}

variable "connect_database" {
  description = "Open 5432 between this service and database_security_group_id."
  type        = bool
  default     = false
}

variable "egress_to" {
  description = "Private calls this service makes to other tasks: a security group and the port it listens on."
  type = map(object({
    security_group_id = string
    port              = number
  }))
  default = {}
}

variable "register_discovery" {
  description = "Register the service in discovery_namespace_id."
  type        = bool
  default     = false
}
