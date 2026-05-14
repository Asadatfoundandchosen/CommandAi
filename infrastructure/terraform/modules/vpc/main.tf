terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  default_tags = merge(
    {
      Module    = "vpc"
      ManagedBy = "terraform"
    },
    var.tags,
  )
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-igw" })
}

locals {
  azs = var.availability_zones
}

resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-public-${count.index + 1}" })

  lifecycle {
    precondition {
      condition     = length(local.azs) >= length(var.public_subnet_cidrs)
      error_message = "The AWS region must expose at least 3 availability zones for this VPC layout."
    }
  }
}

resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-private-${count.index + 1}" })
}

resource "aws_eip" "nat" {
  count = length(var.public_subnet_cidrs)

  domain = "vpc"

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-nat-eip-${count.index + 1}" })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count = length(var.public_subnet_cidrs)

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-nat-${count.index + 1}" })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-private-rt-${count.index + 1}" })
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

resource "aws_security_group" "baseline" {
  name_prefix = "${var.name_prefix}-baseline-"
  description = "Baseline security group for ${var.name_prefix} VPC"
  vpc_id      = aws_vpc.main.id

  egress {
    description      = "Allow all outbound"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = merge(local.default_tags, { Name = "${var.name_prefix}-sg-baseline" })

  lifecycle {
    create_before_destroy = true
  }
}
