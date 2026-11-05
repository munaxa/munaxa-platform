# DNS and G6 readiness

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead of this thread.
- **Scope:** read-only, from code and docs only. **Cloudflare, DNS records, certificates and production domains were not accessed** (no Cloudflare API, no dashboard, no DNS lookup of live records). Every DNS step below is an owner action at gate G6.
- **Sources:** `infra/aws/stack/edge.tf`, `outputs.tf`, `envs/nonprod.tfvars`, `infra/aws/cloudflare-access.md`, `infra/aws/README.md` G3, G6 and G7, `.github/workflows/aws-session.yml`, all at `0c58174` [V-repo].

## 1. Hostnames and certificate (from `nonprod.tfvars`)

| Host | Serves | Cloudflare record | When |
| --- | --- | --- | --- |
| `id.test.munaxa.com` | Identity | CNAME to the ALB, **DNS only** | First session with Identity |
| `control-api.test.munaxa.com` | Control API (admin API refused at the ALB) | CNAME to the ALB, DNS only | First session with Control |
| `operator-test.munaxa.com` | Control portal and Identity `/api/auth/*` | CNAME to the ALB, **proxied**, behind the Access application | First session with Control, after the Access app exists |
| `work.test.munaxa.com` | Work | CNAME to the ALB, DNS only | Work session |
| `school.test.munaxa.com`, `docs.test.munaxa.com` | School, Docs | CNAME to the ALB, DNS only | Later |

ACM certificate (G3 address 1): `*.test.munaxa.com` with SAN `operator-test.munaxa.com`, DNS validation. The wildcard covers every `*.test` host; the SAN covers the first-level operator host, so Cloudflare can connect to the ALB with **Full (strict)** TLS. The operator host is first-level because Cloudflare's free Universal SSL covers `munaxa.com` and one level below; a proxied `*.test` name would need Advanced Certificate Manager (paid) [V-repo `cloudflare-access.md`].

## 2. Records and dependencies

| # | Record | Value from | Needed before | Proxy | Notes |
| --- | --- | --- | --- | --- | --- |
| D-1 | ACM validation CNAME for `*.test.munaxa.com` (name `_<token>.test.munaxa.com`) | `certificate_validation_records` output after G3 | **The first `up`** (the session's `aws_acm_certificate_validation` waits for ISSUED and the HTTPS listener uses it, `edge.tf` 81 to 85, 111) and within 72 h of G3 | **DNS only** | Kept permanently: ACM renews through it |
| D-2 | ACM validation CNAME for `operator-test.munaxa.com` (name `_<token>.operator-test.munaxa.com`) | same output | same | **DNS only** | Kept permanently |
| D-3 | `id.test`, `control-api.test`, `work.test` CNAMEs | `alb_dns_name` output after `up` | Smoke tests S-1, S-2, S-7 | DNS only | See finding DNS-H1: the value changes every session |
| D-4 | `operator-test` CNAME | `alb_dns_name` | Smoke tests S-4, S-5 | **Proxied** | Needs the Access application (BL-7) and a configuration rule setting Full (strict) for this host only |

**Validation window [E, from AWS ACM behaviour as documented in the README]:** ACM waits 72 hours for DNS validation of a new request; after that the request fails (validation timed out) and cannot be revived. Recovery is a new certificate: an `-replace` of `aws_acm_certificate.main` (create before destroy), which is a **separately approved** plan and apply outside the 64. So the owner should add D-1 and D-2 on the same day as G3.

**Certificate authority authorisation [U]:** if `munaxa.com` has CAA records, they must permit Amazon (`amazon.com`); not checked, because live DNS was out of scope. If ACM reports a CAA error, the owner adds the CAA record in Cloudflare.

## 3. What can be prepared without touching live DNS

- The record **names and types** are fixed by the certificate domains and the hostnames above. The validation **values** (`_<token>` and `<token>.acm-validations.aws.`) exist only after G3 creates the certificate, so they cannot be prepared earlier.
- The Cloudflare Access application can be **designed** now (`cloudflare-access.md`: self-hosted, domain `operator-test.munaxa.com`, Allow policy listing staff emails, Require MFA, session 8 h or less). Creating it is an owner action in Cloudflare and was not done.
- The owner can read the outputs in CloudShell as root, or from the apply job (the public log prints no output values, platform #37):
  `terraform output -json certificate_validation_records` and, during a session, `terraform output -raw alb_dns_name`.

## 4. Findings

| # | Severity | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| **DNS-H1** | High (session operations; not a G3 blocker) | **The ALB's DNS name changes every session.** Testing creates the ALB at `up` and deletes it at `down` (`edge_enabled`, `edge.tf` 67 to 79). An ALB DNS name contains an identifier AWS assigns when the load balancer is created [E], so a recreated ALB gets a new name. README G7 step 2 says "first session only" and G6 says "On the first session", which would leave every CNAME pointing at a deleted name from the second session on | [V-repo] README G6, G7 step 2; `aws-session.yml` prints no outputs | Correct the runbook (docs-only, next PR): **update the CNAMEs after every `up`** from `alb_dns_name`, or decide a stable entry point later (a separate design change). Confirm on the second session by comparing the two names. A dangling CNAME to a deleted ELB name is not known to be claimable by others (the identifier is AWS-assigned) [E] |
| DNS-M1 | Medium | The validation records must be added within 72 h of G3 and before the first `up`; missing them makes the first `up` fail at `aws_acm_certificate_validation` (the provider waits up to 75 minutes, but the session job times out at 50 minutes, so the job fails first and may leave the ALB running until the next `down`) and, after 72 h, needs a new certificate | `edge.tf` 81 to 85 | Add D-1 and D-2 on G3 day; confirm ISSUED in the ACM console |
| DNS-M2 | Medium | `alb_dns_name` and `certificate_validation_records` are not printed by the workflows | `aws-terraform.yml` apply step (stdout suppressed), `aws-session.yml` line 235 | Owner reads them in CloudShell or the console (ACM, EC2 Load Balancers) |
| DNS-L1 | Low | CAA unknown | §2 | Owner check |

## 5. Recommended order (G3 → G6 → first session)

1. **G3 apply** approved and completed (64 creates); `down` dispatched at once (`04` B-3).
2. **Same day:** owner reads `certificate_validation_records`; adds D-1 and D-2 in Cloudflare as **DNS only** CNAMEs; waits for ACM status **Issued** (normally minutes). Deadline: 72 h after the G3 apply.
3. Backstop apply (13 creates), separately approved; verify its first 21:00 UTC run.
4. Cloudflare Access application for `operator-test.munaxa.com`; record the team domain and AUD tag (public); a configuration rule for Full (strict) on that host only.
5. Images, secrets, Config A and B applies (services off) as in `2026-11-05-testing-readiness/03` §7.
6. **First `up`.** Read `alb_dns_name`. Add (or update) D-3 CNAMEs, DNS only, and D-4, proxied.
7. Smoke tests S-1 to S-9; `down`.
8. **Every later session:** after `up`, update all CNAMEs to the new `alb_dns_name` (DNS-H1) before testing.

No step above was performed. Production hostnames are out of scope.
