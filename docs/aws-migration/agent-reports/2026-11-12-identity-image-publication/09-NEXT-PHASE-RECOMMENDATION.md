# 09. Next steps and recommendation

## To finish this authorization (no new authorization needed, owner actions only)

1. **[Owner] Sign in to the AWS MCP connector again.** Claude then runs the read-only check (03), creates `image/5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`, and the run starts.
2. **[Owner] Approve `image-release`** when GitHub asks. Claude then verifies the digests and provenance (05) and updates 04 and 05 in this folder.
3. **[Owner] Grant Read access** on the `@munaxa` packages (02, owner file).
4. Claude re-runs CI on identity#19, work#32 and control#9. The Control image build is the cache-free proof. Claude then marks them ready and squash-merges them.
5. **[Owner]** After step 4 and **after** step 2's publication, delete `PLATFORM_PACKAGES_TOKEN` from munaxa-identity, munaxa-work and munaxa-control.

The order of steps 2 and 5 matters. The `5a5994f` workflow still reads the repository secret.

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

**Recommendation:** finish steps 1 to 5 above first. Then authorize stage R together with the P-5 preparation. Stage C should be authorized only once the custody route for `MFA_ENCRYPTION_KEYS` (owner console or `asm-exec`) is confirmed in stage R.
