# Supporting files: G3 failed apply recovery

| File | What | sha256 |
| --- | --- | --- |
| `bootstrap-createscarry-ec2-parents.patch` | C-1: the proposed IAM guardrail change (bootstrap `iam.tf`, `iam_allow.tf`, one test). Applies to `bf46c5d` (`git apply --check` passes). Not merged, not applied | `70fbed7d2319a24307dde7c81a45ac3a16d3a85bd300f62e32ae6ef93e0daf00` |
| `nonprod.expected-changes.g3-recovery-DRAFT.json` | C-2: the 26-create recovery declaration (filtered from the merged 64; `--validate` passes). Not committed to `envs/` | `c8ca8789a72bc9ae0f2aebdadc93522c268af67b32bba528c0cc9ca3e05cb931` |
| `state-38-addresses.txt` | The 38 managed addresses in `nonprod/stack.tfstate` version `cmp240i_.nN.inwND8wBX52tvNC.Ynp2`, serial 3 (addresses only) | — |
| `recovery-26-addresses.txt` | The declared 64 minus the 38 | — |

## Decoded authorization messages (3 of 10)

`sts:DecodeAuthorizationMessage`, root, read-only, 5 Nov about 23:45 UTC. Fields kept: verdict, matched statement ids and their conditions, the evaluated action and resource, and the names of the context keys (values are tags and ids already in the report). The encoded strings are in the public job log.

| Denial | Action | Resource | allowed / explicitDeny | Matched statements | Condition of each | `aws:RequestTag/*` in context |
| --- | --- | --- | --- | --- | --- | --- |
| `aws_security_group.database` | CreateSecurityGroup | `vpc/vpc-0824ebbff902d2980` | false / true | `CreatesCarryProjectTag`, `CreatesCarryEnvironmentTag` | `aws:RequestTag/Project` = munaxa; `aws:RequestTag/Environment` = nonprod (operator StringNotEquals in the policy) | **absent** |
| `aws_subnet.public["a"]` | CreateSubnet | same | false / true | same two | same | **absent** |
| `aws_route_table.public` | CreateRouteTable | same | false / true | same two | same | **absent** |

Context keys present in all three: `aws:ResourceTag/{Project,Environment,Stack,Name,ManagedBy}`, `ec2:ResourceTag/{same}`, `229251310592:{same}`, `ec2:VpcID`, `ec2:Tenancy`, `ec2:Region`, `aws:Region`, `aws:Service`, `aws:Type` (= vpc), `aws:Resource`, `aws:ARN`, `aws:Account`.
