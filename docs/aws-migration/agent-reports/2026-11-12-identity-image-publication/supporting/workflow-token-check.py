"""Static checks of GitHub Actions workflows for package-token exposure (offline, read-only)."""
import re,sys,pathlib,yaml
def main(paths):
    bad=0
    for f in paths:
        t=pathlib.Path(f).read_text(); d=yaml.safe_load(t); on=d.get(True,d.get("on"))
        errs=[]
        if isinstance(on,dict) and "pull_request_target" in on or on=="pull_request_target": errs.append("pull_request_target trigger")
        if "permissions" not in d: errs.append("no workflow-level permissions")
        elif d["permissions"] not in ({"contents":"read"},):
            if isinstance(d["permissions"],dict) and any(v=="write" for v in d["permissions"].values()): errs.append(f"workflow-level write permission {d['permissions']}")
        if "PLATFORM_PACKAGES_TOKEN" in re.sub(r'#.*','',re.sub(r"git grep[^\n]*",'',t)) : errs.append("references PLATFORM_PACKAGES_TOKEN")
        for jn,j in d.get("jobs",{}).items():
            if any("secrets." in str(v) for v in (j.get("env") or {}).values()): errs.append(f"{jn}: secret in job-level env")
            perms=j.get("permissions",d.get("permissions",{})) or {}
            for i,s in enumerate(j.get("steps",[])):
                u=s.get("uses")
                if u and not u.startswith("./") and not re.search(r'@[0-9a-f]{40}$',u): errs.append(f"{jn}[{i}]: unpinned {u}")
                if u and u.startswith("actions/checkout@") and (s.get("with") or {}).get("persist-credentials") is not False: errs.append(f"{jn}[{i}]: checkout persists credentials")
                txt=str(s.get("env",""))+str(s.get("with",""))
                if "secrets.GITHUB_TOKEN" in txt and "NODE_AUTH_TOKEN" in txt or "npm_token" in txt or "node_auth_token" in txt:
                    if perms.get("packages") not in ("read","write"): errs.append(f"{jn}[{i}]: package token without packages permission")
                if "secrets." in str(s.get("run","")): errs.append(f"{jn}[{i}]: secret interpolated into run script")
        print(("FAIL " if errs else "PASS ")+f); [print("   -",e) for e in errs]; bad+=bool(errs)
    return bad
sys.exit(1 if main(sys.argv[1:]) else 0)
