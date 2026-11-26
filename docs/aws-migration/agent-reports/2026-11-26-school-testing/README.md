# Munaxa School on AWS Testing, like Docs and Work (26 Nov 2026)

Owner request (26 Nov 21:15 UTC): School should match Work and Docs on Testing: AWS hosting, sign-in
through Munaxa Identity, a Control licence, the same security bar. Owner decision (card, 21:30 UTC),
"Yes, and all School Testing steps": School Testing images may use the Testing-only OpenSSL
exception D-SSL-2026-11 (same five findings, expiry 2026-12-01T00:00:00Z, never production); Claude
generates the School secrets in AWS (never shown), pins and applies School on Testing (the owner
approves the GitHub gate), then a Testing session.

| File | What |
| --- | --- |
| [01-SCHOOL-PIN.md](01-SCHOOL-PIN.md) | Audit, exception, images, secrets, provisioning task, the pin and its 41 declared changes, what the session does |
| [supporting/school-pin-mocked-changes.txt](supporting/school-pin-mocked-changes.txt) | The declared address set, equal to a mocked plan diff (no AWS call) |

Status: repository work merged up to the pin PR; apply and session follow (status line in the index).
