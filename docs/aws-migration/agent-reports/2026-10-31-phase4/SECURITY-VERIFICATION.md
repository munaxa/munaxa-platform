# Security verification: phase 4 (G2), 31 Oct 2026

Labels: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified, **[O]** owner
action required. Evidence: outputs pasted from Tamer's root CloudShell session; full commands in
[G2-EXECUTION-REPORT.md](G2-EXECUTION-REPORT.md).

## 1. IAM roles and trust policies [V]

| Role (path `/munaxa-shared/bootstrap/`) | Principal | Conditions |
| --- | --- | --- |
| `munaxa-shared-ci-nonprod` | `oidc-provider/token.actions.githubusercontent.com` | StringEquals: `aud = sts.amazonaws.com`; `ref = refs/heads/main`; `sub` ∈ {`repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod`, `…:environment:aws-nonprod-session`} |
| `munaxa-shared-ci-prod` | same provider | StringEquals: `aud`, `ref = refs/heads/main`, `sub = …:environment:aws-prod` |
| `munaxa-shared-deployer-nonprod` | `role/munaxa-shared/bootstrap/munaxa-shared-ci-nonprod` | `sts:SourceIdentity = github-actions` |
| `munaxa-shared-deployer-prod` | `…/munaxa-shared-ci-prod` | `sts:SourceIdentity = github-actions` |
| `munaxa-identity-image-publisher` | GitHub OIDC | `aud`; `sub = repo:munaxa@311481412/munaxa-identity@1354378376:environment:image-release`; `ref` like `refs/tags/image/*` |
| `munaxa-control-image-publisher` | GitHub OIDC | same form, `munaxa-control@1434295290` |
| `munaxa-work-image-publisher` | GitHub OIDC | same form, `munaxa-work@1318345640` |
| `munaxa-school-image-publisher` | GitHub OIDC | same form, `munaxa-school@1318345275` |

No wildcard subject, no extra principal; nothing was widened. The subjects match the forms GitHub
issued in phase 3's probe (P11).

## 2. OIDC

- The GitHub OIDC provider existed before G2 (Docs bootstrap) and was only **read** by the
  platform bootstrap (data source); no provider change appears in either plan. [V]
- Until the GitHub environments exist, no workflow can obtain a token with a matching
  `environment:` subject, so none of the eight roles is assumable yet. [V by trust; environments O]

## 3. State bucket [V]

Versioning `Enabled`; all four public-access blocks `true`; SSE-KMS with the dedicated key
`679d1b6b-cb6a-491b-a585-cb630b3fbce5` (the alias target), bucket key on, SSE-C blocked;
`BucketOwnerEnforced`; bucket policy `TlsOnly` (Deny when `aws:SecureTransport = false`); key rotation
on (365 days). State contains role ARNs and policy JSON only; no secret resource exists in bootstrap.
Local state copies were deleted only after the S3 copy planned "No changes".

## 4. Deployer boundary and policy simulations

- Both deployers carry all ten deny statements (`ThisRegionOnly`, `NeverMunaxaDocsOrBootstrap`,
  `NeverMunaxaDocsProductionByTag`, `NeverTagAsMunaxaDocs`, `NeverAnotherProjectByTag`,
  `NeverTagForAnotherProject`, `NeverTheOtherEnvironmentByTag`, `NeverCreateForTheOtherEnvironment`,
  `NeverTheOtherEnvironmentByName`, `NoSecretValuesNoUsersNoKeys`). [V]
- **Finding G2-1 (new, fixed):** `NeverAnotherProjectByTag`/`NeverTagForAnotherProject` (platform#31)
  denied every request **without** a Project tag, because `StringNotEquals` is true on a missing
  key. Severity: Medium (availability; fail-closed, no exposure). Found by the runbook simulation,
  confirmed by three diagnostic simulations, fixed by platform#33 (`Null = false` guard + test),
  re-applied 13:42:03 UTC. [V]
- After the fix (all with `aws:RequestedRegion=eu-central-1`): Docs tag explicitDeny ×3; another
  project explicitDeny; munaxa/nonprod **allowed**; prod tag explicitDeny; `DescribeVpcs`
  **allowed**; tagging for another project explicitDeny; prod deployer on a nonprod tag
  explicitDeny. [V]
- **Finding G2-2 (runbook, docs):** the runbook's simulations omit `aws:RequestedRegion`, so
  `ThisRegionOnly` denies in the simulator regardless. Future runbooks must pass it. [V]

## 5. Untagged-resource residual (explicit) — **G3 prerequisite**

The tag-based denies cannot see a resource that has **no** `Project` tag. After the platform#33 fix
this is by design: a missing tag matches neither Project statement. So the deployer's `ec2:*`,
`elasticloadbalancing:*`, `rds:*` and similar on `*` can reach any untagged resource in the account
that no name-based deny covers. The simulations above say nothing about such resources. **Before G3**
[O]: the read-only Docs VPC tag inventory (phase 3 SECURITY §3) and TD-14 (the owner confirms
non-Munaxa resources carry a `Project` tag, or approves an allow-list condition). Until then the
deployer is not usable anyway (no GitHub environments or variables).

## 6. Old Docs Production protection [V]

Neither plan touched a Docs resource; both plans were purely the inventory (49 creates) and the two
deployer policies. The Docs budgets are unchanged (`munaxa-account-monthly`,
`munaxa-docs-eu-prod-monthly`). The Docs state is in its own bucket and was not read. The deployers
deny `role/munaxa-docs/*`, `secret:munaxa-docs*`, `db:munaxa-docs*`, `cluster/munaxa-docs*`,
`s3:::munaxa-docs*` by name and `Project = MunaxaDocs` by tag (simulation explicitDeny). The
CloudShell directory `~/bootstrap` (790 MB, apparently Docs' bootstrap working copy) was left as is.

## 7. CanteenHub

**Not accessed, inspected, searched for, identified or modified.** Every AWS listing in this phase
was filtered to Munaxa names or paths, except the runbook's `describe-budgets` names list, which
returned only the two Docs budgets before G2. The CloudTrail check was deliberately not run, so as
not to list other workloads' activity.

## 8. Credentials

Root in CloudShell only. No IAM user, access key, login profile, Identity Center or permission-set
change. No credential was copied to GitHub, chat, logs, files or these reports. The AWS connector was
never used (signed out).

## 9. Open security items

| Id | Item | Severity | Gate |
| --- | --- | --- | --- |
| B2 / TD-14 | Untagged-resource residual (§5) | Medium | **G3** |
| S-ROOT | Root is the only operator identity (29 Oct decision) | High (operational) | Production hardening |
| G2-3 | GitHub environments not yet protected/created; if a variable were set first, a workflow could create an unprotected environment | Low | Before any workflow run [O] |
| C8 | munaxa-control `main` unprotected | Low | TD-9 |
