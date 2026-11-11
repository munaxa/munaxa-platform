"""Preflight P-11b and P-13 verifier (embedded in preflight-readonly.sh; read-only, no AWS access).

    python3 -I -c "$VERIFY" iam DIR SPEC_FILE
    python3 -I -c "$VERIFY" net DIR PREFIX DB_VPC P2_STATUS

DIR holds one file per AWS response, written by the shell: the CLI's JSON output, or a marker line
"__ABSENT__ <code>" (AWS said the resource does not exist) or "__ERROR__" (the call failed; the
shell has already recorded the ERROR). Prints one "STATUS<TAB>message" line per result, STATUS in
PASS, FAIL, ERROR. Exit 0 when it printed only PASS lines, 1 when at least one FAIL and no ERROR,
2 on any ERROR, including any response that does not have the documented shape.
This program only reads files. It imports nothing that can reach the network or run commands.
"""
import json
import re
import sys
import urllib.parse

OUT = []
SKIP = object()


class Malformed(Exception):
    pass


def emit(status, msg):
    OUT.append((status, msg))


def short(items, limit=6):
    items = sorted(items)
    text = ", ".join(items[:limit])
    return text + (f" (+{len(items) - limit} more)" if len(items) > limit else "")


def load(directory, name):
    """The response in DIR/name: parsed JSON, ("ABSENT", code), or SKIP after a failed call."""
    try:
        with open(f"{directory}/{name}", encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        raise Malformed(f"no response recorded for {name}")
    if text.startswith("__ERROR__"):
        return SKIP
    if text.startswith("__NOT_FETCHED__"):
        raise Malformed(f"{name} was not read: the VPC id did not resolve")
    if text.startswith("__ABSENT__"):
        return ("ABSENT", text.split()[1] if len(text.split()) > 1 else "?")
    try:
        return json.loads(text)
    except ValueError:
        raise Malformed(f"{name}: response is not JSON")


def need(cond, what):
    if not cond:
        raise Malformed(what)


# ------------------------------------------------------------------ IAM policy documents
LIST_KEYS = ("Action", "NotAction", "Resource", "NotResource")
STATEMENT_KEYS = {"Sid", "Effect", "Action", "NotAction", "Resource", "NotResource", "Condition",
                  "Principal", "NotPrincipal"}


def as_set(value, where):
    if isinstance(value, str):
        return [value]
    need(isinstance(value, list) and value and all(isinstance(v, str) for v in value),
         f"{where}: expected a string or a list of strings")
    return sorted(set(value))


def canon_statement(s, where):
    need(isinstance(s, dict), f"{where}: statement is not an object")
    c = {}
    for k, v in s.items():
        if k in LIST_KEYS:
            c[k] = as_set(v, f"{where} {k}")
        elif k == "Condition":
            need(isinstance(v, dict) and all(isinstance(m, dict) for m in v.values()), f"{where}: Condition shape")
            c[k] = {op: {key: as_set(val, f"{where} Condition") for key, val in m.items()} for op, m in v.items()}
        elif k in ("Principal", "NotPrincipal"):
            if isinstance(v, str):
                c[k] = v
            else:
                need(isinstance(v, dict), f"{where}: Principal shape")
                c[k] = {t: as_set(x, f"{where} Principal") for t, x in v.items()}
        else:
            # Sid, Effect and any key IAM may add later: kept as is, so a new key is a difference.
            c[k] = v
    return c


def canon_doc(doc, where):
    if isinstance(doc, str):  # the IAM API returns documents URL-encoded; the CLI normally decodes them
        try:
            doc = json.loads(urllib.parse.unquote(doc))
        except ValueError:
            raise Malformed(f"{where}: policy document is not JSON")
    need(isinstance(doc, dict), f"{where}: policy document is not an object")
    st = doc.get("Statement")
    if isinstance(st, dict):
        st = [st]
    need(isinstance(st, list) and st, f"{where}: no Statement list")
    return doc.get("Version"), [canon_statement(s, where) for s in st]


def statement_diff(label, actual, expected):
    """Lines describing how one statement differs; elements are printed, Condition values are not."""
    lines = []
    for k in sorted(set(actual) | set(expected)):
        a, e = actual.get(k), expected.get(k)
        if a == e:
            continue
        if a is None:
            lines.append(f"{label}: {k} missing")
        elif e is None:
            lines.append(f"{label}: unexpected {k} present")
        elif k in LIST_KEYS:
            added, removed = set(a) - set(e), set(e) - set(a)
            parts = ([f"added {short(added)}"] if added else []) + ([f"missing {short(removed)}"] if removed else [])
            lines.append(f"{label}: {k} {'; '.join(parts)}")
        elif k == "Condition":
            keys = lambda c: {f"{op} {key}" for op, m in c.items() for key in m}  # noqa: E731
            changed = sorted(keys(a) ^ keys(e)) or sorted(
                f"{op} {key}" for op, m in a.items() for key in m if e.get(op, {}).get(key) != m[key])
            lines.append(f"{label}: Condition differs ({short(changed)}; values not printed)")
        elif k in ("Principal", "NotPrincipal"):
            lines.append(f"{label}: {k} differs")
        else:
            lines.append(f"{label}: {k} = {json.dumps(a)[:80]}, expected {json.dumps(e)[:80]}")
    return lines


def compare_doc(where, actual_doc, expected_doc):
    version, actual = canon_doc(actual_doc, where)
    _, expected = canon_doc(expected_doc, where + " (expected)")
    fails = []
    if version != expected_doc["Version"]:
        fails.append(f"{where}: Version {version}, expected {expected_doc['Version']}")
    by_sid, unnamed = {}, []
    for s in actual:
        if "Sid" in s and s["Sid"] != "":
            if s["Sid"] in by_sid:
                fails.append(f"{where}: duplicate Sid {s['Sid']}")
            by_sid[s["Sid"]] = s
        else:
            unnamed.append(s)
    exp_sid = {s["Sid"]: s for s in expected if s.get("Sid")}
    exp_unnamed = [s for s in expected if not s.get("Sid")]
    for sid in sorted(set(exp_sid) - set(by_sid)):
        fails.append(f"{where}: statement {sid} missing")
    for sid in sorted(set(by_sid) - set(exp_sid)):
        s = by_sid[sid]
        fails.append(f"{where}: unexpected statement {sid} ({s.get('Effect')} "
                     f"{short(s.get('Action', s.get('NotAction', [])))})")
    for sid in sorted(set(by_sid) & set(exp_sid)):
        fails += statement_diff(f"{where} {sid}", by_sid[sid], exp_sid[sid])
    key = lambda s: json.dumps(s, sort_keys=True)  # noqa: E731
    rest = [key(s) for s in exp_unnamed]
    for s in unnamed:
        if key(s) in rest:
            rest.remove(key(s))
        else:
            fails.append(f"{where}: unexpected statement without Sid ({s.get('Effect')} "
                         f"{short(s.get('Action', s.get('NotAction', [])))})")
    fails += [f"{where}: expected statement without Sid missing" for _ in rest]
    if fails:
        for f in fails:
            emit("FAIL", f)
    else:
        emit("PASS", f"{where}: {len(actual)} statement(s) match the code")


def check_iam(directory, spec_file):
    with open(spec_file, encoding="utf-8") as f:
        spec = json.load(f)
    roles = load(directory, "roles.json")
    if roles is not SKIP:
        need(isinstance(roles, list) and all(isinstance(r, dict) and isinstance(r.get("RoleName"), str)
                                             for r in roles), "list-roles: Roles is not a list of roles")
        names = {r["RoleName"] for r in roles if "-session" in r["RoleName"]}
        expected = set(spec["roles"])
        if names == expected:
            emit("PASS", f"session roles under {spec['path']} = {short(names)}")
        else:
            if expected - names:
                emit("FAIL", f"ABSENT: session role(s) {short(expected - names)} not under {spec['path']}")
            if names - expected:
                emit("FAIL", f"unexpected session role(s) under {spec['path']}: {short(names - expected)}")
    for name, exp in sorted(spec["roles"].items()):
        role = load(directory, f"role-{name}.json")
        if role is SKIP:
            continue
        if isinstance(role, tuple):
            emit("FAIL", f"ABSENT: role {name} (AWS answered {role[1]})")
            continue
        need(isinstance(role, dict) and role.get("RoleName") == name, f"get-role {name}: unexpected shape")
        for field in ("Path", "Arn", "MaxSessionDuration"):
            want = spec["path"] if field == "Path" else exp[field]
            if role.get(field) == want:
                emit("PASS", f"{name} {field} = {want}")
            else:
                emit("FAIL", f"{name} {field} = {role.get(field)!r}, expected {want!r}")
        # Any PermissionsBoundary value at all is a boundary: the code sets none.
        boundary = role.get("PermissionsBoundary")
        if isinstance(boundary, dict):
            boundary = boundary.get("PermissionsBoundaryArn") or boundary or None
        if boundary == exp["PermissionsBoundary"]:
            emit("PASS", f"{name} permissions boundary = none (as in the code)")
        else:
            emit("FAIL", f"{name} permissions boundary = {boundary}, expected none (the code sets none)")
        need("AssumeRolePolicyDocument" in role, f"get-role {name}: no AssumeRolePolicyDocument")
        compare_doc(f"{name} trust policy", role["AssumeRolePolicyDocument"], exp["trust"])

        inline = load(directory, f"inline-names-{name}.json")
        if inline is not SKIP:
            need(isinstance(inline, list) and all(isinstance(p, str) for p in inline),
                 f"list-role-policies {name}: not a list of names")
            if set(inline) == set(exp["inline"]):
                emit("PASS", f"{name} inline policies = {short(inline)}")
            else:
                emit("FAIL", f"{name} inline policies = {short(inline) or 'none'}, expected {short(exp['inline'])}")
        for pname, pdoc in sorted(exp["inline"].items()):
            doc = load(directory, f"inline-{name}-{pname}.json")
            if doc is SKIP:
                continue
            if isinstance(doc, tuple):
                emit("FAIL", f"ABSENT: inline policy {pname} on {name} (AWS answered {doc[1]})")
                continue
            compare_doc(f"{name} inline {pname}", doc, pdoc)

        attached = load(directory, f"attached-{name}.json")
        if attached is not SKIP:
            need(isinstance(attached, list) and all(isinstance(p, dict) and isinstance(p.get("PolicyArn"), str)
                                                    for p in attached),
                 f"list-attached-role-policies {name}: not a list of policies")
            arns = {p["PolicyArn"] for p in attached}
            if arns == set(exp["attached"]):
                emit("PASS", f"{name} attached policies = {short(a.rsplit('/', 1)[1] for a in arns) or 'none'}")
            else:
                if set(exp["attached"]) - arns:
                    emit("FAIL", f"{name} attached policy missing: {short(set(exp['attached']) - arns)}")
                if arns - set(exp["attached"]):
                    emit("FAIL", f"{name} unexpected attached policy: {short(arns - set(exp['attached']))}")
    attached_docs = {}
    for exp in spec["roles"].values():
        attached_docs.update(exp["attached"])
    for i, (arn, pdoc) in enumerate(sorted(attached_docs.items())):
        doc = load(directory, f"policy-{i}.json")
        if doc is SKIP:
            continue
        if isinstance(doc, tuple):
            emit("FAIL", f"ABSENT: managed policy {arn} (AWS answered {doc[1]})")
            continue
        compare_doc(f"managed policy {arn.rsplit('/', 1)[1]}", doc, pdoc)
    key = load(directory, "state-key.json")
    if key is not SKIP:
        if isinstance(key, tuple):
            emit("FAIL", f"ABSENT: {spec['state_key_alias']} (AWS answered {key[1]})")
        elif key == spec["state_key_arn"]:
            emit("PASS", f"{spec['state_key_alias']} = the state key in the expected policy")
        else:
            need(isinstance(key, str), "kms describe-key: not an ARN")
            emit("FAIL", f"{spec['state_key_alias']} = {key}, expected {spec['state_key_arn']}")


# ------------------------------------------------------------------ network topology (stack/network.tf)
ROUTE_TARGETS = ("GatewayId", "NatGatewayId", "InstanceId", "NetworkInterfaceId", "VpcPeeringConnectionId",
                 "TransitGatewayId", "EgressOnlyInternetGatewayId", "CarrierGatewayId", "LocalGatewayId",
                 "CoreNetworkArn", "OdbNetworkArn", "IpAddress")


def tag(item, key="Name"):
    tags = item.get("Tags") or []
    need(isinstance(tags, list), "Tags is not a list")
    return next((t.get("Value") for t in tags if isinstance(t, dict) and t.get("Key") == key), None)


def items(data, what):
    need(isinstance(data, list) and all(isinstance(i, dict) for i in data), f"{what}: not a list of objects")
    return data


def check_net(directory, c, db_vpc, p2_status):
    vpc_cidr = "10.130.0.0/16"
    subnets_spec = {f"{c}-public-a": ("eu-central-1a", "10.130.0.0/24"), f"{c}-public-b": ("eu-central-1b", "10.130.1.0/24"),
                    f"{c}-db-a": ("eu-central-1a", "10.130.64.0/24"), f"{c}-db-b": ("eu-central-1b", "10.130.65.0/24"),
                    f"{c}-db-c": ("eu-central-1c", "10.130.66.0/24")}
    sg_spec = {"default", f"{c}-alb", f"{c}-database", f"{c}-db-admin", f"{c}-identity", f"{c}-identity-migrate"}
    fails_before = sum(1 for s, _ in OUT if s == "FAIL")

    vpcs = load(directory, "vpcs.json")
    if vpcs is SKIP:
        return
    vpcs = items(vpcs, "describe-vpcs")
    if len(vpcs) != 1:
        emit("FAIL", f"VPCs tagged Name={c}: {len(vpcs)}, expected 1" + (" (ABSENT)" if not vpcs else ""))
        emit("FAIL", "network topology not checked: the VPC could not be identified")
        return
    vpc = vpcs[0]
    vid = vpc.get("VpcId")
    need(isinstance(vid, str) and re.fullmatch(r"vpc-[0-9a-f]{8,17}", vid), "describe-vpcs: no valid VpcId")
    for label, got, want in (("CIDR", vpc.get("CidrBlock"), vpc_cidr), ("state", vpc.get("State"), "available"),
                             ("IsDefault", vpc.get("IsDefault"), False)):
        emit("PASS" if got == want else "FAIL", f"VPC {c} {label} = {got}" + ("" if got == want else f", expected {want}"))
    if p2_status == "ERROR":
        emit("ERROR", f"VPC {vid} not compared with the database VPC: P-2 failed")
    elif not db_vpc:
        emit("FAIL", f"VPC {vid} not compared with the database VPC: P-2 found no database")
    elif vid == db_vpc:
        emit("PASS", f"VPC {c} = database VPC {vid}")
    else:
        emit("FAIL", f"VPC {c} = {vid}, but the database is in {db_vpc}")

    subnet_ids = {}
    data = load(directory, "subnets.json")
    if data is not SKIP:
        found = {}
        for s in items(data, "describe-subnets"):
            name = tag(s)
            need(isinstance(s.get("SubnetId"), str), "describe-subnets: no SubnetId")
            if s.get("VpcId") != vid:
                emit("FAIL", f"subnet {name or s['SubnetId']} in {s.get('VpcId')}, expected {vid}")
                continue
            if name in found:
                emit("FAIL", f"two subnets named {name}")
            found[name] = s
        for name in sorted(set(subnets_spec) - set(found)):
            emit("FAIL", f"ABSENT: subnet {name} in {vid}")
        for name in sorted(set(found) - set(subnets_spec), key=str):
            emit("FAIL", f"unexpected subnet {name or found[name]['SubnetId']} in {vid}")
        for name in sorted(set(found) & set(subnets_spec)):
            s, (az, cidr) = found[name], subnets_spec[name]
            got = (s.get("AvailabilityZone"), s.get("CidrBlock"), s.get("MapPublicIpOnLaunch"), s.get("State"))
            if got == (az, cidr, False, "available"):
                emit("PASS", f"subnet {name} {az} {cidr}, no public IP on launch, available")
            else:
                emit("FAIL", f"subnet {name} = {got}, expected {(az, cidr, False, 'available')}")
            subnet_ids[s["SubnetId"]] = name

    igw_id = None
    data = load(directory, "igws.json")
    if data is not SKIP:
        igws = items(data, "describe-internet-gateways")
        if len(igws) != 1:
            emit("FAIL", f"internet gateways tagged {c}-igw: {len(igws)}, expected 1" + (" (ABSENT)" if not igws else ""))
        else:
            g = igws[0]
            need(isinstance(g.get("InternetGatewayId"), str), "describe-internet-gateways: no id")
            att = g.get("Attachments") or []
            need(isinstance(att, list), "describe-internet-gateways: Attachments is not a list")
            # The API reports an attached internet gateway as "available" (API_InternetGatewayAttachment).
            ok = [a for a in att if isinstance(a, dict) and a.get("VpcId") == vid and a.get("State") in ("available", "attached")]
            if len(att) == 1 and ok:
                igw_id = g["InternetGatewayId"]
                emit("PASS", f"internet gateway {c}-igw {igw_id} attached to {vid}")
            elif not att:
                emit("FAIL", f"internet gateway {c}-igw {g['InternetGatewayId']} is detached")
            else:
                emit("FAIL", f"internet gateway {c}-igw attachments = "
                             f"{[(a.get('VpcId'), a.get('State')) for a in att if isinstance(a, dict)]}, expected [({vid}, available)]")

    endpoint_id = None
    data = load(directory, "endpoints.json")
    rts = load(directory, "route-tables.json")
    rt_by_name = {}
    if rts is not SKIP:
        for t in items(rts, "describe-route-tables"):
            need(isinstance(t.get("RouteTableId"), str) and isinstance(t.get("Routes"), list)
                 and isinstance(t.get("Associations"), list), "describe-route-tables: incomplete route table")
            if t.get("VpcId") != vid:
                emit("FAIL", f"route table {tag(t) or t['RouteTableId']} in {t.get('VpcId')}, expected {vid}")
                continue
            main = any(isinstance(a, dict) and a.get("Main") is True for a in t["Associations"])
            key = "main" if main else tag(t)
            if key in rt_by_name:
                emit("FAIL", f"two route tables as {key}")
            rt_by_name[key] = t
    if data is not SKIP:
        eps = items(data, "describe-vpc-endpoints")
        if len(eps) != 1:
            emit("FAIL", f"VPC endpoints in {vid}: {len(eps)}, expected 1 (the S3 gateway endpoint)")
        else:
            e = eps[0]
            want_rt = [rt_by_name[f"{c}-rt-public"]["RouteTableId"]] if f"{c}-rt-public" in rt_by_name else None
            got = (e.get("VpcId"), e.get("ServiceName"), e.get("VpcEndpointType"), str(e.get("State", "")).lower(),
                   sorted(e.get("RouteTableIds") or []), tag(e))
            want = (vid, "com.amazonaws.eu-central-1.s3", "Gateway", "available", want_rt, f"{c}-s3")
            if got == want:
                endpoint_id = e.get("VpcEndpointId")
                emit("PASS", f"S3 gateway endpoint {endpoint_id} on {c}-rt-public only")
            else:
                emit("FAIL", f"S3 endpoint = {got}, expected {want}")

    if rts is not SKIP:
        wanted = {"main": set(), f"{c}-rt-public": {f"{c}-public-a", f"{c}-public-b"},
                  f"{c}-rt-db": {f"{c}-db-a", f"{c}-db-b", f"{c}-db-c"}}
        for key in sorted(set(wanted) - set(rt_by_name)):
            emit("FAIL", f"ABSENT: route table {key} in {vid}")
        for key in sorted(set(rt_by_name) - set(wanted), key=str):
            emit("FAIL", f"unexpected route table {key or rt_by_name[key]['RouteTableId']} in {vid}")
        seen = {}
        for key in sorted(set(wanted) & set(rt_by_name)):
            t = rt_by_name[key]
            assoc_names, bad = set(), []
            for a in t["Associations"]:
                need(isinstance(a, dict), "describe-route-tables: association is not an object")
                state = (a.get("AssociationState") or {}).get("State")
                if a.get("Main") is True:
                    if key != "main" or a.get("SubnetId") or a.get("GatewayId"):
                        bad.append("main association")
                    continue
                if a.get("GatewayId") or not a.get("SubnetId"):
                    bad.append(f"edge association {a.get('GatewayId')}")
                    continue
                sname = subnet_ids.get(a["SubnetId"], a["SubnetId"])
                if state != "associated":
                    bad.append(f"{sname} association {state}")
                assoc_names.add(sname)
                seen.setdefault(sname, []).append(key)
            if assoc_names == wanted[key] and not bad:
                emit("PASS", f"route table {key} associations = {short(assoc_names) or 'main only'}")
            else:
                extra, missing = assoc_names - wanted[key], wanted[key] - assoc_names
                emit("FAIL", f"route table {key} associations: " + "; ".join(
                    ([f"missing {short(missing)}"] if missing else []) + ([f"unexpected {short(extra)}"] if extra else []) + bad))
            routes, bad = list(t["Routes"]), []
            local = [r for r in routes if isinstance(r, dict) and r.get("DestinationCidrBlock") == vpc_cidr
                     and r.get("GatewayId") == "local" and r.get("State") == "active"]
            rest = [r for r in routes if r not in local[:1]]
            if len(local) < 1:
                bad.append("local route missing or not active")
            if key == f"{c}-rt-public":
                default = [r for r in rest if isinstance(r, dict) and r.get("DestinationCidrBlock") == "0.0.0.0/0"]
                s3 = [r for r in rest if isinstance(r, dict) and str(r.get("DestinationPrefixListId", "")).startswith("pl-")]
                rest = [r for r in rest if r not in default and r not in s3]
                if len(default) != 1:
                    bad.append(f"{len(default)} default routes, expected 1")
                else:
                    r = default[0]
                    targets = {k: r[k] for k in ROUTE_TARGETS if r.get(k)}
                    if igw_id is None:
                        bad.append("default route not verified: the internet gateway is not attached to this VPC")
                    elif targets != {"GatewayId": igw_id}:
                        bad.append(f"default route targets {targets}, expected {{'GatewayId': '{igw_id}'}}")
                    if r.get("State") != "active":
                        bad.append(f"default route state {r.get('State')}")
                if len(s3) != 1:
                    bad.append(f"{len(s3)} S3 endpoint routes, expected 1")
                else:
                    r = s3[0]
                    targets = {k: r[k] for k in ROUTE_TARGETS if r.get(k)}
                    if endpoint_id is None or targets != {"GatewayId": endpoint_id} or r.get("State") != "active":
                        bad.append(f"S3 route targets {targets} state {r.get('State')}, expected the S3 endpoint, active")
            for r in rest:
                bad.append(f"unexpected route {r.get('DestinationCidrBlock') or r.get('DestinationIpv6CidrBlock') or r.get('DestinationPrefixListId')}"
                           f" -> {({k: r[k] for k in ROUTE_TARGETS if r.get(k)})} {r.get('State')}" if isinstance(r, dict) else "malformed route")
            if bad:
                for b in bad:
                    emit("FAIL", f"route table {key}: {b}")
            else:
                emit("PASS", f"route table {key} routes = local" + (", 0.0.0.0/0 -> " + igw_id + " active, S3 endpoint active"
                                                                   if key == f"{c}-rt-public" else " only"))
        for sid, sname in sorted(subnet_ids.items(), key=lambda x: x[1]):
            if len(seen.get(sname, [])) != 1 and sname in subnets_spec:
                emit("FAIL", f"subnet {sname} has {len(seen.get(sname, []))} explicit route table associations, expected 1")

    data = load(directory, "sgs.json")
    if data is not SKIP:
        found = {}
        for g in items(data, "describe-security-groups"):
            name = g.get("GroupName")
            need(isinstance(name, str), "describe-security-groups: no GroupName")
            if g.get("VpcId") != vid:
                emit("FAIL", f"security group {name} in {g.get('VpcId')}, expected {vid}")
                continue
            found[name] = g
        if set(found) == sg_spec:
            emit("PASS", f"security groups in {vid} = {short(found, 10)}")
        else:
            if sg_spec - set(found):
                emit("FAIL", f"ABSENT: security group(s) {short(sg_spec - set(found))} in {vid}")
            if set(found) - sg_spec:
                emit("FAIL", f"unexpected security group(s) in {vid}: {short(set(found) - sg_spec)}")
        if "default" in found:
            d = found["default"]
            if tag(d) != f"{c}-default-unused":
                emit("FAIL", f"default security group Name tag = {tag(d)}, expected {c}-default-unused")
            # aws_default_security_group with no rule blocks: Terraform removes every rule.
            if d.get("IpPermissions") or d.get("IpPermissionsEgress"):
                emit("FAIL", "default security group has rules; the code leaves it with none")
            else:
                need("IpPermissions" in d and "IpPermissionsEgress" in d, "describe-security-groups: no rule lists")
                emit("PASS", "default security group has no rules")


def main(argv):
    try:
        if argv[1:2] == ["iam"] and len(argv) == 4:
            check_iam(argv[2], argv[3])
        elif argv[1:2] == ["net"] and len(argv) == 6:
            check_net(argv[2], argv[3], argv[4], argv[5])
        else:
            raise Malformed("usage: iam DIR SPEC | net DIR PREFIX DB_VPC P2_STATUS")
    except Malformed as e:
        emit("ERROR", f"malformed response, nothing verified from it: {e}")
    except Exception as e:  # any surprise is an ERROR, never a PASS
        emit("ERROR", f"verifier failed: {type(e).__name__}: {e}")
    for status, msg in OUT:
        print(f"{status}\t{msg}")
    statuses = {s for s, _ in OUT}
    if not OUT or "ERROR" in statuses:
        return 2
    return 1 if "FAIL" in statuses else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
