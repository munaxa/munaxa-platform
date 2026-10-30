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
