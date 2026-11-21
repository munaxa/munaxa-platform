# 14. Risks, dependencies, rollback

| Risk | Likelihood / impact | Mitigation | Rollback |
| --- | --- | --- | --- |
| Rotation still failing after the DB starts | low / medium | check at about 00:30 UTC 21 Nov; plan in file 03 §5 | none needed; AWSCURRENT stays valid |
| DB runs about 24 hours after the 21:07 auto-start | certain / about US$0.4 | backstop 21:00 UTC 21 Nov stops it | n/a |
| C-2 merged before Stage E | medium / Stage E blocked by the guard | ordering rule 1 | revert, or update the manifest |
| Control session on vulnerable images | avoided if A-5C first | ordering rule 4 | re-pin and apply |
| `pnpm audit` blocks unrelated PRs in identity, work, school | certain / CI noise | one-line override per repository | n/a |
| Mocked plan differs from the live plan (task definitions in-place vs replace; computed ARNs) | certain / low | the live plan is compared with the declaration before every apply | the apply is refused if the plan differs |
| Two script runs at once | low | lock (PR #143) | `status`, then resume |
| Resend placeholder | certain if chosen / mail does not send | A-6 decision; failures are retried, then dead-lettered | `replace-key MAIL_RESEND_API_KEY` |
| Credential shown once (CT-01) | low | revoke and mint again | revoke |
| Session left running | low / cost | hard stop, R, backstop, alarms | `down` |
| Account budget alert noise | certain | D-N1 | n/a |
| Docs base digest goes stale | medium over months | refresh PRs like control#10 | n/a |

## What was not done

- No AWS write of any kind: no Terraform apply, destroy or import, no live plan, no state lock.
- No RDS start or stop. No ECS service or task. No `up` or `down`. No Stage E.
- No secret created, read, rotated or changed. No KMS key. No Cloudflare, Resend or DNS change.
- No image published. No tag pushed. No workflow dispatched. No PR merged.
- No percentage of completion is given.
