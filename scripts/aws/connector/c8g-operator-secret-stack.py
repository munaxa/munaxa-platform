# C-8G  The Identity nonprod operator credential through CloudFormation (L-A0 redesign, owner decision
# D-LA0, 15 Nov 2026; report 2026-11-15-identity-stage-e-owner-decisions, file 03).
#
# Replaces C-8, C-8R, C-8v and C-16. Secrets Manager generates the password inside AWS
# (AWS::SecretsManager::Secret GenerateSecretString in the template below, the same JSON as
# infra/aws/cloudformation/identity-operator-secret.template.json, checked by test). No request this
# script sends and no response it receives holds the password: it never calls GetRandomPassword,
# CreateSecret, PutSecretValue, GetSecretValue or BatchGetSecretValue (sandbox_harness.py refuses
# them here). The email is a NoEcho stack parameter, sent only by MODE "create".
#
# One secret, no copy: munaxa-nonprod/identity-operator holds IDENTITY_OWNER_EMAIL,
# IDENTITY_OWNER_PASSWORD, IDENTITY_ORGANISATION and IDENTITY_SECRET_GENERATION. Its resource policy
# denies every value read except by root, and by the identity-bootstrap execution role only while the
# stack parameter BootstrapReadWindow is "open". Every change except by root is denied.
#
# MODE (one per connector call):
#   create        stack absent and secret absent -> CreateStack (window closed), wait for CREATE_COMPLETE
#   open-window   just before the identity-bootstrap task (E-1 run); UpdateStack, previous template
#   close-window  right after it, and on every exit path before `down` (replaces C-16)
#   regenerate    new password (Generation + 1) ONLY while no Identity account exists for the email;
#                 needs NO_ACCOUNT_CONFIRMED = True and EXPECTED_GENERATION = the current generation
#   status        read-only metadata check (replaces C-8v); run after every other mode
#
# The operator edits only the INPUT lines, in the session copy, never in this repository. The email
# is private runtime input: an unedited "create" copy aborts with EMAIL_NOT_SET, and the other modes
# never send it (UsePreviousValue). The call record of a "create" run (its source holds the email) is
# never committed as evidence (owner review B-7); only the returned names, ARNs, statuses and codes are.
#
# Returns names, ARNs, statuses, counts and codes only. Never the email, never a value, never an AWS
# message (ResourceStatusReason and error messages are not read into the result). NOT RUN.

MODE = "status"  # INPUT: create | open-window | close-window | regenerate | status
OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT: MODE create only (private, never committed)
EXPECTED_GENERATION = 0  # INPUT: MODE regenerate only, the generation that status reports now
NO_ACCOUNT_CONFIRMED = False  # INPUT: MODE regenerate only, True once the owner confirms no account exists

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

STACK = "munaxa-nonprod-identity-operator-secret"
SECRET = "munaxa-nonprod/identity-operator"
LEGACY_BOOTSTRAP = "munaxa-nonprod/identity-bootstrap"
DATA_KEY_ID = "45eda044-092a-4f31-9243-3f9548636e37"
ROOT_ARN = "arn:aws:iam::" + ACCOUNT + ":root"
READER_ARN = "arn:aws:iam::" + ACCOUNT + ":role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"
EXPECTED_TAGS = ["Environment=nonprod", "ManagedBy=cloudformation/" + STACK, "Project=munaxa", "Stack=shared"]
STACK_TAGS = [{"Key": t.split("=", 1)[0], "Value": t.split("=", 1)[1]} for t in EXPECTED_TAGS]
STABLE = ("CREATE_COMPLETE", "UPDATE_COMPLETE")
MODES = ("create", "open-window", "close-window", "regenerate", "status")
RETRYABLE = ("PY_TIMEOUT", "AWS_Throttling", "AWS_ThrottlingException")
EMAIL_SHAPE = re.compile(r"^[A-Za-z0-9.!#$%&*+/=?^_{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")

TEMPLATE_TEXT = r'''{
  "AWSTemplateFormatVersion": "2010-09-09",
  "Description": "Munaxa nonprod Identity operator credential (L-A0 redesign, report 2026-11-15-identity-stage-e-owner-decisions). Secrets Manager generates the password; it is never in a request, a response, a parameter, the template or a log.",
  "Parameters": {
    "OperatorEmail": {
      "Type": "String",
      "NoEcho": true,
      "MinLength": 6,
      "MaxLength": 254,
      "AllowedPattern": "^[A-Za-z0-9.!#$%&*+/=?^_{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$",
      "ConstraintDescription": "an email address without quotes, backslashes or spaces"
    },
    "Generation": {
      "Type": "String",
      "Default": "1",
      "AllowedPattern": "^[1-9][0-9]{0,2}$",
      "ConstraintDescription": "1 to 999; raising it makes Secrets Manager generate a new password (only while no account exists)"
    },
    "BootstrapReadWindow": {
      "Type": "String",
      "Default": "closed",
      "AllowedValues": ["closed", "open"]
    }
  },
  "Conditions": {
    "WindowOpen": {
      "Fn::Equals": [
        {
          "Ref": "BootstrapReadWindow"
        },
        "open"
      ]
    }
  },
  "Resources": {
    "OperatorSecret": {
      "Type": "AWS::SecretsManager::Secret",
      "DeletionPolicy": "Retain",
      "UpdateReplacePolicy": "Retain",
      "Properties": {
        "Name": "munaxa-nonprod/identity-operator",
        "Description": "Identity nonprod operator credential. Password generated by Secrets Manager (CloudFormation GenerateSecretString); read only by the identity-bootstrap execution role while the read window is open.",
        "KmsKeyId": "alias/munaxa-nonprod-data",
        "GenerateSecretString": {
          "SecretStringTemplate": {
            "Fn::Sub": "{\"IDENTITY_OWNER_EMAIL\":\"${OperatorEmail}\",\"IDENTITY_ORGANISATION\":\"munaxa-group\",\"IDENTITY_SECRET_GENERATION\":\"${Generation}\"}"
          },
          "GenerateStringKey": "IDENTITY_OWNER_PASSWORD",
          "PasswordLength": 40,
          "ExcludeCharacters": "\"'`\\",
          "IncludeSpace": false,
          "RequireEachIncludedType": true
        },
        "Tags": [
          {
            "Key": "Project",
            "Value": "munaxa"
          },
          {
            "Key": "Stack",
            "Value": "shared"
          },
          {
            "Key": "Environment",
            "Value": "nonprod"
          },
          {
            "Key": "ManagedBy",
            "Value": "cloudformation/munaxa-nonprod-identity-operator-secret"
          }
        ]
      }
    },
    "OperatorSecretPolicy": {
      "Type": "AWS::SecretsManager::ResourcePolicy",
      "Properties": {
        "SecretId": {
          "Ref": "OperatorSecret"
        },
        "BlockPublicPolicy": true,
        "ResourcePolicy": {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "ValueReadOnlyByRootOrTheOpenBootstrapWindow",
              "Effect": "Deny",
              "Principal": "*",
              "Action": ["secretsmanager:GetSecretValue"],
              "Resource": "*",
              "Condition": {
                "StringNotEquals": {
                  "aws:PrincipalArn": {
                    "Fn::If": [
                      "WindowOpen",
                      [
                        {
                          "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root"
                        },
                        {
                          "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"
                        }
                      ],
                      [
                        {
                          "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root"
                        }
                      ]
                    ]
                  }
                }
              }
            },
            {
              "Sid": "ChangesOnlyByRoot",
              "Effect": "Deny",
              "Principal": "*",
              "Action": [
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecret",
                "secretsmanager:UpdateSecretVersionStage",
                "secretsmanager:RotateSecret",
                "secretsmanager:CancelRotateSecret",
                "secretsmanager:DeleteSecret",
                "secretsmanager:RestoreSecret",
                "secretsmanager:PutResourcePolicy",
                "secretsmanager:DeleteResourcePolicy",
                "secretsmanager:TagResource",
                "secretsmanager:UntagResource",
                "secretsmanager:ReplicateSecretToRegions",
                "secretsmanager:RemoveRegionsFromReplication",
                "secretsmanager:StopReplicationToReplica"
              ],
              "Resource": "*",
              "Condition": {
                "StringNotEquals": {
                  "aws:PrincipalArn": {
                    "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root"
                  }
                }
              }
            }
          ]
        }
      }
    }
  },
  "Outputs": {
    "SecretArn": {
      "Value": {
        "Ref": "OperatorSecret"
      }
    },
    "Generation": {
      "Value": {
        "Ref": "Generation"
      }
    },
    "BootstrapReadWindow": {
      "Value": {
        "Ref": "BootstrapReadWindow"
      }
    }
  }
}'''
TEMPLATE = json.loads(TEMPLATE_TEXT)


def email_problem(email):
    if not isinstance(email, str) or email.startswith("<"):
        return "EMAIL_NOT_SET"
    if len(email) < 6 or len(email) > 254 or not EMAIL_SHAPE.match(email):
        return "EMAIL_MALFORMED"
    domain = email.rsplit("@", 1)[1].lower()
    if domain.endswith((".invalid", ".example", ".test", ".localhost")) or domain in ("example.com", "example.org", "example.net"):
        return "EMAIL_RESERVED_DOMAIN"
    return ""


async def stack_state():
    """(None, '') if the stack does not exist, (state, '') if it does, (None, code) on failure. A
    DELETE_COMPLETE stack counts as absent. NoEcho values come back masked and none is returned."""
    try:
        r = await aws("cloudformation", "DescribeStacks", {"StackName": STACK})
    except Exception as e:
        if code_of(e) == "AWS_ValidationError":  # "Stack with id ... does not exist" (STACK is a constant)
            return None, ""
        return None, "DESCRIBE_STACK_" + code_of(e)
    stacks = r.get("Stacks") if isinstance(r, dict) else None
    if not isinstance(stacks, list) or len(stacks) != 1 or not isinstance(stacks[0], dict):
        return None, "DESCRIBE_STACK_MALFORMED"
    s = stacks[0]
    status = str(s.get("StackStatus", ""))
    if status == "DELETE_COMPLETE":
        return None, ""
    params = {}
    for p in s.get("Parameters") or []:
        if isinstance(p, dict) and p.get("ParameterKey") in ("Generation", "BootstrapReadWindow"):
            params[p["ParameterKey"]] = str(p.get("ParameterValue", ""))
    tags = sorted(str(t.get("Key")) + "=" + str(t.get("Value")) for t in (s.get("Tags") or []) if isinstance(t, dict))
    return {"status": status, "params": params, "tags": tags,
            "termination_protection": s.get("EnableTerminationProtection") is True}, ""


async def secret_absent(name):
    try:
        await aws("secretsmanager", "DescribeSecret", {"SecretId": name})
        return "SECRET_EXISTS"
    except Exception as e:
        if code_of(e) == "AWS_ResourceNotFoundException":
            return ""
        return "PRECHECK_" + code_of(e)


async def template_matches():
    """'' when the stack's current template is exactly the reviewed one, else a code."""
    try:
        r = await aws("cloudformation", "GetTemplate", {"StackName": STACK, "TemplateStage": "Original"})
    except Exception as e:
        return "GET_TEMPLATE_" + code_of(e)
    body = r.get("TemplateBody") if isinstance(r, dict) else None
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            return "TEMPLATE_DRIFT"
    return "" if body == TEMPLATE else "TEMPLATE_DRIFT"


async def wait_stable(expected, seconds=40):
    """Poll DescribeStacks every 5 s until a terminal status. Statuses only, never a reason."""
    waited = 0
    while True:
        state, code = await stack_state()
        if code:
            return "", code
        if state is None:
            return "ABSENT", "STACK_ABSENT"
        status = state["status"]
        if status == expected:
            return status, ""
        if not status.endswith("_IN_PROGRESS"):
            return status, "STACK_" + status
        if waited >= seconds:
            return status, "STILL_IN_PROGRESS"
        await asyncio.sleep(5)
        waited += 5


async def update(window, generation):
    """UpdateStack with the previous template; the email is never sent (UsePreviousValue)."""
    params = [
        {"ParameterKey": "OperatorEmail", "UsePreviousValue": True},
        {"ParameterKey": "Generation", "ParameterValue": generation},
        {"ParameterKey": "BootstrapReadWindow", "ParameterValue": window},
    ]
    token = "c8g-" + str(uuid.uuid4())
    for attempt in (1, 2):
        try:
            await aws("cloudformation", "UpdateStack", {"StackName": STACK, "UsePreviousTemplate": True,
                                                         "Parameters": params, "ClientRequestToken": token})
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in RETRYABLE:
                continue  # same ClientRequestToken: CloudFormation treats the retry as the same request
            return "UPDATE_" + code
    status, code = await wait_stable("UPDATE_COMPLETE")
    return code


def policy_window(text):
    """('open'|'closed', '') from the live resource policy, or ('', code) if it is not the reviewed shape."""
    try:
        doc = json.loads(text)
    except Exception:
        return "", "POLICY_MALFORMED"
    if not isinstance(doc, dict) or not isinstance(doc.get("Statement"), list):
        return "", "POLICY_MALFORMED"
    sids = {}
    for st in doc["Statement"]:
        if not isinstance(st, dict):
            return "", "POLICY_MALFORMED"
        sids[str(st.get("Sid"))] = st
    if sorted(sids) != ["ChangesOnlyByRoot", "ValueReadOnlyByRootOrTheOpenBootstrapWindow"] or len(doc["Statement"]) != 2:
        return "", "POLICY_STATEMENTS"
    for st in sids.values():
        if st.get("Effect") != "Deny" or st.get("Principal") not in ("*", {"AWS": "*"}) or st.get("Resource") != "*":
            return "", "POLICY_NOT_DENY_ALL"
    read = sids["ValueReadOnlyByRootOrTheOpenBootstrapWindow"]
    actions = read.get("Action")
    actions = [actions] if isinstance(actions, str) else actions
    if actions != ["secretsmanager:GetSecretValue"]:
        return "", "POLICY_READ_ACTIONS"
    try:
        allowed = read["Condition"]["StringNotEquals"]["aws:PrincipalArn"]
    except Exception:
        return "", "POLICY_READ_CONDITION"
    if not isinstance(read.get("Condition"), dict) or len(read["Condition"]) != 1:
        return "", "POLICY_READ_CONDITION"
    allowed = sorted([allowed] if isinstance(allowed, str) else [str(a) for a in allowed])
    if allowed == [ROOT_ARN]:
        window = "closed"
    elif allowed == sorted([ROOT_ARN, READER_ARN]):
        window = "open"
    else:
        return "", "POLICY_READERS"
    try:
        changers = sids["ChangesOnlyByRoot"]["Condition"]["StringNotEquals"]["aws:PrincipalArn"]
    except Exception:
        return "", "POLICY_CHANGE_CONDITION"
    if changers not in (ROOT_ARN, [ROOT_ARN]):
        return "", "POLICY_CHANGERS"
    expected = TEMPLATE["Resources"]["OperatorSecretPolicy"]["Properties"]["ResourcePolicy"]["Statement"][1]["Action"]
    got = sids["ChangesOnlyByRoot"].get("Action")
    if sorted([got] if isinstance(got, str) else got) != sorted(expected):
        return "", "POLICY_CHANGE_ACTIONS"
    return window, ""


async def status():
    """Read-only. PASS only when the stack, the template, the secret, its versions and its policy are
    exactly the reviewed shape. Never reads a value."""
    state, code = await stack_state()
    if code:
        return {"result": "FAIL", "code": code}
    if state is None:
        legacy = await secret_absent(SECRET)
        return {"result": "ABSENT", "secret_absent": legacy == "", "code": legacy}
    out = {"result": "FAIL", "problems": [], "stack_status": state["status"],
           "generation": state["params"].get("Generation", ""),
           "window_parameter": state["params"].get("BootstrapReadWindow", ""),
           "termination_protection": state["termination_protection"]}
    problems = out["problems"]
    if state["status"] not in STABLE:
        problems.append("stack-status")
    if state["tags"] != EXPECTED_TAGS:
        problems.append("stack-tags")
    if not state["termination_protection"]:
        problems.append("termination-protection")
    drift = await template_matches()
    if drift:
        problems.append(drift.lower().replace("_", "-"))
    try:
        d = await aws("secretsmanager", "DescribeSecret", {"SecretId": SECRET})
        v = await aws("secretsmanager", "ListSecretVersionIds", {"SecretId": SECRET})
        p = await aws("secretsmanager", "GetResourcePolicy", {"SecretId": SECRET})
    except Exception as e:
        out["code"] = "SECRET_" + code_of(e)
        problems.append("secret-unreadable")
        return out
    if not isinstance(d, dict) or not isinstance(v, dict) or not isinstance(p, dict):
        out["code"] = "SECRET_MALFORMED"
        problems.append("secret-malformed")
        return out
    out["arn"] = str(d.get("ARN", ""))
    if d.get("Name") != SECRET or not out["arn"].startswith("arn:aws:secretsmanager:" + REGION + ":" + ACCOUNT + ":secret:" + SECRET + "-"):
        problems.append("secret-name")
    kms = str(d.get("KmsKeyId", ""))
    if not (kms.endswith("key/" + DATA_KEY_ID) or kms == "alias/munaxa-nonprod-data"):
        problems.append("kms-key")
    tags = sorted(str(t.get("Key")) + "=" + str(t.get("Value")) for t in (d.get("Tags") or []) if isinstance(t, dict))
    if tags != EXPECTED_TAGS:
        problems.append("secret-tags")
    if d.get("DeletedDate"):
        problems.append("scheduled-for-deletion")
    if d.get("RotationEnabled"):
        problems.append("rotation-enabled")
    versions = [x for x in (v.get("Versions") or []) if isinstance(x, dict)]
    current = [x for x in versions if "AWSCURRENT" in (x.get("VersionStages") or [])]
    out["versions"] = len(versions)
    out["current_version"] = str(current[0].get("VersionId", "")) if len(current) == 1 else ""
    if len(current) != 1:
        problems.append("current-version")
    window, code = policy_window(p.get("ResourcePolicy", ""))
    out["window_policy"] = window
    if code:
        problems.append(code.lower().replace("_", "-"))
    elif window != out["window_parameter"]:
        problems.append("window-mismatch")
    legacy = await secret_absent(LEGACY_BOOTSTRAP)
    if legacy:
        problems.append("legacy-bootstrap-secret-" + ("present" if legacy == "SECRET_EXISTS" else "unknown"))
    out["result"] = "PASS" if not problems else "FAIL"
    return out


async def create():
    problem = email_problem(OPERATOR_EMAIL)
    if problem:
        return {"result": "ABORT", "code": problem}
    state, code = await stack_state()
    if code:
        return {"result": "ABORT", "code": code}
    if state is not None:
        return {"result": "ABORT", "code": "STACK_EXISTS", "stack_status": state["status"]}
    for name in (SECRET, LEGACY_BOOTSTRAP):
        problem = await secret_absent(name)
        if problem:
            return {"result": "ABORT", "code": problem, "name": name}
    params = {
        "StackName": STACK,
        "TemplateBody": TEMPLATE_TEXT,
        "Parameters": [
            {"ParameterKey": "OperatorEmail", "ParameterValue": OPERATOR_EMAIL},
            {"ParameterKey": "Generation", "ParameterValue": "1"},
            {"ParameterKey": "BootstrapReadWindow", "ParameterValue": "closed"},
        ],
        "OnFailure": "ROLLBACK",
        "EnableTerminationProtection": True,
        "Tags": STACK_TAGS,
        "ClientRequestToken": "c8g-" + str(uuid.uuid4()),
    }
    for attempt in (1, 2):
        try:
            await aws("cloudformation", "CreateStack", params)
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in RETRYABLE:
                continue  # same ClientRequestToken: CloudFormation treats the retry as the same request
            if code == "AWS_AlreadyExistsException":
                return {"result": "ABORT", "code": "STACK_EXISTS", "next": "status"}
            return {"result": "ABORT", "code": "CREATE_" + code, "next": "status"}
    params = None
    final, code = await wait_stable("CREATE_COMPLETE")
    if code:
        return {"result": "FAIL", "code": code, "stack_status": final, "next": "status"}
    return {"result": "CREATED", "stack_status": final, "next": "status"}


async def set_window(target):
    state, code = await stack_state()
    if code:
        return {"result": "ABORT", "code": code}
    if state is None:
        return {"result": "ABORT", "code": "STACK_ABSENT"}
    if state["status"] not in STABLE:
        return {"result": "ABORT", "code": "STACK_" + state["status"]}
    drift = await template_matches()
    if drift:
        return {"result": "ABORT", "code": drift}
    if state["params"].get("BootstrapReadWindow") == target:
        return {"result": "ALREADY_" + target.upper(), "next": "status"}
    generation = state["params"].get("Generation", "")
    if not re.match(r"^[1-9][0-9]{0,2}$", generation):
        return {"result": "ABORT", "code": "GENERATION_UNKNOWN"}
    code = await update(target, generation)
    if code:
        return {"result": "FAIL", "code": code, "next": "status"}
    return {"result": "WINDOW_" + target.upper(), "next": "status"}


async def regenerate():
    if NO_ACCOUNT_CONFIRMED is not True:
        return {"result": "ABORT", "code": "NO_ACCOUNT_NOT_CONFIRMED"}
    if not isinstance(EXPECTED_GENERATION, int) or isinstance(EXPECTED_GENERATION, bool) or not 1 <= EXPECTED_GENERATION < 999:
        return {"result": "ABORT", "code": "EXPECTED_GENERATION_NOT_SET"}
    state, code = await stack_state()
    if code:
        return {"result": "ABORT", "code": code}
    if state is None:
        return {"result": "ABORT", "code": "STACK_ABSENT"}
    if state["status"] not in STABLE:
        return {"result": "ABORT", "code": "STACK_" + state["status"]}
    if state["params"].get("Generation") != str(EXPECTED_GENERATION):
        return {"result": "ABORT", "code": "GENERATION_MISMATCH"}
    if state["params"].get("BootstrapReadWindow") != "closed":
        return {"result": "ABORT", "code": "WINDOW_OPEN"}
    drift = await template_matches()
    if drift:
        return {"result": "ABORT", "code": drift}
    code = await update("closed", str(EXPECTED_GENERATION + 1))
    if code:
        return {"result": "FAIL", "code": code, "next": "status"}
    return {"result": "REGENERATED", "generation": str(EXPECTED_GENERATION + 1), "next": "status"}


async def c8g():
    if MODE not in MODES:
        return {"result": "ABORT", "code": "MODE_UNKNOWN"}
    problem = await this_account()
    if problem:
        return {"result": "ABORT", "code": problem}
    if MODE == "create":
        return await create()
    if MODE == "open-window":
        return await set_window("open")
    if MODE == "close-window":
        return await set_window("closed")
    if MODE == "regenerate":
        return await regenerate()
    return await status()


try:
    result = await c8g()
    result["mode"] = MODE
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e), "mode": MODE}
result
