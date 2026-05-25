# Internet-facing **ALB** for the API — **TLS 1.3** policy, **ACM** certificate, **HTTP → HTTPS** redirect.
# HSTS is set at the application (`helmet` / `https-security.middleware.ts`) and optionally via WAF.
# SSL Labs target: **A+** with `ELBSecurityPolicy-TLS13-1-2-2021-06`.

locals {
  name = replace(lower(var.name_prefix), "/[^a-z0-9-]+/", "-")
}

resource "aws_lb" "api" {
  name               = substr("${local.name}-api", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.deletion_protection
  drop_invalid_header_fields = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-alb-api" })
}

resource "aws_lb_target_group" "api" {
  name_prefix = substr("${local.name}-tg", 0, 6)
  port        = var.target_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = var.target_type

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200-399"
    protocol            = "HTTP"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = local.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.api.arn
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

resource "aws_lb_target_group_attachment" "registered" {
  for_each = toset(var.target_ids)

  target_group_arn = aws_lb_target_group.api.arn
  target_id        = each.value
  port             = var.target_port
}
