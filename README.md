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
npm run dev          # → http://localhost:5173
```

### 2. Full stack via Docker Compose

Brings up Postgres, LocalStack (S3 + SQS + Secrets Manager), the API, the Playwright
scan worker, and the web app — wired together end-to-end.

```bash
cp example.env .env          # optional: set ANTHROPIC_API_KEY for real LLM drafting
docker compose up --build
```

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

## Security notes (carried from the handoff)

- **Scan credentials are radioactive.** Captured over TLS, stored in Secrets Manager,
  never written to the DB or report, and **destroyed after the scan** (`destroySecret`).
- The AI draft is a **starting point** — the human-approval gate in Step 5 is mandatory;
  nothing is exported until every finding is approved. The original AI draft is kept in
  the `ai_*` columns for the compliance audit trail.

## Not yet built

`infra/` AWS CDK stacks and CI/CD (handoff milestones 8–9). The LLM path is wired but
billed; leave `ANTHROPIC_API_KEY` blank to run fully offline on the mock/heuristic path.
