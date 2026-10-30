# Testing acceptance: Munaxa AWS Testing

30 Oct 2026, Agent 7. Run in one session after `DEPLOYMENT-SEQUENCE.md` step 15. Test data only.
Record pass or fail with evidence (log line, HTTP status, screenshot).

## Platform
- [ ] Every target group is healthy. Every service reports `/health/ready` 200.
- [ ] `http://` redirects 301 to `https://`. An unknown host returns 404.
- [ ] Each task's public IP refuses direct connections on its port (only the ALB security group is admitted).
- [ ] RDS is not reachable from the internet. `sslmode=disable` is refused (`force_ssl`).
- [ ] Session down removes the ALB and services and stops RDS. The cost line drops the next day.

## Identity
- [ ] Sign-in at `id.test`, `work.test/api/auth/login` and `operator-test/api/auth/login` sets `__Host-mx_session`.
- [ ] Eleven failed logins from one IP give 429 for that IP only. A second IP still signs in (proves `TRUST_PROXY_HOPS`).
- [ ] A cross-site POST from an origin outside `CSRF_TRUSTED_ORIGINS` is refused.

## Control
- [ ] `operator-test` without Access gives the Cloudflare login. A direct ALB request with that Host gives 401.
- [ ] A user outside the allow-list, or from another org, gets 401 even with Access.
- [ ] `control-api.test/api/v1/admin/...` gives 403 at the ALB. A mixed-case path gives 401 from the API (C4).
- [ ] Issue a licence and download it, and the revocation list (control#6). The signature verifies with the published public key.
- [ ] CloudTrail shows `kms:Sign` only from the control-api task role.

## Work
- [ ] A signed-in user with `work:*` reaches the admin. Without grants, the API answers 403.
- [ ] Tenant A cannot read tenant B's records (RLS) through the API.
- [ ] An entitlement change in Control shows in Work within the cache window. Revoking the `mxc_` credential stops Work's licence calls.

## School
- [ ] Password login works. JWT access and refresh secrets differ.
- [ ] Upload a PDF via a presigned URL, then confirm. The object is under `tenants/<id>/`. A file over quota is refused.
- [ ] Confirming another tenant's key is refused (`assertKeyInTenant`).
- [ ] Licensing comes from Control. `DATABASE` mode is refused at boot.

## Docs
- [ ] Sign in with Docs' own auth. Upload a file and get an AV scan verdict.
- [ ] Entitlement lookup to Control succeeds over TLS with hostname verification. The usage report is sent.

## Exit criteria
All boxes pass. There are no Critical or High findings open in `SECURITY-REVIEW.md`. The cost after
the first week is in line with `COST-ESTIMATE.md`.
