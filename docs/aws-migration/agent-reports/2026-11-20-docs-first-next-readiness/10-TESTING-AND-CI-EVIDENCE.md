# 10. Testing and CI evidence

| What | Where | Result |
| --- | --- | --- |
| Docs secret script tests | `scripts/aws/owner/test/test_docs_testing_secrets.py` (PR #143) | 23 passed [T] |
| Control secret script tests | `scripts/aws/owner/test/test_control_testing_secrets.py` (PR #143) | 8 passed [T] |
| shellcheck, pyflakes | both scripts and tests | clean [T] |
| CI on PR #143 head `eb060e9` | "Format, validate, mocked plan tests" and "Lint · Typecheck · Test · Build" | success [V] |
| Control C-1/C-2 offline harness | [supporting/control-c1-c2-mocked.tftest.hcl](supporting/control-c1-c2-mocked.tftest.hcl), terraform 1.16.5, aws 6.67.0, mocked | **7 passed, 0 failed** [T] |
| Docs D-1/D-2 offline harness | 19 Nov report supporting | 42 / 62 creates [D] |
| docs#179 first CI run | 23 of 24 checks green; `pnpm audit` failed (SF-3) | fix `4c6ec2a`: all checks green |
| control#10 first CI run | image build green; 83/83 tests; `pnpm audit` failed (SF-3) | fix `6ca2287`: all checks green |
| Docker build locally | not possible (no daemon in the session) | CI image builds are the proof |

## Not run, by design

- No live Terraform plan against the shared S3 backend (it takes a state lock).
- No script run against AWS.
- No image build pushed.
- No session.
