# Phase 7, Agent 4: Testing session network security and public logs

> **Lead note (Phase 7 consolidation).** This report was written against PR #43 head `e78aa92`. Its patch `a4-p4-placement-and-logs.patch` (F-1 network placement: bootstrap Sid `SessionNeverNetworkPlacement` and `scripts/terraform/session-network-placement.jq`; F-2 key-id masking; F-3 warning headings) was applied by the lead in commit `58b80f4`, now in PR #43 (head `744c67c`). Bootstrap 12/12 and stack 24/24 pass there [L]. Simulation revision 3 covers the new deny (cases NP01 to NP16, `02` §6.2).


Scope: munaxa-platform PR #43, head e78aa92 (worktree at /tmp/claude-0/phase7/a4/wt). No AWS call, no GitHub write, nothing applied to the PR.

Labels: [V-repo] repository evidence, [V-gh] GitHub evidence, [V-aws] earlier owner-pasted live evidence, [L] local simulation or test, [E] inference, [U] unverified, [O] owner action required.

Local policy evaluation is not an AWS IAM simulation. Every statement here about how IAM evaluates a request is [E] unless it says otherwise.

## 1. Summary

- The session deployer cannot create, change or revoke a security-group rule. Its policy allows no EC2 write at all. All seven rule actions are denied explicitly, and so is tagging groups and rules. [V-repo][L]
- The from_alb rules (9 with all products and Docs) and the ALB egress rules (9) do not depend on the session switches. The same 63 security-group rules are planned in all four edge and services positions, and the address set hashes identically. The session delta is 41 resources of the 7 allowed types, with no security-group resource among them. [L]
- G3 is unaffected by admit_alb. The mocked G3 plan gives 64 creates, identical to the addresses of run 41977870108, with 0 from_alb rules. [L]
- The session plan filter rejects every security-group type for create, update, delete, both replacement orders and forget (36 of 36), and lets no-op and read through. [L]
- **Main finding (F-1, Medium):** P4 is closed for rules but not for placement. Through elasticloadbalancing:* and ecs:Create/UpdateService, the session can put the ALB or any service into another existing security group or subnet of the VPC, or make the ALB internal. The plan filter checks only resource types, and it accepts all of this. Nothing opens a task port to the internet today. The real risk is lateral reach without approval (for example, any service into the db_admin group, which reaches the database). A fix patch is provided.
- Logs: the plan and apply stdout are suppressed in both Terraform workflows. Errors reach stderr and can quote non-sensitive values (shown locally with the DB endpoint pattern). Sensitive values are redacted. No secret value or connection string exists in Terraform at all. Warnings are dropped, though the comments say they reach the log (F-3). In the session job, the temporary access key id is written to GITHUB_ENV without a mask (F-2).

## 2. Findings, ranked by severity

### F-1 (Medium): session network placement is not covered by P4, and the plan filter does not catch it

Evidence:
- The session allow `SessionEdgeAndServices` grants `elasticloadbalancing:*` on the ALB, listener, listener-rule and target-group ARNs, plus `ecs:CreateService` and `ecs:UpdateService` on `service/munaxa-nonprod/*`. [V-repo] iam_session.tf:100-110
- The ELB actions in that set include SetSecurityGroups, SetSubnets and SetIpAddressType, and CreateLoadBalancer takes any SecurityGroups and Subnets. The ECS calls take any `networkConfiguration.awsvpcConfiguration` (securityGroups, subnets, assignPublicIp). [E] As far as I know, none of these is authorized on the security group or the subnet, so no EC2 deny applies, and that includes `NeverInProtectedVpcs` (ec2:Vpc is an EC2-only key). [U] I could not check the Service Authorization Reference without an AWS call. Two things stay open. One is whether `elasticloadbalancing:SecurityGroup` and `elasticloadbalancing:Subnet`, or the newer ECS network keys, can pin these values. Even if they can, the group ids do not exist until G3, so bootstrap cannot name them today.
- The plan filter in aws-session.yml checks types only. A synthetic plan in which a service moves to `[sg-alb, sg-dbadmin]` and the ALB gains `sg-dbadmin` is accepted. So are placing a service into the ALB group, turning off its public IP, putting it in the DB subnets, making the ALB internal, and moving the ALB to a foreign subnet: 8 of 8 accepted. [L] jqtest/placement-results.txt
- aws-session.yml runs main's code in `aws-nonprod-session`, which has no required reviewer and shows no attribute names. [V-repo] An `aws_lb` or `aws_ecs_service` placement change merged to main therefore goes live on the next `up` without the owner's approval. The reviewed path, aws-terraform.yml, would have shown the changed attribute names and waited for approval.

What it can and cannot do today (G3 VPC groups: alb, database, db_admin, the per-service groups and the emptied default group) [E]:
- No internet exposure of a task port. Only the ALB group admits 0.0.0.0/0, on 80 and 443, and no container listens on those ports. The session cannot register a task definition (no allow, and `aws_ecs_task_definition` is outside the filter). assign_public_ip is already true for every task, so setting it adds nothing.
- Lateral reach. A service in the db_admin group reaches the database on 5432, because the DB admits db_admin. A service in the ALB group reaches every routed service directly, past the ALB's refusal rules. The ALB in docs-api's group reaches docs-scanner on 1344. All of this stays inside nonprod. It still needs the app's database credentials or an app compromise to be useful.
- Other VPCs. CreateLoadBalancer or CreateService with default-VPC subnets and that VPC's default group is not blocked by IAM [E]. The default group admits only itself, so the impact is low.
- Already by design (not a defect): the session fully controls L7 routing through listener rules, including the control and operator refusal rules. This was accepted when the ALB was made session-owned. Listing it here keeps the severity honest.

Severity: Medium. It needs a merged change on main, and the reach is lateral and nonprod only. It contradicts the stated P4 intent ("a session writes no network exposure") and bypasses the approval-gated path.

Fix, patches/a4-p4-placement-and-logs.patch (applies cleanly to e78aa92; tested in /tmp/claude-0/phase7/a4/pwt):
1. A new `scripts/terraform/session-network-placement.jq`, called from "Plan the switches". For every created or updated `aws_ecs_service`, security_groups must be exactly the module's own `aws_security_group.this` id, assign_public_ip must be true, and the subnets must be `aws_subnet.public[*]`. For `aws_lb`, security_groups must be exactly `aws_security_group.alb`, internal must be false, and the subnets must be public. The ids come from `planned_values`. Unknown or missing values fail closed, and only addresses are printed. Results: 8 of 8 bad cases rejected; create, update, replace and the `down` deletes accepted. [L] One caveat: this was tested on synthetic plan JSON only. The `planned_values` layout of a real session plan is [U] until the first `up` after the patch, and a mismatch there fails closed (the `up` is refused).
2. A bootstrap statement `SessionNeverNetworkPlacement` (Deny) on elasticloadbalancing:SetSecurityGroups, SetSubnets and SetIpAddressType, plus ec2:ModifyNetworkInterfaceAttribute, CreateSecurityGroup and DeleteSecurityGroup, with a test assertion. With it, the inline policy grows from 9,182 to 9,468 non-whitespace characters, under the 10,240 role inline limit [L for the size, E for the limit]. [U] I assume Terraform's `aws_lb` create passes the groups in CreateLoadBalancer and calls SetSecurityGroups only on update. If that is wrong, `up` fails visibly. [O] This needs a root bootstrap re-apply in CloudShell.

### F-2 (Low): the session job's deployer access key id is unmasked in GITHUB_ENV

- aws-session.yml:144-152 masks SecretAccessKey and SessionToken but not AccessKeyId, then writes all three to GITHUB_ENV. [V-repo] GitHub lists GITHUB_ENV variables in each later step's header [E], so the temporary ASIA key id appears in the public log. It is not usable without the masked secret and token, which is why this is Low.
- The other assume-role blocks (the database job and both aws-terraform.yml blocks) keep the key id in a shell variable and never print it. [V-repo]
- Fix (in the patch): `::add-mask::` the AccessKeyId as well.

### F-3 (Low): Terraform warnings are discarded, but the comments say they reach the log

- Terraform writes warnings to stdout and errors to stderr. Locally, a failing check block warning showed up only on stdout and stderr was empty; an error went to stderr. [L] diagdemo/
- With `> /dev/null`, deprecation warnings and check-block failures are therefore invisible in aws-terraform.yml (plan and apply) and in aws-session.yml. aws-terraform.yml lines 12 and 173 say "errors and warnings still reach the log". [V-repo]
- Fix (in the patch): send stdout to a file, print only the `Warning: <heading>` lines as `::warning::` (headings are fixed summary text, never an attribute value [E]), delete the file, and correct the comments. The patch also adds `set -euo pipefail` to both apply steps.

### F-4 (Info): stderr can quote non-sensitive values

- On error, a Terraform diagnostic quotes the values of the expressions involved. Locally this printed `local.endpoint is "munaxa-test-pg.example.eu-central-1.rds.amazonaws.com"`. A `sensitive` value printed as "this sensitive string". [L]
- Provider errors quote ARNs and ids: role ARNs, the deployer session name, group and subnet ids, secret ARNs in ECS errors, the DB endpoint if an expression that uses it fails. [E]
- What could appear in the public log: the DB endpoint (a private DB with no public access), secret ARNs (containers only), resource ids, the account id (already public in the workflows). This happens only on a failing run that touches such an expression. Likelihood: low to moderate per failure. Impact: low.
- What cannot appear: secret values or connection strings. The stack holds only secret containers, values are set outside Terraform (data.tf:12-13), and the master password is RDS-managed. Deployers are denied GetSecretValue. [V-repo]

### F-5 (Info): small permission and comment nits

- `SessionPassOwnRoles` allows PassedToService `ecs.amazonaws.com` (the legacy service `role` parameter, which the stack does not use). The comment above it says "ECS services pass no role of their own", but the statement still allows PassRole. [V-repo] Whether CreateService needs iam:PassRole for the task roles is [U]. Keep the statement, drop `ecs.amazonaws.com` only after the first session proves it is unused, and fix the comment.
- `ecs:UntagResource` is not needed by up or down (tags are set at create, and services are deleted at down) [E]. It is harmless.
- The aws-session.yml header lists "ALB egress rules" as session changes, but they are persistent and the filter rejects them. The patch fixes the comment.
- ci.yml and release.yml use tag-pinned actions (`@v6`, `@v4`, `@v5`). The two Terraform workflows use SHAs. [V-repo] There is no Terraform or AWS there, so this is out of this scope.

## 3. P4 coverage, action by action

| Action | Session allow? | Explicit deny? | Result |
| --- | --- | --- | --- |
| ec2:Authorize/RevokeSecurityGroupIngress/Egress | no | yes (SessionNeverSecurityGroupRules) | refused [V-repo][L] |
| ec2:ModifySecurityGroupRules, UpdateSecurityGroupRuleDescriptionsIngress/Egress | no | yes | refused |
| ec2:CreateTags, DeleteTags on security-group and security-group-rule | no | yes (SessionNeverGroupTags) | refused |
| ec2:CreateSecurityGroup, DeleteSecurityGroup | no | no (patch adds one) | implicitly refused [E] |
| ec2:ModifyNetworkInterfaceAttribute (ENI groups) | no | no (patch adds one) | implicitly refused [E] |
| elasticloadbalancing:SetSecurityGroups, SetSubnets, CreateLoadBalancer with any groups | yes (elasticloadbalancing:* on the ALB) | no (patch denies Set*) | **allowed: F-1** |
| ecs:CreateService/UpdateService networkConfiguration (groups, subnets, public IP) | yes | no | **allowed: F-1**; patch adds a plan check |

The rendered session inline policy contains no EC2 allow at all. [L] rendered-session_inline.json

## 4. from_alb persistence and the G3 plan

Harness: /tmp/claude-0/phase7/a4/fromalb. It uses the PR's mock provider and variables, with all 14 product images (including Docs) and hosts.docs, over 4 runs. [L]

| edge_enabled | services_enabled | creates | from_alb | ALB egress | all SG rules | ECS services | ALB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| false | false | 212 | 9 | 9 | 63 | 0 | 0 |
| false | true | 226 | 9 | 9 | 63 | 10 | 0 |
| true | false | 219 | 9 | 9 | 63 | 0 | 1 |
| true | true | 253 | 9 | 9 | 63 | 10 | 1 |

- The security-group and rule address set has the same sha256 prefix, e76f95e8bb38853f, in all four runs. [L]
- The from_alb modules are exactly the 9 routed modules (the target-group owners). docs-scanner is not routed and has no from_alb. [L]
- Session delta (true/true minus false/false): 41 creates, 0 removed. By type: 1 aws_acm_certificate_validation, 10 aws_ecs_service, 1 aws_lb, 2 aws_lb_listener, 14 aws_lb_listener_rule, 9 aws_lb_target_group, 4 aws_service_discovery_service. All are allowed types, and none is a security-group resource. [L] A mocked plan shows creates only; in-place updates of an `up` from real state are not covered.
- G3, on a copy of /tmp/claude-0/g3mock (the original is untouched), with `-var-file=envs/nonprod.tfvars`: 64 creates, 0 updates or destroys, 0 from_alb. Its security-group resources are the alb, database, db_admin and default groups and 5 rules (alb 80 and 443, db_admin https and database, database_from_db_admin). The sorted addresses are identical to the addresses of run 41977870108 from the evidence file. [L][V-gh via the committed evidence] images = {}, so no service module exists and admit_alb has no effect on G3.

## 5. Plan filter test (the exact jq, extracted with yq from aws-session.yml)

148 single-change plans were built from 18 types and 8 actions (create, update, delete, delete+create, create+delete, no-op, read, forget), plus 4 edge cases. [L] Files: jqtest/plans, jqtest/results.tsv.

- Security-group types: aws_vpc_security_group_ingress_rule, aws_vpc_security_group_egress_rule, aws_security_group, aws_security_group_rule, aws_default_security_group and aws_network_interface_sg_attachment. Each is rejected for all 6 changing actions (36 of 36) and accepted for no-op and read.
- The 7 allowed types are accepted for every action (56).
- Other types (task definition, DB instance, IAM role, target-group attachment, listener certificate) are rejected for every changing action (30 of 30).
- An allowed ALB create mixed with a from_alb delete is rejected.
- An empty `resource_changes` is accepted.
- A missing `resource_changes` key makes jq exit 5. Under `set -e` that fails the step, so it fails closed.
- Totals: 80 accepted, 67 rejected, 1 error.
- Placement gap: the plan where a service and the ALB move groups is accepted by the current filter and rejected by the patch (section 2, F-1).

## 6. Public log review of all workflows

| Workflow and step | Exposure | Status |
| --- | --- | --- |
| aws-terraform `terraform plan` | stdout to /dev/null; stderr shows errors | OK (warnings lost: F-3) [V-repo] |
| aws-terraform summary | plan-summary.sh (addresses and actions), plan-changed-attributes.sh (top-level attribute names only), check-plan-intent.sh (addresses, actions, declared intent text) | OK. for_each keys are static names (ports, product names, bucket keys, rule priorities) [V-repo] |
| aws-terraform `terraform show -json` | to plan.json, then deleted; tfplan kept in the KMS-encrypted state bucket; only its sha256 is in job outputs | OK |
| aws-terraform `terraform apply` | stdout to /dev/null (ids and every output); stderr shows errors | OK (F-3, F-4) |
| `terraform init` (both workflows) | stdout printed: backend and provider messages, no values; the role ARN is passed as an argument and not echoed | OK [E] |
| aws-session plan and apply | as above; step summary is plan-summary.sh only; plan.json deleted; tfplan stays on the ephemeral runner, not uploaded | OK (F-1, F-3) |
| aws-session "Does the stack exist" | prints the bucket and key; on error, the AWS CLI message (may include a role ARN) | OK |
| aws-session and database job: assume-role | secret and token masked; key id unmasked in GITHUB_ENV in the session job | F-2 |
| stop-database.sh / start | prints the status only; start and stop output to /dev/null | OK |
| ci.yml, release.yml | no Terraform or AWS; one upload-artifact (Storybook static build, on failure only) | OK, out of scope |

- `set -x`, `bash -x`, `TF_LOG` and `ACTIONS_STEP_DEBUG`: none in .github, scripts or infra. setup-terraform runs with `terraform_wrapper: false`, so no wrapper echoes stdout. [V-repo]

## 7. Session permissions, statement by statement

Rendered locally with the real aws_iam_policy_document data source. The provider was offline (proxy disabled, skip flags set), and the OIDC data source and the two state resource ARNs were replaced with literals. Files: rendered-session_inline.json, rendered-session_read.json, rendered-deployer_read.json. Inline size: 9,182 non-whitespace characters. [L]

| Sid | Effect | Needed by | Verdict |
| --- | --- | --- | --- |
| StateList | Allow s3:ListBucket on the state bucket | init (workspaces) | needed |
| State | Allow Get/Put/DeleteObject on nonprod/* | head-object, state read and write, lock file | needed |
| StateKey | Allow kms Encrypt/Decrypt/GenerateDataKey on the state key | SSE-KMS state | needed |
| 18 guardrail denies from the nonprod deployer | Deny | defense in depth | keep |
| SessionEdgeAndServices | Allow elasticloadbalancing:*, ecs Create/Update/DeleteService, Tag/Untag | ALB, listener, rule and target-group create and delete; ECS services; ecs:TagResource for tags on create | needed, but `*` includes SetSecurityGroups/SetSubnets/SetIpAddressType (F-1); UntagResource unused (F-5) |
| SessionNeverSecurityGroupRules, SessionNeverGroupTags | Deny | R10 | keep |
| SessionCloudMapServices | Allow servicediscovery Create/Delete/UpdateService on Project/Environment-tagged resources | discovery entries (namespace side of create) | needed |
| SessionDiscoveryWithOwnTags | Allow CreateService on a new service with request tags | new entry | needed |
| SessionDiscoveryTagOnCreate | Allow servicediscovery:TagResource with request tags | tags on create | needed (residual R3) |
| SessionPassOwnRoles | Allow iam:PassRole on munaxa-nonprod-* roles to ecs-tasks and ecs | ECS services with task roles [U] | keep; `ecs.amazonaws.com` is likely unnecessary (F-5) |
| SessionDatabaseStartStop | Allow rds Start/StopDBInstance on munaxa-nonprod-pg | the up start step, the down stop steps and the database job | needed |
| deployer_read (managed) | Describe, List and metadata Get | refresh of the whole stack | needed |
| deployer_session_read (managed) | KMS, secret-container, bucket and role reads on nonprod | refresh of the persistent layer | needed |

Nothing else is extra. The session has no EC2, IAM-write, KMS-write, logs, S3-write, ACM or task-definition allow. [L]

## 8. Test and tool counts

- PR head e78aa92: `terraform fmt -check -recursive infra/aws` exit 0. validate OK for bootstrap and stack. `terraform test`: bootstrap 12 passed, 0 failed; stack 24 passed, 0 failed. [L] baseline-tests.txt
- With the patch (pwt/): fmt exit 0, validate OK, bootstrap 12/12 (one new assertion inside h3), stack 24/24. [L]
- Harnesses: fromalb 4 of 4 runs passed; G3 mock 1 of 1 passed (64 creates); policy render 1 of 1 passed. [L]
- yq (kislyuk yq 3.1.0) parses all 4 workflows: aws-session 2 jobs, aws-terraform 3, ci 3, release 1. This holds with and without the patch. [L]
- actionlint 1.7.7: downloaded from its GitHub release, sha256 023070a2...e0757 matches the release's checksums file. It reports 2 shellcheck SC2015 info-level notes and nothing else, before and after the patch. Both are the intentional `[ ] && [ ] || { error; exit; }` pattern. [L]
- shellcheck: the GitHub release has no checksum file, and api.github.com and the release asset page were blocked (403). So I installed 0.9.0 from the signed Ubuntu apt repository instead. scripts/terraform/*.sh, scripts/aws/*.sh and db-bootstrap.sh (sh): 0 findings. [L]

## 9. Owner actions

- [O] Decide on patches/a4-p4-placement-and-logs.patch. The workflow and jq part takes effect on merge. The bootstrap part needs a root re-apply in CloudShell (1 policy update).
- [O] After the patch, the first `up` confirms that the placement check passes on a real plan and that the ALB create works with the Set* denies.

## 10. Files in /tmp/claude-0/phase7/a4/

- 04-SESSION-SECURITY-AND-LOGGING.md: this report
- patches/a4-p4-placement-and-logs.patch: aws-session.yml, aws-terraform.yml, iam_session.tf, bootstrap test, new scripts/terraform/session-network-placement.jq
- rendered-session_inline.json, rendered-session_inline.patched.json, rendered-session_read.json, rendered-deployer_read.json
- jqtest/: filter.jq (exact), plans/, results.tsv, placement.jq, sg/, placement-results.txt
- fromalb/aws/stack/: tests/a4.tftest.hcl, a4.out, created.txt, summary.txt, delta.txt
- g3mock/aws/stack/: g3.out, g3-addresses.txt (copy; the original is untouched)
- diagdemo/: Terraform warning and error stream demo
- baseline-tests.txt, actionlint.txt, wt/ (PR head), pwt/ (patched copy), render/ (policy render harness)
