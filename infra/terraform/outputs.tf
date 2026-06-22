output "app_url" {
  value = "https://${trimspace(var.domain_name) != "" ? trimspace(var.domain_name) : aws_cloudfront_distribution.app.domain_name}"
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.app.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.app.domain_name
}

output "custom_domain_name" {
  value = trimspace(var.domain_name) != "" ? trimspace(var.domain_name) : null
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "web_bucket_name" {
  value = aws_s3_bucket.web.bucket
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "api_ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "worker_ecr_repository_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "app_runtime_secret_arn" {
  value = aws_secretsmanager_secret.app_runtime.arn
}

output "db_connection_secret_arn" {
  value = aws_secretsmanager_secret.db_connection.arn
}

output "db_master_secret_arn" {
  value = one(aws_db_instance.postgres.master_user_secret).secret_arn
}

output "db_address" {
  value = aws_db_instance.postgres.address
}

output "db_name" {
  value = aws_db_instance.postgres.db_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "worker_service_name" {
  value = aws_ecs_service.worker.name
}

output "scan_queue_name" {
  value = aws_sqs_queue.scan.name
}

output "aws_region" {
  value = var.aws_region
}
