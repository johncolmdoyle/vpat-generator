# Architecture — VPAT Generator on AWS

This document proposes a concrete, production-oriented architecture. It's a strong default, not the only valid one — adjust to your team's existing conventions.

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React + TypeScript + Vite, React Router, TanStack Query, Tailwind (or CSS Modules mirroring the prototype tokens) | The prototype is already React; tokens map cleanly to Tailwind theme values. |
| **API** | Node.js + TypeScript (NestJS or Fastify) | Shares types with the frontend; good fit for orchestrating async jobs + WebSockets. |
| **Scan workers** | Node.js + **Playwright** (headless Chromium) + **axe-core** | Playwright handles auth, rendering, keyboard simulation, screenshots; axe-core is the de-facto automated WCAG ruleset. |
| **LLM drafting** | **Anthropic Claude API** (e.g. `claude-sonnet`-class) | Maps evidence → conformance level + remarks with structured (tool/JSON) output. |
| **Datastore** | PostgreSQL (Amazon RDS or Aurora Serverless v2) | Relational fits reports → criteria → evidence; JSONB for flexible evidence blobs. |
| **Object storage** | Amazon S3 | Screenshots, DOM snapshots, generated PDF/DOCX exports. |
| **Job queue** | Amazon SQS (+ a jobs table) | Decouple the long-running scan from the request/response cycle. |
| **Realtime** | API Gateway WebSocket **or** SSE from the API | Stream the Step-3 activity log and Step-4 drafting progress to the browser. |

If your org is serverless-first, the worker can run on **AWS Fargate** tasks (recommended for Playwright — needs a real browser and more memory/time than Lambda comfortably gives). If you prefer Lambda, use a container image with the Playwright Chromium layer and keep per-page work under the timeout.

## 2. Topology (high level)

```
                                  ┌────────────────────────────┐
   Browser (React SPA)            │  CloudFront + S3 (static)   │
        │   ▲                     └────────────────────────────┘
        │   │ WSS/SSE (scan + draft progress)
   HTTPS│   │
        ▼   │
   ┌──────────────────────────┐        ┌───────────────────────────┐
   │  API (ECS Fargate / ALB) │──────▶ │  RDS PostgreSQL (reports)  │
   │  - REST + WebSocket       │       └───────────────────────────┘
   │  - auth, CRUD, exports    │        ┌───────────────────────────┐
   └──────────┬───────────────┘──────▶ │  S3 (evidence + exports)   │
              │ enqueue scan            └───────────────────────────┘
              ▼
        ┌───────────┐      poll/consume     ┌──────────────────────────────┐
        │  SQS queue │ ───────────────────▶ │ Scan Workers (Fargate)        │
        └───────────┘                       │  Playwright + axe-core         │
              ▲                             │  → writes evidence to S3/RDS   │
              │ progress events             │  → calls Claude API for drafts │
              └─────────────────────────────┴──────────────────────────────┘
                                                      │
                                                      ▼
                                        ┌──────────────────────────┐
                                        │  Anthropic Claude API     │
                                        └──────────────────────────┘
```

## 3. AWS services, concretely

- **CloudFront + S3** — host the built SPA; CloudFront for TLS, caching, and SPA routing (`403/404 → /index.html`).
- **Application Load Balancer + ECS Fargate** — the API service and the scan-worker service as two task definitions in one ECS cluster. Autoscale workers on SQS queue depth.
- **Amazon SQS** — one standard queue for scan jobs; a dead-letter queue for poison messages. A scan job message = `{ scanId, domain, scope, authRef }`.
- **Amazon RDS for PostgreSQL** (or Aurora Serverless v2 for spiky load) — primary datastore, in private subnets.
- **Amazon S3** — `s3://…/evidence/{scanId}/…` for screenshots + DOM snapshots; `s3://…/exports/{reportId}/…` for generated files. Serve to the browser via short-lived presigned URLs.
- **AWS Secrets Manager** — the Anthropic API key, DB credentials, and (critically) **target-site scan credentials** the user enters in Step 2. Never persist those in the DB; store encrypted in Secrets Manager with a short TTL and delete after the scan.
- **Amazon Cognito** (or your existing SSO/OIDC) — authn for the IT-team users of *this* app. Don't confuse with the Step-2 credentials, which are for the *site being scanned*.
- **API Gateway WebSocket API** — if you don't want to hold WebSocket connections on Fargate; otherwise run SSE/WS directly from the API service.
- **CloudWatch** — logs, metrics, alarms (scan failure rate, queue age, worker errors). **X-Ray** for tracing the scan pipeline.
- **VPC** — public subnets for ALB + NAT; private subnets for API, workers, and RDS. Outbound internet for workers (to reach target sites + Anthropic) via NAT Gateway.

## 4. Security & compliance notes (this product handles sensitive inputs)

- **Scan credentials are radioactive.** They grant access to a third-party site. Capture over TLS, hand straight to Secrets Manager (or keep only in the worker's memory for the job), use once, destroy. They must never appear in logs, the database, the report, or LLM prompts.
- **Don't send secrets or full PII to the LLM.** Send sanitized evidence (rule ids, selectors, contrast ratios, truncated DOM excerpts, alt-text strings) — not raw authenticated page dumps. Strip obvious PII before prompting.
- **Respect the target site.** Honor `robots.txt` by default (with an explicit user override for sites they own), rate-limit the crawl, set a clear User-Agent, and require the user to affirm they're authorized to scan the domain.
- **Tenant isolation.** Scope every report/scan row to an org/user; enforce in queries and presigned-URL generation.
- **Encryption** at rest (RDS + S3 SSE-KMS) and in transit (TLS everywhere, including ALB→task).

## 5. Environments & IaC

- Use **AWS CDK** (TypeScript — same language as the app) or Terraform. Define three stacks/workspaces: `dev`, `staging`, `prod`.
- CI/CD via **GitHub Actions** (or CodePipeline): build + test → build Docker images → push to **ECR** → deploy ECS services → invalidate CloudFront. The SPA build syncs to S3.
- See GETTING_STARTED.md for the repo layout that holds `infra/`, `apps/web`, `apps/api`, `apps/worker`, and shared packages.

## 6. Cost / scale shape

The expensive, bursty part is the Playwright scan (CPU + memory + wall-clock). Keep it on autoscaling Fargate that scales to zero between jobs (or near-zero with a min of 0–1). The API and DB are cheap and steady. LLM cost scales with criteria count per report (~30–60 calls per scan if you draft per-criterion; batch where possible). Exports are trivial. This is a low-QPS, high-per-job-cost workload — design for concurrency limits per org, not for thousands of RPS.
