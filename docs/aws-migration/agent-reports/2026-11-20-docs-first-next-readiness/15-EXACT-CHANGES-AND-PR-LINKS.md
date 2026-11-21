# 15. Exact changes and PR links

| PR | Branch / head | Files | Purpose |
| --- | --- | --- | --- |
| [munaxa-platform#143](https://github.com/munaxa/munaxa-platform/pull/143) | `claude/project-thread-r335u7-docs-secrets` @ `eb060e9` | see list below | owner secret custody for Docs and Control |
| [munaxa-docs#179](https://github.com/munaxa/munaxa-docs/pull/179) | `claude/project-thread-r335u7-pin-base` @ `4c6ec2a` | `Dockerfile`, `package.json`, `pnpm-lock.yaml` | Node base pinned by digest `e9f565d3…`; `effect` override `^3.22.1` |
| [munaxa-control#10](https://github.com/munaxa/munaxa-control/pull/10) | `claude/project-thread-r335u7-base-refresh` @ `6ca2287` | `Dockerfile`, `package.json`, `pnpm-lock.yaml` | base digest `de170b39…` → `e9f565d3…`, `apt-get upgrade` in the `os` and `portal` stages; `effect` override |
| this report's PR | `claude/project-thread-r335u7-next-readiness` | this folder and the README index row | report and supporting harness |

Files changed in PR #143:

- `scripts/aws/owner/docs-testing-secrets.sh`: lock and Purpose tag.
- `scripts/aws/owner/control-testing-secrets.sh`: new.
- `scripts/aws/owner/test/fake_aws.py`: store-then-fail fault and tags.
- `test_docs_testing_secrets.py`: +5 tests.
- `test_control_testing_secrets.py`: new, 8 tests.
- `.github/workflows/aws-terraform.yml`: shellcheck and tests for both scripts.
- `infra/aws/README.md`: G4 Control bullet.

Earlier PRs still open (no change today): [#141](https://github.com/munaxa/munaxa-platform/pull/141), [#142](https://github.com/munaxa/munaxa-platform/pull/142), [#144](https://github.com/munaxa/munaxa-platform/pull/144), [docs#178](https://github.com/munaxa/munaxa-docs/pull/178).

## Supporting files

- [supporting/control-c1-c2-mocked.tftest.hcl](supporting/control-c1-c2-mocked.tftest.hcl): the offline harness. Copy it into `infra/aws/stack/tests/` and run `terraform init -backend=false && terraform test -verbose -var-file=envs/nonprod.tfvars` with no AWS credentials. Its public key is a throwaway; the private half was never kept.
- [supporting/control-c1-c2-plan-addresses.txt](supporting/control-c1-c2-plan-addresses.txt): plan counts and resource addresses for C-1, C-2 and the Control session.
