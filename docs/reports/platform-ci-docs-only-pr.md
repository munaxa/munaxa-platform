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

*(measured in this repository; filled from the pull request that carries this report)*

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

*(filled from the pull request that carries this report)*
