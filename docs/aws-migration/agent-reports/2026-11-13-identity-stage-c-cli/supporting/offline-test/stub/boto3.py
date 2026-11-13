# Fake boto3 for the offline stage C test. No network, fake values only (all contain FAKESECRET).
import json, os
from botocore.exceptions import ClientError
S = os.environ.get("SCEN", "normal")
STATE = os.environ["STATE"]
ARN = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-sn5umm"
KMS = "arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37"
PIN = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
PEM = "-----BEGIN PRIVATE KEY-----\nFAKESECRETPEMBODYAAAABBBBCCCC\n-----END PRIVATE KEY-----\n"
BASE = {"DATABASE_URL": "postgresql://identity_app:FAKESECRETDB@db.invalid:5432/identity",
        "IDENTITY_SIGNING_PRIVATE_KEY": PEM, "IDENTITY_SIGNING_SECRET": "FAKESECRETPEPPER0123456789abcdefghij",
        "REDIS_URL": "redis://:FAKESECRETR@127.0.0.1:6379", "REDIS_PASSWORD": "FAKESECRETR"}

def load():
    if os.path.exists(STATE):
        return json.load(open(STATE))
    b = dict(BASE)
    if S == "has_ring": b["MFA_ENCRYPTION_KEYS"] = "old=FAKESECRET"
    if S == "extra_key": b["EXTRA"] = "FAKESECRETX"
    if S == "empty_value": b["REDIS_PASSWORD"] = " "
    if S == "collide":
        import base64; b["IDENTITY_SIGNING_SECRET"] = "FAKESECRET" + base64.urlsafe_b64encode(bytes(range(1, 33))).decode().rstrip("=")
    raw = json.dumps(b, separators=(",", ":"))
    if S == "dup_key": raw = raw[:-1] + ',"REDIS_URL":"FAKESECRETDUP"}'
    st = {"versions": {PIN: raw}, "stages": {PIN: ["AWSCURRENT"]}}
    if S == "done_bad":
        nb = dict(b); nb["MFA_ENCRYPTION_KEYS"] = "mfa-nonprod-2026-11=FAKESECRETshort"
        n = "55555555-0000-4000-8000-000000000000"
        return {"versions": {PIN: raw, n: json.dumps(nb, separators=(",", ":"))}, "stages": {PIN: ["AWSPREVIOUS"], n: ["AWSCURRENT"]}}
    if S == "pending": st["stages"]["99999999-0000-0000-0000-000000000000"] = ["AWSPENDING"]; st["versions"]["99999999-0000-0000-0000-000000000000"] = raw
    return st

def save(st): json.dump(st, open(STATE, "w"))

class Meta:
    region_name = "eu-central-1"

class C:
    meta = Meta()
    def __init__(self, name): self.name = name
    def get_caller_identity(self):
        return {"Account": "111111111111" if S == "wrong_account" else "229251310592", "Arn": "arn:aws:iam::229251310592:root"}
    def describe_secret(self, SecretId):
        assert SecretId == ARN
        st = load()
        if S == "fail_after_write" and len(st["versions"]) > 1: raise ClientError("InternalServiceError")
        m = {"ARN": ARN if S != "arn_mismatch" else ARN + "x", "Name": "munaxa-nonprod/identity",
             "KmsKeyId": KMS if S != "wrong_kms" else "alias/aws/secretsmanager", "VersionIdsToStages": dict(st["stages"])}
        if S == "rotation": m["RotationEnabled"] = True
        if S == "moved_during_prompt":
            n = int(open(STATE + ".n").read()) + 1 if os.path.exists(STATE + ".n") else 1
            open(STATE + ".n", "w").write(str(n))
            if n >= 2: m["VersionIdsToStages"] = {PIN: ["AWSPREVIOUS"], "66666666-0000-4000-8000-000000000000": ["AWSCURRENT"]}
        if S == "race" and len(st["versions"]) > 1:
            m["VersionIdsToStages"]["77777777-0000-0000-0000-000000000000"] = ["AWSCURRENT"]
            for k in list(m["VersionIdsToStages"]):
                if k != "77777777-0000-0000-0000-000000000000": m["VersionIdsToStages"][k] = ["AWSPREVIOUS"] if k != PIN else []
        return m
    def list_secret_version_ids(self, SecretId, IncludeDeprecated=False):
        assert SecretId == ARN and IncludeDeprecated
        st = load()
        ids = list(st["versions"])
        if S == "unlabelled": ids.append("88888888-0000-4000-8000-000000000000")
        return {"ARN": ARN, "Versions": [{"VersionId": v} for v in ids]}
    def get_secret_value(self, SecretId, VersionId, VersionStage=None):
        assert SecretId == ARN
        if S == "deny_read": raise ClientError("AccessDeniedException")
        st = load()
        r = {"ARN": ARN, "VersionId": VersionId, "VersionStages": st["stages"][VersionId]}
        if S == "binary": r["SecretBinary"] = b"FAKESECRET"
        else: r["SecretString"] = st["versions"][VersionId] if not (S == "differs" and VersionId != PIN) else "{}"
        return r
    def put_secret_value(self, SecretId, SecretString, ClientRequestToken):
        assert SecretId == ARN
        st = load()
        st["versions"][ClientRequestToken] = SecretString
        for k in st["stages"]:
            if "AWSCURRENT" in st["stages"][k]: st["stages"][k] = ["AWSPREVIOUS"]
        st["stages"][ClientRequestToken] = ["AWSCURRENT"]
        save(st)
        open(STATE + ".put", "w").write(SecretString)
        return {"ARN": ARN, "Name": "munaxa-nonprod/identity", "VersionId": ClientRequestToken, "VersionStages": ["AWSCURRENT"]}

def client(name, config=None, endpoint_url=None, region_name=None):
    assert endpoint_url and "eu-central-1" in endpoint_url
    return C(name)
