# Getting Started — Repo Setup & Building with Claude Code

This walks you from the handoff bundle to a working git repo that Claude Code can build out.

---

## 1. Create the repo

```bash
mkdir vpat-generator && cd vpat-generator
git init
# drop this handoff bundle in so Claude Code can read it:
mkdir -p docs/handoff
cp -R /path/to/design_handoff_vpat_generator/* docs/handoff/
git add . && git commit -m "Add VPAT Generator design + architecture handoff"
```

Recommended monorepo layout (pnpm workspaces or Turborepo):

```
vpat-generator/
├─ docs/handoff/            ← this bundle (README, ARCHITECTURE, BACKEND, design/)
├─ apps/
│  ├─ web/                  ← React + Vite SPA (recreate the prototype here)
│  ├─ api/                  ← REST + WebSocket service
│  └─ worker/              ← Playwright + axe-core scan worker
├─ packages/
│  ├─ shared/               ← shared TS types: Report, Finding, Evidence, enums
│  └─ vpat-template/        ← criteria lists, cross-ref map, DOCX template
├─ infra/                   ← AWS CDK (or Terraform)
└─ .github/workflows/       ← CI/CD
```

Port the prototype's `vpat-data.js` into `packages/vpat-template` and `packages/shared` first — it's the domain model the rest depends on.

## 2. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code   # then run:  claude
```
Run it from the repo root so it can see `docs/handoff/`.

## 3. Add a CLAUDE.md to the repo root

This gives Claude Code persistent context. Suggested contents:

```markdown
# VPAT Generator

Build a web app that scans a website, drafts a VPAT 2.5Rev International Edition
Accessibility Conformance Report with an LLM, walks the user through approving each
finding, and exports the report.

## Read first
- docs/handoff/README.md — product flow + UI/design reference (hi-fi)
- docs/handoff/ARCHITECTURE.md — stack + AWS topology
- docs/handoff/BACKEND.md — scan pipeline, LLM drafting, data model, API
- docs/handoff/design/ — the HTML/React prototype (reference, not production code)

## Rules
- The HTML in docs/handoff/design/ is a DESIGN REFERENCE. Recreate it in apps/web with
  React + TypeScript + our component patterns — do not ship the prototype as-is.
- vpat-data.js is the source of truth for the domain model (conformance levels,
  criteria, the three reports, cross-references). Port it to packages/.
- Scan credentials (Step 2) are secrets: TLS in, Secrets Manager, use once, destroy.
  Never log them, never store in the DB, never send to the LLM.
- This is an accessibility product — the app's own UI must be exemplary (visible focus
  rings, semantic landmarks, labels, keyboard operability, 4.5:1 contrast).
- Keep the human-approval gate; the AI draft is a starting point, never auto-final.
```

## 4. Suggested build order (give these to Claude Code as sequential tasks)

A good first prompt to Claude Code:

> Read `docs/handoff/README.md`, `ARCHITECTURE.md`, and `BACKEND.md`. Then scaffold the monorepo described in `GETTING_STARTED.md` (pnpm workspaces, `apps/web|api|worker`, `packages/shared|vpat-template`, `infra`). Port `docs/handoff/design/vpat-data.js` into `packages/shared` as typed models and `packages/vpat-template` as the criteria/cross-reference data. Don't build UI yet — just the workspace, types, and a green `pnpm build`/lint.

Then proceed in milestones:

1. **Domain & types** — port `vpat-data.js`; define `Report`, `Finding`, `Evidence`, conformance enums, the three-report structure, and the WCAG→EN/508 cross-reference map in `packages/shared`.
2. **Web shell** — recreate the 6-step wizard from the prototype in `apps/web` with the design tokens from README.md. Mock the API at first (reuse the prototype's data) so the whole flow clicks through.
3. **API + DB** — implement the REST/WebSocket surface in BACKEND.md §4 against PostgreSQL; wire the web app's create-report / fetch / approve / export calls.
4. **Scan worker** — Playwright crawl + auth + axe-core + contrast/keyboard/media checks; write evidence to S3/RDS; stream progress events. Replace the Step-3 simulation with the real log.
5. **LLM drafting** — per-criterion Claude calls with structured output (BACKEND.md §2); compute cross-references deterministically; populate findings.
6. **Review & approve** — wire Step 5 edits/approvals to `PATCH /findings` + approve endpoints; keep `ai_*` originals.
7. **Export** — DOCX (official template) + PDF + JSON to S3 with presigned download (BACKEND.md §5).
8. **Infra & CI/CD** — CDK stacks for dev/staging/prod (ARCHITECTURE.md §3, §5); GitHub Actions to build, push to ECR, deploy ECS, sync SPA to S3, invalidate CloudFront.
9. **Harden** — secrets handling, robots.txt/authorization affirmation, tenant isolation, accessibility audit of your own UI, observability.

## 5. Keys & config you'll need

- **Anthropic API key** → Secrets Manager (`ANTHROPIC_API_KEY` for local dev via `.env`, never committed).
- **AWS account** with permissions for ECS, RDS, S3, SQS, Secrets Manager, CloudFront, ECR.
- **Domain + ACM certificate** for the app's own hostname.

## 6. A note on what stays vs. goes from the prototype

- **Reuse**: all of `vpat-data.js` (becomes real models/data), the design tokens, the screen layouts and copy, the cross-reference logic, the conformance semantics.
- **Drop**: `tweaks-panel.jsx` and the three-direction theming (pick "Airy" and commit), the `setTimeout`-based fake progress, the inline Babel/CDN script setup (use a real Vite build).
