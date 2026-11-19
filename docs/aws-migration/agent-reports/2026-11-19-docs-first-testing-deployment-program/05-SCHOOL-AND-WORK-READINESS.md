# 05. School and Work readiness

## 1. Work

**Status: CODE COMPLETE — NOT DEPLOYED.**

| Item | State |
| --- | --- |
| Images | api, admin, migrate at `b490b25` [V]. Main is `eabcc47`, which includes WK-01/WK-02 (work#30, #31). **The images are stale**; a new release is needed before any Work session |
| Identity dependency | Work signs in through Identity. WK-01/WK-02 need Identity with identity#15; `2db6ed9` includes it [V] |
| Infrastructure | Work services exist in the stack (desired 0); bundles empty [V] |
| Product gaps | admin is read-only; no file storage, notifications or scheduler [D 11 Nov audit] |
| Tenant re-binding | needed after the first Identity session (WK-02 note) [D] |

Work can follow Identity directly; it does not need Control. It is not on the Docs-first critical path.

## 2. School

**Status: NOT STARTED** on AWS.

| Item | State |
| --- | --- |
| Images | none; the School ECR repositories are empty [V] |
| Auth | School has its own sign-in, not Identity [V] |
| CI | runs on PRs only; there is no image publication workflow run [V] |
| Open findings | SC-04 to SC-07 (11 Nov audit) [D] |

School needs an image publication path, its own secrets design and the open findings closed before any Testing session.
