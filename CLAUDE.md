# VPAT Generator

Build a web app that scans a website, drafts a VPAT 2.5Rev International Edition
Accessibility Conformance Report with an LLM, walks the user through approving each
finding, and exports the report.

## Read first
- docs/handoff/README.md — product flow + UI/design reference (hi-fi)
- docs/handoff/ARCHITECTURE.md — stack + AWS topology
- docs/handoff/BACKEND.md — scan pipeline, LLM drafting, data model, API
- docs/handoff/design/ — the HTML/React prototype (reference, not production code)

## Repo layout (npm workspaces)
- `packages/shared` — typed domain model + mock data ported from the prototype's
  `vpat-data.js` (source of truth for conformance levels, criteria, the three reports,
  the WCAG → EN/508 cross-reference map) **plus the API ⇄ worker ⇄ web wire contract**
  (`src/api.ts`: DTOs + the `ScanEvent` stream).
- `packages/backend` — shared backend infra: env config, Postgres pool, AWS/LocalStack
  clients (S3/SQS/Secrets Manager), and row↔DTO mappers. Imported by api + worker.
- `apps/web` — React + TypeScript + Vite SPA, the 6-step wizard ("Airy" direction).
  Runs the mock flow by default; when `VITE_API_URL` is set it drives the real backend
  (REST + SSE). The mode switch lives in `src/config.ts` (`hasApi`).
- `apps/api` — Fastify REST + SSE (`/api/...`, `/api/scans/:id/stream`); DOCX/PDF/JSON
  export to S3 with presigned URLs.
- `apps/worker` — SQS consumer: Playwright crawl + axe-core (real, with a deterministic
  mock fallback for unreachable domains) and per-criterion drafting (Claude when
  `ANTHROPIC_API_KEY` is set, heuristic otherwise). Emits the persisted `ScanEvent`s.
- `infra/` — Postgres schema (auto-applied), LocalStack bootstrap, nginx SPA config.

## Commands
- `npm install` (once, from repo root)
- `npm run dev` — web app in mock mode (Vite)
- `npm run build` — build shared then web
- `npm run typecheck` — TS typecheck across all workspaces
- `docker compose up --build` — full stack (web/api/worker/postgres/localstack)

## Backend notes
- The API/worker run TypeScript directly via `tsx` (no compile step); Docker images use
  `tsx` too. The worker image is the Playwright base image (Chromium preinstalled).
- Progress is **persisted** to `scan_events` and the SSE endpoint replays-then-tails, so
  Steps 3 and 4 show full history even when reached after the worker has moved on.
- One worker job runs scan→draft continuously; the UI's Step 3/Step 4 split is a UX gate
  over the same event stream.

## Rules
- The HTML in docs/handoff/design/ is a DESIGN REFERENCE. The production UI lives in
  apps/web (React + TypeScript). Do not ship the prototype as-is.
- `packages/shared` is the source of truth for the domain model. Future api/worker
  packages should import its types.
- Only the "Airy" design direction ships. The prototype's tweaks panel and the
  three-direction theming were intentionally dropped.
- Scan credentials (Step 2) are secrets: TLS in, Secrets Manager, use once, destroy.
  Never log them, never store in the DB, never send to the LLM. (Backend, not yet built.)
- This is an accessibility product — the app's own UI must be exemplary (visible focus
  rings, semantic landmarks, labels, keyboard operability, 4.5:1 contrast).
- Keep the human-approval gate; the AI draft is a starting point, never auto-final.

## Not yet built (see GETTING_STARTED.md milestones 8–9)
`infra/` AWS CDK stacks and CI/CD. Everything else runs locally via docker compose with
LocalStack standing in for AWS. The `packages/vpat-template` DOCX template idea is folded
into `apps/api/src/export.ts` for now.
