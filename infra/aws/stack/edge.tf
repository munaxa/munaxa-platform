# The environment edge: one internet-facing ALB, HTTPS only, host-based rules per service
# (shared AWS hosting ADR §1). Cloudflare stays the DNS provider; every host is a CNAME there to
# this ALB, which is an owner action. Nothing here changes DNS.
#
# The certificate is requested in the persistent layer (no charge) so its DNS validation records
# can be added in Cloudflare once and keep it renewing. The ALB, its listeners and the operator
# restriction exist only while edge_enabled: Testing turns it off between sessions, which removes
# the ALB-hour charge and its two public IPv4 addresses.
#
# Listener rule priorities (lower wins):
#
# | Priority | Host        | Condition                          | Action                          |
# | -------- | ----------- | ---------------------------------- | ------------------------------- |
# | 10       | control_api | /api/v1/admin/*                    | 403 (the admin API is private)  |
# | 20       | control_api | —                                  | Control API                     |
# | 30       | operator    | /api/auth/*; Access or source IPs  | Identity                        |
# | 31       | operator    | Access or source IPs               | Control portal                  |
# | 39       | operator    | —                                  | 403 (Control ADR-0006)          |
# | 40       | identity    | —                                  | Identity                        |
# | 50-52    | work        | /api/auth/*, /api/v1/*, rest       | Identity, Work API, Work admin  |
# | 60-61    | school      | /api/v1/*, rest                    | School API, School admin        |
# | default  | any other   | —                                  | 404                             |

resource "aws_acm_certificate" "main" {
  domain_name               = var.certificate_domains[0]
  subject_alternative_names = slice(var.certificate_domains, 1, length(var.certificate_domains))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb"
  description = "The shared ALB: 80 and 443 from the internet; to tasks on their ports only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.prefix}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.alb.id
  description       = "HTTP${each.key == "443" ? "S" : " (redirected)"} from the internet"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
  cidr_ipv4         = "0.0.0.0/0"
}

# The ALB reaches each task group on its own port only.
resource "aws_vpc_security_group_egress_rule" "alb_to_service" {
  for_each = local.routed_ports

  security_group_id            = aws_security_group.alb.id
  description                  = "To ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
  referenced_security_group_id = each.value.security_group_id
}

resource "aws_lb" "main" {
  count = var.edge_enabled ? 1 : 0

  name                       = local.prefix
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = [for s in aws_subnet.public : s.id]
  drop_invalid_header_fields = true
  idle_timeout               = 60
  # Production keeps deletion protection; Testing deletes the ALB at every session end.
  enable_deletion_protection = var.environment == "prod"
}

resource "aws_acm_certificate_validation" "main" {
  count = var.edge_enabled ? 1 : 0

  certificate_arn = aws_acm_certificate.main.arn
}

resource "aws_lb_listener" "http" {
  count = var.edge_enabled ? 1 : 0

  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.edge_enabled ? 1 : 0

  load_balancer_arn = aws_lb.main[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main[0].certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "control_admin_refused" {
  count = var.edge_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  condition {
    host_header {
      values = [var.hosts.control_api]
    }
  }
  condition {
    path_pattern {
      values = ["/api/v1/admin/*"]
    }
  }
}

resource "aws_lb_listener_rule" "operator_refused" {
  count = var.edge_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 39

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  condition {
    host_header {
      values = [var.hosts.operator]
    }
  }
}
