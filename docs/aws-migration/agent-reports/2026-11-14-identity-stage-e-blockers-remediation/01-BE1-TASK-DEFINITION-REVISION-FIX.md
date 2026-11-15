# BE-1: no hard-coded task-definition revision

Status: **RESOLVED IN THE REPOSITORY.** Nothing run against AWS.

## 1. The defect

The 11 Nov operator checklist and final operator runbook started every task as `<family>:1`
(checklist steps 10, 11, 13 and lines 285 to 310; runbook §4.3 S-3, S-4, S-6a and the step 0-6
script). Every task definition here has `skip_destroy = true`, so each apply that changes one
registers a new revision and leaves the old one ACTIVE. Revision 1 predates the stage D apply of
13 Nov; PR #129 found the Identity revision 1 definitions still carry the 5277d71-era image. Running
`:1` would run superseded code against the Testing database with nothing to stop it.

## 2. The fix

| Piece | File | What it does |
| --- | --- | --- |
| Manifest | `infra/aws/stack/envs/nonprod.stage-e-tasks.json` | The reviewed content of the five families Stage E runs (`db-admin`, `identity-migrate`, `identity-bootstrap`, `identity-probe`, `identity`), with **no revision number**: containers, image digests, every secret's name and exact reference (bundle, JSON key, pinned version; the one-run secret's partial ARN; the RDS master secret's keys), execution role, security group, task volumes, and per container the exact environment names, the shape fields (`shapeKeys`: entryPoint, user, capabilities, read-only root, mounts, dependsOn, health check, logging, …) and the command (exact, or the SHA-256 of db-admin's script and of the probe loader), the probe pin, and the allow-listed command overrides |
| Guard | `scripts/aws/connector/e1-task-guard.py` | A connector script (sandbox rules, see file 05) with three modes, below |
| Terraform cross-check | `infra/aws/stack/tests/stage-e-manifest.tftest.hcl` | Renders the five task definitions with the manifest's values and asserts container names, images, secret names and reference forms, run-only family names, execution roles, the db-admin group, every container's environment names, shape fields and command, the loader and db-admin hashes, and the probe volume equal the manifest, and that no container has a shape field the manifest does not list. Mutation-checked: changing a secret version, a key name, the organisation name or one shape field in the manifest fails it |
| Python cross-check | `scripts/aws/connector/test_task_guard.py` | The script's embedded manifest equals the JSON file; the manifest's images, secret versions and probe pin equal `envs/nonprod.tfvars`; the db-admin and loader hashes are the committed files' SHA-256; the script's plain-Python SHA-256 equals `hashlib`; module family, role and group names follow `modules/service` |
| Lint | same file, `NoRevisionNumbers` | Fails if any file under `scripts/`, `infra/`, `.github/` or the three live Stage E report folders names `munaxa-nonprod-<family>:<digit>`, `$C-<family>:<digit>` or `run_one …:<digit>` |
| Runbooks | the 11 Nov checklist and final runbook | A correction banner; every `:1` became `:<E1>` ("the revision E-1 discover reported and validated in the same session"); the 71d01fdf image line is marked superseded |

## 3. The guard (E-1)

- **`discover`** (read-only). `ListTaskDefinitions(familyPrefix, status ACTIVE)`, keeps only ARNs
  whose family is *exactly* the requested one (the prefix `munaxa-nonprod-identity` also matches
  `-identity-migrate`, `-identity-bootstrap`, `-identity-probe`; a test proves they never mix),
  takes the highest revision, `DescribeTaskDefinition` on its full ARN, and checks that the
  returned ARN and revision are the requested ones. Then it validates against the manifest and
  returns `{family, latest, active_revisions, valid, problems}`. Problems are short codes such as
  `identity-bootstrap:image`, `…:secret-ref:DIRECT_DATABASE_URL`, `execution-role`, `task-role`,
  `launch`, `namespaces`, `volumes`, `…:env-names`, `…:shape`, `…:command`, `…:unexpected-source`,
  `…:probe-pin`, `…:probe-loader`, `…:probe-not-pinned-in-manifest`. A revision with an added
  `entryPoint`, command, `NODE_OPTIONS`, capability, mount or environment file fails (review
  findings S-2 and C-4). The connector sandbox has no hashing module, so the script carries a
  plain-Python SHA-256 (tested against `hashlib`).
- **`run`**. Inputs: `FAMILY`, `EXPECTED_REVISION` (the number `discover` recorded), `COMMAND` (a
  key of the family's allow list), `RUN_TOKEN` (fresh per run), and only where the command needs
  one, `ACCOUNT_ID` (UUID) or `PROBE_ALB_DNS` (an `eu-central-1` ELB name). It refuses unless the
  latest ACTIVE revision **is** `EXPECTED_REVISION` and valid (a stale revision, a newer one
  registered since, or a tampered one fails closed), unless the network resolves exactly (one VPC
  by tag, both public subnets by tag, one security group by name), unless no task this guard
  started for the family is still running (a service's own task does not block a one-off), and
  unless the token was never used. Tasks are found with `ListTasks` by family and desired status
  and then `DescribeTasks`, never with a `startedBy` filter combined with another filter (the ECS
  reference allows `startedBy` only alone; review finding C-2). Then exactly one `RunTask` on the **full revision ARN**,
  `startedBy = stage-e-<token>`, `clientToken = <token>`, `assignPublicIp ENABLED`, and the
  allow-listed override only. A timeout returns `UNKNOWN` and is never retried by the script;
  `status` with the same token tells.
- **`status`**. Every task started with the token (or one `TASK_ARN`): last and desired status,
  stop code, the stop reason's leading class only (for example `ResourceInitializationError`;
  never the message, which can name a secret ARN), exit codes, and whether each container ran
  the manifest's image digest. `SUCCEEDED` needs every task stopped with
  `EssentialContainerExited`, exit code 0 and the expected digest in every container (the probe's
  account container included). ECS lists a stopped task for about an hour only, so after that
  `status` answers `NOT_FOUND` / `NOT_LISTED_MAY_HAVE_EXPIRED`, never "not started": it is never a
  reason to run a migration or bootstrap again (review finding C-3); use `TASK_ARN` or the log
  stream, and record every task ARN in the session log.

Allow-listed commands (nothing else can be passed):

| Family | `COMMAND` | Override |
| --- | --- | --- |
| db-admin, identity-migrate | `default` | none |
| identity-bootstrap | `default`, `seed-control-roles`, `operator-admin-role` | the two 11 Nov command overrides, verbatim |
| identity-probe | `default` | environment `PROBE_ALB_DNS` only |
| identity | `account-disable-plan`, `account-disable` | `operator-cli account-disable --organisation munaxa-stage-e-checks --account-id <UUID> --reference stage-e-throwaway [--apply]` |

## 4. How to select a revision (procedure for Stage E and later sessions)

1. E-1 `MODE = "discover"`, `FAMILY = ""`. Every family must be `valid: true`. Record each
   `latest` as `<E1>` for that family in the session log.
2. Any `valid: false`: stop. The problems name the difference. Fix it by a PR (manifest or
   Terraform) and an owner-approved apply; never by choosing an older revision.
3. Start each task with E-1 `MODE = "run"`, `EXPECTED_REVISION = <E1>` of that family. If a
   configuration apply happened since step 1, `run` refuses with `REVISION_NOT_EXPECTED`; repeat
   step 1.
4. After every configuration PR that changes a Stage E task definition, update the manifest in the
   same PR: the Terraform and Python tests fail until it matches.
5. The probe family is refused until the pin PR sets `identity_probe_source` in
   `envs/nonprod.tfvars` **and** `probePin` in the manifest (the Python test keeps them equal).

## 5. Tests

`test_task_guard.py`, 38 tests: manifest equalities and the SHA-256 implementation (6), discover
(11: reviewed revision passes, prefix isolation, the BE-1 stale case, twelve kinds of drift
including `NODE_OPTIONS`, an added `entryPoint`, `pidMode`, a host volume and an environment file,
ten shape and command drifts across every family, seven probe-task drifts including a tampered
loader in either container, partial vs full references, both service containers, unpinned and
pinned probe, missing/malformed/denied/mismatched answers, wrong account), run (14: one RunTask on the full ARN, allow-listed overrides, the disable command's
UUID, the probe's ALB name, unused inputs, stale and newer revisions, invalid revision, input
shapes, duplicate token and running task, the service's own task, exact network lookups, a
timeout never retried, denial/failures/malformed answers, a denied precheck), status (4), and the
revision lint (2). Plus `stage-e-manifest.tftest.hcl` (1 run, 4 assertions).

## 6. Limits

- [U] `RunTask`'s `clientToken` parameter (ECS API, documented) has not been exercised through
  the connector; if the sandbox's boto3 refuses it, `run` fails closed (`RUNTASK_PY_*`) and a PR
  removes it (the `startedBy` token check still prevents a duplicate).
- Environment **values** are compared only where the manifest lists them (the probe's account,
  organisation, stage and hand-off directory); every container's environment **names** are
  compared exactly. A changed value of an existing variable (for example a host name) is not
  caught; it cannot add code to run (accepted Low, file 06).
- [U] `DescribeTaskDefinition` is assumed to return the shape fields as Terraform wrote them,
  apart from empty defaults (which the guard ignores). If it returns a field differently, discover
  reports `…:shape` and fails closed; the fix is a manifest PR, never an older revision.
