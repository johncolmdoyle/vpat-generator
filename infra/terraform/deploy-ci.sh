#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
ENVIRONMENT="${1:-${ENVIRONMENT:-dev}}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
}

for cmd in aws docker node terraform curl git; do
  require_cmd "$cmd"
done

: "${AWS_REGION:=us-east-1}"
: "${ANTHROPIC_MODEL:=claude-sonnet-4-6}"
: "${TF_DOMAIN_NAME:=}"
: "${TF_HOSTED_ZONE_NAME:=}"
: "${TF_STATE_BUCKET:=accessops-vpat-terraform-state}"
: "${TF_STATE_LOCK_TABLE:=accessops-vpat-terraform-locks}"
: "${TF_STATE_KEY:=${ENVIRONMENT}/terraform.tfstate}"

require_env AUTH0_DOMAIN
require_env AUTH0_AUDIENCE
require_env VITE_AUTH0_DOMAIN
require_env VITE_AUTH0_CLIENT_ID
require_env VITE_AUTH0_AUDIENCE

ADMIN_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')"
ADMIN_CIDR="${ADMIN_IP}/32"

terraform -chdir="$TF_DIR" init \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${TF_STATE_KEY}" \
  -backend-config="region=${AWS_REGION}" \
  -backend-config="dynamodb_table=${TF_STATE_LOCK_TABLE}" \
  -backend-config="encrypt=true"

terraform -chdir="$TF_DIR" apply \
  -auto-approve \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="admin_cidr=${ADMIN_CIDR}" \
  -var="domain_name=${TF_DOMAIN_NAME}" \
  -var="hosted_zone_name=${TF_HOSTED_ZONE_NAME}" \
  -var="image_tag=" \
  -var="api_desired_count=0" \
  -var="worker_desired_count=0"

TF_JSON="$(mktemp)"
trap 'rm -f "$TF_JSON"' EXIT
terraform -chdir="$TF_DIR" output -json > "$TF_JSON"

TF_VALUES=()
while IFS= read -r line; do
  TF_VALUES+=("$line")
done < <(node - "$TF_JSON" <<'NODE'
const fs = require('fs');
const p = process.argv[2];
const o = JSON.parse(fs.readFileSync(p, 'utf8'));
const keys = [
  'app_url',
  'cloudfront_distribution_id',
  'web_bucket_name',
  'api_ecr_repository_url',
  'worker_ecr_repository_url',
  'app_runtime_secret_arn',
  'db_master_secret_arn',
  'db_address',
  'db_name',
  'ecs_cluster_name',
  'api_service_name',
  'worker_service_name',
];
for (const key of keys) console.log(o[key].value);
NODE
)

APP_URL="${TF_VALUES[0]}"
CLOUDFRONT_ID="${TF_VALUES[1]}"
WEB_BUCKET="${TF_VALUES[2]}"
API_REPO="${TF_VALUES[3]}"
WORKER_REPO="${TF_VALUES[4]}"
APP_SECRET_ARN="${TF_VALUES[5]}"
DB_MASTER_SECRET_ARN="${TF_VALUES[6]}"
DB_ADDRESS="${TF_VALUES[7]}"
DB_NAME="${TF_VALUES[8]}"
ECS_CLUSTER="${TF_VALUES[9]}"
API_SERVICE="${TF_VALUES[10]}"
WORKER_SERVICE="${TF_VALUES[11]}"

RUNTIME_JSON="$(APP_URL_FROM_TERRAFORM="$APP_URL" node <<'NODE'
const env = process.env;
const payload = {
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  AUTH0_DOMAIN: env.AUTH0_DOMAIN || '',
  AUTH0_AUDIENCE: env.AUTH0_AUDIENCE || '',
  AUTH0_PLAN_CLAIM: env.AUTH0_PLAN_CLAIM || '',
  GROWTH_PLAN_EMAILS: env.GROWTH_PLAN_EMAILS || '',
  ENTERPRISE_PLAN_EMAILS: env.ENTERPRISE_PLAN_EMAILS || '',
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_STARTER_PRICE_ID: env.STRIPE_STARTER_PRICE_ID || '',
  STRIPE_GROWTH_PRICE_ID: env.STRIPE_GROWTH_PRICE_ID || '',
  APP_URL: env.APP_URL_FROM_TERRAFORM || '',
};
process.stdout.write(JSON.stringify(payload));
NODE
)"

aws secretsmanager put-secret-value \
  --secret-id "$APP_SECRET_ARN" \
  --secret-string "$RUNTIME_JSON" >/dev/null

DB_SECRET_JSON="$(aws secretsmanager get-secret-value --secret-id "$DB_MASTER_SECRET_ARN" --query SecretString --output text)"
DB_CREDS=()
while IFS= read -r line; do
  DB_CREDS+=("$line")
done < <(node -e 'const v = JSON.parse(process.argv[1]); console.log(v.username); console.log(v.password);' "$DB_SECRET_JSON")
DB_USER="${DB_CREDS[0]}"
DB_PASS="${DB_CREDS[1]}"

echo "Waiting for Postgres to accept connections..."
for _ in $(seq 1 40); do
  if docker run --rm postgres:16-alpine sh -lc "PGPASSWORD='$DB_PASS' psql -h '$DB_ADDRESS' -U '$DB_USER' -d '$DB_NAME' -c 'select 1' >/dev/null 2>&1"; then
    break
  fi
  sleep 15
done

SCHEMA_READY="$(docker run --rm postgres:16-alpine sh -lc "PGPASSWORD='$DB_PASS' psql -tA -h '$DB_ADDRESS' -U '$DB_USER' -d '$DB_NAME' -c \"select to_regclass('public.organizations') is not null\" | tr -d '[:space:]'")"
if [[ "$SCHEMA_READY" != "t" ]]; then
  echo "Applying schema to RDS..."
  docker run --rm -i postgres:16-alpine sh -lc "PGPASSWORD='$DB_PASS' psql -v ON_ERROR_STOP=1 -h '$DB_ADDRESS' -U '$DB_USER' -d '$DB_NAME'" < "$ROOT/infra/postgres/01-schema.sql"
else
  echo "Schema already present; skipping bootstrap."
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
IMAGE_TAG="${GITHUB_SHA:-$(git rev-parse HEAD)}"
IMAGE_TAG="${IMAGE_TAG:0:12}-${GITHUB_RUN_NUMBER:-0}"

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com" >/dev/null

docker buildx build \
  --platform linux/arm64 \
  --push \
  -f "$ROOT/apps/api/Dockerfile" \
  -t "${API_REPO}:${IMAGE_TAG}" \
  "$ROOT"

docker buildx build \
  --platform linux/arm64 \
  --push \
  -f "$ROOT/apps/worker/Dockerfile" \
  -t "${WORKER_REPO}:${IMAGE_TAG}" \
  "$ROOT"

(
  cd "$ROOT"
  VITE_API_URL="$APP_URL" \
  VITE_AUTH0_DOMAIN="$VITE_AUTH0_DOMAIN" \
  VITE_AUTH0_CLIENT_ID="$VITE_AUTH0_CLIENT_ID" \
  VITE_AUTH0_AUDIENCE="$VITE_AUTH0_AUDIENCE" \
  npm run build --workspace @vpat/web
)

aws s3 sync "$ROOT/apps/web/dist/" "s3://${WEB_BUCKET}/" --delete

terraform -chdir="$TF_DIR" apply \
  -auto-approve \
  -var="aws_region=${AWS_REGION}" \
  -var="environment=${ENVIRONMENT}" \
  -var="admin_cidr=${ADMIN_CIDR}" \
  -var="domain_name=${TF_DOMAIN_NAME}" \
  -var="hosted_zone_name=${TF_HOSTED_ZONE_NAME}" \
  -var="image_tag=${IMAGE_TAG}" \
  -var="api_desired_count=1" \
  -var="worker_desired_count=1"

aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$API_SERVICE" "$WORKER_SERVICE"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths '/*' >/dev/null

echo "Deployment complete."
echo "App URL: $APP_URL"
