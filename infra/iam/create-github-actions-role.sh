#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACCOUNT_ID="${ACCOUNT_ID:-211945238241}"
ROLE_NAME="${ROLE_NAME:-GitHubActionsAccessOpsVpatDeploy}"
POLICY_NAME="${POLICY_NAME:-GitHubActionsAccessOpsVpatDeployPolicy}"
OIDC_URL="https://token.actions.githubusercontent.com"
OIDC_HOST="token.actions.githubusercontent.com"
OIDC_THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"
TRUST_POLICY_FILE="$ROOT/infra/iam/github-actions-oidc-trust-policy.json"
PERMISSIONS_POLICY_FILE="$ROOT/infra/iam/github-actions-deploy-policy.json"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

for cmd in aws python3; do
  require_cmd "$cmd"
done

if [[ ! -f "$TRUST_POLICY_FILE" || ! -f "$PERMISSIONS_POLICY_FILE" ]]; then
  echo "Missing IAM policy files under infra/iam" >&2
  exit 1
fi

PERMISSIONS_POLICY_JSON="$(python3 - "$PERMISSIONS_POLICY_FILE" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    doc = json.load(fh)
print(json.dumps(doc, separators=(",", ":")))
PY
)"

OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

echo "Checking for GitHub OIDC provider..."
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" >/dev/null 2>&1; then
  echo "OIDC provider already exists: $OIDC_PROVIDER_ARN"
else
  echo "Creating OIDC provider: $OIDC_PROVIDER_ARN"
  aws iam create-open-id-connect-provider \
    --url "$OIDC_URL" \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list "$OIDC_THUMBPRINT" >/dev/null
fi

echo "Updating trust policy principal with account ${ACCOUNT_ID}..."
TRUST_POLICY_JSON="$(python3 - "$TRUST_POLICY_FILE" "$OIDC_PROVIDER_ARN" <<'PY'
import json, sys
path, provider_arn = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
doc["Statement"][0]["Principal"]["Federated"] = provider_arn
print(json.dumps(doc))
PY
)"

echo "Ensuring IAM role exists..."
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role exists, updating trust policy: $ROLE_NAME"
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY_JSON" >/dev/null
else
  echo "Creating role: $ROLE_NAME"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY_JSON" >/dev/null
fi

echo "Ensuring customer-managed policy exists..."
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  echo "Policy exists, creating new default version: $POLICY_NAME"
  VERSION_IDS="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'Versions[?!IsDefaultVersion].VersionId' --output text)"
  VERSION_COUNT="$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'length(Versions)' --output text)"
  if [[ "$VERSION_COUNT" -ge 5 && -n "${VERSION_IDS// }" ]]; then
    OLDEST_NON_DEFAULT="$(aws iam list-policy-versions \
      --policy-arn "$POLICY_ARN" \
      --query 'Versions[?!IsDefaultVersion] | sort_by(@, &CreateDate)[0].VersionId' \
      --output text)"
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$OLDEST_NON_DEFAULT" >/dev/null
  fi
  aws iam create-policy-version \
    --policy-arn "$POLICY_ARN" \
    --policy-document "$PERMISSIONS_POLICY_JSON" \
    --set-as-default >/dev/null
else
  echo "Creating policy: $POLICY_NAME"
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "$PERMISSIONS_POLICY_JSON" >/dev/null
fi

echo "Attaching policy to role..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN" >/dev/null

cat <<EOF

GitHub Actions AWS deploy role is ready.

Role ARN:
  $ROLE_ARN

Add this GitHub repository secret:
  AWS_DEPLOY_ROLE_ARN=$ROLE_ARN

Next:
  1. Add the repository variables listed in docs/github-actions-aws-role.md
  2. Add any optional secrets you plan to use
  3. Run the "Deploy Platform" workflow from GitHub Actions
EOF
