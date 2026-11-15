# 04. IAM policy review

All statements below are the offline render at `9752146` (normalized: actions and resources
sorted). The owner script compares the real plan with exactly these.

## 1. Nonprod workload boundary `munaxa-shared-workload-boundary` (+2 statements, 16 to 18)

A permission boundary caps what nonprod workload roles (task roles, scheduler roles, the cleanup
role) can ever do; it grants nothing by itself.

- `TestingSessionCleanup` (Allow):
  - Actions: `ecs:DescribeServices`, `ecs:StopTask`, `elasticloadbalancing:DeleteLoadBalancer`, `rds:DescribeDBInstances`, `secretsmanager:DeleteSecret`, `states:StartExecution`.
  - Resources, all with a nonprod name:
    - `service/munaxa-nonprod/*`
    - `task/munaxa-nonprod/*`
    - `loadbalancer/app/munaxa-nonprod/*`
    - `db:munaxa-nonprod-*`
    - `secret:munaxa-nonprod/identity-bootstrap-??????`
    - `stateMachine:munaxa-nonprod-session-cleanup`
- `TestingSessionCleanupLookups` (Allow):
  - Actions: `ecs:ListTasks`, `elasticloadbalancing:DescribeLoadBalancers`, `secretsmanager:ListSecrets`.
  - Resource: `*`. These three actions have no resource-level permission. `ListSecrets` returns names and metadata, never a value.

The existing boundary denies stay in force and win over these allows: `NeverTheOtherEnvironment` (prod tag), `NeverMunaxaDocsProduction`, `NeverFromADeployerSession`, `ThisRegionOnly`.

## 2. Nonprod session-read `munaxa-shared-deployer-nonprod-session-read` (+1 statement, 4 to 5)

- `RefreshSessionCleanup` (Allow), reads only:
  - Actions: `cloudwatch:ListTagsForResource`, `sns:GetTopicAttributes`, `sns:ListTagsForResource`, `states:DescribeStateMachine`, `states:ListTagsForResource`.
  - Resources: `alarm:munaxa-nonprod-*`, `munaxa-nonprod-*` topics, `stateMachine:munaxa-nonprod-*`.
- Why it is needed: without it, the session plan refresh of the new cleanup resources fails. That is the same class of failure as S-1.

## 3. New `munaxa-shared-deployer-nonprod-session-cleanup` (4 statements), attached to the nonprod deployer only

- `OwnSessionCleanupStateMachine`:
  - Actions: Create, Update, Delete, Describe, ListStateMachineVersions, Tag, Untag, ListTagsForResource.
  - Resource: `stateMachine:munaxa-nonprod-*`.
- `ValidateDefinitions`: `states:ValidateStateMachineDefinition` on `*`. This action takes no resource.
- `OwnAlarmTopics`:
  - Actions: Create, Delete, Get and Set attributes, Tag, Untag, ListTags.
  - Resource: `sns:...:munaxa-nonprod-*`.
  - There is no `sns:Subscribe`. The alarm email subscription stays a separate owner step (D-B5).
- `PassTheCleanupRole`:
  - Action: `iam:PassRole`.
  - Resource: only `role/munaxa-shared/munaxa-nonprod-session-cleanup`.
  - Condition: `iam:PassedToService = states.amazonaws.com`.

## 4. Assessment

- **Wildcards.** Only three wildcards appear:
  - `ValidateDefinitions` on `*`, which has no resource;
  - the three lookups on `*`, which have no resource-level permission;
  - `munaxa-nonprod-*` name prefixes.

  These are exactly the reviewed implementation (reviews in `2026-11-14-identity-stage-e-blockers-remediation`, 06, 10 and 12). No service-wide wildcard action.
- **Production.** Every named resource is `munaxa-nonprod…`. The prod boundary and the prod deployer do not change. The deployer's inline guardrails (iam.tf) still deny the other environment and Docs Production.
- **Secrets.** The boundary allows deleting only `munaxa-nonprod/identity-bootstrap-??????`. That is the one-run copy, retired by L-A0, so after #131 it is never created. The boundary does not allow touching `identity-operator`, and no secret value can be read: there is no `GetSecretValue`.
- **Policy sizes** are well under the 6,144-character managed-policy limit: 3,871, 1,470 and 1,028.
- **Attachments.** The nonprod deployer goes from 3 to 4 managed policies, against a quota of 10. The script checks the live count.
- **Note for later.** `secretsmanager:DeleteSecret` on the retired one-run secret is now only a fallback. Removing it would be a separate reviewed change, not part of D-B2.
