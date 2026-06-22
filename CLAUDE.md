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
- `apps/web` — React + TypeScript + Vite SPA, the 7-step wizard ("Airy" direction):
  Target → Access → Examine → Draft → Review → **Details** → Report. The Details step
  collects the VPAT header + evaluator attestation (product/vendor, contact, assistive
  tech used, test environments, evaluator, dates). Runs the mock flow by default; when
  `VITE_API_URL` is set it drives the real backend (REST + SSE). Switch in `src/config.ts`.
- `apps/api` — Fastify REST + SSE (`/api/...`, `/api/scans/:id/stream`); `PATCH
  /api/reports/:id` saves the Details metadata; DOCX/PDF/JSON export to S3 with presigned
  URLs. `src/export.ts` renders the official VPAT 2.5Rev template (product info, standards,
  terms, per-criterion conformance tables with EN/508 cross-refs, attestation) — every
  export is marked **DRAFT**.
- `apps/worker` — SQS consumer: Playwright crawl + axe-core **plus AT-oriented checks in
  `src/checks.ts`** (accessible-name computation, scripted keyboard reachability/trap,
  reflow@320, target-size, landmarks, labels) — the API a screen reader consumes, since
  native JAWS/NVDA can't run headless. Real scans never inherit mock evidence; untested
  criteria draft at low confidence ("requires manual verification"). Per-criterion drafting
  uses Claude when `ANTHROPIC_API_KEY` is set, heuristic otherwise. Emits persisted `ScanEvent`s.
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
- Report metadata columns are added idempotently by `migrate()` (backend `db.ts`) on API
  boot, so existing Postgres volumes upgrade without recreating the DB.
- Presigned download URLs are signed against `S3_PUBLIC_ENDPOINT` (default
  `http://localhost:4566`) so the browser — not just the in-network API — can fetch them.
- Reports are always issued as a **DRAFT**: the named evaluator/responsible party reviews
  and approves before publishing. The automated checks maximize coverage but don't replace
  the manual + assistive-technology testing recorded in the attestation.

## Rules
- The HTML in docs/handoff/design/ is a DESIGN REFERENCE. The production UI lives in
  apps/web (React + TypeScript). Do not ship the prototype as-is.
- `packages/shared` is the source of truth for the domain model. Future api/worker
  packages should import its types.
- Only the "Airy" design direction ships. The prototype's tweaks panel and the
  three-direction theming were intentionally dropped.
- Scan credentials (Step 2) are secrets: stored in Secrets Manager (LocalStack), used
  once by the worker, destroyed after the job. Never log them, never store in the DB,
  never send to the LLM.
- This is an accessibility product — the app's own UI must be exemplary (visible focus
  rings, semantic landmarks, labels, keyboard operability, 4.5:1 contrast).
- Keep the human-approval gate; the AI draft is a starting point, never auto-final.

## Not yet built (see GETTING_STARTED.md milestones 8–9)
`infra/` AWS CDK stacks and CI/CD. Everything else runs locally via docker compose with
LocalStack standing in for AWS. The `packages/vpat-template` DOCX template idea is folded
into `apps/api/src/export.ts` for now.
