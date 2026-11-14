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
#                    role, Fargate/awsvpc, no shared namespaces, the task volumes, and per container
#                    the exact set of environment names, the shape fields (entryPoint, user,
#                    capabilities, read-only root, mounts, dependsOn, health check, logging) and the
#                    command (exact, or by SHA-256 for db-admin's script and the probe loader, with the
#                    probe pin). Records the revision number.
#   MODE "run"       FAMILY, EXPECTED_REVISION (the number discover recorded), COMMAND (a key of the
#                    family's allow-listed commands), RUN_TOKEN (fresh per run). Re-validates; refuses
#                    unless the latest ACTIVE revision is EXPECTED_REVISION and valid (a stale, newer,
#                    unknown or tampered revision fails closed); resolves the network by tags and group
#                    name; refuses when a task this guard started is still running, or the token was
#                    used; then ONE RunTask on the full revision ARN, never retried by the script.
#   MODE "status"    RUN_TOKEN (or TASK_ARN): every task started with that token, its status, stop
#                    code, exit codes, and whether each container ran the manifest's image digest.
#                    ECS lists a stopped task for about an hour only: NOT_FOUND after that is not
#                    proof that nothing ran (use TASK_ARN, or the log stream), and never a reason to
#                    run a migration or bootstrap again.
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
            "task": {
                "cpu": "256",
                "memory": "512",
                "runtimePlatform": {
                    "cpuArchitecture": "X86_64",
                    "operatingSystemFamily": "LINUX"
                }
            },
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
                    "environmentNames": [
                        "HOME",
                        "PGHOST",
                        "PGPORT"
                    ],
                    "shape": {
                        "essential": True,
                        "user": "999:999",
                        "readonlyRootFilesystem": True,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "entryPoint": [
                            "sh",
                            "-c"
                        ],
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/ops",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "db-admin"
                            }
                        }
                    },
                    "commandSha256": "de2ea694d627845d1ca0cc97fbb6a1be3a04ca7787ce9c4feff7aec8671221ee",
                    "environment": {
                        "HOME": "/tmp",
                        "PGHOST": "munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com",
                        "PGPORT": "5432"
                    }
                }
            },
            "commands": {
                "default": None
            },
            "volumes": []
        },
        "munaxa-nonprod-identity-migrate": {
            "executionRole": "munaxa-nonprod-identity-migrate-execution",
            "taskRole": None,
            "task": {
                "cpu": "256",
                "memory": "512",
                "runtimePlatform": {
                    "cpuArchitecture": "X86_64",
                    "operatingSystemFamily": "LINUX"
                }
            },
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
                    },
                    "environmentNames": [
                        "NODE_ENV"
                    ],
                    "shape": {
                        "essential": True,
                        "readonlyRootFilesystem": False,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/identity-migrate",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "identity-migrate"
                            }
                        }
                    },
                    "environment": {
                        "NODE_ENV": "production"
                    }
                }
            },
            "commands": {
                "default": None
            },
            "volumes": []
        },
        "munaxa-nonprod-identity-bootstrap": {
            "executionRole": "munaxa-nonprod-identity-bootstrap-execution",
            "taskRole": None,
            "task": {
                "cpu": "256",
                "memory": "512",
                "runtimePlatform": {
                    "cpuArchitecture": "X86_64",
                    "operatingSystemFamily": "LINUX"
                }
            },
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
                    "environmentNames": [
                        "NODE_ENV"
                    ],
                    "shape": {
                        "essential": True,
                        "readonlyRootFilesystem": True,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/ops",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "identity-bootstrap"
                            }
                        }
                    },
                    "command": [
                        "node",
                        "scripts/bootstrap-account.mjs",
                        "--organisation",
                        "munaxa-group",
                        "--organisation-name",
                        "Munaxa Group"
                    ],
                    "environment": {
                        "NODE_ENV": "production"
                    }
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
            },
            "volumes": []
        },
        "munaxa-nonprod-identity-probe": {
            "executionRole": "munaxa-nonprod-identity-bootstrap-execution",
            "taskRole": None,
            "task": {
                "cpu": "256",
                "memory": "512",
                "runtimePlatform": {
                    "cpuArchitecture": "X86_64",
                    "operatingSystemFamily": "LINUX"
                }
            },
            "securityGroup": "munaxa-nonprod-identity",
            "service": False,
            "containers": {
                "throwaway-account": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b",
                    "secrets": {
                        "DIRECT_DATABASE_URL": {
                            "form": "full",
                            "secret": "munaxa-nonprod/identity-migrate",
                            "key": "DATABASE_MIGRATION_URL",
                            "version": "a3cc6622-df66-4787-bae7-83ccfec56ff4"
                        }
                    },
                    "environmentNames": [
                        "NODE_ENV",
                        "PROBE_ACCOUNT",
                        "PROBE_HANDOFF_DIR",
                        "PROBE_STAGE"
                    ],
                    "shape": {
                        "essential": False,
                        "user": "0",
                        "readonlyRootFilesystem": True,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "mountPoints": [
                            {
                                "containerPath": "/stage-e",
                                "readOnly": False,
                                "sourceVolume": "stage-e-handoff"
                            }
                        ],
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/ops",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "identity-probe"
                            }
                        }
                    },
                    "probeLoader": True,
                    "environment": {
                        "NODE_ENV": "production",
                        "PROBE_ACCOUNT": "throwaway",
                        "PROBE_HANDOFF_DIR": "/stage-e",
                        "PROBE_STAGE": "account"
                    },
                    "extra": {
                        "stopTimeout": 10
                    }
                },
                "identity-probe": {
                    "image": "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b",
                    "secrets": {},
                    "environmentNames": [
                        "NODE_ENV",
                        "PROBE_ACCOUNT",
                        "PROBE_AUDIENCES",
                        "PROBE_COMMIT",
                        "PROBE_CONTROL_API_HOST",
                        "PROBE_HANDOFF_DIR",
                        "PROBE_HOST",
                        "PROBE_ISSUER",
                        "PROBE_OPERATOR_HOST",
                        "PROBE_ORGANISATION",
                        "PROBE_PUBLIC_KEYS",
                        "PROBE_SHA256",
                        "PROBE_SIGNING_KID",
                        "PROBE_STAGE",
                        "PROBE_UNKNOWN_HOST"
                    ],
                    "shape": {
                        "essential": True,
                        "readonlyRootFilesystem": True,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "dependsOn": [
                            {
                                "condition": "SUCCESS",
                                "containerName": "throwaway-account"
                            }
                        ],
                        "mountPoints": [
                            {
                                "containerPath": "/stage-e",
                                "readOnly": True,
                                "sourceVolume": "stage-e-handoff"
                            }
                        ],
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/ops",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "identity-probe"
                            }
                        }
                    },
                    "probeLoader": True,
                    "environment": {
                        "NODE_ENV": "production",
                        "PROBE_ACCOUNT": "throwaway",
                        "PROBE_AUDIENCES": "munaxa-work,munaxa-control",
                        "PROBE_CONTROL_API_HOST": "control-api.test.munaxa.com",
                        "PROBE_HANDOFF_DIR": "/stage-e",
                        "PROBE_HOST": "id.test.munaxa.com",
                        "PROBE_ISSUER": "https://id.test.munaxa.com",
                        "PROBE_OPERATOR_HOST": "operator-test.munaxa.com",
                        "PROBE_ORGANISATION": "munaxa-stage-e-checks",
                        "PROBE_PUBLIC_KEYS": "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42\\n0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==\\n-----END PUBLIC KEY-----\"}]",
                        "PROBE_SIGNING_KID": "identity-nonprod-2026-11",
                        "PROBE_STAGE": "probe",
                        "PROBE_UNKNOWN_HOST": "unknown.test.munaxa.com"
                    },
                    "extra": {
                        "stopTimeout": 10
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
            },
            "probePin": {
                "commit": "",
                "sha256": ""
            },
            "loaderSha256": "0201914656cd129b1de25cccf60af0248f5e99aba48d820a0b21f52b90a3f962",
            "volumes": [
                "stage-e-handoff"
            ]
        },
        "munaxa-nonprod-identity": {
            "executionRole": "munaxa-nonprod-identity-execution",
            "taskRole": None,
            "task": {
                "cpu": "512",
                "memory": "1024",
                "runtimePlatform": {
                    "cpuArchitecture": "X86_64",
                    "operatingSystemFamily": "LINUX"
                }
            },
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
                    },
                    "environmentNames": [
                        "CSRF_TRUSTED_ORIGINS",
                        "IDENTITY_AUTH_AUDIENCE",
                        "IDENTITY_BASE_URL",
                        "IDENTITY_DEFAULT_ORGANISATION",
                        "IDENTITY_PASSWORD_RESET",
                        "IDENTITY_SIGNING_ALGORITHM",
                        "IDENTITY_SIGNING_KID",
                        "LOG_PRETTY",
                        "MFA_ENCRYPTION_PRIMARY_KID",
                        "MFA_POLICY",
                        "NODE_ENV",
                        "PORT",
                        "TRUST_PROXY_HOPS"
                    ],
                    "shape": {
                        "essential": True,
                        "readonlyRootFilesystem": True,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "dependsOn": [
                            {
                                "condition": "HEALTHY",
                                "containerName": "valkey"
                            }
                        ],
                        "healthCheck": {
                            "command": [
                                "CMD",
                                "node",
                                "-e",
                                "fetch('http://127.0.0.1:4001/api/auth/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
                            ],
                            "interval": 15,
                            "retries": 3,
                            "startPeriod": 60,
                            "timeout": 5
                        },
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/identity",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "identity"
                            }
                        }
                    },
                    "environment": {
                        "CSRF_TRUSTED_ORIGINS": "https://id.test.munaxa.com,https://work.test.munaxa.com,https://operator-test.munaxa.com",
                        "IDENTITY_AUTH_AUDIENCE": "munaxa-work,munaxa-control",
                        "IDENTITY_BASE_URL": "https://id.test.munaxa.com",
                        "IDENTITY_DEFAULT_ORGANISATION": "",
                        "IDENTITY_PASSWORD_RESET": "disabled",
                        "IDENTITY_SIGNING_ALGORITHM": "ES256",
                        "IDENTITY_SIGNING_KID": "identity-nonprod-2026-11",
                        "LOG_PRETTY": "false",
                        "MFA_ENCRYPTION_PRIMARY_KID": "mfa-nonprod-2026-11",
                        "MFA_POLICY": "off",
                        "NODE_ENV": "production",
                        "PORT": "4001",
                        "TRUST_PROXY_HOPS": "1"
                    },
                    "extra": {
                        "portMappings": [
                            {
                                "containerPort": 4001,
                                "hostPort": 4001,
                                "protocol": "tcp"
                            }
                        ]
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
                    },
                    "environmentNames": [],
                    "shape": {
                        "essential": True,
                        "user": "999:999",
                        "readonlyRootFilesystem": False,
                        "linuxParameters": {
                            "capabilities": {
                                "add": [],
                                "drop": [
                                    "ALL"
                                ]
                            }
                        },
                        "entryPoint": [
                            "sh",
                            "-c"
                        ],
                        "healthCheck": {
                            "command": [
                                "CMD-SHELL",
                                "valkey-cli -a \"$REDIS_PASSWORD\" --no-auth-warning ping | grep -q PONG"
                            ],
                            "interval": 10,
                            "retries": 5,
                            "startPeriod": 10,
                            "timeout": 3
                        },
                        "logConfiguration": {
                            "logDriver": "awslogs",
                            "options": {
                                "awslogs-group": "/munaxa/nonprod/identity",
                                "awslogs-region": "eu-central-1",
                                "awslogs-stream-prefix": "valkey"
                            }
                        }
                    },
                    "command": [
                        "umask 077 && printf 'requirepass %s\\n' \"$REDIS_PASSWORD\" > /tmp/valkey.conf && exec valkey-server /tmp/valkey.conf --bind 127.0.0.1 --port 6379 --protected-mode yes --maxmemory 128mb --maxmemory-policy noeviction --save '' --appendonly no"
                    ],
                    "environment": {}
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
            },
            "volumes": []
        }
    },
    "shapeKeys": [
        "essential",
        "user",
        "privileged",
        "readonlyRootFilesystem",
        "linuxParameters",
        "entryPoint",
        "dependsOn",
        "mountPoints",
        "volumesFrom",
        "healthCheck",
        "logConfiguration",
        "workingDirectory",
        "dockerSecurityOptions",
        "systemControls",
        "links",
        "interactive",
        "pseudoTerminal"
    ]
}
# --- end manifest ---

TOKEN_SHAPE = re.compile(r"^[a-z0-9][a-z0-9-]{7,35}$")
UUID_SHAPE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ALB_SHAPE = re.compile(r"^munaxa-nonprod-[0-9]{1,20}\.eu-central-1\.elb\.amazonaws\.com$")  # owner review A-11: the session ALB only
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


SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]


def sha256_hex(text):
    """SHA-256 of a UTF-8 string in plain Python (the connector sandbox has no hashing module).
    test_task_guard.py checks it against hashlib."""
    data = bytearray(text.encode("utf-8"))
    length = len(data) * 8
    data.append(0x80)
    while len(data) % 64 != 56:
        data.append(0)
    data += length.to_bytes(8, "big")
    h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    mask = 0xFFFFFFFF

    def rotr(x, n):
        return ((x >> n) | (x << (32 - n))) & mask

    for start in range(0, len(data), 64):
        w = [int.from_bytes(data[start + 4 * i:start + 4 * i + 4], "big") for i in range(16)]
        for i in range(16, 64):
            s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
            s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
            w.append((w[i - 16] + s0 + w[i - 7] + s1) & mask)
        a, b, c, d, e, f, g, hh = h
        for i in range(64):
            t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) & mask
            t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) & mask
            a, b, c, d, e, f, g, hh = (t1 + t2) & mask, a, b, c, (d + t1) & mask, e, f, g
        h = [(x + y) & mask for x, y in zip(h, [a, b, c, d, e, f, g, hh])]
    return "".join(x.to_bytes(4, "big").hex() for x in h)


def bare(value):
    """A value with every None, empty string, empty list and empty object removed, recursively
    (DescribeTaskDefinition may return empty defaults Terraform never wrote); None if nothing is left."""
    if isinstance(value, dict):
        out = {}
        for k in sorted(value.keys()):
            v = bare(value[k])
            if v is not None:
                out[k] = v
        return out or None
    if isinstance(value, list):
        out = [bare(v) for v in value]
        out = [v for v in out if v is not None]
        return out or None
    if value is None or value == "":
        return None
    return value


# Owner review B-8: every other field DescribeTaskDefinition can return. Read-only metadata ECS adds
# is ignored; any other task-level or container field must be absent (empty, false or a container
# cpu of 0) unless the manifest lists it ("task" for the task, "extra" per container).
TASK_METADATA = ("taskDefinitionArn", "revision", "registeredAt", "registeredBy", "deregisteredAt",
                 "compatibilities", "requiresAttributes")
TASK_COMPARED = ("family", "status", "executionRoleArn", "taskRoleArn", "requiresCompatibilities", "networkMode",
                 "pidMode", "ipcMode", "volumes", "containerDefinitions", "cpu", "memory", "runtimePlatform")
CONTAINER_COMPARED = ("name", "image", "secrets", "environment", "command", "environmentFiles", "repositoryCredentials")


def absent_value(value):
    """bare(value) that also drops false and 0 at every depth, so ECS defaults such as a container
    cpu of 0, enableFaultInjection false or restartPolicy {"enabled": false} count as absent, and a
    default versionConsistency "enabled" too (the image is pinned by digest either way)."""
    if isinstance(value, dict):
        out = {}
        for k in sorted(value.keys()):
            v = absent_value(value[k])
            if v is not None:
                out[k] = v
        return out or None
    if isinstance(value, list):
        out = [absent_value(v) for v in value]
        out = [v for v in out if v is not None]
        return out or None
    if value is None or value == "" or value is False or (not isinstance(value, bool) and value == 0):
        return None
    return value


def extras(fields, skip):
    """The fields outside `skip` that carry something, normalised (bare, false and 0 dropped)."""
    out = {}
    for k in sorted(fields.keys()):
        if k in skip:
            continue
        v = absent_value(fields[k])
        if k == "versionConsistency" and v == "enabled":
            v = None
        if v is not None:
            out[k] = v
    return out


def shape_of(c):
    """The security-relevant fields of one container (MANIFEST["shapeKeys"]), normalised."""
    out = {}
    for k in MANIFEST["shapeKeys"]:
        v = c.get(k)
        if k == "essential" and v is None:
            v = True
        if k in ("readonlyRootFilesystem", "privileged", "interactive", "pseudoTerminal") and v is False:
            v = None
        v = bare(v)
        if v is not None:
            out[k] = v
    return out


def loader_ok(cmd, family_spec):
    """The probe loader command: exactly the reviewed loader text with the manifest's pin written in."""
    pin = family_spec.get("probePin") or {}
    if not re.fullmatch(r"[0-9a-f]{40}", str(pin.get("commit"))) or not re.fullmatch(r"[0-9a-f]{64}", str(pin.get("sha256"))):
        return "probe-not-pinned-in-manifest"
    if not isinstance(cmd, list) or len(cmd) != 4 or cmd[:3] != ["node", "--input-type=module", "-e"] or not isinstance(cmd[3], str):
        return "probe-pin"
    text = cmd[3]
    commit_line, sha_line = "const COMMIT = '" + pin["commit"] + "';", "const SHA256 = '" + pin["sha256"] + "';"
    if text.count(commit_line) != 1 or text.count(sha_line) != 1:
        return "probe-pin"
    text = text.replace(commit_line, "const COMMIT = '__PROBE_COMMIT__';").replace(sha_line, "const SHA256 = '__PROBE_SHA256__';")
    if sha256_hex(text) != family_spec["loaderSha256"]:
        return "probe-loader"
    return ""


def validate(family, td):
    """Every difference from MANIFEST, as short codes (never a value). Compared: family, status,
    roles, launch, task volumes and namespaces, and per container the image, every secret name and
    reference, the exact set of environment names and every value, the shape fields, every other
    field (task cpu, memory, runtime platform; per container the manifest's "extra"; anything else
    must be absent) and the command (review findings S-2, C-4; owner review B-1, B-8: a revision
    with an added entryPoint, command, NODE_OPTIONS, capability, other PGHOST, proxy or field fails)."""
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
    if td.get("requiresCompatibilities") != ["FARGATE"] or td.get("networkMode") != "awsvpc":
        p.append("launch")
    if td.get("pidMode") not in (None, "") or td.get("ipcMode") not in (None, ""):
        p.append("namespaces")
    task = spec["task"]
    if str(td.get("cpu")) != task["cpu"] or str(td.get("memory")) != task["memory"]:
        p.append("task-size")
    if bare(td.get("runtimePlatform")) != bare(task["runtimePlatform"]):
        p.append("runtime-platform")
    for k in sorted(extras(td, TASK_METADATA + TASK_COMPARED).keys()):
        p.append("task-field:" + str(k)[:40])
    volumes = td.get("volumes") or []
    if sorted(str(v.get("name")) for v in volumes if isinstance(v, dict)) != sorted(spec["volumes"]) or len(volumes) != len(spec["volumes"]) \
            or any(not isinstance(v, dict) or extras(v, ("name",)) for v in volumes):
        p.append("volumes")
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
        if c.get("environmentFiles") or c.get("repositoryCredentials"):
            p.append(tag + "unexpected-source")
        if shape_of(c) != shape_of(cs["shape"]):
            p.append(tag + "shape")
        if extras(c, CONTAINER_COMPARED + tuple(MANIFEST["shapeKeys"])) != extras(cs.get("extra") or {}, ()):
            p.append(tag + "fields")
        env, entries = {}, c.get("environment") or []
        for e in entries:
            if isinstance(e, dict):
                env[str(e.get("name"))] = e.get("value")
        if sorted(env.keys()) != sorted(cs["environmentNames"]) or len(env) != len(entries):
            p.append(tag + "env-names")
        # Owner review B-1: every value, not only the names (a changed PGHOST would send the master
        # password elsewhere). The probe pin's two values are compared with probePin below.
        pinned = cs.get("environment") or {}
        for name in sorted(env.keys()):
            if cs.get("probeLoader") and name in ("PROBE_COMMIT", "PROBE_SHA256"):
                continue
            if name not in pinned or (env.get(name) or "") != (pinned[name] or ""):
                p.append(tag + "env:" + name)
        cmd = c.get("command")
        if "command" in cs:
            if cmd != cs["command"]:
                p.append(tag + "command")
        elif "commandSha256" in cs:
            if not isinstance(cmd, list) or len(cmd) != 1 or not isinstance(cmd[0], str) or sha256_hex(cmd[0]) != cs["commandSha256"]:
                p.append(tag + "command")
        elif cs.get("probeLoader"):
            problem = loader_ok(cmd, spec)
            if problem:
                p.append(tag + problem)
            pin = spec.get("probePin") or {}
            if c["name"] == "identity-probe" and (env.get("PROBE_COMMIT") != pin.get("commit") or env.get("PROBE_SHA256") != pin.get("sha256")):
                p.append(tag + "env:probe-pin")
        elif bare(cmd) is not None:
            p.append(tag + "command")
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
    """Task ARNs started with this guard's token, running or stopped. ListTasks filtered by family and
    desired status, then DescribeTasks and startedBy compared here: the ECS reference says a startedBy
    filter must be the only filter (review finding C-2). ECS lists a stopped task for about an hour
    only, so an empty answer after that cannot prove a token was never used (finding C-3)."""
    arns = []
    for family in sorted(MANIFEST["families"].keys()):
        for status in ("RUNNING", "STOPPED"):
            token_ = None
            for _ in range(10):
                params = {"cluster": MANIFEST["cluster"], "family": family, "desiredStatus": status, "maxResults": 100}
                if token_:
                    params["nextToken"] = token_
                r = await aws("ecs", "ListTasks", params)
                found = r.get("taskArns")
                if not isinstance(found, list):
                    raise ValueError("shape")
                arns.extend(str(a) for a in found)
                token_ = r.get("nextToken")
                if not token_:
                    break
            else:
                raise ValueError("too-many-pages")
    arns = sorted(set(arns))
    mine = []
    for start in range(0, len(arns), 100):
        d = await aws("ecs", "DescribeTasks", {"cluster": MANIFEST["cluster"], "tasks": arns[start:start + 100]})
        tasks = d.get("tasks")
        if not isinstance(tasks, list):
            raise ValueError("shape")
        for t in tasks:
            if isinstance(t, dict) and t.get("startedBy") == STARTED_BY_PREFIX + token:
                mine.append(str(t.get("taskArn")))
    return sorted(mine)


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
            # Not proof that nothing ran: ECS lists a stopped task for about an hour only (finding C-3).
            return {"result": "NOT_FOUND", "code": "NOT_LISTED_MAY_HAVE_EXPIRED", "run_token": RUN_TOKEN,
                    "next": "if this token was used more than about an hour ago, never run again on that basis: "
                            "read the task's log stream, or give TASK_ARN"}
    try:
        d = await aws("ecs", "DescribeTasks", {"cluster": MANIFEST["cluster"], "tasks": arns})
    except Exception as e:
        return {"result": "FAIL", "code": "DESCRIBE_" + code_of(e)}
    # Owner review A-4: a task ECS no longer knows comes back under failures (reason MISSING), not
    # under tasks. It is reported as expired or unknown, never as still in progress.
    missing, other = 0, []
    for f in d.get("failures") or []:
        reason = str(f.get("reason", "")) if isinstance(f, dict) else ""
        if reason == "MISSING":
            missing += 1
        else:
            other.append(reason_class(reason))
    if other:
        return {"result": "FAIL", "code": "DESCRIBE_FAILURES", "reasons": sorted(set(other))}
    if missing and not (d.get("tasks") or []):
        return {"result": "NOT_FOUND", "code": "TASK_EXPIRED_OR_UNKNOWN", "missing": missing,
                "next": "ECS keeps a stopped task for about an hour only: read the task's log stream; never run "
                        "again on the basis of this answer"}
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
    if missing:
        return {"result": "UNKNOWN", "code": "SOME_TASKS_EXPIRED", "missing": missing, "tasks": out,
                "next": "read the expired tasks' log streams; never run again on the basis of this answer"}
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
