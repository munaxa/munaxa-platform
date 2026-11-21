# 03. Identity, Control and Docs: readiness after this sprint

This updates file 04 of `2026-11-21-autonomous-security-and-testing-readiness`. The details there
still apply: the C-1/C-2 contents, the Docs prerequisites table, and the offline plans
(C-1 33/0/0, C-2 0/3/0, C-3 session 19 creates, D-1 42 creates).
Nothing in this file was executed on AWS.

| Product | Done | Remaining blocker | Owner items (file 05) |
| --- | --- | --- | --- |
| **Identity** | Stage E done 21 Nov (probe 28/28; organisation and operator exist). Pinned images run the same code as `main`. The bump PR identity#24 is open | O-4 republication waits for D-SSL. The pinned `9a8c6ebd…`/`5f3bdcce…` carry OpenSSL 3.5.9-r0 and npm tooling HIGHs. Risk while Testing is idle: none | 7, 8 |
| **Control** | Terraform for C-1/C-2/C-3 is on `main`; the offline plans pass; the custody script is on `main`; the bump PR control#13 (also removes the `openssl` CLI) is open | Images: control#13 must be merged after Alpine 3.5.10, then published. The Cloudflare Access team domain and AUD are needed | 2, 3, 7, 8, 9, 10 |
| **Docs** (first customer-facing product) | S3 with the task role; migrations; provisioning; custody script; health checks; rollback; the bump PR docs#182 is open | D-SSL (images; docs#178 and docs#181 checks). Bootstrap (the migrate repository). Bundles. Resend decision. The Control credential | 4, 5, 7, 9, 11, 12 |

## Why Docs is the first product in Testing

Identity is already proven in Testing. Docs is the first product a customer would use. It needs
Identity for sign-in and Control for licensing (`LICENSING_MODE=CONTROL_PLANE`, which fails closed
with 402 without a credential). Control therefore goes to Testing first, but only as a supporting
service behind Cloudflare Access.

## Shortened critical path, compared with the 21 Nov morning plan

1. **Everything that does not need an image moves before 1 Dec:** the Access app, the Control and Docs bundles, the Docs bootstrap and the Resend decision (file 05, session 1). After 3.5.10 the remaining work is publish, two applies, one session, one pin apply and one session.
2. **The O-4 Identity pin rides with C-1** in one plan (Apply 1), and **D-1 rides with C-2** (Apply 2). This is two apply cycles instead of four.
3. **The bump PRs are already open and pinned.** On the day Alpine ships, the change is a CI re-run, not new work.

## Estimated time after Alpine ships (estimate, not measured)

| Step | Approximate time |
| --- | --- |
| CI and merges | about 1 h |
| Publish | about 30 min |
| Apply 1 and Apply 2 | about 1 h each, including the PR CI |
| Control session | about 1 h |
| Pin apply | about 30 min |
| Docs session | about 1.5 h |

The total is one long working day of owner availability, or two half-days.
