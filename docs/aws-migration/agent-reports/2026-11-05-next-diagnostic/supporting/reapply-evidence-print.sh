#!/usr/bin/env bash
# Prints the second re-apply evidence that the runbook (phase7/08) saved in /tmp/p7.
# NOT RUN. Owner-run in the SAME CloudShell environment. It makes NO AWS call: it only reads
# local files (cat, grep, jq, python3, sha256sum). It prints no state values, only serials,
# lineage, addresses, Sids and counts. CloudShell keeps /tmp only while the environment lives,
# so run it before /tmp/p7 is lost.
set -u
D=${1:-/tmp/p7}
cd "$D" || { echo "NO-EVIDENCE: $D does not exist"; exit 2; }
echo "== files"; ls -la --time-style=+%FT%T plan.txt plan.json actual.txt expected.txt post.txt bootstrap-before.tfstate bootstrap-after.tfstate simulation-rev3.tsv 2>&1
echo "== plan summary (plan.txt)"; grep -E '^Plan:|changed outside of Terraform|^Error|^Warning' plan.txt
echo "== addresses (expected vs actual)"; diff expected.txt actual.txt && echo ADDRESSES-OK
echo "== moves"; jq -r '[.resource_changes[] | select(.previous_address != null)] | length' plan.json
echo "== changed attributes"; jq -r '.resource_changes[] | select(.change.actions==["update"]) | . as $r
  | [($r.change.before|keys[]) | select(($r.change.before[.] != $r.change.after[.]) or ($r.change.after_unknown[.]==true))]
  | "\($r.address): \(join(","))"' plan.json
echo "== planned Sids"; jq -r '.resource_changes[] | select(.change.actions==["update"]) | "\(.address) \(.change.after.policy|fromjson|[.Statement[].Sid]|join(","))"' plan.json
echo "== plan.json readable"; jq -e .format_version plan.json
echo "== clone commit (if the runbook clone is here)"; for c in "$D"/munaxa-platform "$D"/repo; do [ -d "$c/.git" ] && git -C "$c" rev-parse HEAD; done; true
echo "== post-apply plan (post.txt)"; tail -3 post.txt
echo "== state serials"; for f in bootstrap-before.tfstate bootstrap-after.tfstate; do
  python3 -I -c "import json,sys;d=json.load(open(sys.argv[1]));print(sys.argv[1],'serial',d['serial'],'lineage',d['lineage'],'resources',len(d['resources']))" "$f"; done
echo "== policies in state after apply (Sids only)"
python3 -I - bootstrap-after.tfstate <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
want={("aws_iam_policy","deployer_allow"),("aws_iam_policy","workload_boundary"),("aws_iam_role_policy","deployer_session")}
for r in d["resources"]:
    if (r["type"],r["name"]) in want or r["type"]=="aws_iam_role_policy_attachment":
        for i in r["instances"]:
            a=i["attributes"]; k=i.get("index_key")
            if "policy" in a and a["policy"]:
                print(r["type"],r["name"],k,",".join(s.get("Sid","-") for s in json.loads(a["policy"])["Statement"]))
            else:
                print(r["type"],r["name"],k,"role=",a.get("role"),"policy_arn=",a.get("policy_arn"))
PY
echo "== simulation result"; awk -F'\t' 'NR>1{c[$1]++} END{for(k in c) print k,c[k]}' simulation-rev3.tsv; grep -P '^FAIL\t' simulation-rev3.tsv
echo "== sha256"; sha256sum plan.txt plan.json post.txt bootstrap-before.tfstate bootstrap-after.tfstate simulation-rev3.tsv
echo "EVIDENCE-PRINT done"
