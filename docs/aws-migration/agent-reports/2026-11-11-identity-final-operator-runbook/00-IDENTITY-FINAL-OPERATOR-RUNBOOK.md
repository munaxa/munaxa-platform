# Identity non-production: final operator runbook for the Claude-executed first session (11 Nov 2026)

- **Workstream 4** of the owner's five preparation workstreams (owner authorization, 11 Nov 2026
  10:07 UTC). Documentation only.
- **This runbook does not authorize anything.** AWS deployment, Terraform apply, IAM, DNS,
  Cloudflare, production changes and PR merges are **not authorized**. Each phase below names the
  separate owner authorization it needs.
- Account `229251310592`, region `eu-central-1`.
- Basis: `munaxa-platform` `main` `49c51f36fb53d1e450c9cf8af58a969897d00623`; `munaxa-identity`
  `main` `5277d7190b3dda496443c4bd7d80c78bd4d9174e`; open PRs #87, #88, #89 (carried byte for byte
  in this PR, see `01-PR-CONSISTENCY-AND-MERGE-ORDER.md`); the parallel workstreams 1, 2, 3 and 5.
- **Operator** in this runbook means Claude: GitHub through the integration (acting as `tam2om`),
  AWS through the AWS connector (root, ACCESS-POLICY 8 Nov). The owner's actions are marked
  **[OWNER]** and are limited to approvals, the email address, a reconnect press and, only in the
  failure cases named, one console action.

Labels: **[V]** verified in this session from source or a local test; **[R]** from evidence already
in the repository; **[P]** pending another workstream's PR; **NOT VERIFIED** not yet proven.

## Contents

1. Status and what supersedes what
2. Inputs and pending items
3. Probe source pinning and checksum procedure
4. Probe task definition and exact ECS task overrides
5. Environment variables and secret references
6. Phase 0: before session day
7. Phase 1: session-day read-only checks
8. Phase 2: the session, step by step (bootstrap and probe sequences)
9. Listener configuration verification
10. Log filtering and count-only reporting
11. Secret cleanup
12. Shutdown and verification
13. Failure and recovery procedures
14. The three-hour hard stop
15. Cost statement
16. What was done for this document

---

## 1. Status and what supersedes what

**Verdict: RUNBOOK COMPLETE FOR REVIEW. NOT EXECUTABLE YET.** It becomes executable only when the
items in section 2 marked **blocking** are closed.

| Document | Status after this runbook |
| --- | --- |
| Operator checklist (PR #86, on `main`, corrected by PR #87) | Still the source of the expected results and of hard stops H-1 to H-17. Its CloudShell commands are **replaced** by the connector and probe steps here. Its step 9 (DNS) is **not used**. Its step 16 (delete the secret before the restart) is **moved** to after the probe (section 11) |
| Claude-executed plan (PR #87, part 4 phase P and phase B) | Phase B order kept. The probe design in phase P is **superseded** by sections 3 to 5 (separate task definition, Origin and organisation on login, HTTP redirect as configuration evidence only). Part 5 option table is **decided**: Option A (owner, 11 Nov) |
| Phase 1 assessment (PR #88) | Evidence unchanged. Its F-1/F-2 "no change was made" is **superseded** by PR #87 `02-LOG-FILTER-CORRECTION.md` |
| Pre-authorization review (PR #89) | BL-1 to BL-5 are **addressed** by workstreams 1, 2, 5 and this runbook (table in section 2). Its recommendation of option C is **overtaken** by the owner's choice of Option A. Its merge order (BL-5) is **replaced** by `01-PR-CONSISTENCY-AND-MERGE-ORDER.md` |

## 2. Inputs and pending items

| # | Item | Owner of the item | Blocking? | State |
| --- | --- | --- | --- | --- |
| I-1 | Probe `identity-session-probe.mjs` and its tests (workstream 1, PR #93, head `7d65fb1`) | Claude, then ChatGPT review, then **[OWNER]** merge word | **Yes** | [P] PR #93 open. Its SHA256 at `bc1d202` is `f7a15787…`; **the session pin is taken from the merged `main` commit, not from this value** |
| I-2 | Probe task definition `identity-probe.tf` (workstream 2, PR #92, head `4c632ab`), disabled by default | Claude, then review, then **[OWNER]** merge word | **Yes** | [P] PR #92 open; enable-PR drafts in its `supporting/` |
| I-3 | Enable PR: `identity_probe_source = { commit, sha256 }` in `envs/nonprod.tfvars` and `nonprod.expected-changes.json` = exactly 1 create | Claude, after I-1 is merged | **Yes** | Not started (needs I-1's merge commit) |
| I-4 | Terraform plan and apply of I-3 (1 create, `aws_ecs_task_definition.identity_probe[0]`) | **[OWNER]** separate authorization; Claude dispatches | **Yes** | Not authorized |
| I-5 | Option A connector scripts and their review (workstream 5, PR #91, `supporting/option-a-connector-scripts.DRAFT.py`: C-8, C-8v, C-16, C-24) | Claude, ChatGPT review | **Yes** | [P] draft in PR #91 |
| I-6 | **Testing operator email address** | **[OWNER]** | **Yes** | **Confirmed by the owner, 11 Nov 2026 10:30 UTC.** Named `IDENTITY_OPERATOR_EMAIL` here. The value is authorized for the operator account only, not for publication (owner, 11:18 UTC), so it is kept only in the project's private runtime input, never in this repository. Claude sets it in the session copy of C-8 only; the committed draft keeps the placeholder `<IDENTITY_OPERATOR_EMAIL>` |
| I-7 | Independent cleanup (workstream 3, PR #90; implementation proposal `01-CLEANUP-IMPLEMENTATION-PROPOSAL.md`): revision 2: cleanup state machine started at the hard stop H, again at H + 30 min, and daily at 21:05 UTC | Proposal only; building it is **[OWNER]** Stage B (PR #95 package) | **Yes.** Owner, 11 Nov 10:30 UTC: the first session should not proceed with an unbounded ALB cost risk | [P] proposal in PR #90, not built |
| I-8 | Session deployment authorization naming the date, start window (start by 15:30 UTC), this runbook's commit, the probe pin and the cost statement in section 15 | **[OWNER]** | **Yes** | Not requested yet |
| I-9 | Read-only pre-checks of the new log patterns with `TestMetricFilter` (section 10.4) | Claude, under the session-day read-only approval | Yes (part of phase 1) | NOT VERIFIED |

## 3. Probe source pinning and checksum procedure

The probe is downloaded at run time from GitHub, at one commit, and refused unless its SHA256
matches. The commit and the hash are fixed in Terraform (I-3), so they are reviewed in a PR and
cannot change at `RunTask` time.

### 3.1 The pin

| Field | Value |
| --- | --- |
| Repository | `munaxa/munaxa-platform` |
| Path | `infra/aws/stack/supporting/identity-session-probe.mjs` |
| Commit `C` | The **merge commit on `main`** of the workstream-1 PR (squash merge). 40 lowercase hex characters. Never a branch name, a tag or a short SHA |
| URL | `https://raw.githubusercontent.com/munaxa/munaxa-platform/<C>/infra/aws/stack/supporting/identity-session-probe.mjs` |
| Hash `H` | SHA256 of the file bytes at `C`, 64 lowercase hex characters |

### 3.2 Procedure (Claude, after the owner merges I-1)

1. Fetch `main`; record `C` = the squash commit of the I-1 PR. Check
   `git merge-base --is-ancestor C origin/main` (exit 0) and that `C` matches `^[0-9a-f]{40}$`.
2. Compute `H` twice, from two independent paths, and require equality:
   - `git show C:infra/aws/stack/supporting/identity-session-probe.mjs | sha256sum`
   - `curl -sSf --proto '=https' "https://raw.githubusercontent.com/munaxa/munaxa-platform/$C/infra/aws/stack/supporting/identity-session-probe.mjs" | sha256sum`
3. Check the file at `C` is byte-identical to the file reviewed in the I-1 PR (the PR head's blob
   id equals the blob id at `C`). If the squash changed the file, stop: the review covered other
   bytes.
4. Run the probe's own tests at `C` (`node --test` on `identity-session-probe.test.mjs`); all
   pass.
5. Open the I-3 enable PR with `identity_probe_source = { commit = "<C>", sha256 = "<H>" }` and
   the expected-changes file at exactly one create. Record `C` and `H` in the PR body and in the
   authorization request (I-8).
6. After the I-4 apply, read the registered task definition (section 6, step 0-6) and confirm its
   command carries `C` and `H` exactly.

### 3.3 The loader

The loader is the container command, defined in the task definition by workstream 2 (PR #92) [P];
the probe (workstream 1, PR #93) no longer carries a copy. Its contract, which this runbook depends
on:

- `node --input-type=module -e <LOADER_SOURCE>` on the Identity API image's Node 22;
- reads `PROBE_COMMIT` and `PROBE_SHA256` from the task definition's environment;
- refuses a commit that is not 40 hex or a hash that is not 64 hex;
- downloads **only** the URL in 3.1, with redirects refused;
- hashes the bytes with `node:crypto`; on mismatch it stops **without evaluating the bytes**;
- on a match, imports the bytes as a `data:text/javascript;base64,…` URL. Nothing is written to
  disk, which the read-only root filesystem requires;
- the probe is one self-contained ES module that imports only `node:` built-ins and runs nothing
  on import; the loader calls `process.exitCode = await m.default(process.env)`;
- a loader failure prints `FAIL probe-source <code>` and exits 3.

[V] The mechanism was tested locally on Node 22.23.4 (`supporting/data-url-import-check.mjs`,
output in `supporting/data-url-import-check-output.txt`): a `data:` module imported this way can
import `node:crypto` and `node:https`; a changed byte gives a different hash and is not imported.
The read-only root filesystem itself was not simulated.
The real loader and probe are tested in PRs #92 and #93 [P].

**Pin rules.**

- The pin changes only through a new reviewed PR and a new owner-authorized apply.
- In a session, a checksum or download failure is a stop (section 13, H-18). Claude never edits
  the pin, the URL or the command during a session, and never runs a probe from another source.

## 4. Probe task definition and exact ECS task overrides

### 4.1 The task definition (workstream 2 [P])

| Attribute | Value |
| --- | --- |
| Family | `munaxa-nonprod-identity-probe`. The revision is **not assumed**: step 0-6 reads the ACTIVE revision back and records `PROBE_TD` = `family:revision` (PR #95 X-2) |
| Container | `identity-probe`, essential |
| Image | The Identity API digest already in `munaxa-nonprod-identity-bootstrap:1`: `munaxa-identity/api@sha256:71d01fdf…` (`node:22-alpine` runtime) [R] |
| Root filesystem | read-only; Linux capabilities: drop `ALL` |
| Command | the loader (3.3), fixed in the definition |
| Execution role | `munaxa-nonprod-identity-bootstrap-execution`, **unchanged** policy |
| Task role | **none** |
| Secrets | **only** `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` from `munaxa-nonprod/identity-bootstrap` |
| Not present | `DIRECT_DATABASE_URL`, `DATABASE_MIGRATION_URL`, any RDS master value, any `identity` service secret |
| Logs | `/munaxa/nonprod/ops`, stream prefix `identity-probe` |
| IAM, security groups | none added or changed |

**Execution role reuse.** The execution role is used by the ECS agent to pull the image, fetch
the two secrets and write logs. Its credentials are **not** given to the container: with no task
role, the container has no AWS credentials at all, and the probe makes no AWS API call. The role
is allowed to read the migrate secret too, but the definition does not reference it, so ECS does
not fetch it and the container never receives it.

### 4.2 `RunTask` (exact, through the connector as root)

```python
# Inputs resolved earlier in the session (section 8, step S-0): SUBNETS (2 ids), SG_IDENTITY, ALB_DNS.
params = {
    "cluster": "munaxa-nonprod",
    "taskDefinition": PROBE_TD,             # family:revision recorded at step 0-6, never a hard-coded :1
    "launchType": "FARGATE",
    "count": 1,
    "startedBy": "first-identity-session-probe",
    "networkConfiguration": {"awsvpcConfiguration": {
        "subnets": SUBNETS,                 # munaxa-nonprod-public-a, munaxa-nonprod-public-b
        "securityGroups": [SG_IDENTITY],    # munaxa-nonprod-identity
        "assignPublicIp": "ENABLED",        # public subnets, no NAT
    }},
    "overrides": {"containerOverrides": [{
        "name": "identity-probe",
        "environment": [{"name": "PROBE_ALB_DNS", "value": ALB_DNS}],
    }]},
}
```

- **The only override is `PROBE_ALB_DNS`.** No `command`, `secrets`, `environmentFiles`,
  `taskRoleArn`, `executionRoleArn`, `cpu` or `memory` override. Claude checks the dictionary
  before sending: exactly these keys, and `ALB_DNS` matches
  `^munaxa-nonprod-[0-9]+\.eu-central-1\.elb\.amazonaws\.com$` (the ALB's own name for this
  session, read from `DescribeLoadBalancers`).
- `PROBE_ALB_DNS` is not secret. It appears in CloudTrail and `DescribeTasks`, which is expected.
- **Network.** Security group `munaxa-nonprod-identity` allows egress 443 to `0.0.0.0/0` and 5432
  to the database group only [R, PR #88 `sgs.json`]. The probe reaches the ALB's public addresses
  and `raw.githubusercontent.com` on 443. It cannot reach port 80 (section 9). It could open a
  connection to the database port, but it holds no database credential (4.1).

### 4.3 The other tasks (unchanged from the checklist)

| Step | Task definition | Security group | Override |
| --- | --- | --- | --- |
| S-3 | `munaxa-nonprod-db-admin:1` | `munaxa-nonprod-db-admin` | none |
| S-4 | `munaxa-nonprod-identity-migrate:1` | `munaxa-nonprod-identity-migrate` | none |
| S-6a | `munaxa-nonprod-identity-bootstrap:1` | `munaxa-nonprod-db-admin` | none (default command: `bootstrap-account.mjs --organisation munaxa-group --organisation-name …`) |
| S-6b | same | same | `{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/seed-control-roles.mjs","--organisation","munaxa-group"]}]}` |
| S-6c | same | same | `{"containerOverrides":[{"name":"identity-bootstrap","command":["node","scripts/bootstrap-account.mjs","--organisation","munaxa-group","--role","control-operator-admin"]}]}` |

All with the same subnets, `assignPublicIp` `ENABLED`, `launchType` `FARGATE`, `count` 1. The
overrides carry commands only, never a secret.

## 5. Environment variables and secret references

### 5.1 Probe task (from workstream 2 [P]; names agreed with workstream 1)

| Name | Kind | Value | Set where |
| --- | --- | --- | --- |
| `NODE_ENV` | env | `production` | task definition |
| `PROBE_COMMIT` | env | `C` (3.1) | task definition, from `identity_probe_source.commit` |
| `PROBE_SHA256` | env | `H` (3.1) | task definition, from `identity_probe_source.sha256` |
| `PROBE_HOST` | env | `id.test.munaxa.com` | task definition |
| `PROBE_ORGANISATION` | env | `munaxa-group` | task definition |
| `PROBE_SIGNING_KID` | env | `identity-nonprod-2026-11` | task definition |
| `PROBE_PUBLIC_KEYS` | env | `var.identity_public_keys` (public, `envs/nonprod.tfvars`) | task definition |
| `PROBE_ISSUER` | env | `https://id.test.munaxa.com` | task definition |
| `PROBE_AUDIENCES` | env | `munaxa-work,munaxa-control` | task definition |
| `PROBE_OPERATOR_HOST` | env | `operator-test.munaxa.com` | task definition |
| `PROBE_CONTROL_API_HOST` | env | `control-api.test.munaxa.com` | task definition |
| `PROBE_UNKNOWN_HOST` | env | `unknown.test.munaxa.com` | task definition |
| `PROBE_ALB_DNS` | env | the session ALB's AWS DNS name | **`RunTask` override** (only one) |
| `IDENTITY_OWNER_EMAIL` | secret | `arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap:IDENTITY_OWNER_EMAIL::` | task definition `secrets` |
| `IDENTITY_OWNER_PASSWORD` | secret | `arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap:IDENTITY_OWNER_PASSWORD::` | task definition `secrets` |

Workstream 1's probe compares each `PROBE_*` value with the reviewed constant in the file and
answers `FAIL config` (exit 2) on any difference, so a wrong definition cannot widen the checks.
Workstreams 1 and 2 are reconciling the five extra names; **the final list is whatever both merged
PRs agree on, and Claude re-checks this table against the registered definition at step 0-6.**

### 5.2 Secrets

| Secret | Created by | Keys | KMS key | Lifetime |
| --- | --- | --- | --- | --- |
| `munaxa-nonprod/identity-bootstrap` | Claude, step S-5, PR #91 script C-8 | `IDENTITY_OWNER_EMAIL` (= I-6), `IDENTITY_OWNER_PASSWORD` (generated in AWS) | `alias/munaxa-nonprod-data` | **Temporary.** Deleted at step S-11 |
| `munaxa-nonprod/identity-operator` | Claude, step S-5, the same C-8 call (PR #91 OA-1) | the same email and password, plus the organisation slug (PR #91) | `alias/munaxa-nonprod-data` | **Persistent**, for later non-production Control work. About US$0.40 a month. Never force-deleted (PR #91 OA-3) |

Rules (owner decisions, 11 Nov):

- the password is generated inside AWS (`secretsmanager:GetRandomPassword`) and passed to
  `CreateSecret` in the same connector script;
- it is **never** returned to Claude's context, ChatGPT, terminal output, logs, PRs or evidence;
  the script returns names, ARNs, version counts and the KMS key id only;
- no `GetSecretValue`, `BatchGetSecretValue` or Secrets Manager Agent call by Claude, ever;
- **L-A0** applies: the value passes through the connector's sandbox, whose server-side audit log
  Claude cannot inspect (PR #88 section 3). The owner accepted Option A with this limit; it is
  repeated in the authorization request (I-8);
- the bootstrap secret is not created until I-6 and I-8 are both in hand.

Readers of the value: only the ECS agent, through `munaxa-nonprod-identity-bootstrap-execution`
(`ops.tf` `ReadOwnerUrlAndOneRunSecret`, pattern `…/identity-bootstrap-??????`), for the
bootstrap and probe tasks. Nothing reads `munaxa-nonprod/identity-operator` during the session.

## 6. Phase 0: before session day (no AWS change unless stated)

| # | Action | Who | Needs |
| --- | --- | --- | --- |
| 0-1 | Review and merge I-1 (probe) and I-2 (task definition, disabled) | ChatGPT review; **[OWNER]** merge word | merge order in `01-…` |
| 0-2 | Pin `C` and `H` (section 3.2, steps 1 to 4) | Claude | I-1 merged |
| 0-3 | Open, review and merge the I-3 enable PR | Claude; **[OWNER]** merge word | 0-2 |
| 0-4 | Dispatch `aws-terraform.yml` nonprod **plan**; require exactly 1 create, `aws_ecs_task_definition.identity_probe[0]`, 0 change, 0 destroy | Claude dispatches | **[OWNER]** authorization of I-4 |
| 0-5 | Dispatch the **apply** of that plan, then a post-apply plan: "No changes" | Claude | same authorization; the session must be down |
| 0-6 | Read-only check of the registered definition (script below) | Claude | read-only approval |
| 0-7 | Merge this runbook PR (it carries #87, #88, #89) so the session follows a commit on `main` | **[OWNER]** merge word | ChatGPT review |
| 0-8 | Build the independent cleanup (I-7) under the Stage B approvals B-1 to B-4 (PR #90 proposal section 11), then its simulation and dry run | **[OWNER]** Stage B, then Claude | PR #90 |
| 0-9 | The session authorization (I-8, Stage D). The operator email (I-6) is already confirmed | **[OWNER]** | everything above |

Step 0-6 connector script (read-only; returns booleans and names only):

```python
# The family name alone resolves to the latest ACTIVE revision; the result records it.
r = await call_boto3(service_name="ecs", operation_name="DescribeTaskDefinition", region_name="eu-central-1",
                     params={"taskDefinition": "munaxa-nonprod-identity-probe"})
b = await call_boto3(service_name="ecs", operation_name="DescribeTaskDefinition", region_name="eu-central-1",
                     params={"taskDefinition": "munaxa-nonprod-identity-bootstrap:1"})
td, bt = r["taskDefinition"], b["taskDefinition"]
c = td["containerDefinitions"]; bc = bt["containerDefinitions"][0]
env = {e["name"]: e["value"] for e in c[0].get("environment", [])}
sec = sorted(s["name"] for s in c[0].get("secrets", []))
cmd = " ".join(c[0].get("command", []))
C, H = "<C from 3.2>", "<H from 3.2>"
result = {
  "one_container": len(c) == 1 and c[0]["name"] == "identity-probe",
  "same_image_as_bootstrap": c[0]["image"] == bc["image"],
  "readonly_root": c[0].get("readonlyRootFilesystem") is True,
  "drop_all": c[0].get("linuxParameters", {}).get("capabilities", {}).get("drop") == ["ALL"],
  "no_task_role": "taskRoleArn" not in td,
  "execution_role": td["executionRoleArn"].endswith("role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"),
  "secrets_exactly_two": sec == ["IDENTITY_OWNER_EMAIL", "IDENTITY_OWNER_PASSWORD"],
  "secrets_from_bootstrap": all(":secret:munaxa-nonprod/identity-bootstrap:" in s["valueFrom"] for s in c[0]["secrets"]),
  "no_db_names": not ({"DIRECT_DATABASE_URL", "DATABASE_URL", "DATABASE_MIGRATION_URL"} & (set(env) | set(sec))),
  "pin_commit": env.get("PROBE_COMMIT") == C, "pin_sha256": env.get("PROBE_SHA256") == H,
  "env_names": sorted(env),
  "log_prefix": c[0]["logConfiguration"]["options"].get("awslogs-stream-prefix"),
  "log_group": c[0]["logConfiguration"]["options"].get("awslogs-group"),
  "command_has_loader": cmd.startswith("node --input-type=module -e"),
  "cpu_mem": [td.get("cpu"), td.get("memory")],
  "probe_td": f'{td["family"]}:{td["revision"]}',   # recorded as PROBE_TD for 4.2
}
result
```

Every boolean must be `true`, `log_prefix` `identity-probe`, `log_group` `/munaxa/nonprod/ops`.
Record `probe_td` as `PROBE_TD`. Phase 1 repeats this check on session day; if `probe_td` changed
since 0-6, stop and re-run the full check before any `RunTask`.
The returned data has no secret: task definitions hold secret ARNs, never values.

## 7. Phase 1: session-day read-only checks

The same as PR #87 phase A and PR #88, repeated on the day (A-1, A-2), plus:

- P-6 extended: 0 secrets named `munaxa-nonprod/identity-bootstrap` **and** 0 named
  `munaxa-nonprod/identity-operator` (first session), using `ListSecrets` with
  `IncludePlannedDeletion=True`;
- the probe definition check of step 0-6, again;
- the `TestMetricFilter` pre-checks of section 10.4;
- gate H-20 (PR #90 proposal revision 2, section 7): schedules P (at H) and S (at H + 30 min) `ENABLED` with the exact times, target and role; the daily schedule R `ENABLED`; the state machine `ACTIVE`; the last R execution `SUCCEEDED`; the failure alarm `OK` with a confirmed subscription;
- GitHub: no `aws-terraform.yml` nonprod run pending (F-10), `main` head equals the authorized
  runbook commit.

Any difference from the expected values: no dispatch, report.

## 8. Phase 2: the session

T0 is the `up` dispatch time. Every AWS call is through the connector as root unless it says
"workflow". Each step's expected result and hard stop come from the checklist (section 7 there)
unless stated.

| # | Step | Expected | Stop |
| --- | --- | --- | --- |
| S-0 | Resolve `SUBNETS` (tag `Name` = `munaxa-nonprod-public-a`, `-public-b`), `SG_DBADMIN`, `SG_MIGRATE`, `SG_IDENTITY` (group names `munaxa-nonprod-db-admin`, `-identity-migrate`, `-identity`) | 2 subnets, 3 group ids, none missing | any missing: no dispatch |
| S-1 | **Dispatch** `aws-session.yml`, ref `main`, `session=up`. Record T0. Schedule the wakes in section 14 | run green; 11 creates; DB `available` | H-1, H-2, H-3, H-4, H-7, H-8 |
| S-2 | Step 8 verification (read-only): DB `available`; ALB `munaxa-nonprod` active, internet-facing; listeners 80 and 443; service `identity` ACTIVE; Valkey HEALTHY; Identity task exits on a **database** error | as stated | H-9 |
| S-3 | `RunTask` db-admin (4.3); wait for STOPPED; exit code 0; log line read through the allow-list (10.2) | exit 0, roles line | H-4 |
| S-4 | `RunTask` identity-migrate; exit 0; `All migrations have been successfully applied.` | exit 0 | H-5 |
| S-5 | **Bootstrap credential (Option A).** PR #91 script **C-8**, one connector call: `GetRandomPassword`; `CreateSecret` `munaxa-nonprod/identity-operator`; `CreateSecret` `munaxa-nonprod/identity-bootstrap` with the same email and password; both with `alias/munaxa-nonprod-data`; if the second create fails, the persistent secret is **kept** (never force-deleted) and recovery is PR #91 script **C-8R** (rotate it in place, create the bootstrap secret, one call; only while no account exists). Returns names, ARNs and version ids only; errors as codes only (OA-2). Then **C-8v**, a separate metadata check. Record the time just before C-8 for C-24 | 2 secrets, 1 version each, data key | any value or error message in the output: H-17; a partial result: C-8v, then C-8R, then the general rule |
| S-6a | `RunTask` bootstrap, default command | exit 0; `Created … in organisation munaxa-group.` (email masked); organisation id and `sub` | H-6 |
| S-6b | `RunTask` bootstrap, `seed-control-roles.mjs` override | exit 0; roles line | H-6 |
| S-6c | `RunTask` bootstrap, `--role control-operator-admin` override | exit 0; `Assigned control-operator-admin` | H-6 |
| S-7 | `UpdateService` cluster `munaxa-nonprod`, service `identity`, `forceNewDeployment`; wait stable (poll `DescribeServices` up to 15 min); target group `munaxa-nonprod-identity` 1 healthy | COMPLETED, 1 running, healthy | H-10 |
| S-8 | **Listener configuration verification** (section 9), read-only | all checks true | H-11, H-14 |
| S-9 | **Probe:** `RunTask` exactly as 4.2; wait for STOPPED (poll `DescribeTasks`, 10 min limit); exit code; read the probe stream through the allow-list (10.2) | exit 0; 15 `PASS` lines; `SUMMARY … result=PASS`; 0 non-allow-listed lines | section 13 table |
| S-10 | **Count-only log checks** (10.3) | every count 0 | H-17 |
| S-11 | **Delete the bootstrap secret** (section 11); confirm count 0; confirm the persistent secret is present (metadata) | 0; persistent present | retry; H-15 timing still applies |
| S-12 | **Dispatch** `aws-session.yml`, `session=down`; follow both jobs | both green; 11 deletes; DB stopping | section 13 |
| S-13 | Shutdown verification (section 12) | all as listed | `down` again; report |
| S-14 | Session report (raw outputs, times, counts, task ids) in a new dated folder, docs PR, **merged only on the owner's word** | — | — |

### 8.1 Bootstrap sequence (S-3 to S-7) in one view

```
db-admin (exit 0) → migrate (exit 0) → create both secrets (metadata only)
  → bootstrap default (exit 0) → seed-control-roles (exit 0) → --role control-operator-admin (exit 0)
  → force new deployment → stable + healthy
```

- The bootstrap task injects the bootstrap secret on every run, so the secret must exist for all
  three runs and for the probe (checklist F-9).
- Bootstrap never rewrites an existing account's password ("Already bootstrapped … No password was
  written."). The persistent secret therefore stays correct only if S-5 and S-6a are in the same
  session for a new account. If S-6a reports "Already bootstrapped", **stop**: the stored password
  may not match the account. Delete the bootstrap secret, `down`, report.
- Steps S-3, S-4 and S-6 change data and cannot be undone in the session (no fix-forward).

### 8.2 Probe execution sequence (S-9) in one view

```
check override dict (4.2) → RunTask → poll DescribeTasks until STOPPED (≤ 10 min)
  → read stopCode, exit code, container reason (no environment, no overrides echoed)
  → read stream identity-probe/identity-probe/<task id> through the allow-list
  → expect 15 PASS + SUMMARY result=PASS, exit 0, non-allow-listed = 0
```

The 15 checks (workstream 1 names): `tls-certificate`, `health-live`, `health-ready`,
`session-unauthenticated`, `login`, `session-authenticated`, `jwt-verification`, `refresh`,
`logout`, `refresh-replay-after-logout`, `invalid-password`, `operator-host`,
`control-admin-path`, `control-other-path`, `unknown-host`.

Probe facts Claude relies on [P, to be confirmed by the I-1 review]:

- login and refresh both send `Origin: https://id.test.munaxa.com` and
  `"organisation":"munaxa-group"`;
- exactly one invalid-password attempt;
- TLS is verified for `id.test.munaxa.com` with SNI set and certificate checking on;
- the JWT is verified offline with the committed public key: alg ES256, kid
  `identity-nonprod-2026-11`, issuer, audience, expiry;
- output is only `PASS <check>`, `FAIL <check> <code>` and one `SUMMARY` line.

**Run the probe at most once per session.** Each run makes one valid and one invalid login for the
operator identifier, and Identity's lockout counts failures per identifier (`auth.service.ts`
333-339). The threshold was not traced (**NOT VERIFIED**). A second run is allowed only for a
loader download error before any check ran (H-18) and is recorded in the report.

## 9. Listener configuration verification (S-8)

The HTTP-to-HTTPS redirect is **configuration evidence, not a runtime test**: the probe's security
group has no egress on port 80 (section 4.2). This is recorded separately in the session report.

Connector script (read-only; returns facts, no secret exists in these responses):

```python
R = "eu-central-1"
lb = (await call_boto3(service_name="elbv2", operation_name="DescribeLoadBalancers", region_name=R,
                       params={"Names": ["munaxa-nonprod"]}))["LoadBalancers"][0]
ls = (await call_boto3(service_name="elbv2", operation_name="DescribeListeners", region_name=R,
                       params={"LoadBalancerArn": lb["LoadBalancerArn"]}))["Listeners"]
http = [l for l in ls if l["Port"] == 80]; https = [l for l in ls if l["Port"] == 443]
rules = (await call_boto3(service_name="elbv2", operation_name="DescribeRules", region_name=R,
                          params={"ListenerArn": https[0]["ListenerArn"]}))["Rules"] if https else []
cert = (await call_boto3(service_name="acm", operation_name="DescribeCertificate", region_name=R,
                         params={"CertificateArn": https[0]["Certificates"][0]["CertificateArn"]}))["Certificate"] if https else {}
d80 = http[0]["DefaultActions"][0] if http else {}
rc = d80.get("RedirectConfig", {})
result = {
  "alb": [lb["State"]["Code"], lb["Scheme"], lb["DNSName"]],
  "listener_count": len(ls),
  "http_redirect_301_to_https_443": len(http) == 1 and http[0]["Protocol"] == "HTTP" and d80.get("Type") == "redirect"
      and rc.get("Protocol") == "HTTPS" and rc.get("Port") == "443" and rc.get("StatusCode") == "HTTP_301",
  "https_policy": https[0].get("SslPolicy") if https else None,
  "https_default_404": bool(https) and https[0]["DefaultActions"][0].get("FixedResponseConfig", {}).get("StatusCode") == "404",
  "rule_priorities": sorted(r["Priority"] for r in rules),
  "cert": [cert.get("Status"), cert.get("DomainName"), sorted(cert.get("SubjectAlternativeNames", [])),
           str(cert.get("NotAfter")), lb["LoadBalancerArn"] in cert.get("InUseBy", [])],
}
result
```

Expected:

- ALB `active`, `internet-facing`; 2 listeners;
- `http_redirect_301_to_https_443` = `true` (the `edge.tf` HTTP listener: redirect, `HTTPS`,
  `443`, `HTTP_301`);
- `https_policy` = `ELBSecurityPolicy-TLS13-1-2-2021-06`; `https_default_404` = `true`;
- `rule_priorities` = `["10", "21", "39", "40", "50", "default"]` (rule 30 is absent while
  `operator_cidrs = []`);
- certificate `ISSUED`, `*.test.munaxa.com`, SANs `*.test.munaxa.com` and
  `operator-test.munaxa.com`, not expired, in use by this ALB.

Anything else: H-11 (certificate) or H-14 (unexpected resource or rule), `down`, report.

## 10. Log filtering and count-only reporting

### 10.1 Principles

- Claude never prints a raw log line it has not first passed through an allow-list.
- Where only absence matters, the connector script returns **a count only**.
- Log contents still pass through the connector's sandbox (L-A0); the controls here limit what
  reaches Claude's context, the PRs and the evidence.
- The filters are spot checks, not secret scanning (PR #87 L-F1 to L-F10, L-FV1 to L-FV3).

### 10.2 Allow-list reading of one task's stream (S-3, S-4, S-6, S-9)

```python
import re
STREAM = "<prefix>/<container>/<task id>"        # e.g. identity-probe/identity-probe/<id>
GROUP = "/munaxa/nonprod/ops"                     # migrate: /munaxa/nonprod/identity-migrate
ALLOW = {
  "identity-probe": [r"^PASS [a-z0-9-]{1,40}$", r"^FAIL [a-z0-9-]{1,40} [A-Za-z0-9_.-]{1,64}$",
                     r"^SUMMARY pass=\d{1,2} fail=\d{1,2} total=\d{1,2} result=(PASS|FAIL)$"],
  # db-admin, migrate and bootstrap: the expected lines of checklist sections 5.5 and 5.6
}["identity-probe"]
EMAIL = re.compile(r"[^\s@]+@[^\s@]+")
ev = (await call_boto3(service_name="logs", operation_name="GetLogEvents", region_name="eu-central-1",
                       params={"logGroupName": GROUP, "logStreamName": STREAM, "startFromHead": True}))["events"]
kept, other = [], 0
for e in ev:
    m = e["message"].rstrip("\n")
    if any(re.fullmatch(p, m) for p in ALLOW):
        kept.append(EMAIL.sub("<email>", m))
    else:
        other += 1
result = {"lines": kept, "other_line_count": other, "total": len(ev)}
result
```

- Probe stream: expect 16 kept lines (15 `PASS`, 1 `SUMMARY`), `other_line_count` 0. A non-zero
  `other_line_count` is **H-19** (section 13): its content is never read.
- Bootstrap and db-admin streams: the allow-list holds the expected line shapes (the checklist's
  roles line, `Created <email> in organisation munaxa-group.`, organisation and `sub` ids,
  `Assigned control-operator-admin`). The email is replaced by `<email>` before the result is
  returned, and is never written to a report (checklist 8.3).
- Paging: one stream of one short task fits in one `GetLogEvents` page; if `nextForwardToken`
  advances, read again until it repeats.

### 10.3 Count-only secret checks (S-10)

Pattern (PR #87, `02-LOG-FILTER-CORRECTION.md`, 47 of 47 on `TestMetricFilter`, accepted by
`FilterLogEvents`):

```
%eyJ|PRIVATE\sKEY|[Pp]assword\x5c?\x22\s*:\s*\x5c?\x22[^\x22\x5c\[]%
```

| Group | Window | Expected count |
| --- | --- | --- |
| `/munaxa/nonprod/identity` | T0 − 5 min to now | 0 |
| `/munaxa/nonprod/identity-migrate` | same | 0 |
| `/munaxa/nonprod/ops` (all streams, including `identity-probe`) | same | 0 |

```python
P = r"%eyJ|PRIVATE\sKEY|[Pp]assword\x5c?\x22\s*:\s*\x5c?\x22[^\x22\x5c\[]%"
out = {}
for g in ["/munaxa/nonprod/identity", "/munaxa/nonprod/identity-migrate", "/munaxa/nonprod/ops"]:
    try:
        r = await call_boto3(service_name="logs", operation_name="FilterLogEvents", region_name="eu-central-1",
                             params={"logGroupName": g, "startTime": T0_MS - 300000, "filterPattern": P})
        out[g] = {"count": len(r.get("events", [])), "streams": sorted({e["logStreamName"] for e in r.get("events", [])})}
    except ClientError as e:
        out[g] = {"error": e.response["Error"]["Code"]}
result = out
result
```

- Only counts and stream names are returned, never messages.
- An error (for example `InvalidParameterException`) is a stop, never a 0 (H-17).
- Pagination: the connector pages automatically up to 1000; a non-zero count stops anyway.

### 10.4 Pre-checks on session day (I-9, read-only)

Before S-1, `TestMetricFilter` with the pattern above on synthetic lines that include the probe's
own output shapes (`PASS login`, `FAIL refresh http-401`, `SUMMARY pass=15 fail=0 total=15
result=PASS`): all must be **not matched**. The probe's lines are designed to contain no `eyJ`, no
`PRIVATE KEY` and no `password":"`. **NOT VERIFIED** until run.

### 10.5 What the report contains

Counts, stream names, task ids, exit codes, the kept allow-listed lines with `<email>` masked,
organisation id and `sub` (public ids). Never: a log message that failed the allow-list, an email,
a cookie, a token, a password, a response body.

## 11. Secret cleanup (S-11, and on every stop path)

Use PR #91 script **C-16** [P], unchanged once reviewed. What it does:

- `DescribeSecret` on the exact name `munaxa-nonprod/identity-bootstrap`; aborts on any other name;
- `DeleteSecret` by that secret's **ARN**, `ForceDeleteWithoutRecovery`;
- waits up to 30 s for `ResourceNotFoundException`;
- `ListSecrets` with `IncludePlannedDeletion` and counts **exact** names only (the `name` filter
  is a prefix match and would also see `munaxa-nonprod/identity-operator`);
- confirms the persistent secret is present and not scheduled for deletion;
- returns `PASS` or `FAIL` with codes and counts only.

- Expected: `result` `PASS`, `describe_not_found` true, `list_count_exact` 0,
  `persistent_present` true.
- **Order on every path:** delete the bootstrap secret first, then `down`. If C-16 fails, run it
  once more; if it still fails, **dispatch `down` anyway** (PR #91 OA-5: the time limit and the
  ALB cost win), then retry C-16 and report the leftover secret as R-1. This replaces the
  checklist's "never `down` with the secret present".
- Never delete by prefix or wildcard (PR #91 OA-4).
- Only the bootstrap secret is deleted. The persistent secret is kept by owner decision.
- Not covered by this step: if Claude's session or the connector is lost, the secret stays (R-1,
  section 13). PR #90's design deletes it independently, if the owner authorizes building it.

## 12. Shutdown and verification (S-12, S-13)

1. Dispatch `aws-session.yml`, ref `main`, `session=down`. Both jobs green: the database job stops
   the database; the Testing job plans both switches false and applies 11 deletes. Two more S-1 to
   S-8 denials are expected.
2. Shutdown evidence, read-only, one connector script (no more than 10 services per script):

| Check | Expected |
| --- | --- |
| `elbv2 DescribeLoadBalancers` | 0 |
| `elbv2 DescribeTargetGroups` | 0 |
| `ecs ListServices` (`munaxa-nonprod`) | 0 |
| `ecs ListTasks` (`munaxa-nonprod`, RUNNING and PENDING) | 0 |
| `rds DescribeDBInstances` `munaxa-nonprod-pg` | `stopping` or `stopped`; recheck until `stopped` |
| `ec2 DescribeAddresses` | 0 |
| `ec2 DescribeNetworkInterfaces` with a public IP | 0 |
| `ec2 DescribeNatGateways` (available, pending) | 0 |
| `scheduler ListSchedules` prefix `munaxa-nonprod-backstop`, ENABLED | 11 |
| `secretsmanager ListSecrets` `munaxa-nonprod/identity-bootstrap`, including planned deletion | 0 |
| `secretsmanager DescribeSecret` `munaxa-nonprod/identity-operator` | present (by design) |
| `cloudtrail LookupEvents` from T0, both regions, denials | only S-1 to S-8 signatures (4 expected: 2 from `up`, 2 from `down`) |
| PR #91 **C-24** CloudTrail custody check, from the time before C-8 | only the expected secret events and readers (PR #91 section D) |

3. After H + 15 min: confirm the cleanup execution started by P ended `SUCCEEDED` (or `FAILED` / `TIMED_OUT` naming what remains, which the alarm also emails) and that P deleted itself; after H + 45 min the same for S (PR #90 proposal revision 2, sections 6 and 7).
4. Record T0, the `down` completion time (must be ≤ T0 + 3 h) and the counts.
5. Next day: Cost Explorer for the session date (PR #87 C-18).

What stays by design: task definitions (including the probe's), log groups with 14-day logs, the
certificate, the database data, the persistent operator secret.

## 13. Failure and recovery procedures

**General rule on any stop:** (1) delete the bootstrap secret if it exists (section 11); (2)
dispatch `down`; (3) run section 12; (4) report with counts and codes only. No fix-forward of data
in the session. No IAM, security-group, Terraform or DNS change in the session.

| Code | Trigger | Action |
| --- | --- | --- |
| H-1 to H-17 | As in the checklist, section 7 | As there, with the general rule above |
| H-6 note | Bootstrap failure, or "Already bootstrapped" at S-6a (8.1) | Secret first, then `down`. The persistent secret is kept but marked "unverified against the account" in the report |
| H-11 | Probe `tls-certificate` FAIL, or S-8 certificate mismatch | general rule |
| H-4 / H-10 | Probe `health-live` or `health-ready` FAIL (including a wrong kid or `cache` not `redis`) | general rule |
| H-12 | Probe `login`, `session-authenticated`, `jwt-verification`, `refresh` FAIL, or `refresh-replay-after-logout` not 401 (a security finding) | general rule. Do not configure any product with this key |
| H-12b | Probe `invalid-password` not 401 (for example 429) | general rule; **no** further login attempt; record possible lockout |
| H-13 | Probe `operator-host` not 403 | `down` **immediately**, then the secret, then section 12 |
| H-14 | Probe `control-admin-path`, `control-other-path` not 403, `unknown-host` not 404, or S-8 rule set different | general rule |
| H-18 (new) | Probe exit 3 (`FAIL probe-source <code>`: checksum or download) or exit 2 (`FAIL config`) | Checksum or config: general rule; never change the pin in the session. Download error before any check: one retry; a second failure follows the general rule |
| H-20 (new) | Any item of the cleanup gate fails before `up` (P or S not `ENABLED` with the exact time, target and role; R not `ENABLED`; state machine not `ACTIVE`; last R execution not `SUCCEEDED`; alarm not `OK` or subscription unconfirmed) (I-7) | `up` is not dispatched. Report; no AWS change |
| H-19 (new) | `other_line_count` > 0 on the probe stream | Treat as possible exposure: do not read the lines; general rule; the operator credential is treated as possibly exposed and is replaced later by a reviewed procedure (there is no reset route); report the count only |
| H-20 (new) | Probe task does not reach STOPPED in 10 min | `StopTask` (as root), then the general rule |
| C-1 | Connector sign-in expired or the connector fails | Claude posts a Reconnect card. **[OWNER]** presses it and signs in with MFA. If it is not back within 15 minutes, or by T0 + 2 h 45 min, Claude dispatches `down` through GitHub (no connector needed) and asks the owner for one console action: delete **exactly** `munaxa-nonprod/identity-bootstrap` (Secrets Manager → that secret → Actions → Delete secret; a 7-day waiting period is acceptable). **Never** `munaxa-nonprod/identity-operator`. Residual R-1 |
| C-2 | Claude's session ends mid-session | Nothing in this session can act. Layers 2 and 3 apply (section 14); R-1 and R-2. With I-7 built, PR #90's cleanup starts at the hard stop H (and again at H + 30 min and 21:05 UTC), deletes the ALB and the bootstrap secret in parallel with the database stop, and ends within 15 min |
| C-3 | GitHub dispatch refused or the integration fails | For `up`: nothing started, no action. For `down`: retry once after 2 minutes; then the owner presses Run workflow in the Actions tab (`AWS Testing session`, `main`, `down`) |
| C-4 | `down` run red | Dispatch again (the database job is separate). Then report; layer 3 stops the DB and the service at 21:00 UTC; the ALB remains until the next good `down` |
| C-5 | C-16 fails twice | `down` first (PR #91 OA-5), retry C-16 after, report R-1 |

## 14. The three-hour hard stop

| Time | Action |
| --- | --- |
| Before S-1 | Start no later than **15:30 UTC** on the authorized date |
| S-1 (T0) | Claude schedules two wakes through this session's scheduler: **T0 + 2 h 30 min** (wrap-up warning: no new step that changes data starts after this) and **T0 + 2 h 45 min** (shutdown) |
| T0 + 2 h 45 min | Whatever the state: delete the bootstrap secret (section 11), dispatch `down` |
| **T0 + 3 h, or 18:30 UTC, whichever is earlier** | **Hard stop (H-15):** `down` must have been dispatched. If not, dispatch now, before anything else |
| **H** (that hard stop) | With I-7 built: AWS starts the cleanup (schedule P) whether or not Claude is connected. The ALB and the bootstrap secret are removed in parallel with the database stop |
| H + 15 min | Cleanup deadline: P's execution has ended `SUCCEEDED`, or `FAILED` / `TIMED_OUT` with an alarm email |
| H + 30 min | Retry schedule S runs the same cleanup |
| 21:05 UTC daily | Recurring schedule R runs the same cleanup (after the unchanged 21:00 backstop) |

- The wakes exist only while this Claude session exists. They are not an independent control.
- Independent layers, and what they cannot do:
  1. the scheduled `down` at 19:17 and 01:47 UTC: GitHub can start it hours late (6 h 40 min
     observed on 11 Nov, run 42987103535) or drop it;
  2. the AWS backstop at 21:00 UTC (`backstop.tf`): stops the database and scales services to
     0; **it cannot delete the ALB and does not delete the secret**;
  3. PR #90's cleanup (revision 2) at H, H + 30 min and 21:05 UTC daily, **only once built** under Stage B; required before the first session.

## 15. Cost statement

- Running cost about US$0.09 to 0.10 an hour (list prices, first-session §8; not re-priced
  today). Expected about US$0.20 for 2 hours.
- **US$0.35 is a conditional ceiling, not a guarantee.** It holds only if Claude's session and the
  connector stay available and `down` is dispatched by T0 + 3 h.
- **If Claude loses control after `up`** and a scheduled `down` runs (19:17 or 01:47 UTC, possibly
  hours late), the cost reaches about **US$1.00** (PR #89 section G): full running cost to 21:00
  UTC, then the ALB until that `down`.
- **If Claude loses control and both scheduled `down` runs are dropped, the cost has no fixed
  upper limit** (PR #95 X-6). The 21:00 UTC backstop stops the database and scales the service to
  0, but it cannot delete the ALB, which keeps costing about US$0.89 a day (about US$27 a month)
  until someone runs `down`. Only PR #90's independent cleanup bounds this case. **Owner position,
  11 Nov 10:30 UTC: the first session should not proceed with this unbounded risk**, so I-7 is
  built first (Stage B). With it built: a lost Claude session costs about US$0.31 to 0.35 when the
  run at H succeeds, about US$0.33 to 0.40 when only the retry at H + 30 min succeeds, and about
  US$0.09 to 0.10 for each hour from T0 to 21:05 UTC when only the daily run succeeds (about
  US$0.50 to 0.56 for a 15:30 start). If the mechanism is persistently broken, the ALB still has
  no fixed upper limit, but the owner is emailed after each failed run and H-20 blocks the next
  `up`. **No design enforces a guaranteed ceiling** (PR #90 proposal revision 2, sections 8
  and 9).
- Option A adds about **US$0.40 a month** for `munaxa-nonprod/identity-operator`, outside the
  session ceiling.
- The probe task (0.25 vCPU, 512 MB, minutes) and the one-off tasks cost under US$0.02.
- Any sign of more (a second ALB, a NAT gateway, another service): H-16, `down` now.

## 16. What was done for this document

**Read:** `main` `49c51f3` (ops.tf, edge.tf, services.tf, variables.tf, envs/nonprod.tfvars,
aws-session.yml, the operator checklist); PRs #87 (`3b2e088`), #88 (`9e3cf41`), #89 (`d9d6865`);
Identity `5277d71` (`auth.service.ts` lockout, bootstrap scripts as cited); PR #90 (workstream 3,
head `79ec7be`); PR #91 (workstream 5, head `d74f317`).

**Agreed with the parallel workstreams:** the probe's environment names, check names, output
format and exit codes (workstream 1); the task definition's family, container, pin variable and
single override (workstream 2).

**Tested locally:** the `data:` URL in-memory import and hash refusal on Node 22.23.4.

**Not done:** no AWS call, no workflow dispatch, no Terraform, no secret, IAM, DNS or Cloudflare
change, no merge. The email address is not invented.
