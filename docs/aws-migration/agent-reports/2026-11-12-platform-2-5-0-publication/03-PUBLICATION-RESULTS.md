# 03. Publication

**[W]** [Release run 43285585963](https://github.com/munaxa/munaxa-platform/actions/runs/43285585963) was dispatched from `main` with `dry_run=false`.
- Head: `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba`.
- It ran once and was not re-dispatched. Conclusion: **success**.

| Check | Result |
| --- | --- |
| Job | "Publish the 13 lockstep @munaxa/* packages", job 131418038628. The dry-run job was skipped. |
| Token | `Contents: read, Metadata: read, Packages: write` |
| Ref guard | the "Refuse to publish from a ref other than main" step was skipped, because the condition did not match: this was a main dispatch |
| Gates | Install, Build, Verify and `release:check` ("all checks passed") all passed |
| Published | 13 lines, 19:01:24 to 19:01:35 UTC: `+ @munaxa/{types,interfaces,crypto,config,cache,logging,session,audit,rbac,security,notifications,auth,conformance}@2.5.0` (`supporting/publish-run-43285585963-published-lines.txt`) |

**[V] Registry state**, read through `npm view` in Identity Actions run 43286188504 (`supporting/registry-metadata-2.5.0.txt`):
- Each of the 13 lists `2.5.0`, with `dist-tags.latest = 2.5.0`, published between 19:01:24 and 19:01:35 UTC.
- `@munaxa/licensing` versions are `0.1.0, 0.2.0` with `latest = 0.2.0`, so it is unchanged.
- No other package was published. The run log has exactly 13 `+ @munaxa/...@` publish lines, and the only other package names in it are the workspace `tooling/` install lines.

**[V] No side effects:**
- munaxa-platform has 0 tags and 0 releases (`GET repos/munaxa/munaxa-platform/tags` and `/releases`).
- No workflow ran other than the two release runs.
- No image was built.
