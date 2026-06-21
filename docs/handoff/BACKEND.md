# Backend — Scan Pipeline, LLM Drafting, Data Model & API

How to turn the prototype's mocked steps into real behavior. Read alongside `design/vpat-data.js`, which is the authoritative shape of the domain.

---

## 1. The scan pipeline (Step 3)

Run as an async job consumed from SQS by a Playwright worker. The prototype's `SCAN_PHASES` are the real phases:

1. **Crawl** — start at the domain root, follow same-origin links breadth-first up to the scope limit (≤25 for auto, or read `/sitemap.xml`). Build the page list. Respect `robots.txt`.
2. **Authenticate** (if Step-2 credentials provided) — Playwright navigates to the login page, fills the credential fields, submits, and persists the storage state (cookies/localStorage) so subsequent page visits are authenticated. Pull credentials from Secrets Manager; never log them.
3. **Render** — for each page, load in headless Chromium, wait for network-idle, snapshot the DOM.
4. **Automated checks** — run **axe-core** against each rendered page with the WCAG 2.2 ruleset (`tags: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']`). Collect violations keyed by rule → mapped to success-criterion ids.
5. **Contrast** — sample computed styles for text/background pairs; compute ratios; flag < 4.5:1 (normal) / < 3:1 (large/non-text).
6. **Keyboard** — script Tab traversal; record focus order, detect focus traps and unreachable interactive elements.
7. **Media** — inspect `<video>`/`<audio>` for caption tracks, `<img>` for alt, etc.
8. **Evidence capture** — for each finding, save a screenshot (element-scoped where possible) + a truncated DOM/code excerpt to S3; record selector + page URL.

Emit a progress event after each page/phase (page count, running issue count, evidence count, and log lines like `GET /products — 7 issues`) over WebSocket/SSE so the UI's live log and counters are real, not simulated.

**axe-core → WCAG mapping:** axe tags each rule with the success criteria it maps to (e.g. `color-contrast` → 1.4.3). Aggregate violations per criterion id; that aggregation feeds the LLM.

> Automated tooling reliably catches only ~30–50% of WCAG issues. Make this explicit in the UI/report: the AI draft is a **starting point for expert review**, which is exactly what Step 5 is for. Keep the human-approval gate.

## 2. LLM drafting (Step 4)

For each in-scope success criterion (and the 508 FPC / EN FPS statements), call Claude with:
- the criterion definition (id, name, level, what it requires),
- the aggregated evidence for it (axe violations, contrast samples, keyboard notes, media findings — **sanitized**, no secrets/PII),
- the list of pages where evidence was found.

Ask for **structured output** (a tool schema / JSON) with exactly:
```jsonc
{
  "status": "Supports | Partially Supports | Does Not Support | Not Applicable | Not Evaluated",
  "remarks": "Plain-language explanation citing the specific issues and locations.",
  "confidence": 0.0,              // model's self-rated confidence
  "evidenceRefs": ["evidenceId", ...]
}
```
Notes:
- **Per-criterion calls** keep prompts focused and let you show the chip-by-chip progress in Step 4. Batch only if cost demands it.
- Resolve the obsolete **4.1.1 Parsing** automatically to "Supports" for WCAG 2.0/2.1 and omit it for 2.2 — don't ask the LLM (the prototype models this as `PARSING_NOTE`).
- The **cross-references are deterministic, not LLM-generated** — compute them from the WCAG id (see `wcagAlsoApplies()` in `vpat-ui.jsx`). The single WCAG response is copied into the EN/508 rows it maps to.
- Surface `confidence` in the UI and flag low-confidence (< ~0.72) criteria for closer review, as the prototype does.
- The Anthropic API key lives in Secrets Manager; calls go out from the worker.

## 3. Data model (PostgreSQL)

```
organizations (id, name, …)
users (id, org_id, email, …)

reports
  id, org_id, created_by, domain, product_name, product_version,
  wcag_target ('A'|'AA'|'AAA'), edition ('INT'),
  status ('draft'|'scanning'|'review'|'final'),
  contact_email, product_description, evaluation_methods, notes,
  created_at, finalized_at

scans
  id, report_id, scope ('auto'|'single'|'sitemap'),
  auth_mode ('public'|'auth'),
  state ('queued'|'running'|'done'|'failed'),
  pages_count, issues_count, evidence_count,
  started_at, finished_at

pages            (id, scan_id, url, title, is_auth, status_code)

findings          -- one row per success criterion / FPC / FPS, per report
  id, report_id, report_kind ('wcag'|'508'|'en'),
  section,                         -- 'A' | 'AA' | 'fpc' | 'fps' | 'ref508' | 'refen'
  criterion_id,                    -- '1.4.3', '302.1', '4.2.1', …
  name, level, wcag_version, principle,
  status, remarks,                 -- AI draft, then user-edited
  ai_status, ai_remarks, ai_confidence,   -- keep the original draft for audit
  approved (bool), edited (bool),
  updated_by, updated_at

evidence          (id, finding_id, scan_id, type ('issue'|'pass'),
                   text, page_url, selector, screenshot_s3_key, dom_excerpt, axe_rule_id)

exports           (id, report_id, format ('pdf'|'docx'|'vpat'), s3_key, created_at)
```
Keeping `ai_*` alongside the editable fields gives you an audit trail of what the model proposed vs. what the human approved — valuable for a compliance artifact.

## 4. API surface (REST + realtime)

```
POST   /api/reports                  → create report (domain, wcag_target, scope)
POST   /api/reports/:id/scan         → store scan creds in Secrets Manager, enqueue SQS job → {scanId}
GET    /api/reports/:id              → report + findings + per-report rollups
GET    /api/scans/:id                → scan status + counters (poll fallback)
WS/SSE /api/scans/:id/stream         → live phase/log/counter events (Step 3) + drafting progress (Step 4)
PATCH  /api/findings/:id             → update status / remarks  (sets edited=true)
POST   /api/findings/:id/approve     → approve one
POST   /api/reports/:id/approve-all  → bulk approve
POST   /api/reports/:id/export       → generate {pdf|docx|vpat} → {downloadUrl (presigned)}
GET    /api/reports                  → list (org-scoped)
```
Front-end: TanStack Query for REST; a small WebSocket/SSE hook feeds the Step-3 log and Step-4 chips. The wizard's local state machine (the prototype's `vpat-app.jsx`) maps directly onto these calls — replace the `setTimeout` simulations with real fetches and stream subscriptions.

## 5. Report export

The official ITI deliverable is a **Word document** in the VPAT 2.5Rev International template format. Implement export as:
- **DOCX** — fill the official template tables programmatically (e.g. `docx` for Node, or a templating approach with `docxtemplater`). This is the format procurement teams expect.
- **PDF** — render an HTML version of the ACR (you already have the layout in Step 6) to PDF via headless Chromium (`page.pdf()`), or convert the DOCX.
- **.vpat / JSON** — your own structured export (the `findings` rows) for re-import and diffing year-over-year.

Store outputs in S3; hand the browser a short-lived presigned URL. The official blank template and the three-report structure live in `vpat-data.js` (`REPORTS`, `STANDARDS`, `TERMS`).

## 6. Mapping the prototype's mock data to reality

| Prototype (`vpat-data.js`) | Real source |
|---|---|
| `CRITERIA` (WCAG + FPC + FPS) | WCAG 2.2 spec criteria + axe results; FPC/FPS are standard fixed lists |
| `status`, `remarks`, `confidence` | Claude structured output (§2) |
| `evidence[]` | axe violations + contrast/keyboard/media checks (§1), stored in `evidence` table |
| `auto` (automated-check count) | count of axe violations aggregated to that criterion |
| `AUTO` (cross-ref / N-A rows) | deterministic; `Not Applicable` for hardware/closed-functionality on a web product |
| `wcagAlsoApplies()` | keep as a static mapping table of WCAG id → EN clauses + 508 provisions |
| `PAGES`, `SCAN_PHASES`, `GEN_PHASES` | real crawl output + pipeline phases + progress events |
