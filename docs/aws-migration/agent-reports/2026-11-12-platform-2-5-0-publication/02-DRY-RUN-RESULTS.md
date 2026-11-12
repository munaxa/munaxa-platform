# 02. Dry run

**[W]** [Release run 43285216277](https://github.com/munaxa/munaxa-platform/actions/runs/43285216277) was dispatched from `main` with `dry_run=true`.
- Head: `ee9015f12fb9bb306179a26a94f7f273e2cfe5ba`.
- Time: 18:57:44 to 18:58:55 UTC. Conclusion: **success**.

| Check | Result |
| --- | --- |
| Job that ran | "Dry run (pack only)", job 131416714248. The publish job was **skipped**. |
| Token | `GITHUB_TOKEN Permissions: Contents: read, Metadata: read`. No packages permission. |
| Install, Build | passed |
| Verify (`pnpm test && pnpm validate`) | passed. Every package test file passed. In `@munaxa/security`, 141 tests passed and 4 were skipped (`test/redis-server.test.ts` needs a Redis server; see 01 for the local real-Redis run). The UI suite ran 621 tests. |
| `pnpm release:check` | "all checks passed" |
| Package list | exactly the 13 at `2.5.0` (the step summary) |
| Packed | 13 `📦 @munaxa/<name>@2.5.0` lines (`supporting/dry-run-43285216277-packed-lines.txt`) |
| `@munaxa/licensing` | built and tested only, never packed |
| Publication | none: `npm pack --dry-run` only, and the token cannot write |

Every condition passed, so the real dispatch went ahead.
