# Munaxa AWS access policy: development stage and future deployment stage

- **Status:** in force from 8 Nov 2026 by the owner's decision (thread "Update root access policy and
  verify Testing readiness", 8 Nov 2026 06:30 UTC). It restates and supersedes, for access only, the
  owner decisions of 29 Oct 2026 (root until launch, no Identity Center, no IAM users or keys).
- **Account:** `229251310592` (management account of `o-6i2zz7t70i`), Region `eu-central-1`.
- **Scope:** how the owner and Claude reach AWS while Munaxa is being built and tested. It does not
  change the workload roles that Terraform creates (`bootstrap/`, `stack/`): CI, deployers, session
  deployers, image publishers and task roles keep their own scoped permissions.

This is an intentional development-stage decision. It is **not** a claim that root is a recommended
permanent or production operating model.

## 1. Development stage (now)

### 1.1 Access method

| # | Rule |
|---|---|
| D-1 | The existing AWS root account and the existing root-connected Claude AWS connector are the approved development access method. |
| D-2 | Root MFA stays enabled. |
| D-3 | No root access keys are ever created. |
| D-4 | No IAM user, IAM role or IAM Identity Center configuration is created solely to run readiness scripts, read-only checks or to continue development. |
| D-5 | Claude may perform explicitly authorized AWS development operations using the existing connection. Authorization is given per task by the owner in the thread. |
| D-6 | Read-only inspection and infrastructure modification are distinct, and every report says which one happened. An authorization for read-only inspection never covers a write. |
| D-7 | Every infrastructure change has a defined scope, a reviewed plan where applicable (Terraform: the exact plan and declaration), and the owner's explicit authorization before it runs. |
| D-8 | On an unexpected `AccessDenied`, stop. Investigate the cause (decode the message, read the policy in code) before changing any policy or retrying. |
| D-9 | Never retrieve or expose secret values, private keys, credentials, application data or Terraform state contents. Secrets Manager: names, metadata and version counts only. KMS: aliases and key metadata only. State: never read the object; metadata (serial, lineage) only when a report needs it and the owner allows it. |
| D-10 | CanteenHub is outside every Munaxa AWS task unless the owner explicitly says otherwise. |

### 1.2 What the root connection does not prove

Root bypasses identity policies, permissions boundaries and (in the management account) SCPs
do not apply to anyone. A call that succeeds as root says nothing about whether a Terraform
deployer, CI, session or publisher role is allowed to make it. Deployer permissions are assessed
from code, from the deployers' own successful applies, or from an IAM simulation that the owner
authorizes as a separate step.

### 1.3 Read-only inspection with the root connection

When the owner authorizes read-only inspection for a task:

1. Review every command before running it. Only `Describe*`, `Get*` (metadata, never
   `GetSecretValue`), `List*` and `LookupEvents` calls. No `Simulate*` unless separately authorized.
2. Record the actual observation time of each result (UTC) and keep current evidence apart from
   earlier reports.
3. The owner's CloudShell scripts that stop on a root caller (for example
   `ALLOW_ROOT_READONLY=yes` in the 7 Nov release-readiness script) may be run as root by the owner
   for read-only checks. Under this policy that is the approved mode, not a deviation.

## 2. Future deployment stage (prepare, do not implement yet)

To be designed and implemented at the deployment-readiness stage, before any production launch,
each as its own reviewed change with the owner's approval. **Nothing in this list is created now,
and none of it is a prerequisite for development or Testing steps.**

| # | Item | Notes for the design |
|---|---|---|
| F-1 | IAM Identity Center | Enable in the management account; decide the identity source (built-in directory is enough for a one-owner organization). |
| F-2 | MFA-enforced operator identity | One named operator user with phishing-resistant MFA; no long-lived keys. |
| F-3 | Permission sets: Administrator, Engineering, ReadOnly | Starting drafts exist (`/mnt/project-files/aws-foundation/proposed-2026-10-29/iam/`, not applied); they need re-review against the current stack (KMS asymmetric keys, PassRole to ECS, session deployer). |
| F-4 | Dedicated deployment roles, narrowly scoped | The existing OIDC CI, deployer, session and publisher roles are the basis; prod deployers get their own boundary (`munaxa-shared-workload-boundary-prod`) before any prod apply. |
| F-5 | Root break-glass procedure | Root used only for tasks that require it; MFA device custody, a sealed recovery procedure, CloudTrail alerting on root sign-in. |
| F-6 | Production access separation | Production changes only through reviewed pipelines and a separate permission set; no standing write access to prod. |
| F-7 | Account recovery and access verification | Recovery contacts, alternate contacts, periodic test of operator sign-in and break-glass. |

When the deployment stage starts, this file is updated first and the change goes through review.

## 3. Where this policy is applied

- Reports state, for each AWS call, whether it was read-only or a change, the identity used, and
  the authorization in the thread.
- Readiness reports must not list "no non-root read-only identity" as a blocker for owner-authorized
  read-only development checks (correction of 8 Nov 2026 to
  `docs/aws-migration/agent-reports/2026-11-07-release-readiness-verification/`).
- Genuine technical blockers stay: for example, the Config A deployer IAM assessment is still needed
  because root access does not prove the deployer's permissions (§1.2).
