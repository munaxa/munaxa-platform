# Munaxa operator access: AWS-native

- **Status:** architecture decision of the owner, 21 Nov 2026 (thread "Replace Cloudflare Access
  with AWS-native operator access"). It supersedes the 29 Oct 2026 choice of Cloudflare Access as
  the operator access method ([cloudflare-access.md](cloudflare-access.md), now optional).
- **Nothing in this file has been created in AWS, GitHub or Cloudflare.** Every step marked
  **[O]** is an owner-executed operation that needs its own explicit approval. A merged pull
  request is not that approval.
- **Account and Region:** `229251310592` (management account of organization `o-6i2zz7t70i`),
  `eu-central-1`. Testing and Production workloads are in this account "until member accounts
  exist" (`stack/envs/*.tfvars`); the member-account design of 29 Oct 2026 (`munaxa-nonprod`,
  `munaxa-prod`) is kept and not changed here.
- **Report:** `docs/aws-migration/agent-reports/2026-11-21-aws-native-operator-access/`.

## 1. Two separate access layers

| Layer | Who | Mechanism | Never |
| --- | --- | --- | --- |
| **AWS infrastructure** (console, CLI, CloudShell, logs, secrets custody, Terraform runs) | Munaxa operators (people), and machines | People: **AWS IAM Identity Center** with MFA and least-privilege permission sets. Machines: the existing GitHub OIDC roles (`bootstrap/`), unchanged | No IAM users, no long-lived access keys, no routine root use |
| **Munaxa applications** (Identity, Control portal and API, Docs, Work, School) | Customers' users and Munaxa staff as application users | **Munaxa Identity** (sessions, `mfa` claim, organisations, RBAC) and each product's own authorization, tenant isolation and licensing checks | IAM Identity Center never signs anyone in to a Munaxa application; no AWS console or API is exposed to application users |

Cloudflare stays the DNS provider for `munaxa.com` and keeps the corporate website and its other
existing uses. **Cloudflare Access is optional** and is not a prerequisite for AWS access, any
Testing deployment, Identity, Control, Docs, Work or School, or for issuing or installing
application credentials.

## 2. IAM Identity Center (the operator identity layer)

### 2.1 Design (from the approved 29 Oct 2026 Phase 0 design)

| Item | Setting |
| --- | --- |
| Instance | One **organization instance**, enabled in the management account `229251310592`, Region `eu-central-1` |
| Identity source | Identity Center directory (enough for a one-owner organization) |
| Users | **One named user per person.** First user: the owner, e-mail `IDENTITY_OPERATOR_EMAIL` (placeholder; the real address is never written in a repository). No shared users |
| MFA | Settings → Authentication → MFA: prompt **every time they sign in**; allowed types: **security keys and built-in authenticators, authenticator apps**; a user without a device must **register one at sign-in**. Do not add `aws:MultiFactorAuthPresent` conditions to policies (Identity Center sessions do not carry that key; it would lock everyone out) |
| Permission sets | `MunaxaAdministrator` (1 h), `MunaxaEngineering` (4 h), `MunaxaReadOnly` (8 h). Policies: the reviewed drafts in project files `aws-foundation/proposed-2026-10-29/iam/` (not applied) and the table in §2.2 |
| Root | Break-glass only (§6) |

### 2.2 Permission sets and what each is for

| Permission set | Policies (29 Oct design) | Used for | Session |
| --- | --- | --- | --- |
| `MunaxaReadOnly` | `ViewOnlyAccess` + `SecurityAudit` + `AWSMCPSignInOAuthAccessPolicy` + inline reads (cost, budgets, Organizations, Identity Center, quotas, CloudWatch metrics and alarms, `cloudtrail:LookupEvents`). **Explicit deny:** `secretsmanager:GetSecretValue`, `kms:Decrypt`, `s3:GetObject*`, log contents (`logs:GetLogEvents`, `FilterLogEvents`, `StartQuery`), `ecs:ExecuteCommand`, `ssm:StartSession`, `ssm:GetParameter*` | Read-only inspection by people, and **the Claude AWS connector** (read-only checks) | 8 h |
| `MunaxaEngineering` | **In `229251310592` (now):** `ViewOnlyAccess` + [`identity-center/MunaxaEngineering.management-interim.inline.json`](identity-center/MunaxaEngineering.management-interim.inline.json): the seven custody bundles and the Docs one-run provision secret, the nonprod data key only through Secrets Manager, nonprod log contents, CloudShell; **no IAM write**, explicit denies on Production-tagged resources, other secrets and keys, state and trail buckets, ECS Exec, Session Manager, other Regions. The 29 Oct `PowerUserAccess` draft is for a future member account only and must not be used here (finding IC-1, [identity-center/README.md](identity-center/README.md)) | Owner-executed custody scripts (Secrets Manager versions), reading nonprod CloudWatch log contents | 4 h |
| `MunaxaAdministrator` | Inline management-account policy: Organizations, account, Identity Center, CloudTrail, budgets and cost, support; IAM reads; `sts:AssumeRoot`; **explicitly denies workloads in the management account** (EC2, VPC, NAT, ECS, RDS, ElastiCache, Lambda, ALB, `GetSecretValue`) | Organization and Identity Center administration only | 1 h |

**Assignment while workloads are in the management account (owner decision D-IAM-1).** The
29 Oct design assigns `MunaxaEngineering` to the `munaxa-nonprod` member account only, which does
not exist yet. Until it does, the workloads live in `229251310592`, where the Administrator set
deliberately denies workload actions. The recommended interim assignment, in `229251310592`, is:

- owner: `MunaxaAdministrator`, `MunaxaEngineering`, `MunaxaReadOnly`;
- Claude AWS connector sign-in: `MunaxaReadOnly` only.

**Re-review of 21 Nov 2026 (ACCESS-POLICY F-3, report `2026-11-21-testing-readiness` file 02):**
the 29 Oct `MunaxaEngineering` draft must **not** be provisioned in this account. Its IAM allows on
`role/munaxa-*/*` match the GitHub OIDC deployers under `/munaxa-shared/bootstrap/` (including the
prod deployer) and the boundary policies under `/munaxa-shared/`, so it could rewrite a deployer's
trust policy (finding IC-1), and `PowerUserAccess` reaches every Production-tagged resource and
secret here (IC-2). The management-account interim policy in
[`identity-center/`](identity-center/README.md) replaces it, with no IAM write at all. The policies
to paste, the console steps and the verification commands are in that README; the JSON in the
project files is superseded for this account. F-6 (production separation) still applies before any
Production deployment.

Operations that remain **root (break-glass)**, because the permission sets deliberately refuse them:
every `bootstrap/` apply of this repository (OIDC provider, deployer roles, boundaries; the planned
RDS restart stop and any D-B*/H-20 style re-apply) and the **Docs bootstrap** apply in munaxa-docs
(`infra/terraform/bootstrap`, tagged `Environment=Production`; pack item 4). The custody-script
steps of the execution pack (Control bundles, Docs bundles, Docs credential, Docs provisioning)
run under `MunaxaEngineering`.

### 2.3 Machine access (unchanged)

GitHub Actions reach AWS only through OIDC: `munaxa-shared-ci-<env>` assumes the deployer and
session-deployer roles; image publishers are per repository (`bootstrap/`). Environment protection
(`aws-nonprod`, `aws-nonprod-session`, `image-release`), plan and apply separation, the declared
intent check (`envs/<env>.expected-changes.json`) and the session plan check stay exactly as they
are. Identity Center changes nothing in this path.

## 3. Operator procedure (people)

### 3.1 Console

1. Open the AWS access portal URL of the Identity Center instance (Identity Center → Settings →
   "AWS access portal URL"; it is `https://<id>.awsapps.com/start`). Bookmark it.
2. Sign in as your own named user and complete MFA (security key or authenticator app).
3. Select account `229251310592`.
4. Select the **least-privilege** permission set for the task: `MunaxaReadOnly` to look,
   `MunaxaEngineering` to run an approved owner step, `MunaxaAdministrator` only for organization or
   Identity Center administration.
5. Choose "Management console". Check the Region is **Europe (Frankfurt) eu-central-1**.
6. For an owner script, open **CloudShell** from that console session. CloudShell inherits the
   permission set's credentials; no keys are created or copied.
7. Check who you are before any write: `aws sts get-caller-identity` must show
   `assumed-role/AWSReservedSSO_<PermissionSet>_<suffix>/<your user>`, never `root`.

### 3.2 CLI with IAM Identity Center (SSO)

```bash
aws configure sso            # session name: munaxa; start URL: the access portal URL
                             # SSO Region: eu-central-1; scopes: sso:account:access
                             # account 229251310592; role MunaxaReadOnly; profile munaxa-readonly
aws sso login --profile munaxa-readonly
aws sts get-caller-identity --profile munaxa-readonly
```

The resulting `~/.aws/config` holds no secret:

```ini
[sso-session munaxa]
sso_start_url = https://<id>.awsapps.com/start
sso_region = eu-central-1
sso_registration_scopes = sso:account:access

[profile munaxa-readonly]
sso_session = munaxa
sso_account_id = 229251310592
sso_role_name = MunaxaReadOnly
region = eu-central-1

[profile munaxa-engineering]
sso_session = munaxa
sso_account_id = 229251310592
sso_role_name = MunaxaEngineering
region = eu-central-1
```

Credentials are short-lived (the permission set's session duration) and cached by the CLI; `aws sso
logout` ends them. Never run `aws configure` with access keys.

### 3.3 The Claude AWS connector

The connector signs in through Identity Center with **`MunaxaReadOnly`** (owner action O-IAM-6).
Its deny list means the connector can never read a secret value, decrypt, read S3 objects or log
contents, or open a session on a task, even if a script asked it to. Checks that need log
contents (for example the secret-pattern log counts of a session report) run with
`MunaxaEngineering` in CloudShell by the owner, or are dropped from that check, and the report says
which.

## 4. Private administration without a public endpoint

| Need | AWS-native method | State |
| --- | --- | --- |
| Database administration (roles, databases) | The `db-admin` ECS task (one-off, private, no inbound port), started by the session workflow or the runbook | In place |
| Migrations, first-operator bootstrap, Docs provisioning | One-off ECS tasks (`*-migrate`, `identity-bootstrap`, `docs-provision`) | In place |
| Shell on a running container | ECS Exec (Systems Manager Session Manager). **Off** (`enable_execute_command = false` in `modules/service`); `MunaxaReadOnly` denies it | Not needed for Testing. If a real need appears: a reviewed PR sets it for one named service, adds `ssmmessages:*` channel permissions to that task role, enables Exec logging to CloudWatch, and the owner uses `MunaxaEngineering` |
| Shell on an instance | Session Manager | **No EC2 instances exist**; no bastion host is needed or created |
| Network-level access to private subnets | AWS Client VPN | **No requirement** (no private endpoint an operator must reach). Not created; no cost |
| Monitoring and logs | CloudWatch (metrics, alarms, Logs) | In place; contents read with `MunaxaEngineering` |
| Secrets | AWS Secrets Manager; owner custody scripts in CloudShell; Claude never reads a value | In place |

No VPN, bastion, public administrative endpoint or paid service is added.

## 5. The Control operator console (an application, not infrastructure)

The Control portal and its Identity sign-in on the operator host (`operator-test.munaxa.com` in
Testing) are a **Munaxa application** used by Munaxa staff to create deployments and issue product
credentials. They are not AWS administration. Without Cloudflare Access they are protected by:

1. **Network (ALB, AWS-native):** the operator host is forwarded only from `operator_cidrs`
   (listener rules 30 and 31, source-IP conditions); rule 39 answers **403 to every other source**.
   With no ranges, the host is closed entirely. In Testing the ranges come from the GitHub
   environment **secret** `OPERATOR_CIDRS` of `aws-nonprod-session` (comma-separated, at most three,
   never `0.0.0.0/0`; a bare IPv4 address counts as its `/32`), read by the session workflow at `up`
   only and never committed. Not a variable: GitHub prints a variable in clear in the public step
   log (24 Nov 2026), a secret is masked from the start.
2. **DNS:** the record is a CNAME to the ALB, **DNS only (not proxied)**, so the ALB sees the
   operator's own address. It stays in Cloudflare DNS like every other Testing record. The name
   `operator-test.munaxa.com` is kept because the issued ACM certificate already lists it; moving
   to `operator.test.munaxa.com` (covered by `*.test.munaxa.com`) would replace the certificate and
   is optional later.
3. **Application (Munaxa Identity):** Control checks every operator request's Identity token
   (signature, issuer, audience `munaxa-control`, expiry), the operator organisation, an Identity
   session, **`mfa: true`**, the subject allow-list and the route's permission. Without Access,
   Control refuses to start in production unless `OPERATOR_REQUIRE_MFA=true` and the allow-list is
   set (munaxa-control `config/environment.ts`), and Terraform refuses Control without Access unless
   Identity's `identity_security_config.mfa_policy` is `privileged` (listing the Control operator
   role) or `all` (`stack/variables.tf`).
4. **Products** reach Control's product API on `control-api.*` with their service credentials; the
   admin API is refused there (rule 10) and reached by the portal only over Cloud Map.

An operator's address changes: update the secret `OPERATOR_CIDRS` (GitHub → munaxa-platform →
Settings → Environments → `aws-nonprod-session` → Environment secrets) before `up`. `down` never
reads it, so a wrong value cannot stop a shutdown.

## 6. Root: break-glass only

Root is used only for (a) tasks only root can do (account closure, root MFA changes, some billing
and support settings), (b) the bootstrap re-applies listed in §2.2 until F-3 is re-reviewed, and
(c) emergencies when Identity Center is unavailable or every operator is locked out.

1. Root MFA stays enabled; never create root access keys.
2. Keep the root MFA device and the root password in separate safe places; record where in the
   owner's private notes, never in a repository.
3. Before using root, write down why; afterwards, record the time and what was done in the next
   agent report.
4. Sign out of root immediately after the task; continue with a permission set.
5. Recommended (not built, owner decision D-IAM-3): a CloudTrail-based alert on root console
   sign-in to the existing alert address.

## 7. Recovery

| Situation | Recovery |
| --- | --- |
| Operator lost their MFA device | Another administrator, or root (break-glass), opens Identity Center → Users → the user → MFA devices, deletes the lost device; the user registers a new one at next sign-in |
| Operator forgot the password | Identity Center → Users → Reset password (e-mail to the user) |
| Identity Center unavailable or misconfigured | Root break-glass (§6); Identity Center is regional (`eu-central-1`) |
| Permission set too narrow for an approved step | Stop. Do not switch to root to get past it. Report the denied action; a reviewed change to the permission set follows |
| Claude connector misbehaves | Remove its assignment or sign it out; the connector never had write permission |

## 8. Owner verification (O-IAM)

These are AWS changes, owner-executed, each needing the owner's yes. None blocks the image
publication; O-IAM-1 to O-IAM-5 come **before** the first owner step that writes to AWS under
this model (execution pack item 2).

| # | Step | Expected |
| --- | --- | --- |
| O-IAM-1 | Enable Identity Center (organization instance, `eu-central-1`, Identity Center directory) as root | Instance listed; access portal URL shown |
| O-IAM-2 | MFA settings as §2.1 | "Every time they sign in"; register-at-sign-in |
| O-IAM-3 | Create user (`IDENTITY_OPERATOR_EMAIL`), sign in once, register MFA | User status Enabled; one MFA device |
| O-IAM-4 | Create the three permission sets from [`identity-center/`](identity-center/README.md) (management-account versions, not the 29 Oct drafts); assign per D-IAM-1 | Three sets; assignments in `229251310592` provisioned |
| O-IAM-5 | Verify: console sign-in asks for MFA; `aws sso login` works; `get-caller-identity` shows `AWSReservedSSO_MunaxaReadOnly_*`; with ReadOnly, `aws ecs list-clusters` works and `aws secretsmanager get-secret-value --secret-id munaxa-nonprod/identity` is **AccessDenied**; with Engineering, the custody scripts' `status` command works | All as stated; Claude reviews the pasted output (no values) |
| O-IAM-6 | Re-sign-in the Claude AWS connector with `MunaxaReadOnly` | Claude's `get-caller-identity` shows the ReadOnly role, not root |

Until O-IAM-1 to O-IAM-5 are done, the approved 8 Nov development method (root with MFA, root
connector; [ACCESS-POLICY.md](ACCESS-POLICY.md)) remains the only working way in, and each use is
recorded as a break-glass-style exception in the report of that step.
