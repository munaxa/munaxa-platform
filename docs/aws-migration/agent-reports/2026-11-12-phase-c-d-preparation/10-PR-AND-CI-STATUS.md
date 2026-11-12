# 10. Pull requests and CI

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required.

| PR | Head | State | CI | Reviews |
| --- | --- | --- | --- | --- |
| [munaxa-identity#18](https://github.com/munaxa/munaxa-identity/pull/18) Platform 2.5.0 adoption | `098df24` | **Draft. Not merged, by instruction** | `verify` **fails at Install**, as designed: `ECONNREFUSED 127.0.0.1:4874` for the 12 `@munaxa` tarballs ([job](https://github.com/munaxa/munaxa-identity/actions/runs/43271502027/job/131368933233)). Explained once in a PR comment | Round 1 changes requested (A1), fixed in the procedure; rounds 2 and 3 approve it as a draft |
| [munaxa-platform#114](https://github.com/munaxa/munaxa-platform/pull/114) single-store reachability, 0/100 wording, AUTH token class | `9acc6ae` | **Squash-merged** as `c40a6b1` (12 Nov) | Terraform "Format, validate, mocked plan tests" green; "Lint · Typecheck · Test · Build" green on the final head (see note) | Rounds 1, 2 and 3 approve |
| Report PR (this folder, plus the R3-13 comment) | see the PR | squash-merged after green CI | CI on its head | round 3 findings applied |

**Note on one red run of #114 [V]:**
- At `a36d0f6`, "Lint · Typecheck · Test · Build" failed once: `@munaxa/security` `test/performance.test.ts > renders the header set in microseconds`, measured 0.132 against a bound of 0.1.
- That commit changed only Terraform and docs, and the same job passed on the next head.
- It is a wall-clock timing test, sensitive to runner load, and unrelated to this PR.
- **[R]** Widen that bound or make it relative in a separate PR. The test was not skipped or changed here.

Commits on #114:
- `3773c25`: `single_task_store` refuses discovery and private callers; 0/100 wording.
- `a36d0f6`: AUTH token class `[A-Za-z0-9-]{32,128}`.
- `6ab747d`: refuses extra security groups too; remaining wording; Phase A report class corrected.
- `9acc6ae`: README wording.

Local checks on the final #114 head **[L]**: `terraform fmt -check -recursive` passes; tests pass (module 17/17, stack 67/67, bootstrap 12/12).

Not opened, by decision:
- Work and Control upgrade PRs (08).
- IAM or availability implementation PRs (06, 07): these wait for the owner's decisions.
