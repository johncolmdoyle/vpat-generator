data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, 2)
  image_tag   = trimspace(var.image_tag) != "" ? trimspace(var.image_tag) : "bootstrap"
  domain_name = trimspace(var.domain_name)
  zone_name   = trimspace(var.hosted_zone_name)
  use_domain  = local.domain_name != "" && local.zone_name != ""

  public_subnets = {
    for idx, az in local.azs :
    az => cidrsubnet("10.40.0.0/16", 8, idx + 10)
  }

  runtime_secret_keys = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "AUTH0_DOMAIN",
    "AUTH0_AUDIENCE",
    "AUTH0_PLAN_CLAIM",
    "GROWTH_PLAN_EMAILS",
    "ENTERPRISE_PLAN_EMAILS",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_STARTER_PRICE_ID",
    "STRIPE_GROWTH_PRICE_ID",
    "APP_URL",
  ]

  api_secret_refs = concat(
    [
      {
        name      = "DATABASE_URL"
        valueFrom = "${aws_secretsmanager_secret.db_connection.arn}:DATABASE_URL::"
      },
      {
        name      = "ANTHROPIC_API_KEY"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:ANTHROPIC_API_KEY::"
      },
      {
        name      = "ANTHROPIC_MODEL"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:ANTHROPIC_MODEL::"
      },
      {
        name      = "AUTH0_DOMAIN"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:AUTH0_DOMAIN::"
      },
      {
        name      = "AUTH0_AUDIENCE"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:AUTH0_AUDIENCE::"
      },
      {
        name      = "AUTH0_PLAN_CLAIM"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:AUTH0_PLAN_CLAIM::"
      },
      {
        name      = "GROWTH_PLAN_EMAILS"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:GROWTH_PLAN_EMAILS::"
      },
      {
        name      = "ENTERPRISE_PLAN_EMAILS"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:ENTERPRISE_PLAN_EMAILS::"
      },
      {
        name      = "STRIPE_SECRET_KEY"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:STRIPE_SECRET_KEY::"
      },
      {
        name      = "STRIPE_WEBHOOK_SECRET"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:STRIPE_WEBHOOK_SECRET::"
      },
      {
        name      = "STRIPE_STARTER_PRICE_ID"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:STRIPE_STARTER_PRICE_ID::"
      },
      {
        name      = "STRIPE_GROWTH_PRICE_ID"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:STRIPE_GROWTH_PRICE_ID::"
      },
      {
        name      = "APP_URL"
        valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:APP_URL::"
      },
    ]
  )

  worker_secret_refs = [
    {
      name      = "DATABASE_URL"
      valueFrom = "${aws_secretsmanager_secret.db_connection.arn}:DATABASE_URL::"
    },
    {
      name      = "ANTHROPIC_API_KEY"
      valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:ANTHROPIC_API_KEY::"
    },
    {
      name      = "ANTHROPIC_MODEL"
      valueFrom = "${aws_secretsmanager_secret.app_runtime.arn}:ANTHROPIC_MODEL::"
    },
  ]
}

data "aws_route53_zone" "app" {
  count        = local.use_domain ? 1 : 0
  name         = local.zone_name
  private_zone = false
}

resource "aws_acm_certificate" "app" {
  count                     = local.use_domain ? 1 : 0
  provider                  = aws.us_east_1
  domain_name               = local.domain_name
  subject_alternative_names = local.domain_name == local.zone_name ? ["www.${local.domain_name}"] : []
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "app_cert_validation" {
  for_each = local.use_domain ? {
    for option in aws_acm_certificate.app[0].domain_validation_options :
    option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  zone_id         = data.aws_route53_zone.app[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "app" {
  count                   = local.use_domain ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for record in aws_route53_record.app_cert_validation : record.fqdn]
}

resource "aws_vpc" "main" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = each.value
  map_public_ip_on_launch = true
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Public ingress for the API ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs"
  description = "Tasks for API and worker"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db"
  description = "Postgres access"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-artifacts"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket" "web" {
  bucket        = "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-web"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name_prefix}-web"
  description                       = "Origin access for the static web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_lb" "api" {
  name               = substr("${local.name_prefix}-api", 0, 32)
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = values(aws_subnet.public)[*].id
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name_prefix}-api", 0, 32)
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/health"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 4
    interval            = 30
    timeout             = 5
  }
}

resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = local.use_domain ? compact([local.domain_name, local.domain_name == local.zone_name ? "www.${local.domain_name}" : ""]) : []

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
    origin_id                = "web-bucket"
  }

  origin {
    domain_name = aws_lb.api.dns_name
    origin_id   = "api-alb"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    target_origin_id       = "web-bucket"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/stripe/*"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/health"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.use_domain ? aws_acm_certificate_validation.app[0].certificate_arn : null
    cloudfront_default_certificate = local.use_domain ? false : true
    ssl_support_method             = local.use_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_domain ? "TLSv1.2_2021" : null
  }
}

resource "aws_route53_record" "app_alias" {
  count   = local.use_domain ? 1 : 0
  zone_id = data.aws_route53_zone.app[0].zone_id
  name    = local.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_alias_ipv6" {
  count   = local.use_domain ? 1 : 0
  zone_id = data.aws_route53_zone.app[0].zone_id
  name    = local.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_www_alias" {
  count   = local.use_domain && local.domain_name == local.zone_name ? 1 : 0
  zone_id = data.aws_route53_zone.app[0].zone_id
  name    = "www.${local.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_www_alias_ipv6" {
  count   = local.use_domain && local.domain_name == local.zone_name ? 1 : 0
  zone_id = data.aws_route53_zone.app[0].zone_id
  name    = "www.${local.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

data "aws_iam_policy_document" "web_bucket_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket_policy.json
}

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name_prefix}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri || "/";

      if (uri === "/health" || uri.startsWith("/api/") || uri.startsWith("/stripe/")) {
        return request;
      }

      var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
      if (lastSegment.indexOf(".") === -1) {
        request.uri = "/index.html";
      }

      return request;
    }
  EOF
}

resource "aws_sqs_queue" "scan_dlq" {
  name                      = "${local.name_prefix}-scan-jobs-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "scan" {
  name                       = "${local.name_prefix}-scan-jobs"
  visibility_timeout_seconds = 900
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.scan_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_secretsmanager_secret" "app_runtime" {
  name                    = "${local.name_prefix}/app-runtime"
  recovery_window_in_days = 0
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = values(aws_subnet.public)[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name_prefix}-postgres"
  engine                       = "postgres"
  engine_version               = "16.4"
  instance_class               = "db.t4g.micro"
  allocated_storage            = 20
  max_allocated_storage        = 100
  db_name                      = "vpat"
  username                     = "vpat"
  manage_master_user_password  = true
  publicly_accessible          = true
  storage_encrypted            = true
  multi_az                     = false
  backup_retention_period      = 7
  deletion_protection          = false
  skip_final_snapshot          = true
  db_subnet_group_name         = aws_db_subnet_group.postgres.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  performance_insights_enabled = false
  apply_immediately            = true
}

resource "aws_secretsmanager_secret" "db_connection" {
  name                    = "${local.name_prefix}/db-connection"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db_connection" {
  secret_id = aws_secretsmanager_secret.db_connection.id
  secret_string = jsonencode({
    DATABASE_URL = "postgres://vpat:${jsondecode(data.aws_secretsmanager_secret_version.db_master.secret_string)["password"]}@${aws_db_instance.postgres.address}:5432/vpat?sslmode=require"
  })
}

data "aws_secretsmanager_secret_version" "db_master" {
  secret_id = one(aws_db_instance.postgres.master_user_secret).secret_arn
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}/api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name_prefix}/worker"
  retention_in_days = 14
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name_prefix}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = "${local.name_prefix}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "ecs_execution_extra" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "kms:Decrypt",
    ]

    resources = [
      aws_secretsmanager_secret.app_runtime.arn,
      aws_secretsmanager_secret.db_connection.arn,
      one(aws_db_instance.postgres.master_user_secret).secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "ecs_execution_extra" {
  name   = "${local.name_prefix}-ecs-execution-extra"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_extra.json
}

resource "aws_iam_role" "ecs_task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json
}

data "aws_iam_policy_document" "ecs_task" {
  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]

    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    actions = [
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:ReceiveMessage",
      "sqs:SendMessage",
    ]

    resources = [
      aws_sqs_queue.scan.arn,
      aws_sqs_queue.scan_dlq.arn,
    ]
  }

  statement {
    actions = [
      "secretsmanager:CreateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
      "secretsmanager:TagResource",
    ]

    resources = [
      aws_secretsmanager_secret.app_runtime.arn,
      aws_secretsmanager_secret.db_connection.arn,
      "${aws_secretsmanager_secret.app_runtime.arn}*",
      "${aws_secretsmanager_secret.db_connection.arn}*",
      "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:vpat/scan-creds/*",
    ]
  }
}

resource "aws_iam_role_policy" "ecs_task" {
  name   = "${local.name_prefix}-ecs-task"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task.json
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${local.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_DEFAULT_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = aws_s3_bucket.artifacts.bucket },
        { name = "SCAN_QUEUE_NAME", value = aws_sqs_queue.scan.name },
        { name = "PORT", value = "8080" }
      ]
      secrets = local.api_secret_refs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "2048"
  memory                   = "4096"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "${aws_ecr_repository.worker.repository_url}:${local.image_tag}"
      essential = true
      environment = [
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_DEFAULT_REGION", value = var.aws_region },
        { name = "S3_BUCKET", value = aws_s3_bucket.artifacts.bucket },
        { name = "SCAN_QUEUE_NAME", value = aws_sqs_queue.scan.name }
      ]
      secrets = local.worker_secret_refs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name                              = "${local.name_prefix}-api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.ecs.id]
    subnets          = values(aws_subnet.public)[*].id
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.api]
}

resource "aws_ecs_service" "worker" {
  name            = "${local.name_prefix}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 200

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.ecs.id]
    subnets          = values(aws_subnet.public)[*].id
  }
}
