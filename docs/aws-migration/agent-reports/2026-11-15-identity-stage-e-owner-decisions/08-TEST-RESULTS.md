# 08. Test results and review C

Every result below was executed in this task on 15 Nov 2026. Offline only: Terraform ran through a
wrapper that unsets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE`,
sets `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` to `/dev/null` and disables instance
metadata; `init -backend=false`; mocked providers. Terraform 1.16.5 with AWS provider 6.67.0 from a
local filesystem mirror (the public registry is not reachable from the session). No plan ran against
a backend or AWS.

## 1. Suites

| Suite | Command (repository root) | PR #131 `391e1be` | PR #131 `03c809b` (after review C) | PR #132 `6df2c4c` |
| --- | --- | --- | --- | --- |
| Connector scripts | `python3 -I -m unittest discover -s scripts/aws/connector -p 'test_*.py'` | 119 OK | **121 OK** | 128 OK |
| Cleanup state machine simulator | `python3 -I -m unittest discover -s infra/aws/stack/session-cleanup -p 'test_*.py'` | 49 OK | unchanged by the commit | 49 OK |
| Probe and loader | `node --test infra/aws/stack/supporting/identity-session-probe.test.mjs infra/aws/stack/scripts/identity-probe-loader.test.mjs` | 116 pass, 0 fail | unchanged | 116 pass, 0 fail |
| Terraform format | `terraform fmt -check -recursive infra/aws` | OK | unchanged | OK |
| Stack | `terraform init -backend=false && terraform validate && terraform test` | valid, 75 passed | unchanged | valid, 75 passed |
| Bootstrap | same, in `infra/aws/bootstrap` | valid, 14 passed | unchanged | valid, 14 passed |
| Prettier | `prettier --check infra/aws/cloudformation/*.json infra/aws/stack/envs/*.json .github/workflows/aws-terraform.yml` | pass | unchanged | pass |
| Plan intent | `check-plan-intent.sh --validate` on #132's declaration; synthetic `--enforce` with the 10 declared changes, and with one extra change | n/a | n/a | validate OK; enforce passes the 10, refuses the extra |

`03c809b` changes only `test_connector_scripts.py`, so the other suites do not depend on it.

Connector count on #131 is lower than on #132 because #131 deletes the C-8, C-8R, C-8v and C-16
tests and adds the C-8G tests; #132 is based on `main`, which still has the old scripts.

CI on GitHub (`Format, validate, mocked plan tests`, `Lint · Typecheck · Test · Build`, `Façades`)
succeeded on `391e1be` (run 43697515693) and `6df2c4c` (run 43697534566).

## 2. Mocked plans (offline, `-var-file=envs/nonprod.tfvars`)

- `main` defaults: 0 cleanup resources, 0 probe task definitions, backstop policy unchanged.
- PR #132: 8 cleanup creates, 1 probe create, the backstop policy update (10 changes).
- PR #131: the `stage-e-manifest` asserts that identity-bootstrap reads `IDENTITY_OWNER_*` only from
  `identity-operator`, that the probe never names it, and that the execution role reads exactly
  `identity-migrate` and `identity-operator-??????`. Each assert fails when mutated.

## 3. Review C (regression and mutation, independent reviewer on `391e1be`)

- 34 mutations; 30 caught by a named test, 4 survived. No test was skipped or loosened.
- Survivors and fixes (all in `03c809b`, each new test re-checked against its mutation and failing):

| Id | Severity | Survivor | Fix |
| --- | --- | --- | --- |
| C-1 | Medium | `FORBIDDEN_OPERATIONS` could be narrowed (for example `GetRandomPassword` removed and called in `regenerate`) with every test green, because every check reads the set itself | `test_review_c1_the_forbidden_operations_cannot_be_narrowed` pins the 11 names and checks the rule checker refuses each |
| C-2 | Low | The principal half of the root-read rule check was untested | new `status` drift case `policy-root-read (principal)` |
| C-3 | Low | A missing, non-ISO or non-string expiry value was untested | three new drift cases `policy-expiry (…)` |
| C-4 | Low | The denied-caller and malformed-caller tests were removed with the C-8 tests | `test_review_c4_a_denied_or_malformed_caller_check_aborts` |

- Secret and email scan of both commits: no keys, tokens or private key bodies; the only addresses
  added are synthetic or reserved-domain test values; the committed C-8G inputs are placeholders.
