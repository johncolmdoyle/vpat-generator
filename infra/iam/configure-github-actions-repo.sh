#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
REPO="${REPO:-johncolmdoyle/vpat-generator}"
ACCOUNT_ID="${ACCOUNT_ID:-211945238241}"
ROLE_NAME="${ROLE_NAME:-GitHubActionsAccessOpsVpatDeploy}"
ROLE_ARN="${AWS_DEPLOY_ROLE_ARN:-arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}}"

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

require_prefix() {
  local key="$1"
  local prefix="$2"
  local value="${!key:-}"
  if [[ "$value" != "$prefix"* ]]; then
    echo "Invalid $key: expected value starting with $prefix" >&2
    exit 1
  fi
}

for cmd in gh; do
  require_cmd "$cmd"
done

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

: "${AWS_REGION:=us-east-1}"
: "${DEPLOY_ENVIRONMENT:=dev}"
: "${TF_DOMAIN_NAME:=vpatbuilder.com}"
: "${TF_HOSTED_ZONE_NAME:=vpatbuilder.com}"
: "${TF_STATE_BUCKET:=accessops-vpat-terraform-state}"
: "${TF_STATE_LOCK_TABLE:=accessops-vpat-terraform-locks}"
: "${TF_STATE_KEY:=${DEPLOY_ENVIRONMENT}/terraform.tfstate}"
: "${ANTHROPIC_MODEL:=claude-sonnet-4-6}"

require_env AUTH0_DOMAIN
require_env AUTH0_AUDIENCE
require_env VITE_AUTH0_DOMAIN
require_env VITE_AUTH0_CLIENT_ID
require_env VITE_AUTH0_AUDIENCE
require_env STRIPE_SECRET_KEY
require_prefix STRIPE_SECRET_KEY "sk_"

echo "Setting GitHub Actions secret: AWS_DEPLOY_ROLE_ARN"
gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO" --body "$ROLE_ARN"

set_var() {
  local key="$1"
  local value="$2"
  echo "Setting GitHub variable: $key"
  gh variable set "$key" --repo "$REPO" --body "$value"
}

set_secret_if_present() {
  local key="$1"
  local value="${!key:-}"
  if [[ -n "$value" ]]; then
    echo "Setting GitHub secret: $key"
    gh secret set "$key" --repo "$REPO" --body "$value"
  else
    echo "Skipping optional secret: $key"
  fi
}

set_var AWS_REGION "$AWS_REGION"
set_var DEPLOY_ENVIRONMENT "$DEPLOY_ENVIRONMENT"
set_var TF_DOMAIN_NAME "$TF_DOMAIN_NAME"
set_var TF_HOSTED_ZONE_NAME "$TF_HOSTED_ZONE_NAME"
set_var TF_STATE_BUCKET "$TF_STATE_BUCKET"
set_var TF_STATE_LOCK_TABLE "$TF_STATE_LOCK_TABLE"
set_var TF_STATE_KEY "$TF_STATE_KEY"
set_var AUTH0_DOMAIN "$AUTH0_DOMAIN"
set_var AUTH0_AUDIENCE "$AUTH0_AUDIENCE"
set_var VITE_AUTH0_DOMAIN "$VITE_AUTH0_DOMAIN"
set_var VITE_AUTH0_CLIENT_ID "$VITE_AUTH0_CLIENT_ID"
set_var VITE_AUTH0_AUDIENCE "$VITE_AUTH0_AUDIENCE"
set_var ANTHROPIC_MODEL "$ANTHROPIC_MODEL"

if [[ -n "${AUTH0_PLAN_CLAIM:-}" ]]; then
  set_var AUTH0_PLAN_CLAIM "$AUTH0_PLAN_CLAIM"
fi
if [[ -n "${GROWTH_PLAN_EMAILS:-}" ]]; then
  set_var GROWTH_PLAN_EMAILS "$GROWTH_PLAN_EMAILS"
fi
if [[ -n "${ENTERPRISE_PLAN_EMAILS:-}" ]]; then
  set_var ENTERPRISE_PLAN_EMAILS "$ENTERPRISE_PLAN_EMAILS"
fi

set_secret_if_present ANTHROPIC_API_KEY
set_secret_if_present STRIPE_SECRET_KEY
set_secret_if_present STRIPE_WEBHOOK_SECRET
set_secret_if_present STRIPE_STARTER_PRICE_ID
set_secret_if_present STRIPE_GROWTH_PRICE_ID

cat <<EOF

GitHub repository settings are configured for:
  $REPO

Secret set:
  AWS_DEPLOY_ROLE_ARN=$ROLE_ARN

Next:
  1. Review Settings → Secrets and variables → Actions in GitHub
  2. Run the "Deploy Platform" workflow
EOF
