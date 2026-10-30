# The environment network (shared AWS hosting ADR §1, owner decisions of 2026-10-29): one VPC,
# public subnets for the ALB and the tasks, isolated subnets for the database, and no NAT gateway
# or interface endpoint. Tasks run in the public subnets with their own public IPv4 address and
# reach AWS APIs over the internet; every inbound path is closed by security group except 443/80 to
# the ALB.
#
# | Tier         | eu-central-1a | eu-central-1b | eu-central-1c | Route table     |
# | ------------ | ------------- | ------------- | ------------- | --------------- |
# | Public       | x.x.0.0/24    | x.x.1.0/24    | —             | public (IGW)    |
# | DB, isolated | x.x.64.0/24   | x.x.65.0/24   | x.x.66.0/24   | db (local only) |
#
# Why no interface endpoints: each costs about US$0.01 per AZ-hour (US$14.60 a month for two AZs),
# and ECR alone needs three (api, dkr, plus logs and Secrets Manager for the task start). Tasks with a
# public IP reach the same APIs at no hourly charge. The S3 gateway endpoint is free and carries
# the ECR image layers.

locals {
  prefix = "munaxa-${var.environment}"

  public_subnets = {
    a = { az = "${var.region}a", cidr = cidrsubnet(var.vpc_cidr, 8, 0) }
    b = { az = "${var.region}b", cidr = cidrsubnet(var.vpc_cidr, 8, 1) }
  }

  db_subnets = {
    a = { az = "${var.region}a", cidr = cidrsubnet(var.vpc_cidr, 8, 64) }
    b = { az = "${var.region}b", cidr = cidrsubnet(var.vpc_cidr, 8, 65) }
    c = { az = "${var.region}c", cidr = cidrsubnet(var.vpc_cidr, 8, 66) }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.prefix }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-igw" }
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.value.az
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = false # each service sets assign_public_ip explicitly

  tags = { Name = "${local.prefix}-public-${each.key}", Tier = "public" }
}

resource "aws_subnet" "db" {
  for_each = local.db_subnets

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.value.az
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = false

  tags = { Name = "${local.prefix}-db-${each.key}", Tier = "db" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-rt-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# Local routes only: the database subnets have no path to or from the internet.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-rt-db" }
}

resource "aws_route_table_association" "db" {
  for_each = aws_subnet.db

  subnet_id      = each.value.id
  route_table_id = aws_route_table.db.id
}

# S3 gateway endpoint (no charge). Only the bucket ECR serves image layers from in this region is
# admitted, read-only: nothing in this stack uses S3 otherwise.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EcrImageLayersOnly"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["s3:GetObject"]
      Resource  = ["arn:aws:s3:::prod-${var.region}-starport-layer-bucket/*"]
    }]
  })

  tags = { Name = "${local.prefix}-s3" }
}

# The VPC's default security group admits nothing, so nothing placed in it by mistake is reachable.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.prefix}-default-unused" }
}
