# GitHub Actions AWS Role Setup

This repo deploys with [`.github/workflows/deploy.yml`](/Users/johndoyle/Code/github/johncolmdoyle/vpat-generator/.github/workflows/deploy.yml) and expects one IAM role that GitHub Actions can assume through OIDC.

## Assumptions

- AWS account: `211945238241`
- GitHub repo: `johncolmdoyle/vpat-generator`
- GitHub environment used by the workflow: `production`
- Suggested role name: `GitHubActionsAccessOpsVpatDeploy`

## Policy files

- Trust policy: [`infra/iam/github-actions-oidc-trust-policy.json`](/Users/johndoyle/Code/github/johncolmdoyle/vpat-generator/infra/iam/github-actions-oidc-trust-policy.json)
- Permissions policy: [`infra/iam/github-actions-deploy-policy.json`](/Users/johndoyle/Code/github/johncolmdoyle/vpat-generator/infra/iam/github-actions-deploy-policy.json)

## One-time setup

Fast path:

```bash
chmod +x infra/iam/create-github-actions-role.sh
infra/iam/create-github-actions-role.sh
```

That script creates or updates the OIDC provider, role, and customer-managed policy, then prints the `AWS_DEPLOY_ROLE_ARN` value to place into GitHub.

GitHub repo settings fast path:

```bash
chmod +x infra/iam/configure-github-actions-repo.sh
infra/iam/configure-github-actions-repo.sh
```

That script uses `gh` to set the repository secret `AWS_DEPLOY_ROLE_ARN`, the required GitHub Actions variables, and any optional secrets present in your local environment.

### 1. Create the GitHub OIDC provider in AWS

Skip this if your account already has `token.actions.githubusercontent.com` configured.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 2. Create the deploy role

```bash
aws iam create-role \
  --role-name GitHubActionsAccessOpsVpatDeploy \
  --assume-role-policy-document file://infra/iam/github-actions-oidc-trust-policy.json
```

### 3. Create and attach the deploy policy

```bash
aws iam create-policy \
  --policy-name GitHubActionsAccessOpsVpatDeployPolicy \
  --policy-document file://infra/iam/github-actions-deploy-policy.json
```

Then attach it:

```bash
aws iam attach-role-policy \
  --role-name GitHubActionsAccessOpsVpatDeploy \
  --policy-arn arn:aws:iam::211945238241:policy/GitHubActionsAccessOpsVpatDeployPolicy
```

### 4. Add the role ARN to GitHub

Create this repository secret:

- `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::211945238241:role/GitHubActionsAccessOpsVpatDeploy`

### 5. Add the GitHub repository variables

Required variables:

- `AWS_REGION=us-east-1`
- `DEPLOY_ENVIRONMENT=dev`
- `TF_DOMAIN_NAME=vpatbuilder.com`
- `TF_HOSTED_ZONE_NAME=vpatbuilder.com`
- `TF_STATE_BUCKET=accessops-vpat-terraform-state`
- `TF_STATE_LOCK_TABLE=accessops-vpat-terraform-locks`
- `TF_STATE_KEY=dev/terraform.tfstate`
- `AUTH0_DOMAIN=...`
- `AUTH0_AUDIENCE=...`
- `VITE_AUTH0_DOMAIN=...`
- `VITE_AUTH0_CLIENT_ID=...`
- `VITE_AUTH0_AUDIENCE=...`

Optional variables:

- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `AUTH0_PLAN_CLAIM=...`
- `GROWTH_PLAN_EMAILS=...`
- `ENTERPRISE_PLAN_EMAILS=...`

Optional secrets:

- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`

### Combined setup

If your local machine is authenticated to both AWS and GitHub CLI, you can do the full setup with:

```bash
infra/iam/create-github-actions-role.sh
infra/iam/configure-github-actions-repo.sh
```

## Notes

- The trust policy is intentionally scoped to the `production` GitHub environment, because the workflow job declares `environment: production`.
- If you rename the repo, org, or GitHub environment, update the `sub` claim in the trust policy.
- The permissions policy is broad enough for the current Terraform stack plus image pushes and SPA uploads. If we tighten resource scoping later, this file is the right place to do it.
