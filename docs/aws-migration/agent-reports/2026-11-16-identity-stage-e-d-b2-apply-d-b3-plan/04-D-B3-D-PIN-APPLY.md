# 04. D-B3/D-PIN apply (18 Nov 2026) and the audit exception

**Approval.** The owner wrote "Yes" and then "Then yes for both" at 08:31 UTC on 18 Nov 2026. That approved the D-B3/D-PIN apply and the temporary audit exception. The owner approved each `aws-nonprod` environment gate in GitHub.

## 1. Apply

[Run 44267788619](https://github.com/munaxa/munaxa-platform/actions/runs/44267788619) ran `aws-terraform.yml` with environment `nonprod` and action `apply` on `main` at `19fa5bc`.

| Job | Result |
| --- | --- |
| Plan, enforce mode, 08:32 to 08:33 UTC | `Plan: 9 to add, 2 to change, 1 to replace, 0 to destroy.` The checker reported "The plan matches the declared changes exactly (12 resource action(s))". Because `--enforce` was on, any extra change would have failed the job. The saved plan was kept in the state bucket. |
| Apply of the saved plan only, 08:33 to 08:34 UTC | The job fetched the saved plan and checked its SHA-256 `b43440ef7a78244a6fb7ae692f7a44fb6f6be56247b73f6893f7d763a5ebf967`. It checked that the plan was for the same commit and fresh. Then `terraform apply tfplan` completed: "Applied the saved plan of commit 19fa5bc…". |

The addresses and actions are the same 12 as in file 02 §2.

## 2. Follow-up plan

[Run 44268194074](https://github.com/munaxa/munaxa-platform/actions/runs/44268194074), plan only, 08:35 UTC:

```
Plan: 0 to add, 0 to change, 0 to replace, 0 to destroy.
No changes.
```

The intent checker printed "does not match" because the declaration still lists the 12 changes that are now applied. The workflow ran in report mode, so this is a warning and expected. The next configuration PR must replace `envs/nonprod.expected-changes.json` with its own declaration, as each stage has done.

## 3. Audit exception (PR #136)

**Advisory.** GHSA-fc5q-39xc-vjpf is a high-severity ReDoS in `picomatch` <=4.0.7. No patched version exists. It started failing `pnpm audit --audit-level high` on every PR on 18 Nov.

**How it reaches the repository.** Only through dev dependencies:

- `@storybook/addon-docs`, a devDependency of `packages/platform`;
- `@changesets/cli`, a root devDependency.

**The change.** PR #136 adds `pnpm.auditConfig.ignoreGhsas: ["GHSA-fc5q-39xc-vjpf"]` to the root `package.json`, so the audit ignores only this one advisory. It also adds `docs/security-platform/AUDIT-EXCEPTIONS.md`, which records the reason, the approval and how to remove the exception.

**Result.** `pnpm audit` exits 0 locally, and on PR #136 "Lint · Typecheck · Test · Build" is green.

## 4. What is live now, and what is still not done

**Live in nonprod:**

- **Session cleanup:**
  - role and policy;
  - state machine `munaxa-nonprod-session-cleanup`;
  - daily schedule R;
  - alert topic and its policy;
  - the two alarms.
- **Backstop:** it may start the cleanup state machine.
- **Identity task definitions:**
  - the probe task definition, pinned to `2f6d443` / `7254a0ba…e369`;
  - a new identity-bootstrap revision. It reads `munaxa-nonprod/identity-operator`, which does not exist yet; C-8G creates it.

**Not done:**

- no alert subscription (D-B5);
- no manual cleanup execution and no dry run;
- no secret created, read, updated or deleted;
- no CloudFormation stack and no C-8G;
- no RDS start, ECS service or task, migration, bootstrap or DB-admin run;
- no Stage E;
- no production change.

## 5. To watch

- **First scheduled run of schedule R:** this is the daily cleanup, at 21:05 UTC. Its alarms notify nobody until `alert@munaxa.com` is subscribed (D-B5).
- **Next scheduled Testing `down`:** "Plan the switches" should now pass, because the state machine exists and its definition is unchanged. If the session role still hits `states:ValidateStateMachineDefinition`, a small bootstrap change is needed (file 03 §2, risk 1).
