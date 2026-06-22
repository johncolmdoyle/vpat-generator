variable "aws_region" {
  description = "AWS region for the stack."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project slug used in resource names."
  type        = string
  default     = "accessops-vpat"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "image_tag" {
  description = "Container image tag to deploy to ECS."
  type        = string
  default     = ""
}

variable "api_desired_count" {
  description = "Desired task count for the API ECS service."
  type        = number
  default     = 0
}

variable "worker_desired_count" {
  description = "Desired task count for the worker ECS service."
  type        = number
  default     = 0
}

variable "admin_cidr" {
  description = "CIDR allowed to connect directly to Postgres for bootstrap and emergency access."
  type        = string
}

variable "domain_name" {
  description = "Custom domain name to attach to the CloudFront distribution."
  type        = string
  default     = ""
}

variable "hosted_zone_name" {
  description = "Route 53 hosted zone name used for the custom domain."
  type        = string
  default     = ""
}
