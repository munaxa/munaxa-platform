| Category | Calls | Allowed | Explicit deny | Implicit deny | Roles | Examples (id: expected) |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Own-environment writes and reads (deployer) | 21 | 21 | 0 | 0 | nonprod | D01.1 Delete own SG (munaxa/nonprod): allowed |
| Tags required on create | 3 | 0 | 3 | 0 | nonprod | D11.1 CreateVpc WITHOUT tags: explicitDeny |
| Untagged KMS keys (R1) | 7 | 2 | 2 | 3 | nonprod | D28.1 Claim UNTAGGED foreign KMS key by TagResource: allowed; N60.1 Claim an untagged key as prod: explicitDeny; D21.1 Schedule deletion of UNTAGGED foreign KMS key: implicitDeny |
| Untagged ACM certificates (R2) | 6 | 2 | 3 | 1 | nonprod | N65.1 Claim an untagged certificate: allowed; N66.1 Claim an untagged certificate as prod: explicitDeny; D48.1 DeleteCertificate UNTAGGED foreign: implicitDeny |
| Untagged Cloud Map (R3) | 8 | 2 | 2 | 4 | nonprod, session | D55.2 Cloud Map service in UNTAGGED foreign namespace: allowed; N71.1 Claim an untagged namespace as prod: explicitDeny; D47.1 DeleteNamespace UNTAGGED foreign Cloud Map: implicitDeny |
| Untagged and default security groups (R4) | 12 | 3 | 4 | 5 | nonprod, prod, session | D05.2 Open ingress on UNTAGGED SG, new rule tagged munaxa/nonprod: allowed; D14.1 Adopt default SG of the account default VPC: explicitDeny; D03.1 Delete UNTAGGED SG (the B2 gap): implicitDeny |
| Other untagged resources (EC2 VPC/subnet, ELB, logs, ECS) | 7 | 1 | 0 | 6 | nonprod | D07.2 Create subnet in UNTAGGED VPC with own tags: allowed; D07.1 Create subnet in UNTAGGED VPC with own tags: implicitDeny |
| Cross-environment | 22 | 2 | 17 | 3 | nonprod, prod, session | N35.1 Prod creates its own role with its own boundary: allowed; D04.1 Delete SG tagged Environment=prod: explicitDeny; N23.1 Nonprod updates an untagged prod ECS service (no name deny on services): implicitDeny |
| State key, alias and bucket (H-2, H-2b) | 19 | 4 | 14 | 1 | nonprod, prod, session | D38.1 Write nonprod state: allowed; D22.1 Schedule deletion of the shared STATE key (H-2): explicitDeny; N12.1 Read the bootstrap state: implicitDeny |
| Production and Docs secrets | 12 | 1 | 9 | 2 | nonprod, prod, session | N48.1 RDS deletes the master secret on the deployer behalf: allowed; D36.1 CreateSecret munaxa-prod/x: explicitDeny; N48.2 Deployer deletes an rds! secret directly: implicitDeny |
| Production and Docs buckets | 7 | 1 | 5 | 1 | nonprod, prod, session | N55.1 Own bucket policy: allowed; N50.1 Nonprod reads a prod object: explicitDeny; N52.1 Deployer reads an object of its own bucket (no data reads): implicitDeny |
| IAM roles and boundaries (H-1) | 5 | 2 | 0 | 3 | nonprod | D32.1 CreateRole munaxa-nonprod-x with nonprod boundary: allowed; D31.1 CreateRole munaxa-shared/evil with nonprod boundary (H-1): implicitDeny |
| Docs, bootstrap and other-project protection | 4 | 0 | 4 | 0 | nonprod | D02.1 Delete SG tagged Project=other: explicitDeny |
| Guardrails (region, account settings, sharing, users) | 10 | 0 | 10 | 0 | nonprod | D15.1 Modify the account default VPC: explicitDeny |
| Route 53 (R5) | 5 | 3 | 1 | 1 | nonprod | D44.1 Route 53 record in nonprod.munaxa.internal: allowed; D58.1 Associate the account default VPC with a hosted zone: explicitDeny; D45.1 Route 53 record in another zone: implicitDeny |
| RDS master secret and data key via service (B-1) | 9 | 4 | 1 | 4 | nonprod, prod | RB1n1.1 B-1: RDS creates the master secret on the deployer behalf: allowed; N102.1 Prod data key through RDS: explicitDeny; RB1n2.1 B-1: RDS creates the master secret - the deployer directly: implicitDeny |
| Session: plan refresh reads (B-2) | 74 | 74 | 0 | 0 | session | SR001.1 Session refresh: network (vpc, igw, subnet, route*, endpoint, *security_group*): allowed |
| Session: up/down writes | 26 | 26 | 0 | 0 | session | S01.1 Session: stop own DB: allowed |
| Session: refusals (H-3, R10) | 43 | 2 | 18 | 23 | session | SR092.2 Session refused: CIDR rule on the ALB group: allowed; S13.1 Session: write prod state: explicitDeny; S04.1 Session: egress rule on own SG (R10: persistent, not a session write): implicitDeny |
| CI roles reach only their own deployer (R-17, H-3) | 8 | 4 | 0 | 4 | ci-nonprod, ci-prod, ci-session | C01.1 Nonprod CI role assumes the nonprod deployer: allowed; C02.1 Nonprod CI role assumes the prod deployer: implicitDeny |
| Boundary nonprod (H-1) | 17 | 5 | 6 | 6 | boundary-nonprod | B02.1 Boundary: nonprod role reads munaxa-nonprod secret: allowed; B03.1 Boundary: decrypt with a prod-tagged key: explicitDeny; B01.1 Boundary: nonprod role reads munaxa-prod secret (H-1): implicitDeny |
| Boundary prod (H-1) | 7 | 2 | 1 | 4 | boundary-prod | BP02.1 Prod boundary: own secret: allowed; BP03.1 Prod boundary: nonprod-tagged key: explicitDeny; BP01.1 Prod boundary: nonprod secret: implicitDeny |
| **Total** | **332** | **161** | **100** | **71** | | |

| Principal | Allowed | Explicit deny | Implicit deny | Total |
| --- | ---: | ---: | ---: | ---: |
| nonprod | 42 | 59 | 30 | 131 |
| prod | 6 | 9 | 2 | 17 |
| session | 102 | 25 | 25 | 152 |
| ci-nonprod | 1 | 0 | 2 | 3 |
| ci-prod | 1 | 0 | 1 | 2 |
| ci-session | 2 | 0 | 1 | 3 |
| boundary-nonprod | 5 | 6 | 6 | 17 |
| boundary-prod | 2 | 1 | 4 | 7 |
