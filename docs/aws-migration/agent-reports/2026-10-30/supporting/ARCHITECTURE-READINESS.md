# Architecture readiness: Munaxa AWS Testing

30 Oct 2026, Agent 7. Code at main: platform `02477a9`, control `fc59515`, identity `9aa4dc1`,
docs `406eaee`, work `19c7d0b`, school `2c07be4`.

## Verdict per component

| Component | Code ready | Infra in shared stack | Blocking items |
| --------- | ---------- | --------------------- | -------------- |
| Shared platform | Yes (platform#26 `c4a1ad0`), validated offline; no real plan yet (needs G2) | – | none in code |
| Identity | Yes (identity#2, #3 merged) | Yes | none |
| Control | Yes (control#6 merged) | Yes | none |
| Work | Yes | Yes | none (T13 optional) |
| School | Yes (school#21, #22, #23 merged) | Yes (bucket and task role) | none |
| Docs | Yes, image must be rebuilt (G5); docs#167 open | Yes (`stack/docs.tf`) | T34 (pin actions) |

## Shape (verified in Terraform)

- One VPC per environment (`10.130.0.0/16` nonprod). Public subnets in 2 AZs for the ALB and tasks
  with public IPv4 and no NAT. Isolated DB subnets in 3 AZs. S3 gateway endpoint admits only the ECR
  layer bucket today.
- One internet-facing ALB, TLS 1.3 policy, host rules. It exists only while `edge_enabled`.
- ECS Fargate, one task per service. Every role carries the workload boundary. Execution roles read
  only their own bundle. Only control-api has a task role (`kms:Sign`).
- One RDS PostgreSQL 16 `db.t4g.micro`, private, encrypted, `force_ssl`. One database plus owner
  and runtime roles per product (`db-bootstrap.sh`). Runtime roles are `NOBYPASSRLS`.
- KMS: data key (RDS, secrets, logs), licence key (ECC P-256, sign only, control-api only), state key.
- Identity rate limits are in a Valkey sidecar on 127.0.0.1 with no persistence.

## Integration contract (from Agents 2, 3, 5)

- Identity issuer `https://id.test.munaxa.com`, ES256, public keys out of band (no JWKS, no OIDC).
- Work and Control verify Identity tokens; School and Docs keep their own sign-in in Testing.
- Products reach Control at `https://control-api.test.munaxa.com` with a per-deployment `mxc_` token.
- Operator host `operator-test.munaxa.com`: Cloudflare Access, then Identity session, org, allow-list.

## Known design gaps, accepted for Testing

- One Identity token is valid for both Work and Control (R-06, C5, I2).
- Identity issues no MFA claim; the operator's second factor is Cloudflare Access (I3, C6).
- `*.test` hosts are DNS-only, so the ALB is directly exposed with no WAF.
- No Identity to Docs SSO (needs OIDC in Identity).
