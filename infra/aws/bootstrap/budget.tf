# The account's monthly cost backstop (owner decision, 29 Oct 2026: about US$50 a month for Testing,
# alerts to admin@ and alert@munaxa.com). Testing's own backstop is the evening session shutdown;
# this one catches anything else, including the idle Docs Production stack in the same account.
# Budgets is a global service; its API is reached through us-east-1 by the provider.

resource "aws_budgets_budget" "account" {
  name         = "${local.prefix}-account-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }
}

# Testing on its own (owner, 30 Oct 2026: the US$50 target is for the new Testing environment; the
# old Docs stack is temporary and is costed separately until it retires). Everything stack/ creates
# for nonprod carries Environment = nonprod. Cost Explorer sees the tag only once the owner has
# activated Environment as a cost allocation tag (Billing console, a one-time owner step); until
# then this budget reads US$0 and the account budget above is the only backstop.
resource "aws_budgets_budget" "testing" {
  name         = "${local.prefix}-testing-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.testing_budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$nonprod"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.budget_alert_emails
  }
}
