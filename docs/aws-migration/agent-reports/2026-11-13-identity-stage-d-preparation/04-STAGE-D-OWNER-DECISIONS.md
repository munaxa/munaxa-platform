# 04. Stage D owner decisions

Three separate yes/no decisions. Each authorizes only what it says.

## M. Merge PR #121

- **Authorizes:** squash-merging https://github.com/munaxa/munaxa-platform/pull/121 (head `30de485`, two nonprod configuration files) into `main`.
- **Does not authorize:** any plan, apply, deployment, session, migration, secret change or AWS write. Nothing applies on a merge.
- **Effect until the apply:** the scheduled `down` keeps failing at its plan step (S-1, F12); the database is still stopped by its own job and the backstop.

## P. Run the real plan (plan only)

- **Authorizes:** one dispatch of `AWS Terraform` on `main` with `environment=nonprod`, `action=plan`, and approving its `aws-nonprod` environment gate. Claude may dispatch it once M is done; the gate approval is yours.
- **Does not authorize:** `action=apply`, saving a plan for an apply, or anything else.
- **Claude then reports:** the plan summary (addresses and actions only), the changed attribute names, and the intent comparison against the six declared changes. Any difference stops stage D.

## A. Apply the reviewed plan

Asked only after P's plan matches exactly.

- **Authorizes:** one dispatch with `action=apply` on the same `main` commit. The plan job then runs `--enforce` and the apply job applies only that saved plan (SHA-256 checked, plan at most 4 h old), after your second environment approval.
- **Applies:** the four Identity task-definition revisions, the docs-migrate secret container (no value) and the docs_db_admin policy update.
- **Does not authorize:** starting Testing (`session up`), running migrations, db-admin, bootstrap, enabling MFA policy, DNS or Cloudflare changes, or anything in prod. The first Identity session is a later, separate decision.

## Not needed now

- No secret change; stage C is done.
- No IAM, network, budget or schedule change.
