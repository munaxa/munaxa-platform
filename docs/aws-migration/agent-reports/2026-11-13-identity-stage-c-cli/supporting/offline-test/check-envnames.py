# Case 28: the environment variable NAMES (never values) of the script's Python and of every AWS CLI
# process, recorded by fake-aws-server.py while requests were in flight, must be inside the allowlists.
import json, sys
seen = {"python": set(), "aws": set()}
lds = set()
for line in open(sys.argv[1]):
    r = json.loads(line)
    seen[r["kind"]].update(r["names"])
    lds.update(r.get("ld_library_path", []))
creds = {"AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN"}
allowed = {"python": {"PATH", "LANG", "LC_ALL", "PYTHONPATH", "SCEN"} | creds,  # PYTHONPATH, SCEN: test-only
           "aws": {"PATH", "HOME", "LANG", "LC_ALL", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_REGION",
                   "AWS_DEFAULT_REGION", "AWS_PAGER", "AWS_CLI_AUTO_PROMPT", "AWS_RETRY_MODE", "AWS_MAX_ATTEMPTS",
                   "AWS_EC2_METADATA_DISABLED", "AWS_CLI_FILE_ENCODING"} | creds
                   # set by the CLI v2's own PyInstaller launcher for its child, pointing at its own files
                   | {"LD_LIBRARY_PATH", "_PYI_ARCHIVE_FILE", "_PYI_LINUX_PROCESS_NAME", "_PYI_PARENT_PROCESS_LEVEL"}}

ok = True
for k in ("python", "aws"):
    extra = sorted(seen[k] - allowed[k])
    print(f"{k:7s} processes seen with variables: {','.join(sorted(seen[k]))}")
    if not seen[k] or extra:
        ok = False
        print(f"  UNEXPECTED: {extra or 'no process seen'}")
print(f"LD_LIBRARY_PATH values seen: {sorted(lds)}")
if any(not v.startswith("/usr/local/aws-cli/v2/") for v in lds):
    ok = False
    print("  UNEXPECTED LD_LIBRARY_PATH")
print("case ok" if ok else "CASE FAILED: 28")
sys.exit(0 if ok else 1)
