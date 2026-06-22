#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
AWS_PROFILE="${AWS_PROFILE:-accessops}"
export AWS_PROFILE
export AWS_SDK_LOAD_CONFIG=1

: "${AWS_REGION:=us-east-1}"
: "${TF_STATE_BUCKET:=accessops-vpat-terraform-state}"
: "${TF_STATE_LOCK_TABLE:=accessops-vpat-terraform-locks}"
: "${TF_STATE_KEY:=dev/terraform.tfstate}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

for cmd in aws terraform; do
  require_cmd "$cmd"
done

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Bootstrapping Terraform backend in account ${ACCOUNT_ID} (${AWS_REGION})..."

if aws s3api head-bucket --bucket "$TF_STATE_BUCKET" >/dev/null 2>&1; then
  echo "S3 backend bucket already exists: $TF_STATE_BUCKET"
else
  echo "Creating S3 backend bucket: $TF_STATE_BUCKET"
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$TF_STATE_BUCKET" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "$TF_STATE_BUCKET" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}" >/dev/null
  fi
fi

aws s3api put-bucket-versioning \
  --bucket "$TF_STATE_BUCKET" \
  --versioning-configuration Status=Enabled >/dev/null

aws s3api put-bucket-encryption \
  --bucket "$TF_STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null

if aws dynamodb describe-table --table-name "$TF_STATE_LOCK_TABLE" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "DynamoDB lock table already exists: $TF_STATE_LOCK_TABLE"
else
  echo "Creating DynamoDB lock table: $TF_STATE_LOCK_TABLE"
  aws dynamodb create-table \
    --table-name "$TF_STATE_LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$AWS_REGION" >/dev/null
  aws dynamodb wait table-exists --table-name "$TF_STATE_LOCK_TABLE" --region "$AWS_REGION"
fi

terraform -chdir="$TF_DIR" init -migrate-state \
  -force-copy \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${TF_STATE_KEY}" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${TF_STATE_LOCK_TABLE}" \
  -backend-config="encrypt=true"

echo "Terraform backend is ready."
