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
# denies every value read except (a) by the identity-bootstrap execution role while the stack
# parameter BootstrapReadWindow is "open" AND before WindowExpiresAt (open-window sets it
# WINDOW_MINUTES ahead, so a lost session's window closes itself), and (b) by root only through
# CloudFormation (aws:CalledVia): a direct GetSecretValue by root, which is the connector's own
# principal, or from the console, is denied (review B-M1). Every change except by root is denied.
#
# MODE (one per connector call):
#   create        stack absent and secret absent -> CreateStack (window closed), wait for CREATE_COMPLETE
#   open-window   just before the identity-bootstrap task (E-1 run); UpdateStack, previous template
#   close-window  right after it, and on every exit path before `down` (replaces C-16)
#   regenerate    new password (Generation + 1) ONLY while no Identity account exists for the email;
#                 needs NO_ACCOUNT_CONFIRMED = True and EXPECTED_GENERATION = the current generation;
#                 FAILs unless AWSCURRENT really changed
#   remove-failed-create  only for a stack in ROLLBACK_COMPLETE (a create that failed): turns off
#                 termination protection and deletes the stack; reports whether a retained secret is
#                 left (its removal is a separate owner-approved root step, never a connector call)
#   status        read-only metadata check (replaces C-8v); run after every other mode
# A stack in UPDATE_ROLLBACK_COMPLETE is updatable, so open-window and close-window still work after a
# failed update (review A-1/B-M2); a change still in progress returns IN_PROGRESS: run status again.
#
# The operator edits only the INPUT lines, in the session copy, never in this repository. The email
# is private runtime input: an unedited "create" copy aborts with EMAIL_NOT_SET, and the other modes
# never send it (UsePreviousValue). The call record of a "create" run (its source holds the email) is
# never committed as evidence (owner review B-7); only the returned names, ARNs, statuses and codes are.
#
# Returns names, ARNs, statuses, counts and codes only. Never the email, never a value, never an AWS
# message (ResourceStatusReason and error messages are not read into the result). NOT RUN.

MODE = "status"  # INPUT: create | open-window | close-window | regenerate | remove-failed-create | status
OPERATOR_EMAIL = "<IDENTITY_OPERATOR_EMAIL>"  # INPUT: MODE create only (private, never committed)
EXPECTED_GENERATION = 0  # INPUT: MODE regenerate only, the generation that status reports now
NO_ACCOUNT_CONFIRMED = False  # INPUT: MODE regenerate only, True once the owner confirms no account exists
WINDOW_MINUTES = 60  # INPUT: MODE open-window only, 5 to 120; the window then closes itself

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
STABLE = ("CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE")
MODES = ("create", "open-window", "close-window", "regenerate", "remove-failed-create", "status")
CLOSED_AT = "2000-01-01T00:00:00Z"
ISO_Z = re.compile(r"^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$")
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
    },
    "WindowExpiresAt": {
      "Type": "String",
      "Default": "2000-01-01T00:00:00Z",
      "AllowedPattern": "^20[0-9]{2}-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z$",
      "ConstraintDescription": "UTC, YYYY-MM-DDThh:mm:ssZ; after it the bootstrap execution role is denied even with the window open"
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
              "Sid": "RootReadsOnlyThroughCloudFormation",
              "Effect": "Deny",
              "Principal": "*",
              "Action": ["secretsmanager:GetSecretValue"],
              "Resource": "*",
              "Condition": {
                "StringEquals": {
                  "aws:PrincipalArn": {
                    "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:root"
                  }
                },
                "ForAllValues:StringNotEquals": {
                  "aws:CalledVia": ["cloudformation.amazonaws.com"]
                }
              }
            },
            {
              "Sid": "BootstrapWindowExpires",
              "Effect": "Deny",
              "Principal": "*",
              "Action": ["secretsmanager:GetSecretValue"],
              "Resource": "*",
              "Condition": {
                "StringEquals": {
                  "aws:PrincipalArn": {
                    "Fn::Sub": "arn:aws:iam::${AWS::AccountId}:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution"
                  }
                },
                "DateGreaterThan": {
                  "aws:CurrentTime": {
                    "Ref": "WindowExpiresAt"
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
    },
    "WindowExpiresAt": {
      "Value": {
        "Ref": "WindowExpiresAt"
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
        if isinstance(p, dict) and p.get("ParameterKey") in ("Generation", "BootstrapReadWindow", "WindowExpiresAt"):
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


def now_iso(minutes=0):
    t = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


async def wait_stable(expected, seconds=40):
    """Poll DescribeStacks every 5 s until a terminal status. Statuses only, never a reason."""
    waited = 0
    while True:
        state, code = await stack_state()
        if code:
            return "", code
        if state is None:
            return "ABSENT", ("" if expected == "ABSENT" else "STACK_ABSENT")
        status = state["status"]
        if status == expected:
            return status, ""
        if not status.endswith("_IN_PROGRESS"):
            return status, "STACK_" + status
        if waited >= seconds:
            return status, "STILL_IN_PROGRESS"
        await asyncio.sleep(5)
        waited += 5


async def update(window, generation, expires):
    """UpdateStack with the previous template; the email is never sent (UsePreviousValue)."""
    params = [
        {"ParameterKey": "OperatorEmail", "UsePreviousValue": True},
        {"ParameterKey": "Generation", "ParameterValue": generation},
        {"ParameterKey": "BootstrapReadWindow", "ParameterValue": window},
        {"ParameterKey": "WindowExpiresAt", "ParameterValue": expires},
    ]
    token = "c8g-" + str(uuid.uuid4())
    retried = False
    for attempt in (1, 2):
        try:
            await aws("cloudformation", "UpdateStack", {"StackName": STACK, "UsePreviousTemplate": True,
                                                         "Parameters": params, "ClientRequestToken": token})
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in RETRYABLE:
                retried = True
                continue  # same ClientRequestToken: CloudFormation treats the retry as the same request
            return "UPDATE_" + code
    # The connector stops a run at about 60 s: a retried call leaves less time to wait (review A-4).
    status, code = await wait_stable("UPDATE_COMPLETE", 15 if retried else 35)
    return code


def policy_window(text):
    """(window, expires, '') from the live resource policy, where window is 'open' or 'closed' as the
    policy states it; or ('', '', code) if the policy is not exactly the reviewed shape."""
    try:
        doc = json.loads(text)
    except Exception:
        return "", "", "POLICY_MALFORMED"
    if not isinstance(doc, dict) or not isinstance(doc.get("Statement"), list):
        return "", "", "POLICY_MALFORMED"
    sids = {}
    for st in doc["Statement"]:
        if not isinstance(st, dict):
            return "", "", "POLICY_MALFORMED"
        sids[str(st.get("Sid"))] = st
    expected = {x["Sid"]: x for x in TEMPLATE["Resources"]["OperatorSecretPolicy"]["Properties"]["ResourcePolicy"]["Statement"]}
    if sorted(sids) != sorted(expected) or len(doc["Statement"]) != len(expected):
        return "", "", "POLICY_STATEMENTS"
    for sid, st in sids.items():
        if st.get("Effect") != "Deny" or st.get("Principal") not in ("*", {"AWS": "*"}) or st.get("Resource") != "*":
            return "", "", "POLICY_NOT_DENY_ALL"
        got = st.get("Action")
        got = [got] if isinstance(got, str) else got
        if not isinstance(got, list) or sorted(got) != sorted(expected[sid]["Action"]):
            return "", "", "POLICY_ACTIONS"
        cond = st.get("Condition")
        if not isinstance(cond, dict) or sorted(cond) != sorted(expected[sid]["Condition"]):
            return "", "", "POLICY_CONDITION"

    def one(value):
        return [str(value)] if isinstance(value, str) else sorted(str(v) for v in value) if isinstance(value, list) else None

    try:
        allowed = one(sids["ValueReadOnlyByRootOrTheOpenBootstrapWindow"]["Condition"]["StringNotEquals"]["aws:PrincipalArn"])
        root_rule = sids["RootReadsOnlyThroughCloudFormation"]["Condition"]
        expiry_rule = sids["BootstrapWindowExpires"]["Condition"]
        changers = one(sids["ChangesOnlyByRoot"]["Condition"]["StringNotEquals"]["aws:PrincipalArn"])
    except Exception:
        return "", "", "POLICY_CONDITION"
    if allowed == [ROOT_ARN]:
        window = "closed"
    elif allowed == sorted([ROOT_ARN, READER_ARN]):
        window = "open"
    else:
        return "", "", "POLICY_READERS"
    if one(root_rule["StringEquals"].get("aws:PrincipalArn")) != [ROOT_ARN] or \
            one(root_rule["ForAllValues:StringNotEquals"].get("aws:CalledVia")) != ["cloudformation.amazonaws.com"]:
        return "", "", "POLICY_ROOT_READ"
    expires = expiry_rule["DateGreaterThan"].get("aws:CurrentTime")
    if one(expiry_rule["StringEquals"].get("aws:PrincipalArn")) != [READER_ARN] or not isinstance(expires, str) or not ISO_Z.match(expires):
        return "", "", "POLICY_EXPIRY"
    if changers != [ROOT_ARN]:
        return "", "", "POLICY_CHANGERS"
    return window, expires, ""


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
           "window_expires_at": state["params"].get("WindowExpiresAt", ""),
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
        res = await aws("cloudformation", "DescribeStackResource", {"StackName": STACK, "LogicalResourceId": "OperatorSecret"})
        physical = str(res.get("StackResourceDetail", {}).get("PhysicalResourceId", "")) if isinstance(res, dict) else ""
    except Exception as e:
        physical = ""
        problems.append("stack-resource-" + code_of(e).lower())
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
    if physical and physical != out["arn"]:
        problems.append("secret-not-the-stacks")  # review A-8: a same-name secret made outside the stack
    kms = str(d.get("KmsKeyId", ""))
    if not (kms.endswith("key/" + DATA_KEY_ID) or kms in ("alias/munaxa-nonprod-data",
            "arn:aws:kms:" + REGION + ":" + ACCOUNT + ":alias/munaxa-nonprod-data")):
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
    window, expires, code = policy_window(p.get("ResourcePolicy", ""))
    out["window_policy"] = window
    out["window_effective"] = "open" if window == "open" and expires > now_iso() else ("closed" if window else "")
    if code:
        problems.append(code.lower().replace("_", "-"))
    elif window != out["window_parameter"] or expires != out["window_expires_at"]:
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
            {"ParameterKey": "WindowExpiresAt", "ParameterValue": CLOSED_AT},
        ],
        "OnFailure": "ROLLBACK",
        "EnableTerminationProtection": True,
        "Tags": STACK_TAGS,
        "ClientRequestToken": "c8g-" + str(uuid.uuid4()),
    }
    retried = False
    for attempt in (1, 2):
        try:
            await aws("cloudformation", "CreateStack", params)
            break
        except Exception as e:
            code = code_of(e)
            if attempt == 1 and code in RETRYABLE:
                retried = True
                continue  # same ClientRequestToken: CloudFormation treats the retry as the same request
            if code == "AWS_AlreadyExistsException":
                return {"result": "ABORT", "code": "STACK_EXISTS", "next": "status"}
            return {"result": "ABORT", "code": "CREATE_" + code, "next": "status"}
    params = None
    final, code = await wait_stable("CREATE_COMPLETE", 15 if retried else 35)
    if code == "STILL_IN_PROGRESS":
        return {"result": "IN_PROGRESS", "stack_status": final, "next": "status"}
    if code:
        return {"result": "FAIL", "code": code, "stack_status": final, "next": "status"}
    return {"result": "CREATED", "stack_status": final, "next": "status"}


async def set_window(target):
    if target == "open" and (not isinstance(WINDOW_MINUTES, int) or isinstance(WINDOW_MINUTES, bool) or not 5 <= WINDOW_MINUTES <= 120):
        return {"result": "ABORT", "code": "WINDOW_MINUTES_OUT_OF_RANGE"}
    state, code = await stack_state()
    if code:
        return {"result": "ABORT", "code": code}
    if state is None:
        return {"result": "ABORT", "code": "STACK_ABSENT"}
    if state["status"].endswith("_IN_PROGRESS"):
        return {"result": "IN_PROGRESS", "stack_status": state["status"], "next": "status"}
    if state["status"] not in STABLE:
        return {"result": "ABORT", "code": "STACK_" + state["status"]}
    drift = await template_matches()
    if drift:
        return {"result": "ABORT", "code": drift}
    current = state["params"].get("BootstrapReadWindow")
    expires = state["params"].get("WindowExpiresAt", "")
    if target == "closed" and current == "closed" and expires == CLOSED_AT:
        return {"result": "ALREADY_CLOSED", "next": "status"}
    generation = state["params"].get("Generation", "")
    if not re.match(r"^[1-9][0-9]{0,2}$", generation):
        return {"result": "ABORT", "code": "GENERATION_UNKNOWN"}
    new_expiry = now_iso(WINDOW_MINUTES) if target == "open" else CLOSED_AT
    code = await update(target, generation, new_expiry)
    if code == "STILL_IN_PROGRESS":
        return {"result": "IN_PROGRESS", "next": "status"}
    if code:
        return {"result": "FAIL", "code": code, "next": "status"}
    out = {"result": "WINDOW_" + target.upper(), "next": "status"}
    if target == "open":
        out["expires_at"] = new_expiry
    return out


async def current_version():
    try:
        v = await aws("secretsmanager", "ListSecretVersionIds", {"SecretId": SECRET})
    except Exception as e:
        return "", "VERSIONS_" + code_of(e)
    current = [x for x in (v.get("Versions") or []) if isinstance(x, dict) and "AWSCURRENT" in (x.get("VersionStages") or [])] \
        if isinstance(v, dict) else []
    if len(current) != 1:
        return "", "VERSIONS_MALFORMED"
    return str(current[0].get("VersionId", "")), ""


async def remove_failed_create():
    state, code = await stack_state()
    if code:
        return {"result": "ABORT", "code": code}
    if state is None:
        return {"result": "ABORT", "code": "STACK_ABSENT"}
    if state["status"] != "ROLLBACK_COMPLETE":
        return {"result": "ABORT", "code": "NOT_A_FAILED_CREATE", "stack_status": state["status"]}
    try:
        await aws("cloudformation", "UpdateTerminationProtection", {"StackName": STACK, "EnableTerminationProtection": False})
        await aws("cloudformation", "DeleteStack", {"StackName": STACK, "ClientRequestToken": "c8g-" + str(uuid.uuid4())})
    except Exception as e:
        return {"result": "FAIL", "code": "DELETE_" + code_of(e), "next": "status"}
    final, code = await wait_stable("ABSENT", 35)
    if code:
        return {"result": "FAIL", "code": code, "next": "status"}
    left = await secret_absent(SECRET)
    return {"result": "REMOVED", "retained_secret_left": left == "SECRET_EXISTS",
            "code": "" if left in ("", "SECRET_EXISTS") else left, "next": "status"}


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
    before, code = await current_version()
    if code:
        return {"result": "ABORT", "code": code}
    code = await update("closed", str(EXPECTED_GENERATION + 1), CLOSED_AT)
    if code:
        return {"result": "FAIL", "code": code, "next": "status"}
    after, code = await current_version()
    if code or after == before:
        # Review A-5: CloudFormation documents a new version for a GenerateSecretString change; this
        # proves it, and a FAIL here means the old password is still current.
        return {"result": "FAIL", "code": code or "NOT_REGENERATED", "next": "status"}
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
    if MODE == "remove-failed-create":
        return await remove_failed_create()
    return await status()


try:
    result = await c8g()
    result["mode"] = MODE
except Exception as e:  # fail closed with a code only, never a message or a traceback
    result = {"result": "FAIL", "code": "UNEXPECTED_" + code_of(e), "mode": MODE}
result
