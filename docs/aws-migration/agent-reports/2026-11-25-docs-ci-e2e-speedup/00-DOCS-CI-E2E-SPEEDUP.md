# Docs CI: end-to-end check timing, Next.js build cache and the flaky search test

Date: 25 Nov 2026. Scope: munaxa-docs repository CI only. Nothing deployed, no AWS, no secrets.
Change: munaxa-docs#186 merged to munaxa-docs main as `0ebd6a0` on 25 Nov 2026 ~21:00 UTC; final PR checks all green on head 859af33.

## Question (Tamer, 25 Nov 19:38 UTC)

Can the accessibility check be made faster, is there best practice, and is anything extra making it slow?
The check meant is `End-to-end · signing, faded text and search` (the colour-contrast/axe suite is `faded-text.e2e.spec.ts`), which failed once on munaxa-docs#185 with a search test timeout.

## Measured before (runs 45630187450 and 45630135364, head 86214cb)

| Step in the signing shard | Time |
| --- | --- |
| Containers, pnpm/node setup, PostgreSQL 16 client, migrations | ~1.5 min |
| `pnpm build` (turbo, 9 tasks, 0 cached) | 65-98 s; `next build` "Compiled successfully in 41s" and printed "No build cache found" |
| Install Chromium (`--with-deps`) | 14 s |
| Tests (signing 27, search 43, faded-text 4) | 127-148 s; the contrast/axe suite itself ~28-30 s |
| Whole job | 297-318 s |

- The whole CI run took ~9 min (e.g. 14:05:01 to 14:14:20) and is decided by the image jobs (Migration image 383-555 s, Container images 339-503 s), which run in parallel. The signing shard is not on the critical path.
- Lint/Test/Build job: `Accessibility contrast and visual regression` step is 21 s.
- The real delay on #185: `search.e2e.spec.ts > the tenant administrator > opens a result` timed out (`page.waitForURL` 30 s, empty navigation log) in job 139260791183; the job had to be re-run (attempt 2 passed unchanged, 15:38 to 15:43).

## Root causes

1. **Flaky search test.** `gotoPopulated` waited only for `networkidle`, then the test clicked the first result link. A quiet network is not a hydrated page; a click in that gap is swallowed and the URL never moves. The repository already has `waitForHydration` (theme.ts) for the same race in `shell.e2e`.
2. **No Next.js build cache.** Every job compiled the web app from scratch; Next.js documents persisting `.next/cache` in CI as standard practice.

## Changes (munaxa-docs#186)

1. `actions/cache` (same pinned SHA `caa2961`, v5.1.0, already used in the workflow) restores/saves `apps/web/.next/cache` in the Lint/Test/Build job and in every end-to-end shard. Key: OS + lockfile hash + hash of `apps/web/src/**`, `apps/web/next.config.*`, `packages/*/src/**`; restore-key falls back to the same lockfile. `next build` still runs in full (lint, type check, fresh `.next`). Image jobs build from a clean Docker context and never see the cache.
2. `gotoPopulated` now calls `waitForHydration`; "opens a result" waits for the result link to be visible before clicking.
3. `waitForHydration` also recognises the Arabic theme labels (`فاتح`/`داكن`). Found by CI on the first push (run 45687722016): the Arabic search cases go through `gotoPopulated` and timed out because the helper knew only the English labels. Fixed in 077a022.

No test, shard, required check, trigger or check name was removed or renamed. Nothing was skipped or retried automatically.

## Measured after (run 45688744775, head 077a022, warm cache)

| | Before | After |
| --- | --- | --- |
| `next build` compile | 41 s | 19.9 s (cache hit on primary key) |
| `pnpm build` total (turbo) | 90.6 s | 57.4 s |
| Signing shard total | 297-318 s | 259 s |
| Other shards, Build step | 65-98 s | 57-75 s |
| Signing shard tests | 127-148 s, 1 flaky failure | 117.7 s, all passed |

Saving per job is ~30-40 s when the cache is warm; with 6 jobs using it, ~3-4 runner-minutes per CI run. Whole-run wall-clock stays ~8-9 min because the image jobs decide it.

## Reported, not changed

- Each commit on a `claude/**` branch with an open PR runs CI twice (push + pull_request). Doubles runner minutes, not waiting time; the workflow documents it as deliberate (feedback before a PR exists).
- `next build` in the e2e shards also lints (duplicate of the Lint job, ~10-15 s). Left as is: skipping it would change what the build step proves.
- Chromium install is 14 s, mostly OS packages; caching the browser would save only a few seconds.
- The `main` ruleset requires the branch to be up to date before merging. While #186 waited, `main` moved twice (#187, #188), and each time the merge was refused ("behind") and the full suite had to run again (~9 min plus runner queueing, which reached 10-15 min on 25 Nov evening). On a busy day this costs more waiting than anything inside the check. Left unchanged: it is a protection setting, and it guarantees the tested code is exactly what lands.
