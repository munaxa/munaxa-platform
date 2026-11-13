# Fake AWS endpoint for the offline stage C test: the REAL AWS CLI v2 talks HTTP to this server.
# It serves the container credential provider, STS GetCallerIdentity (query/XML) and the four
# Secrets Manager operations (JSON 1.1), backed by stub/boto3.py so every scenario (SCEN) behaves as
# in the revision 1 test. Fake values only, all containing FAKESECRET.
# On every request it also scans /proc/*/cmdline and /proc/*/environ of every process for the fake
# marker and, once written, the generated key: any hit is a leak through arguments or environment.
# Usage: SCEN=... STATE=... python3 fake-aws-server.py <port>
import base64, json, os, sys, threading, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "stub"))
import boto3  # the stub
from botocore.exceptions import ClientError

STATE = os.environ["STATE"]
TOKEN = "fake-container-authorization-token"
SM = boto3.C("secretsmanager")
STS = boto3.C("sts")
LOCK = threading.Lock()
ALLOWED = {"DescribeSecret", "ListSecretVersionIds", "GetSecretValue", "PutSecretValue"}


def log(rec):
    with open(STATE + ".ops", "a") as f:
        f.write(json.dumps(rec) + "\n")


def proc_scan(tag):
    needles = [b"FAKESECRET"]
    if os.path.exists(STATE + ".put"):
        ring = json.load(open(STATE + ".put")).get("MFA_ENCRYPTION_KEYS", "")
        if "=" in ring:
            needles.append(ring.split("=", 1)[1].encode())
    hits, scanned = [], 0
    me = str(os.getpid())
    for pid in os.listdir("/proc"):
        if not pid.isdigit() or pid == me:
            continue
        for part in ("cmdline", "environ"):
            try:
                data = open(f"/proc/{pid}/{part}", "rb").read()
            except OSError:
                continue
            scanned += 1
            if any(n in data for n in needles):
                hits.append(f"{pid}/{part}")
            if part == "environ":
                try:
                    cmd = open(f"/proc/{pid}/cmdline", "rb").read().split(b"\0")
                except OSError:
                    continue
                kind = ("python" if cmd[0].rsplit(b"/", 1)[-1].startswith(b"python3") and b"ignore" in cmd else
                        "aws" if cmd[:1] and cmd[0].endswith(b"/aws") or b"/usr/local/bin/aws" in cmd[:2] else None)
                if kind:
                    names = sorted({e.split(b"=", 1)[0].decode() for e in data.split(b"\0") if b"=" in e})
                    ld = [e.split(b"=", 1)[1].decode() for e in data.split(b"\0") if e.startswith(b"LD_LIBRARY_PATH=")]
                    with open(STATE + ".envnames", "a") as f:
                        f.write(json.dumps({"kind": kind, "names": names, "ld_library_path": ld}) + "\n")
    with open(STATE + ".proc", "a") as f:
        f.write(json.dumps({"at": tag, "scanned": scanned, "hits": hits}) + "\n")


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("x-amzn-RequestId", str(uuid.uuid4()))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):  # container credential provider
        ok = self.path == "/creds" and self.headers.get("Authorization") == TOKEN
        log({"op": "ContainerCredentials", "authorized": ok})
        if not ok:
            return self.send(403, "{}", "application/json")
        self.send(200, json.dumps({"AccessKeyId": "AKIAFAKEFAKEFAKE", "SecretAccessKey": "fake/fake",
                                   "Token": "fake", "Expiration": "2099-01-01T00:00:00Z"}), "application/json")

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        target = self.headers.get("X-Amz-Target", "")
        with LOCK:
            proc_scan(target or "sts")
            if target.startswith("secretsmanager."):
                return self.secrets_manager(target.split(".", 1)[1], json.loads(body or b"{}"))
            q = parse_qs(body.decode())
            if q.get("Action") == ["GetCallerIdentity"]:
                log({"op": "GetCallerIdentity"})
                who = STS.get_caller_identity()
                xml = ("<GetCallerIdentityResponse xmlns=\"https://sts.amazonaws.com/doc/2011-06-15/\">"
                       f"<GetCallerIdentityResult><Arn>{who['Arn']}</Arn><UserId>{who['Account']}</UserId>"
                       f"<Account>{who['Account']}</Account></GetCallerIdentityResult>"
                       "<ResponseMetadata><RequestId>x</RequestId></ResponseMetadata></GetCallerIdentityResponse>")
                return self.send(200, xml, "text/xml")
            log({"op": "UNEXPECTED", "target": target})
            self.send(400, "{}", "application/json")

    def secrets_manager(self, op, params):
        log({"op": op, "params": sorted(params), "token": params.get("ClientRequestToken"),
             "secret_id": params.get("SecretId"), "version_id": params.get("VersionId"),
             "stage": params.get("VersionStage"), "include_deprecated": params.get("IncludeDeprecated")})
        if op not in ALLOWED:
            return self.send(400, json.dumps({"__type": "UnexpectedOperation", "message": "FAKESECRET"}), "application/x-amz-json-1.1")
        try:
            if op == "DescribeSecret":
                out = SM.describe_secret(SecretId=params["SecretId"])
            elif op == "ListSecretVersionIds":
                out = SM.list_secret_version_ids(SecretId=params["SecretId"], IncludeDeprecated=params.get("IncludeDeprecated", False))
            elif op == "GetSecretValue":
                out = SM.get_secret_value(SecretId=params["SecretId"], VersionId=params.get("VersionId"), VersionStage=params.get("VersionStage"))
                if isinstance(out.get("SecretBinary"), bytes):
                    out["SecretBinary"] = base64.b64encode(out["SecretBinary"]).decode()
            else:
                if "VersionStages" in params:
                    log({"op": "PutSecretValue_WITH_VERSION_STAGES"})
                out = SM.put_secret_value(SecretId=params["SecretId"], SecretString=params["SecretString"],
                                          ClientRequestToken=params["ClientRequestToken"])
                proc_scan("after-put")
        except ClientError as e:
            err = e.response["Error"]
            return self.send(400, json.dumps({"__type": err["Code"], "message": err["Message"]}), "application/x-amz-json-1.1")
        self.send(200, json.dumps(out), "application/x-amz-json-1.1")


ThreadingHTTPServer.allow_reuse_address = True
srv = ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H)
srv.serve_forever()
