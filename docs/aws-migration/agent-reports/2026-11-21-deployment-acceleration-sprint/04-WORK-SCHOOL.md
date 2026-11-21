# 04. Work and School

## Work

### W-3 custody script: DONE in the repository

On `main` with this PR:
- `scripts/aws/owner/work-testing-secrets.sh`
- `scripts/aws/owner/test/test_work_testing_secrets.py`
- the `aws-terraform.yml` CI step
- the `infra/aws/README.md` G4 entry

The script follows the Control and Docs custody pattern:

| Mode | What it does |
| --- | --- |
| `bundles` | 1. Fills `munaxa-nonprod/work-migrate` (`DATABASE_MIGRATION_URL`, `work_owner`).<br>2. Then fills `munaxa-nonprod/work-api` with `DATABASE_URL` (`work_app`), a generated `PII_MATCH_SECRET` (48 random bytes, base64url) and `CONTROL_PLANE_TOKEN` (hidden input, or a marked placeholder).<br>It writes one version per bundle, reads it back, is resumable and allows one run at a time. It prints version ids only. |
| `replace-key CONTROL_PLANE_TOKEN` | Writes one new work-api version in which only that key changes. `PII_MATCH_SECRET` is never replaced, because rotating it invalidates the stored duplicate-match digests. |
| `status` | Metadata only. |

Checks run on 21 Nov:
- shellcheck: clean.
- Offline tests: 30/30 (fake AWS CLI).
- The Docs suite (23/23) and the Control suite (8/8) still pass alongside it.

### Work path to Testing (after Docs; not executed)

1. Merge work#35, the D-SSL bump, after Alpine ships 3.5.10.
2. Publish the Work images: `image/<sha>` tag and `image-release` approval.
3. The owner runs `work-testing-secrets.sh bundles` (with the `mxc_` credential from a Control session, or the placeholder, followed later by `replace-key`).
4. Work config PR: digests, version ids for the keys `work-migrate` and `work-api`, `db_bootstrap_products` with `"work"` added, and the declaration. Then plan and apply.
5. Work session with W-4 `bootstrap-tenant` for organisation `munaxa-group` (owner approval).

## School

SC-07_SCHOOL_PLACEHOLDER

### School D-SSL bump

The same `3.5.10-r0` patch as the other products is ready. It is held back from the SC-07 branch
so that it cannot block SC-07's merge: its build fails until Alpine ships. It opens as its own PR
once the SC-07 PR has merged and the branch is free.

### Render

Nothing on Render was changed. `render.yaml` and the connected services are untouched, as
instructed. SC-06 (what the staging blueprint should claim) remains an owner decision.
