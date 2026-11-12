# 04. Identity image publication (Phase C)

## Status: NOT STARTED (Phase B is blocked, see 03)

| Item | Value |
| --- | --- |
| Source commit | `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` (identity#18 squash merge, on main) |
| Tag to create | `image/5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`, **not created** |
| Workflow | `publish-images-ecr.yml` at that commit, **not run** |
| Images | `munaxa-identity/api` (target `runtime`) and `munaxa-identity/migrate` (target `migrate`), **not built, not pushed** |
| Expected tags | `5a5994f`, `sha-5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` |
| Digests | none yet |

The procedure once Phase B passes:
1. Create the tag on `5a5994f`. The tag ruleset allows only admins.
2. The run starts. Job `source` checks the tag and that the commit is on main.
3. The `publish` matrix waits for `image-release` approval by the owner.
4. Two jobs build and push.
5. Record the run link, start and end times, and both digests from the step summary.
6. If one job fails, do **not** re-run or re-tag (owner rule). Report, and ask.

This section is filled in when the run happens. A later commit to this folder updates it.
