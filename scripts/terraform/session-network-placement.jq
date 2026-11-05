# Used by aws-session.yml: prints the address of every created or updated ECS service or ALB whose
# network placement differs from the code's (own task group only, public IPv4, public subnets; the
# ALB in its own group, internet-facing, public subnets). Groups and subnets are persistent, so
# their ids are known in a session plan; an unknown id fails closed. Never prints a value.
# Every security group and public subnet in the planned state, by address.
[.planned_values.root_module | recurse(.child_modules[]?) | .resources[]?] as $res
| ([$res[] | select(.type == "aws_security_group") | {key: .address, value: .values.id}] | from_entries) as $sg
| ([$res[] | select(.type == "aws_subnet" and (.address | startswith("aws_subnet.public["))) | .values.id]) as $public
| [.resource_changes[]
   | select((.change.actions | index("create")) or (.change.actions | index("update")))
   | . as $c
   | if .type == "aws_ecs_service" then
       (.address | sub("aws_ecs_service\\.this\\[0\\]$"; "aws_security_group.this")) as $own
       | (.change.after.network_configuration // []) as $n
       | select(($sg[$own] // null) == null or ($n | length) != 1
                or (($n[0].security_groups // []) | sort) != [$sg[$own]]
                or $n[0].assign_public_ip != true
                or (($n[0].subnets // []) | length) == 0
                or ((($n[0].subnets // []) - $public) | length) != 0)
       | "\($c.address) (network placement)"
     elif .type == "aws_lb" then
       select(($sg["aws_security_group.alb"] // null) == null
              or ((.change.after.security_groups // []) | sort) != [$sg["aws_security_group.alb"]]
              or .change.after.internal != false
              or ((.change.after.subnets // []) | length) == 0
              or (((.change.after.subnets // []) - $public) | length) != 0)
       | "\($c.address) (network placement)"
     else empty end]
| join(", ")
