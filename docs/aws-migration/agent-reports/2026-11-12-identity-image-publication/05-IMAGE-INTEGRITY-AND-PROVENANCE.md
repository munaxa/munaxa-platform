# 05. Image integrity and provenance

Read-only checks, 21:05 to 21:10 UTC. They used the root AWS connector (`ecr:DescribeImages`, `BatchGetImage`, `DescribeRepositories`, `DescribeImageScanFindings`) and the run's job logs.

| Check | Result | Evidence |
| --- | --- | --- |
| Both repositories hold the image | **PASS** [V] | `DescribeImages` |
| The immutable tags point at the recorded digest | **PASS** [V] | `BatchGetImage` by tag `5a5994f` and by tag `sha-5a5994f…` each return exactly the digest in the run log (`containerimage.digest`). Both repositories are `IMMUTABLE` |
| The manifest's config equals the build's config | **PASS** [V] | the config digest in the ECR manifest equals `containerimage.config.digest` in the log: api `defb6893…`, migrate `f8aad205…` |
| Built from the exact source commit | **PASS** [V] | Job `source`: the tag name equals `GITHUB_SHA`, and `git merge-base --is-ancestor` on main passed. Both publish jobs check out `ref: 5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175`. The build-push inputs carry the label `org.opencontainers.image.revision=5a5994f52ae5e403cb61d01cdfb1cd7fa9e4b175` |
| API and migrate from the same revision | **PASS** [V] | same run, same checkout ref, same label. Same Dockerfile, targets `runtime` and `migrate`. Same base, the `node:22-alpine` tag, which BuildKit resolved to `node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` |
| Architecture | **PASS** [V] | linux/amd64 runner, single-platform build (`provenance: false`). The manifest is a single OCI image manifest, not an index. That matches ECS Fargate X86_64 in the stack |
| Runtime configuration | **PASS** [V] | The in-run step "Verify the image runs as non-root and carries no credential" succeeded for both images. It pulls by digest and checks four things: the user is not root, no token in the history, no npmrc with a token, and (for runtime) no dev toolchain |
| No credential in layers or logs | **PASS** [V] | The history and npmrc checks passed. A search of all three job logs for `ghp_`, `ghs_`, `github_pat_` and `_authToken=<value>` matches only the `grep` pattern itself, inside the script text. The package token reached the build only as a BuildKit secret |
| Build provenance attestation | **N/A** | The workflow sets `provenance: false` by design, so no SLSA attestation exists. Provenance rests on the revision label, the tag-to-commit check and this run record |

## Finding: ECR basic scan reports one CRITICAL in both images

| Image | Scan | Findings |
| --- | --- | --- |
| api `848d33c0…` | COMPLETE 20:57:23 | CRITICAL 1: **CVE-2026-4738**, package `zlib` 1.3.2-r1 |
| migrate `df44505d…` | COMPLETE 20:57:45 | the same, CRITICAL 1 |

- `zlib` comes from the `node:22-alpine` base image, not from Identity's dependencies.
- The CI and image audits (`pnpm audit`) cover npm packages only.
- The 8 Nov `5277d71` images were scanned before this CVE was known. Their current status is not rescanned (basic scanning scans on push only).
- **This does not undo the publication.** It is a deployment gate: decide before the Testing session [O] (09).
- The fix is an Identity PR that pins a patched `node:22-alpine` digest, or adds `apk upgrade zlib`, followed by a new image tag.
- Whether CVE-2026-4738 can be exploited in Identity was not assessed here.
