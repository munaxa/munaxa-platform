# 06. Remaining blockers

| # | Blocker | Owner of the next step | Evidence |
| --- | --- | --- | --- |
| B-1 | **D-SSL**: every product image fails its scan on 5 HIGH OpenSSL CVEs (`libssl3`/`libcrypto3`/`openssl` 3.5.9-r1). Alpine has no 3.5.10 yet: pkgs.alpinelinux.org shows `edge/main/x86_64/libssl3` **3.5.9-r1** (built 11 Nov) and `v3.22` **3.5.9-r0**, checked 21 Nov ~15:20 UTC. Gate kept fail-closed; nothing suppressed. Blocks image publication and therefore every Testing deployment | Alpine upstream; then Claude (bump PRs) | control#14 image job run 44918620776 (grype exit 2 on the same CVEs) |
| B-2 | control#14 cannot merge while its image job is red on D-SSL (same as control#12). It must merge before Control's images are built | Claude, after B-1 | file 04 |
| B-3 | IAM Identity Center not set up (O-IAM-1 to O-IAM-6). Until then, root (8 Nov method) is the only way in | Owner (AWS change; needs a yes) | OPERATOR-ACCESS.md §8 |
| B-4 | Decision D-IAM-1 (permission-set assignment while workloads are in the management account) | Owner | 01 §4 |
| B-5 | Decision D-OP-1 (Identity MFA policy `privileged` with the two Control operator roles), applied with the Identity pin in item 8 | Owner | 05 item 8 |
| B-6 | `OPERATOR_CIDRS` variable before the Control session (item 9a) | Owner (GitHub setting) | 05 |
| B-7 | Unchanged from the sprint: GitHub Packages read grant (optional), Docs bootstrap, secret bundles, Resend decision, School `SCHOOL_LOCAL_AUTH` yes | Owner | sprint report 05 |

**Not blockers any more:** the Cloudflare Access application, team domain, AUD tag, e-mail
allow-list, session duration and the proxied operator record.

## Next deployment-ready steps

1. Owner: item 2 (Identity Center, O-IAM-1 to 6), then items 3 to 5 under `MunaxaEngineering`.
2. Claude: watch Alpine for OpenSSL 3.5.10; then bump PRs, merge control#14 and the others, report
   the `main` SHAs (session 2 preamble).
3. Owner: publish (item 7), then Apply 1 with the Identity MFA policy (item 8), Apply 2 (item 9),
   `OPERATOR_CIDRS` (9a), Control session (10), Docs credential (11), Docs session (12), down (13).
