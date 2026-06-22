# VPAT Generator

Scans a website, captures accessibility evidence, drafts a **VPAT® 2.5Rev
International Edition** Accessibility Conformance Report (ACR) with an LLM, walks the
user through approving each finding, and exports the finished report.

The original product spec + design reference lives in [`docs/handoff/`](docs/handoff).

## Two ways to run

### 1. Standalone web demo (no backend)

The SPA runs entirely on mock data with a simulated scan/draft — the whole 6-step
flow clicks through locally.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # optional: enable Auth0 login on the SPA
npm run dev          # → http://localhost:5173
```

When `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` are both present, the app uses the
official Auth0 React SDK and requires signup/login before the wizard can start. When
the API is enabled, `VITE_AUTH0_AUDIENCE` is also required so the SPA can request a
bearer token for `https://api.vpatbuilder.com`.

### 2. Full stack via Docker Compose

Brings up Postgres, LocalStack (S3 + SQS + Secrets Manager), the API, the Playwright
scan worker, and the web app — wired together end-to-end.

```bash
cp example.env .env          # optional: set ANTHROPIC_API_KEY for real LLM drafting
docker compose up --build
```

The checked-in `example.env` already includes the provided Auth0 tenant domain and SPA
client id for `http://localhost:5173`, so copying it into `.env` enables the login gate
for the compose-hosted web app as well. It also sets `AUTH0_DOMAIN` and
`AUTH0_AUDIENCE` so the Fastify API validates access tokens server-side. For local
plan testing, you can place user emails into `GROWTH_PLAN_EMAILS` or
`ENTERPRISE_PLAN_EMAILS`; everyone else defaults to the Starter plan.

| Service | URL |
|---|---|
| Web app | http://localhost:5173 |
| API | http://localhost:8080 |
| Postgres | localhost:5432 |
| LocalStack | localhost:4566 |

Enter any domain in Step 1. Unreachable demo domains (e.g. `clarus-health.example`)
fall through to a deterministic mock scan so the flow always completes; enter a real,
reachable URL and the worker runs an actual Playwright + axe-core scan. With
`ANTHROPIC_API_KEY` set, the worker drafts each criterion with Claude; without it, a
deterministic heuristic is used. Exports (PDF / DOCX / .vpat) are generated for real
and stored in LocalStack S3, served back via a presigned URL.

When Stripe is configured (`STRIPE_SECRET_KEY`, `STRIPE_STARTER_PRICE_ID`,
`STRIPE_GROWTH_PRICE_ID`), authenticated users can open hosted Checkout for the
modeled annual plans and manage subscriptions through the Stripe customer portal.
Plan sync happens immediately on the Checkout return path and can stay in sync over
time via the `/stripe/webhook` endpoint when `STRIPE_WEBHOOK_SECRET` is set.

## Architecture

```
 Browser (React SPA, nginx)
     │  REST + SSE
     ▼
 API (Fastify) ──────────────▶ Postgres   (reports, scans, findings, evidence, events)
     │  enqueue (SQS)          ▲   ▲
     ▼                         │   │ progress events (replayed + tailed over SSE)
 LocalStack SQS ──poll──▶ Worker (Playwright + axe-core + Claude)
                               │   writes findings/evidence ─┘
 LocalStack S3  ◀── exports ───┤
 LocalStack Secrets ◀ scan creds (stored on scan, destroyed after use)
```

The API ⇄ worker ⇄ web wire contract lives in [`packages/shared`](packages/shared/src/api.ts).
Progress is delivered as an ordered, persisted `ScanEvent` stream the API replays and
tails over Server-Sent Events, so a client that reaches Step 3 or 4 late still sees
full history.

This maps onto the AWS topology in [`docs/handoff/ARCHITECTURE.md`](docs/handoff/ARCHITECTURE.md)
(Fargate API/worker, RDS, real S3/SQS/Secrets Manager) — LocalStack stands in for AWS
locally.

## Workspace layout (npm workspaces)

```
packages/
  shared/      domain model + types + wire contract (no runtime deps)
  backend/     env, Postgres pool, AWS/LocalStack clients, row↔DTO mappers
apps/
  web/         React + TypeScript + Vite SPA (the 6-step wizard)
  api/         Fastify REST + SSE; DOCX/PDF/JSON export
  worker/      SQS consumer: Playwright crawl + axe-core, LLM drafting
infra/
  postgres/    schema (auto-applied on first boot)
  localstack/  resource bootstrap (bucket, queues, secret)
  nginx/       SPA static-serving config
docs/handoff/  original product spec, architecture, backend design, prototype
```

## Commands

```bash
npm run dev          # web app (mock mode)
npm run build        # build shared + web
npm run typecheck    # typecheck every workspace
docker compose up --build      # full stack
docker compose down -v         # stop + wipe the Postgres volume
```

## GitHub Actions deploy

The repo now includes [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which deploys the platform on pushes to `main` and via manual dispatch. It uses [`infra/terraform/deploy-ci.sh`](infra/terraform/deploy-ci.sh) to:

- apply Terraform bootstrap infrastructure
- update Secrets Manager runtime config
- bootstrap the RDS schema if needed
- build and push ARM64 `api` and `worker` images to ECR
- build the SPA and sync it to S3
- roll ECS and invalidate CloudFront

Configure these GitHub repository settings before enabling the workflow:

- Repository secret: `AWS_DEPLOY_ROLE_ARN`
- Repository secrets as needed: `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`
- Repository variables: `AWS_REGION`, `DEPLOY_ENVIRONMENT`, `TF_DOMAIN_NAME`, `TF_HOSTED_ZONE_NAME`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_PLAN_CLAIM`, `GROWTH_PLAN_EMAILS`, `ENTERPRISE_PLAN_EMAILS`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `ANTHROPIC_MODEL`

The AWS role should trust GitHub OIDC for this repository and allow Terraform, ECS, ECR, S3, CloudFront, Route 53, RDS, SQS, Secrets Manager, and CloudWatch Logs operations for the deployment account.

There is also a ready-to-apply setup guide at [`docs/github-actions-aws-role.md`](docs/github-actions-aws-role.md) plus policy documents in [`infra/iam/`](infra/iam/).

## Security notes (carried from the handoff)

- **Scan credentials are radioactive.** Captured over TLS, stored in Secrets Manager,
  never written to the DB or report, and **destroyed after the scan** (`destroySecret`).
- The AI draft is a **starting point** — the human-approval gate in Step 5 is mandatory;
  nothing is exported until every finding is approved. The original AI draft is kept in
  the `ai_*` columns for the compliance audit trail.
- Stripe webhooks should always be verified with `STRIPE_WEBHOOK_SECRET`; the API
  expects the raw webhook payload for signature verification on `/stripe/webhook`.

## Not yet built

`infra/` AWS CDK stacks (the repo is using Terraform instead) and deeper environment
promotion/review workflows beyond the current GitHub Actions deploy path. The LLM path
is wired but billed; leave `ANTHROPIC_API_KEY` blank to run fully offline on the
mock/heuristic path.
