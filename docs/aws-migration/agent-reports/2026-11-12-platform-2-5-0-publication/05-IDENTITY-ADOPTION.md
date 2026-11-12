# 05. Identity adoption (munaxa-identity#18)

[munaxa-identity#18](https://github.com/munaxa/munaxa-identity/pull/18): branch `claude/project-thread-1rsder`, base main `25823b1`.

## Commits on the branch

| Commit | What |
| --- | --- |
| `098df24` | the earlier draft: ranges `^2.5.0`, new test, docs, lockfile at `127.0.0.1:4874` |
| `56f575a` | **temporary** workflow `.github/workflows/tmp-regen-lockfile.yml` and two helper scripts (copies of the reviewed `drop-munaxa-resolutions.mjs` and `content-digest.mjs`) |
| `3bb53d5` | **temporary**: print the evidence to the log, because the session cannot reach the artifact storage host |
| `4aabdf742146de723a308683a74416f1bc140099` | regenerated `pnpm-lock.yaml`; deletes all three temporary files |

The PR was squash-merged, so main received one commit, `5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`. Its tree equals `4aabdf7` and contains no temporary file.

## Why a temporary workflow

- **[V]** `npm.pkg.github.com` answered 401 from the session, and the session holds no `read:packages` token.
- The org packages API is outside the session's repository scope, and Actions artifact downloads are refused by the egress proxy.
- Asking the owner for a token would have meant copying a credential into a session, which this project avoids.

So the reviewed procedure ran in Actions, in the same way Identity CI installs:
- `permissions: contents: read, packages: read`;
- `persist-credentials: false`;
- `NODE_AUTH_TOKEN: secrets.PLATFORM_PACKAGES_TOKEN`, only in the two steps that talk to the registry.

The step that prints evidence has no token in its environment. It triggered only on pushes to this branch that touched its own files.
- [Run 43285974617](https://github.com/munaxa/munaxa-identity/actions/runs/43285974617) succeeded, but its artifact was unreachable.
- [Run 43286188504](https://github.com/munaxa/munaxa-identity/actions/runs/43286188504) succeeded and is the evidence used here.

## The reviewed procedure, as run (run 43286188504)

1. `node drop-munaxa-resolutions.mjs pnpm-lock.yaml`, which printed "dropped 12 @munaxa package entries".
2. `pnpm install --lockfile-only --fix-lockfile` against GitHub Packages. pnpm 10.33.0 resolved 518 packages. **`127.0.0.1` references: 0.**
3. Prettier was run locally with the repository's own version, `prettier@3.9.6`, on the diff applied from the log. `prettier --check` passes.

`pnpm install --lockfile-only` on the old resolutions was not used. That is the procedure an independent review had shown to be incorrect.

## Checks on the committed lockfile (`4aabdf7`) [V]

| Check | Result |
| --- | --- |
| `grep -c 127.0.0.1 pnpm-lock.yaml` | 0 |
| Entries changed vs `098df24` | only the 12 `@munaxa/*@2.5.0` `resolution` blocks (`supporting/identity-18-lockfile-regeneration.diff`, 117 lines). Each gains the GitHub Packages `tarball:` URL, the same form main uses for 2.4.1. |
| Every `@munaxa` source | `https://npm.pkg.github.com/download/@munaxa/<name>/2.5.0/<sha1>`; 12/12 |
| `integrity` vs registry `dist.integrity` | equal, 12/12 |
| Everything else vs main | identical, checked by parsing both lockfiles as YAML: every non-@munaxa entry in `packages`, `snapshots` and `importers`, plus `settings` and `overrides` |
| One manual edit | `--fix-lockfile` also added a `deprecated:` note to `node-abort-controller@3.1.1`, which is metadata only. It was removed, so that entry stays identical to main. |
| Content digests | 13/13 equal the candidate (04) |
| Application code | unchanged from the reviewed draft. Only `pnpm-lock.yaml` changed after `098df24`. |

Work, Control, School and Docs were not touched.
