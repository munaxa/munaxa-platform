# 03. Control and licensing readiness

**Status: CODE COMPLETE — NOT DEPLOYED. BLOCKED** on Cloudflare Access (owner), Identity Stage E, and the two-step bring-up.

## 1. Images

Control images (api, migrate, portal) are published at `a24c568` [V: ECR]. Main is `1f58c90`; the difference is comments and documentation only [V: `git diff a24c568 1f58c90` touches 4 files: one code comment in `environment.ts` ("proposed" to "accepted"), `.env.example` and two operations docs]. No republish is needed for Testing.

## 2. How licensing works for Docs

1. Docs runs with `LICENSING_MODE=CONTROL_PLANE`, `CONTROL_PLANE_URL` = the Control API host, and `CONTROL_PLANE_TOKEN` = a Control deployment credential.
2. Docs fetches a signed licence snapshot (KMS asymmetric key, ES256/ECDSA P-256) and verifies it with the public key and kid that Terraform passes in.
3. With no valid snapshot and a placeholder token, Docs licensing fails closed: guarded routes answer 402. This is the intended behaviour and must not be bypassed [V: docs `src/licensing/*`].
4. The credential is minted in the Control operator portal: customer, subscription, deployment (tenantRef = the Docs tenant id from the catalogue), credential. It is shown once.

## 3. Bring-up sequence (README G7, step 0)

| Step | Change | Needs |
| --- | --- | --- |
| C-1 | Config PR: Control image digests, `operator_access` (Cloudflare Access team domain and AUD), desired 0. Apply | Cloudflare Access application for `operator-test.munaxa.com` (owner, Cloudflare dashboard) |
| C-2 | Read the KMS licence public key (created by C-1), then config PR: public key, kid, operator org and subject allowlist. Apply | Identity operator subject (exists after Stage E) |
| C-3 | Session: control db-admin, control-migrate, control-api, portal | gate pass |
| C-4 | Owner signs in to the portal (Identity operator, Cloudflare Access) and mints the Docs credential | Docs tenant id (from the Docs secret fill) |

C-2 can carry the Docs image pins (D-1 in file 04) in the same apply, so the two products share one plan/apply cycle.

## 4. Open findings

- **CT-01:** the portal shows the credential once; there is no recovery path except revoke and mint again. Acceptable for Testing.
- **CT-02:** the subject allowlist is a Terraform variable, so adding an operator needs an apply. Acceptable for Testing; review for production.

Neither blocks Testing.
