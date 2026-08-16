# Platform CI — documentation-only pull requests

**Scope:** one CI trigger in this repository. Nothing else. No package version changes, no release,
no application code, and no change to any required check name.

This is a maintenance task, not a certification phase. It exists because closing the Munaxa Docs
production certification surfaced a defect in that repository's CI configuration, and this repository
has the identical one.

## 1. Current behaviour

`.github/workflows/ci.yml` filters both of its triggers:

```yaml
on:
  pull_request:
    branches: [main]
    paths-ignore:
      - '**/*.md'
      - 'LICENSE'
  push:
    branches: [main]
    paths-ignore:
      - '**/*.md'
      - 'LICENSE'
```

`main` is protected by ruleset `20906222`, active, `bypass_actors: null`, with five rules in force:
`deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` (0 approvals) and
`required_status_checks` (strict). The three required contexts are:

```
Lint · Typecheck · Test · Build
Accessibility · contrast and keyboard, every story, four brands, light and dark
Façades match the platform surface
```

Each corresponds exactly to a job `name:` in `ci.yml` — lines 28, 66 and 118 respectively.

`release.yml` is `workflow_dispatch` only. Publishing is manual and cannot be triggered by a pull
request, before or after this change.

## 2. Why `paths-ignore` is a problem here

A path filter and a required status check disagree about what "did not run" means. The filter means
*nothing to test*; the ruleset means *not yet proven*, and holds the check **pending** rather than
treating it as satisfied.

That disagreement was harmless while `main` was unprotected. It stopped being harmless the moment the
three checks above became mandatory: a pull request whose changed files are all Markdown triggers no
workflow at all, so none of the three contexts is ever produced, and the pull request can never merge.

This is not theoretical. It was measured in `munaxa-docs`, whose `ci.yml` carried the same filter: the
pull request publishing the Phase 9.6 certification report — one Markdown file, 349 insertions, no
conflicts — produced **0 workflow runs**, **0 check runs**, and `mergeable_state: blocked`. The record
certifying that repository could not be merged into the repository it certified. §5 below records the
equivalent measurement taken here rather than assumed from there.

## 3. Why a shim workflow was rejected

The published remedy is a second workflow whose jobs carry the **same names** as the real ones and
succeed trivially when only documentation changed, so the required contexts get a green result.

It is rejected, and the reason is specific rather than stylistic. Path filters cannot express "all
changed files are Markdown" — only "some changed file matches". So when a pull request touches both a
Markdown file and a source file, **both** workflows fire and **both** publish a check of the same
name. The shim finishes in seconds; the real suite takes minutes. For that window the ruleset sees a
green check bearing the right name, and the branch is mergeable before anything has been tested.

A merge gate with a window of false green is worse than the wedge it replaces. The wedge fails
closed — nothing merges, and somebody notices. The shim fails open, silently, on exactly the pull
requests that mix documentation with code.

The invariant this repository keeps instead:

> Every required check corresponds to the real job that actually executed the work it names.

## 4. The change

One trigger, one deletion — `paths-ignore` removed from `pull_request` only:

```diff
 on:
   pull_request:
     branches: [main]
-    paths-ignore:
-      - '**/*.md'
-      - 'LICENSE'
```

The filter **stays** on `push`. A push run gates nothing: `main` is reachable only through a pull
request, which has now already run the suite, and the push trigger here is scoped to `main` alone —
so it does not fire on development branches at all. The wedge is a property of *required* checks, and
only pull requests are subject to them.

No job was renamed, no workflow was renamed, no job was added or removed, and no required context
changed. Nothing conditional was introduced: there is no `if: always()`, no synthetic success, and no
job that reports a result without doing its work.

## 5. Before / after evidence

Both states were measured on **PR #17**, this pull request, rather than argued from the `munaxa-docs`
measurement. Its first commit adds only this Markdown file; its second removes the filter. Commit
hashes are not cited: the branch was rebased onto `main` to satisfy the strict up-to-date rule, and
the merge itself rebases again, so any hash written here would be stale by the time it was read. The
two states are identified by their content instead.

**Before — the Markdown-only head, one file changed:**

```
workflow runs for the head sha : 0
required contexts published    : 0 of 3
check-runs present             : 1  — 'Workers Builds: platform-storybook' (in_progress)
mergeable                      : no
```

The single check-run is the Cloudflare integration, and it is *useful* evidence rather than noise: it
fired on the same commit that produced no workflow run, which confirms that integration has its own
triggers and is unaffected by anything in `ci.yml`.

None of `Lint · Typecheck · Test · Build`,
`Accessibility · contrast and keyboard, every story, four brands, light and dark` or
`Façades match the platform surface` existed. The ruleset had nothing to evaluate and would have held
this pull request pending indefinitely.

**After — the same Markdown file plus the one-trigger change:**

```
workflow runs for the head sha : 1  — CI, event: pull_request
required contexts published    : 3 of 3, executing the real jobs
```

See §7 for their conclusions.

## 6. Required check contexts

Unchanged by this work. Recorded before and after:

```
Lint · Typecheck · Test · Build
Accessibility · contrast and keyboard, every story, four brands, light and dark
Façades match the platform surface
```

Deliberately **not** required, and not changed here:

- `Publish @munaxa/* to GitHub Packages` — a release action, not a merge gate.
- `Workers Builds: platform-storybook` — a Cloudflare Workers preview build, failing on `main` before
  this work and unaffected by it. It is a separate integration with its own triggers, not a workflow
  in this repository. It remains a pre-existing issue and is out of scope.

## 7. Result

All three required contexts reported, and all three passed:

```
Lint · Typecheck · Test · Build                                          success
Accessibility · contrast and keyboard, every story, four brands, …       success
Façades match the platform surface                                       success
```

`Workers Builds: platform-storybook` failed, as it does on `main`. It is not a required context and
is out of scope (§6). Its failure is why the pull request's `mergeable_state` reads `unstable` rather
than `clean` — that state means *mergeable, with a non-required check red*, and the ruleset evaluates
only the three contexts above.

### The `@munaxa/rbac` failure on the first run

**The first run of `Lint · Typecheck · Test · Build` failed.** It is recorded here rather than
retried out of the history, because the first run is part of the evidence.

The failing task was `@munaxa/rbac#test`. Diagnosed before anything was re-run:

| Evidence | Finding |
| --- | --- |
| This pull request's diff | one CI trigger block and one Markdown file — `rbac` source and tests untouched |
| `main` at `72009f2` | the same check: **success** |
| Full workspace, locally | 15 packages, ~1,540 tests, all pass — `@munaxa/rbac` 81/81 |
| The failing file | `packages/platform/rbac/test/performance.test.ts`, asserting wall-clock budgets of 7 500 ms and 1 250 ms |
| That file's own comment | *"a budget tuned on an idle laptop fails on a busy CI runner"* |
| Local measurement of the 7 500 ms case | **743 ms** — roughly 90 % headroom |
| Munaxa Docs Phase 8.22 | the same package, the same budget: 8 120 ms against 7 500 ms on CI, passing on re-run with nothing changed; runners measured 13–15× slower than local |

A 90 % margin does not survive a 13× slowdown. The classification is therefore:

```
INFRASTRUCTURE — CI RUNNER VARIANCE
```

**Disposition:**

```
initial run:              failed  @munaxa/rbac#test
single disclosed retry:   passed
budgets changed:          none
```

`rerun_failed_jobs` was used rather than re-running the workflow, so the two already-green contexts
were not re-run to manufacture a fresher result. The 7 500 ms and 1 250 ms budgets were not touched:
the remedy for a slow runner is not a looser assertion, and no evidence was gathered that would
justify moving either number.

### Why this incident argues *for* the change rather than against it

The failure is the clearest available demonstration of why §3 rejected the shim. What happened was:

```
Markdown-only pull request → real workflow → real job → real result → failure visible
```

Under the shim, the same pull request would have produced:

```
Markdown-only pull request → synthetic green for 'Lint · Typecheck · Test · Build' → no job ran
```

— and it would have merged with a green tick, nobody any the wiser that `@munaxa/rbac` had failed at
all. A gate that can only ever report success is not a gate.

## 8. Performance impact

| | Before | After |
| --- | --- | --- |
| Jobs in the workflow | 3 | 3 |
| Required check contexts | 3 | 3 |
| Job names | unchanged | unchanged |
| Runs on a code pull request | 1 | 1 |
| Runs on a documentation-only pull request | **0** | **1** |
| Runs on a push to `main` | unchanged (filter retained) | unchanged |

The only material change is the last-but-one row, and it is the entire point. Wall-clock per run is
unaffected — no job was added, removed, split or reordered. The cost is one suite execution on a
pull request that changes only documentation, which previously cost nothing and also could not merge.

## 9. Final state

```
Platform main:            protected, ruleset 20906222 active, bypass_actors null
Required contexts:        3, unchanged, each matching a real job name
ci.yml pull_request:      no paths-ignore
ci.yml push:              branches [main], paths-ignore retained
release.yml:              workflow_dispatch only — unchanged
@munaxa/platform:         1.5.1 — no release, no version bump
Synthetic checks:         none introduced
Protection weakened:      none
```

The invariant this establishes, matching the one already established for Munaxa Docs:

> Every pull request that can merge has had the real required checks execute, report, and be
> evaluated by branch protection.
