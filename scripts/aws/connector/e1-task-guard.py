# E-1  Stage E task-definition guard: discover, validate and run the reviewed revision of a family.
#
# Stage E blocker BE-1 (report 2026-11-14-identity-stage-e-blockers-remediation, file 01). No runbook
# names a task-definition revision any more. Every Stage E task (db-admin, identity-migrate,
# identity-bootstrap, the probe, and the throwaway account's disable) goes through this script:
#
#   MODE "discover"  read-only. For FAMILY (or every family when FAMILY is ""), list the ACTIVE
#                    revisions by exact family name, describe the LATEST one and validate it against
#                    MANIFEST (envs/nonprod.stage-e-tasks.json): containers, image digests, secret
#                    names and references (bundle, key, pinned version), execution role, no task
#                    role, Fargate/awsvpc, the command, the probe pin. Records the revision number.
#   MODE "run"       FAMILY, EXPECTED_REVISION (the number discover recorded), COMMAND (a key of the
#                    family's allow-listed commands), RUN_TOKEN (fresh per run). Re-validates; refuses
#                    unless the latest ACTIVE revision is EXPECTED_REVISION and valid (a stale, newer,
#                    unknown or tampered revision fails closed); resolves the network by tags and group
#                    name; refuses when a task this guard started is still running, or the token was
#                    used; then ONE RunTask on the full revision ARN, never retried by the script.
#   MODE "status"    RUN_TOKEN (or TASK_ARN): every task started with that token, its status, stop
#                    code, exit codes, and whether each container ran the manifest's image digest.
#
# Read-only except the one RunTask. Never a secret value: task definitions carry secret ARNs only,
# and the result holds names, revision numbers, task ARNs, statuses and codes. Checked by
# sandbox_harness.py and tested against a fake AWS (test_task_guard.py). NOT RUN.

MODE = "discover"  # INPUT: discover | run | status
FAMILY = ""  # INPUT: a MANIFEST family name ("" = every family, discover only)
EXPECTED_REVISION = 0  # INPUT: run only, the revision number discover recorded
COMMAND = "default"  # INPUT: run only, a key of the family's commands
ACCOUNT_ID = ""  # INPUT: run only, the throwaway account's sub (account-disable commands)
PROBE_ALB_DNS = ""  # INPUT: run only, the session ALB's DNS name (probe)
RUN_TOKEN = ""  # INPUT: run and status, fresh per run, e.g. s3-db-admin-20261120t1200
TASK_ARN = ""  # INPUT: status only, instead of RUN_TOKEN

# --- shared helpers v1 (identical in every connector script) ---
# Sandbox rules (sandbox_harness.py check_source): no import, no dunder name, no getattr/hasattr/type,
# no print; only the pre-imported names; the last statement is the bare expression `result`.
REGION = "eu-central-1"
ACCOUNT = "229251310592"


def code_of(e):
    """An error CODE only. Never str(e) or a message: AWS and botocore messages can echo values."""
    if isinstance(e, ClientError):
        try:
            return "AWS_" + str(e.response["Error"]["Code"])[:64]
        except Exception:
            return "AWS_UNKNOWN"
    if isinstance(e, asyncio.TimeoutError):
        return "PY_TIMEOUT"
    if isinstance(e, KeyError):
        return "PY_KEY"
    if isinstance(e, (TypeError, ValueError)):
        return "PY_VALUE"
    return "PY_OTHER"


async def aws(service, operation, params, timeout=20):
    """One AWS call with a client-side time limit (the connector itself stops a run at about 60 s)."""
    return await asyncio.wait_for(
        call_boto3(service_name=service, operation_name=operation, region_name=REGION, params=params),
        timeout=timeout,
    )


async def this_account():
    """Fail closed unless the connector is signed in to the Munaxa account."""
    try:
        who = await aws("sts", "GetCallerIdentity", {})
    except Exception as e:
        return "CALLER_" + code_of(e)
    if not isinstance(who, dict) or who.get("Account") != ACCOUNT:
        return "WRONG_ACCOUNT"
    return ""
# --- end shared helpers ---

# --- manifest: envs/nonprod.stage-e-tasks.json without its description (test_task_guard.py keeps them equal) ---
MANIFEST = {
    "schema": 1,
    "region": "eu-central-1",
    "account": "229251310592",
    "cluster": "munaxa-nonprod",
    "network": {
        "vpcName": "munaxa-nonprod",
        "subnetNames": [
            "munaxa-nonprod-public-a",
            "munaxa-nonprod-public-b"
        ],
        "assignPublicIp": "ENABLED"
    },
    "families": {
        "munaxa-nonprod-db-admin": {
            "executionRole": "munaxa-nonprod-db-admin-execution",
            "taskRole": None,
            "securityGroup": "munaxa-nonprod-db-admin",
            "service": False,
            "containers": {
                "db-admin": {
                    "image": "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e",
                    "secrets": {
                        "PGUSER": {
                            "form": "rds",
                            "key": "username"
                        },
                        "PGPASSWORD": {
                            "form": "rds",
                            "key": "password"
                        },
                        "IDENTITY_APP_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "DATABASE_URL",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "IDENTITY_OWNER_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity-migrate",
                            "key": "DATABASE_MIGRATION_URL",
                            "version": "a3cc6622-df66-4787-bae7-83ccfec56ff4"
                        }
                    },
                    "entryPoint": [
                        "sh",
                        "-c"
                    ],
                    "commandLength": 4961,
                    "commandFirstLine": "#!/bin/sh"
                }
            },
            "commands": {
                "default": None
            }
        },
        "munaxa-nonprod-identity-migrate": {
            "executionRole": "munaxa-nonprod-identity-migrate-execution",
            "taskRole": None,
            "securityGroup": "munaxa-nonprod-identity-migrate",
            "service": False,
            "containers": {
                "identity-migrate": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874",
                    "secrets": {
                        "DATABASE_MIGRATION_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity-migrate",
                            "key": "DATABASE_MIGRATION_URL",
                            "version": "a3cc6622-df66-4787-bae7-83ccfec56ff4"
                        }
                    }
                }
            },
            "commands": {
                "default": None
            }
        },
        "munaxa-nonprod-identity-bootstrap": {
            "executionRole": "munaxa-nonprod-identity-bootstrap-execution",
            "taskRole": None,
            "securityGroup": "munaxa-nonprod-db-admin",
            "service": False,
            "containers": {
                "identity-bootstrap": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b",
                    "secrets": {
                        "DIRECT_DATABASE_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity-migrate",
                            "key": "DATABASE_MIGRATION_URL",
                            "version": "a3cc6622-df66-4787-bae7-83ccfec56ff4"
                        },
                        "IDENTITY_OWNER_EMAIL": {
                            "form": "partial",
                            "secret": "munaxa-nonprod/identity-bootstrap",
                            "key": "IDENTITY_OWNER_EMAIL"
                        },
                        "IDENTITY_OWNER_PASSWORD": {
                            "form": "partial",
                            "secret": "munaxa-nonprod/identity-bootstrap",
                            "key": "IDENTITY_OWNER_PASSWORD"
                        }
                    },
                    "command": [
                        "node",
                        "scripts/bootstrap-account.mjs",
                        "--organisation",
                        "munaxa-group",
                        "--organisation-name",
                        "Munaxa Group"
                    ]
                }
            },
            "commands": {
                "default": None,
                "seed-control-roles": {
                    "container": "identity-bootstrap",
                    "command": [
                        "node",
                        "scripts/seed-control-roles.mjs",
                        "--organisation",
                        "munaxa-group"
                    ]
                },
                "operator-admin-role": {
                    "container": "identity-bootstrap",
                    "command": [
                        "node",
                        "scripts/bootstrap-account.mjs",
                        "--organisation",
                        "munaxa-group",
                        "--role",
                        "control-operator-admin"
                    ]
                }
            }
        },
        "munaxa-nonprod-identity-probe": {
            "executionRole": "munaxa-nonprod-identity-bootstrap-execution",
            "taskRole": None,
            "securityGroup": "munaxa-nonprod-identity",
            "service": False,
            "containers": {
                "identity-probe": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b",
                    "secrets": {
                        "DIRECT_DATABASE_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity-migrate",
                            "key": "DATABASE_MIGRATION_URL",
                            "version": "a3cc6622-df66-4787-bae7-83ccfec56ff4"
                        }
                    },
                    "environment": {
                        "PROBE_ACCOUNT": "throwaway",
                        "PROBE_ORGANISATION": "munaxa-stage-e-checks"
                    },
                    "probePin": {
                        "commit": "",
                        "sha256": ""
                    }
                }
            },
            "commands": {
                "default": {
                    "container": "identity-probe",
                    "environment": [
                        "PROBE_ALB_DNS"
                    ]
                }
            }
        },
        "munaxa-nonprod-identity": {
            "executionRole": "munaxa-nonprod-identity-execution",
            "taskRole": None,
            "securityGroup": "munaxa-nonprod-identity",
            "service": True,
            "containers": {
                "identity": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b",
                    "secrets": {
                        "DATABASE_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "DATABASE_URL",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "IDENTITY_SIGNING_PRIVATE_KEY": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "IDENTITY_SIGNING_PRIVATE_KEY",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "IDENTITY_SIGNING_SECRET": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "IDENTITY_SIGNING_SECRET",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "REDIS_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "REDIS_URL",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "REDIS_PASSWORD": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "REDIS_PASSWORD",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        },
                        "MFA_ENCRYPTION_KEYS": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "MFA_ENCRYPTION_KEYS",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        }
                    }
                },
                "valkey": {
                    "image": "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e",
                    "secrets": {
                        "REDIS_PASSWORD": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity",
                            "key": "REDIS_PASSWORD",
                            "version": "80914756-68cd-420d-8094-0fd49afe3492"
                        }
                    }
                }
            },
            "commands": {
                "account-disable-plan": {
                    "container": "identity",
                    "command": [
                        "node",
                        "dist/ops/operator-cli.js",
                        "account-disable",
                        "--organisation",
                        "munaxa-stage-e-checks",
                        "--account-id",
                        "{ACCOUNT_ID}",
                        "--reference",
                        "stage-e-throwaway"
                    ]
                },
                "account-disable": {
                    "container": "identity",
                    "command": [
                        "node",
                        "dist/ops/operator-cli.js",
                        "account-disable",
                        "--organisation",
                        "munaxa-stage-e-checks",
                        "--account-id",
                        "{ACCOUNT_ID}",
                        "--reference",
                        "stage-e-throwaway",
                        "--apply"
                    ]
                }
            }
        }
    }
}
# --- end manifest ---

TOKEN_SHAPE = re.compile(r"^[a-z0-9][a-z0-9-]{7,35}$")
UUID_SHAPE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ALB_SHAPE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}\.eu-central-1\.elb\.amazonaws\.com$")
DIGEST_SHAPE = re.compile(r"@sha256:([0-9a-f]{64})$")
TD_PREFIX = "arn:aws:ecs:" + REGION + ":" + ACCOUNT + ":task-definition/"
SM_PREFIX = "arn:aws:secretsmanager:" + REGION + ":" + ACCOUNT + ":secret:"
ROLE_PREFIX = "arn:aws:iam::" + ACCOUNT + ":role/munaxa-shared/"
STARTED_BY_PREFIX = "stage-e-"


def secret_ok(spec, value_from):
    """The exact reference form for one secret (the Terraform test checks the same forms)."""
    if not isinstance(value_from, str) or not value_from.startswith(SM_PREFIX):
        return False
    rest = value_from[len(SM_PREFIX):]
    form = spec.get("form")
    if form == "full":
        head = spec["secret"] + "-"
        tail = ":" + spec["key"] + "::" + spec["version"]
        middle = rest[len(head):len(rest) - len(tail)] if rest.startswith(head) and rest.endswith(tail) else ""
        return re.fullmatch(r"[A-Za-z0-9]{6}", middle) is not None and len(spec["version"]) == 36
    if form == "partial":
        return rest == spec["secret"] + ":" + spec["key"] + "::"
    if form == "rds":
        return re.fullmatch(r"rds!db-[0-9a-f-]{36}-[A-Za-z0-9]{6}:" + re.escape(spec["key"]) + "::", rest) is not None
    return False


def validate(family, td):
    """Every difference from MANIFEST, as short codes (never a value)."""
    spec = MANIFEST["families"][family]
    p = []
    if not isinstance(td, dict):
        return ["malformed"]
    if td.get("family") != family:
        p.append("family")
    if td.get("status") != "ACTIVE":
        p.append("not-active")
    if td.get("executionRoleArn") != ROLE_PREFIX + spec["executionRole"]:
        p.append("execution-role")
    if td.get("taskRoleArn") not in (None, ""):
        p.append("task-role")
    if "FARGATE" not in (td.get("requiresCompatibilities") or []) or td.get("networkMode") != "awsvpc":
        p.append("launch")
    containers = td.get("containerDefinitions")
    if not isinstance(containers, list):
        return p + ["containers-malformed"]
    names = sorted(str(c.get("name")) for c in containers if isinstance(c, dict))
    if names != sorted(spec["containers"].keys()) or len(names) != len(containers):
        return p + ["container-names"]
    for c in containers:
        cs = spec["containers"][c["name"]]
        tag = c["name"] + ":"
        if c.get("image") != cs["image"] or not DIGEST_SHAPE.search(str(c.get("image"))):
            p.append(tag + "image")
        refs = c.get("secrets") or []
        got = {}
        for s in refs:
            if isinstance(s, dict) and isinstance(s.get("name"), str):
                got[s["name"]] = s.get("valueFrom")
        if sorted(got.keys()) != sorted(cs["secrets"].keys()) or len(got) != len(refs):
            p.append(tag + "secret-names")
        else:
            for name in sorted(got.keys()):
                if not secret_ok(cs["secrets"][name], got[name]):
                    p.append(tag + "secret-ref:" + name)
        if "command" in cs and c.get("command") != cs["command"]:
            p.append(tag + "command")
        if "entryPoint" in cs:
            cmd = c.get("command")
            if c.get("entryPoint") != cs["entryPoint"] or not isinstance(cmd, list) or len(cmd) != 1:
                p.append(tag + "command")
            elif len(cmd[0]) != cs["commandLength"] or not cmd[0].startswith(cs["commandFirstLine"]):
                p.append(tag + "command")
        if "environment" in cs or "probePin" in cs:
            env = {}
            for e in c.get("environment") or []:
                if isinstance(e, dict):
                    env[str(e.get("name"))] = e.get("value")
            for name, value in (cs.get("environment") or {}).items():
                if env.get(name) != value:
                    p.append(tag + "env:" + name)
            pin = cs.get("probePin")
            if pin is not None:
                if not re.fullmatch(r"[0-9a-f]{40}", pin["commit"]) or not re.fullmatch(r"[0-9a-f]{64}", pin["sha256"]):
                    p.append(tag + "probe-not-pinned-in-manifest")
                else:
                    cmd = c.get("command") or []
                    loader = cmd[3] if isinstance(cmd, list) and len(cmd) == 4 else ""
                    if cmd[:3] != ["node", "--input-type=module", "-e"] or ("const COMMIT = '" + pin["commit"] + "';") not in loader \
                            or ("const SHA256 = '" + pin["sha256"] + "';") not in loader:
                        p.append(tag + "probe-pin")
                    if env.get("PROBE_COMMIT") != pin["commit"] or env.get("PROBE_SHA256") != pin["sha256"]:
                        p.append(tag + "env:probe-pin")
    return p


async def active_revisions(family):
    """Revision numbers of the ACTIVE task definitions whose family is exactly `family`."""
    revisions, token = [], None
    for _ in range(10):
        params = {"familyPrefix": family, "status": "ACTIVE", "sort": "DESC", "maxResults": 100}
        if token:
            params["nextToken"] = token
        r = await aws("ecs", "ListTaskDefinitions", params)
        arns = r.get("taskDefinitionArns")
        if not isinstance(arns, list):
            raise ValueError("shape")
        for arn in arns:
            arn = str(arn)
            if arn.startswith(TD_PREFIX + family + ":"):
                number = arn[len(TD_PREFIX + family + ":"):]
                if re.fullmatch(r"[1-9][0-9]{0,6}", number):
                    revisions.append(int(number))
        token = r.get("nextToken")
        if not token:
            return sorted(set(revisions), reverse=True)
    raise ValueError("too-many-pages")


async def discover_one(family):
    out = {"family": family, "valid": False}
    try:
        revisions = await active_revisions(family)
    except Exception as e:
        out["error"] = "LIST_" + code_of(e)
        return out
    out["active_revisions"] = revisions
    if not revisions:
        out["error"] = "NO_ACTIVE_REVISION"
        return out
    latest = revisions[0]
    out["latest"] = latest
    try:
        d = await aws("ecs", "DescribeTaskDefinition", {"taskDefinition": TD_PREFIX + family + ":" + str(latest)})
        td = d["taskDefinition"]
    except Exception as e:
        out["error"] = "DESCRIBE_" + code_of(e)
        return out
    if not isinstance(td, dict) or td.get("revision") != latest or td.get("taskDefinitionArn") != TD_PREFIX + family + ":" + str(latest):
        out["error"] = "DESCRIBE_MISMATCH"
        return out
    out["problems"] = validate(family, td)
    out["valid"] = not out["problems"]
    return out


async def network(family):
    spec, net = MANIFEST["families"][family], MANIFEST["network"]
    vpcs = (await aws("ec2", "DescribeVpcs", {"Filters": [{"Name": "tag:Name", "Values": [net["vpcName"]]}]})).get("Vpcs") or []
    if len(vpcs) != 1:
        return None, "VPC_COUNT_" + str(len(vpcs))
    vpc = vpcs[0]["VpcId"]
    subnets = (await aws("ec2", "DescribeSubnets", {"Filters": [
        {"Name": "vpc-id", "Values": [vpc]}, {"Name": "tag:Name", "Values": net["subnetNames"]}]})).get("Subnets") or []
    if len(subnets) != len(net["subnetNames"]):
        return None, "SUBNET_COUNT_" + str(len(subnets))
    groups = (await aws("ec2", "DescribeSecurityGroups", {"Filters": [
        {"Name": "vpc-id", "Values": [vpc]}, {"Name": "group-name", "Values": [spec["securityGroup"]]}]})).get("SecurityGroups") or []
    if len(groups) != 1:
        return None, "GROUP_COUNT_" + str(len(groups))
    return {"awsvpcConfiguration": {"subnets": sorted(s["SubnetId"] for s in subnets),
                                    "securityGroups": [groups[0]["GroupId"]], "assignPublicIp": net["assignPublicIp"]}}, ""


async def tasks_started_by(token):
    """Task ARNs started with this guard's token, running or stopped."""
    arns = []
    for status in ("RUNNING", "STOPPED"):
        r = await aws("ecs", "ListTasks", {"cluster": MANIFEST["cluster"], "startedBy": STARTED_BY_PREFIX + token, "desiredStatus": status})
        found = r.get("taskArns")
        if not isinstance(found, list):
            raise ValueError("shape")
        arns.extend(str(a) for a in found)
    return sorted(set(arns))


async def guard_running(family):
    """Tasks of this family started by the guard and still running (a service's own tasks excluded)."""
    r = await aws("ecs", "ListTasks", {"cluster": MANIFEST["cluster"], "family": family, "desiredStatus": "RUNNING"})
    arns = r.get("taskArns")
    if not isinstance(arns, list):
        raise ValueError("shape")
    if not arns:
        return []
    d = await aws("ecs", "DescribeTasks", {"cluster": MANIFEST["cluster"], "tasks": arns[:100]})
    running = []
    for t in d.get("tasks") or []:
        started = str(t.get("startedBy", ""))
        if started.startswith(STARTED_BY_PREFIX) or not MANIFEST["families"][family]["service"]:
            running.append(str(t.get("taskArn")))
    return running


def overrides_for(family, key):
    """The allow-listed override for COMMAND, with its one validated input, or an error code."""
    commands = MANIFEST["families"][family]["commands"]
    if key not in commands:
        return None, "COMMAND_NOT_ALLOWED"
    spec = commands[key]
    if spec is None:
        if ACCOUNT_ID or PROBE_ALB_DNS:
            return None, "UNUSED_INPUT"
        return {}, ""
    container = {"name": spec["container"]}
    if "command" in spec:
        if "{ACCOUNT_ID}" in spec["command"]:
            if not UUID_SHAPE.match(ACCOUNT_ID):
                return None, "ACCOUNT_ID_SHAPE"
        elif ACCOUNT_ID:
            return None, "UNUSED_INPUT"
        container["command"] = [ACCOUNT_ID if part == "{ACCOUNT_ID}" else part for part in spec["command"]]
    elif ACCOUNT_ID:
        return None, "UNUSED_INPUT"
    if spec.get("environment") == ["PROBE_ALB_DNS"]:
        if not ALB_SHAPE.match(PROBE_ALB_DNS):
            return None, "ALB_DNS_SHAPE"
        container["environment"] = [{"name": "PROBE_ALB_DNS", "value": PROBE_ALB_DNS}]
    elif PROBE_ALB_DNS:
        return None, "UNUSED_INPUT"
    return {"containerOverrides": [container]}, ""


async def run():
    if FAMILY not in MANIFEST["families"]:
        return {"result": "ABORT", "code": "UNKNOWN_FAMILY"}
    if not isinstance(EXPECTED_REVISION, int) or EXPECTED_REVISION < 1:
        return {"result": "ABORT", "code": "EXPECTED_REVISION_NOT_SET"}
    if not TOKEN_SHAPE.match(RUN_TOKEN):
        return {"result": "ABORT", "code": "RUN_TOKEN_SHAPE"}
    overrides, problem = overrides_for(FAMILY, COMMAND)
    if problem:
        return {"result": "ABORT", "code": problem}
    found = await discover_one(FAMILY)
    if "error" in found:
        return {"result": "ABORT", "code": found["error"], "family": FAMILY}
    if found["latest"] != EXPECTED_REVISION:
        return {"result": "ABORT", "code": "REVISION_NOT_EXPECTED", "latest": found["latest"], "expected": EXPECTED_REVISION}
    if not found["valid"]:
        return {"result": "ABORT", "code": "REVISION_INVALID", "revision": found["latest"], "problems": found["problems"]}
    try:
        used = await tasks_started_by(RUN_TOKEN)
        running = await guard_running(FAMILY)
        net, problem = await network(FAMILY)
    except Exception as e:
        return {"result": "ABORT", "code": "PRECHECK_" + code_of(e)}
    if used:
        return {"result": "ABORT", "code": "RUN_TOKEN_ALREADY_USED", "tasks": used}
    if running:
        return {"result": "ABORT", "code": "ALREADY_RUNNING", "tasks": running}
    if problem:
        return {"result": "ABORT", "code": problem}
    arn = TD_PREFIX + FAMILY + ":" + str(EXPECTED_REVISION)
    params = {"cluster": MANIFEST["cluster"], "taskDefinition": arn, "launchType": "FARGATE", "count": 1,
              "startedBy": STARTED_BY_PREFIX + RUN_TOKEN, "clientToken": RUN_TOKEN, "networkConfiguration": net}
    if overrides:
        params["overrides"] = overrides
    try:
        r = await aws("ecs", "RunTask", params, timeout=30)
    except Exception as e:
        code = code_of(e)
        if code == "PY_TIMEOUT":
            # The task may have started. Never retried here: status with RUN_TOKEN tells.
            return {"result": "UNKNOWN", "code": code, "next": "status with the same RUN_TOKEN", "task_definition": arn}
        return {"result": "FAIL", "code": "RUNTASK_" + code, "task_definition": arn}
    tasks = r.get("tasks") if isinstance(r, dict) else None
    failures = r.get("failures") if isinstance(r, dict) else None
    if failures:
        reasons = sorted(set(str(f.get("reason", "?"))[:64] for f in failures if isinstance(f, dict)))
        return {"result": "FAIL", "code": "RUNTASK_FAILURES", "reasons": reasons, "task_definition": arn}
    if not isinstance(tasks, list) or len(tasks) != 1 or not str(tasks[0].get("taskArn", "")).startswith(
            "arn:aws:ecs:" + REGION + ":" + ACCOUNT + ":task/" + MANIFEST["cluster"] + "/"):
        return {"result": "UNKNOWN", "code": "RUNTASK_MALFORMED", "next": "status with the same RUN_TOKEN", "task_definition": arn}
    return {"result": "STARTED", "task": tasks[0]["taskArn"], "task_definition": arn, "command": COMMAND}


def reason_class(text):
    """The leading class of a stop reason (e.g. ResourceInitializationError), never the message."""
    m = re.match(r"[A-Za-z][A-Za-z ]{0,48}", str(text or ""))
    return m.group(0).strip() if m else ""


async def status():
    if TASK_ARN:
        if not re.fullmatch(r"arn:aws:ecs:" + REGION + ":" + ACCOUNT + r":task/munaxa-nonprod/[0-9a-f]{32}", TASK_ARN):
            return {"result": "ABORT", "code": "TASK_ARN_SHAPE"}
        arns = [TASK_ARN]
    else:
        if not TOKEN_SHAPE.match(RUN_TOKEN):
            return {"result": "ABORT", "code": "RUN_TOKEN_SHAPE"}
        try:
            arns = await tasks_started_by(RUN_TOKEN)
        except Exception as e:
            return {"result": "FAIL", "code": "LIST_" + code_of(e)}
        if not arns:
            return {"result": "NOT_STARTED", "run_token": RUN_TOKEN}
    try:
        d = await aws("ecs", "DescribeTasks", {"cluster": MANIFEST["cluster"], "tasks": arns})
    except Exception as e:
        return {"result": "FAIL", "code": "DESCRIBE_" + code_of(e)}
    out = []
    for t in d.get("tasks") or []:
        td = str(t.get("taskDefinitionArn", ""))
        family = td[len(TD_PREFIX):].rsplit(":", 1)[0] if td.startswith(TD_PREFIX) else ""
        spec = MANIFEST["families"].get(family)
        containers = []
        for c in t.get("containers") or []:
            name = str(c.get("name"))
            expected = spec["containers"].get(name, {}).get("image", "") if spec else ""
            m = DIGEST_SHAPE.search(expected)
            containers.append({"name": name, "exitCode": c.get("exitCode"), "lastStatus": c.get("lastStatus"),
                               "digest_ok": bool(m) and c.get("imageDigest") == "sha256:" + m.group(1)})
        out.append({"task": t.get("taskArn"), "task_definition": td, "known_family": spec is not None,
                    "lastStatus": t.get("lastStatus"), "desiredStatus": t.get("desiredStatus"),
                    "stopCode": t.get("stopCode"), "stoppedReasonClass": reason_class(t.get("stoppedReason")),
                    "containers": containers})
    done = all(x["lastStatus"] == "STOPPED" for x in out) and len(out) == len(arns)
    ok = done and all(x["known_family"] and x["stopCode"] == "EssentialContainerExited"
                      and all(c["digest_ok"] for c in x["containers"])
                      and all(c["exitCode"] == 0 for c in x["containers"] if c["name"] != "valkey") for x in out)
    return {"result": ("SUCCEEDED" if ok else "FAILED") if done else "IN_PROGRESS", "tasks": out}


async def e1():
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    if MODE == "discover":
        if FAMILY and FAMILY not in MANIFEST["families"]:
            return {"result": "ABORT", "code": "UNKNOWN_FAMILY"}
        families = [FAMILY] if FAMILY else sorted(MANIFEST["families"].keys())
        found = [await discover_one(f) for f in families]
        return {"result": "PASS" if all(f["valid"] for f in found) else "FAIL", "families": found}
    if MODE == "run":
        return await run()
    if MODE == "status":
        return await status()
    return {"result": "ABORT", "code": "UNKNOWN_MODE"}


try:
    result = await e1()
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e)}
result
