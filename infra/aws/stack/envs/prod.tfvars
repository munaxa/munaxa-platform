# Production. Created only after Testing has passed and the owner approves the production gate.
# No secret, credential or tenant data in this file.

environment = "prod"
account_id  = "229251310592" # until member accounts exist (owner decision pending)
vpc_cidr    = "10.131.0.0/16"

edge_enabled     = false
services_enabled = false

hosts = {
  identity    = "id.munaxa.com"
  control_api = "control-api.munaxa.com"
  operator    = "operator.munaxa.com"
  work        = "work.munaxa.com"
  school      = "school.munaxa.com"
}
certificate_domains = [
  "id.munaxa.com",
  "control-api.munaxa.com",
  "operator.munaxa.com",
  "work.munaxa.com",
  "school.munaxa.com",
]

operator_cidrs = []

database_backup_retention_days = 35
database_deletion_protection   = true
log_retention_days             = 30

# Two of each API so a deployment or a lost task does not take a product down.
desired_counts = {
  identity       = 2
  control-api    = 2
  control-portal = 1
  work-api       = 2
  work-admin     = 1
  school-api     = 2
  school-admin   = 1
}

images = {}
