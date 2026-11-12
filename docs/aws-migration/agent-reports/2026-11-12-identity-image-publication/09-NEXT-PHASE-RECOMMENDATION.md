# 09. Next steps and recommendation

## To finish this authorization (no new authorization needed, owner actions only)

1. ~~Connector sign-in, tag, `image-release` approval~~ **done**. The images are published and verified (04, 05).
2. **[Owner] Decide on the zlib CRITICAL** (CVE-2026-4738 in both images, from `node:22-alpine`).
   - Recommended: a small Identity PR that pins a patched base digest, then a new image tag, before any Testing session.
   - Or accept it for Testing only, explicitly.
3. **[Owner] Grant Read access** on the `@munaxa` packages (02, owner file).
4. Claude re-runs CI on identity#19, work#32 and control#9. The Control image build is the cache-free proof. Claude then marks them ready and squash-merges them.
5. **[Owner]** After step 4, delete `PLATFORM_PACKAGES_TOKEN` from munaxa-identity, munaxa-work and munaxa-control.

Any rebuild before step 4 merges still uses the repository secret. So delete it only after identity#19 is merged.

## Follow-ups needing their own authorization

| # | Item | Why |
| --- | --- | --- |
| F-1 | Same token change in **munaxa-docs** (2 workflows) and **munaxa-school** (5 workflows) | They still give the PAT to every branch (reviewer H1). Only after F-1 can the PAT be revoked |
| F-2 | **[Owner]** Revoke the PAT | It never expires and was exposed to branch workflows (reviewer M3) |
| F-3 | Identity docs: `secrets.md`, `configuration-contract.md`, `repository-creation.md` | They still describe the repository secret (reviewer L3) |
| F-4 | Platform `release.yml`: hold the publish token in an environment with a reviewer | Any branch workflow can request `packages: write` and publish. The per-package Read grant does not cover munaxa-platform itself, the packages' source repository (01) |
| F-5 | Optional: delete the logs of identity run 43286188504 | Base64 copies of the 13 restricted tarballs (2.5.0 report I1) |

## The next Testing phase (each a separate yes)

From 06: R (read-only pre-checks), then C (MFA key bundle, irreversible in effect), then the P-5 tfvars PR, then D (at-rest plan and apply, expected 4 add / 1 change / 3 destroy, the 3 being the skip_destroy task-definition replacements), then E (the session).

Before E there are two repository tasks:
- the throwaway-account MFA and revocation helper (runbook §13);
- the runbook's "stop on any destroy" line, which must allow the declared task-definition replacements.

**Recommendation:** finish steps 2 to 5 above first. If the zlib fix is chosen, the P-5 pin uses the rebuilt digests, not the ones in 04. Then authorize stage R together with the P-5 preparation. Stage C should be authorized only once the custody route for `MFA_ENCRYPTION_KEYS` (owner console or `asm-exec`) is confirmed in stage R.
