mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  override_resource {
    target = aws_db_instance.main
    values = { address = "pg.example", port = 5432, master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }] }
  }
}
run "dump" {
  command = plan
  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-XXXXXX" }
  }
  assert {
    condition     = module.identity[0].task_definition_container_definitions == "x"
    error_message = "DUMP ${module.identity[0].task_definition_container_definitions} ENDDUMP"
  }
}
