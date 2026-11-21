# 03. Security and access

## 1. Controls before and after, for the Control operator console

| Control | Before (Cloudflare Access design) | After (AWS-native default) |
| --- | --- | --- |
| Who can reach the host | Anyone reaching Cloudflare; Access sign-in (e-mail allow-list, MFA rule) at Cloudflare's edge; origin open to any source once `operator_access` set | Only `OPERATOR_CIDRS` (at most three ranges, never the whole internet) at the ALB; rule 39 answers 403 to everyone else; host closed when unset |
| Second factor | Cloudflare Access MFA rule (Identity issued no `mfa` claim) | Identity TOTP; Control refuses any operator token without `mfa: true` |
| Named people | Access e-mail allow-list + `OPERATOR_SUBJECT_ALLOWLIST` | `OPERATOR_SUBJECT_ALLOWLIST` (now mandatory in production without Access) |
| Organisation, session, permission checks | Yes | Yes (unchanged) |
| Startup fail-closed | API refused production without Access | API refuses production without Access **unless** MFA required and allow-list set; Terraform refuses Control without Access unless Identity's MFA policy is on |
| Admin API exposure | 403 on `control-api.*`, Cloud Map only | Unchanged |
| Rate limits and failure counting (ADR-0007) | Yes | Unchanged |

Residual risk, stated plainly: the portal's static pages are reachable from the operator's own
address without a session (they redirect to sign-in; data comes only from the API, which checks
every request). Previously Access also hid them from Cloudflare-authenticated-but-unknown users.
The ALB source restriction closes them to everyone else.

## 2. AWS infrastructure access

- People: IAM Identity Center, one named user each, MFA at every sign-in, least-privilege permission
  sets, short sessions (1/4/8 h), no IAM users, no access keys (OPERATOR-ACCESS.md §2, §3).
- The Claude connector: `MunaxaReadOnly`, whose explicit deny blocks secret values, decryption, S3
  objects, log contents, ECS Exec and SSM sessions.
- Root: break-glass only, with a written reason and a report entry each time (§6 there).
- Machines: GitHub OIDC only; environments `aws-nonprod`, `aws-nonprod-session`, `image-release`;
  plan/apply separation and declared-intent checks unchanged.
- **Gap (honest):** the 29 Oct permission sets were designed for member accounts. While the
  workloads live in the management account, `MunaxaEngineering` there also reaches Production-tagged
  resources in the same account (decision D-IAM-1; ACCESS-POLICY F-3/F-6 before any Production
  deployment).
- **Not built:** root sign-in alerting (D-IAM-3).

## 3. Secrets and credentials

- No Cloudflare Access credential, token, team domain or AUD is required anywhere in the Testing
  deployment. `operator_access` values were never secrets and are now unused.
- The operator's address is not a secret but is personal: it lives only in the GitHub environment
  variable `OPERATOR_CIDRS`, masked in workflow logs, never in the public repository.
- AWS Secrets Manager custody is unchanged; scripts print version ids only.
- This task read, printed, logged or committed **no secret value** and made **no AWS call**.

## 4. Gates kept (brief §3E)

OIDC-only AWS authentication; least-privilege workflow `permissions`; environment protection;
HIGH/CRITICAL image scans fail closed (D-SSL still failing, not suppressed); immutable ECR tags
and digest pins; deployment approvals; Terraform plan/apply separation and the declaration check;
the session plan check (only switch resources). None was weakened.
