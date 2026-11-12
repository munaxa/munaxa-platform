# 05. Image integrity and provenance

## Status: NOT STARTED (no image published yet)

The checks that will run after publication, all read-only:

| Check | Method |
| --- | --- |
| Both repositories hold the image | `ecr:DescribeImages` (connector) |
| Immutable tags point at the recorded digests | `DescribeImages` with `imageIds` by tag: `5a5994f` and `sha-<full>` resolve to the digest printed in the run summary; repository `IMMUTABLE` |
| Source commit | label `org.opencontainers.image.revision` in the image config (`ecr:BatchGetImage` manifest, then the config blob); the run's `head_sha`; job `source` log line |
| API and migrate from the same revision | the same run, the same `revision` label |
| Architecture and runtime configuration | config `architecture: amd64`, `os: linux`, `User` non-root (the job also ran `id -un`), `Cmd` and `Entrypoint` as in the Dockerfile |
| No credential in layers or logs | in-run history and npmrc checks (03); the job log searched for `ghp_`, `ghs_`, `github_pat_` and `_authToken=` |

`provenance: false` in the workflow means no BuildKit SLSA attestation is attached. The provenance evidence is therefore the revision label, the tag-to-commit check in job `source`, and the run record.
