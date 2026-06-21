# Handoff: VPAT Generator

A web app that scans a website, captures accessibility evidence, uses an LLM to draft a **VPAT® 2.5Rev International Edition** Accessibility Conformance Report (ACR), walks the user through approving each finding, and exports the finished report.

This bundle is the **product specification + design reference** for building the real thing. It contains four documents — read them in this order:

| Doc | What it covers |
|---|---|
| **README.md** (this file) | Product overview, the 6-step flow, UI/design reference, design tokens |
| **ARCHITECTURE.md** | Full-stack system design and the AWS deployment topology |
| **BACKEND.md** | The scan pipeline, LLM drafting, data model, and REST/WebSocket API |
| **GETTING_STARTED.md** | How to stand up the git repo and drive the build with Claude Code |

---

## About the design files

The `design/` folder holds an **HTML/React prototype** built as a design reference — it shows the intended look, copy, and interaction flow. **It is not production code to ship.** The job is to recreate these screens in a real codebase (see ARCHITECTURE.md for the recommended stack) and wire them to a real backend (BACKEND.md). The prototype uses **mock data** (`design/vpat-data.js`) — that file is also the single best reference for the **real domain model** (the VPAT 2.5Rev INT structure, conformance levels, criteria, cross-references).

**Fidelity: High.** Colors, typography, spacing, copy, and interactions are final-quality. Recreate the UI faithfully, using the target codebase's component library and design-system conventions.

## What VPAT 2.5Rev International Edition means (domain primer)

A VPAT (Voluntary Product Accessibility Template) produces an **ACR** — the filled-out report. The **International Edition** is the key choice here: it bundles **three reports into one document**:

1. **WCAG 2.x Report** — Tables 1 & 2 (Level A and AA success criteria). This is the heart of the report.
2. **Revised Section 508 Report** (U.S. federal) — Chapter 3 Functional Performance Criteria, plus Chapters 4–6 (Hardware/Software/Docs).
3. **EN 301 549 Report** (EU) — Clause 4 Functional Performance Statements, plus Clauses 5–13.

The defining mechanic: **each WCAG success criterion is evaluated once, and that single response is cross-referenced** to the EN 301 549 clauses (9.x Web, 10.x Documents, 11.x Software, 12.x Docs) and Section 508 provisions (501.1, 504.2, 602.3) it satisfies. The 508 and EN reports then only add the rows WCAG doesn't cover (functional-performance statements, hardware, closed functionality, etc.). The prototype models all of this in `vpat-data.js`.

**Conformance levels** (one per criterion): `Supports`, `Partially Supports`, `Does Not Support`, `Not Applicable`, and `Not Evaluated` (AAA only).

---

## The flow (6 steps)

A single-page wizard. The top bar has a brand mark, a 6-item stepper, and a "Draft · auto-saved" pill. Steps you've reached are clickable to jump back. Below ~880px the stepper collapses to a bottom progress bar.

### Step 1 — Target (`DomainScreen`)
- Centered column, max-width 720px.
- Eyebrow "Step 01 — Target", H1 "What site should we evaluate?", lead paragraph naming the VPAT 2.5Rev International Edition.
- **URL field** with a `https://` prefix affix; two example chips below.
- **Standards panel** — read-only confirmation that all three standards (WCAG 2.0/2.1/2.2, Revised Section 508, EN 301 549) are included, each with a green check.
- **WCAG conformance target** — pill segmented control: Level A / Level A & AA / Level A, AA & AAA. Default AA.
- **Crawl scope** — pills: Auto-discover (≤25 pages) / This page only / From sitemap.
- Primary button "Set up access" (disabled until a valid-looking domain is entered).

### Step 2 — Access (`CredentialsScreen`)
- Two big choice cards: **Public pages only** (globe icon) vs **Use credentials** (lock icon).
- If "Use credentials": a card with Username, Password (show/hide toggle), and Login page (default `/login`) fields, plus a green security-reassurance note: credentials are encrypted in transit, used only for this scan, never written to the report.
- Buttons: Back · "Begin examination".

### Step 3 — Examine (`ExaminingScreen`)
- Header with live counters that count up: pages, auto issues, evidence.
- Full-width progress bar.
- Two-column grid: **Pipeline** checklist (8 phases — crawl, authenticate, render, axe-core, contrast, keyboard, media, evidence — each animating done→active→todo with a spinner) and a **live activity log** (monospace, streaming `GET /path — N issues` lines, auto-scrolling).
- When complete the title switches to "Examination complete" and the primary button "Draft findings with AI" enables.

### Step 4 — Draft (`GeneratingScreen`)
- Centered, max-width 860px. Progress bar + "drafting N/total".
- Criteria render as a grid of chips **grouped by the three reports**; each chip flips from spinner → colored check (color = drafted conformance level) as the LLM "drafts" it.
- Primary button "Review findings" enables when done.

### Step 5 — Review (`ReviewScreen`) — the core screen
- Header with an approved-count progress bar (`12 / 47 approved`).
- **Three report tabs**: WCAG 2.2 Report · Revised Section 508 Report · EN 301 549 Report, each showing its own `done/total`.
- Two-pane layout:
  - **Left rail (sticky)**: criteria grouped by the active report's sections (e.g. WCAG → Table 1 Level A / Table 2 Level AA). Each row: approval check, criterion id (mono), name, conformance dot. Auto-resolved/cross-referenced rows appear dimmed with a → glyph and a tooltip ("See WCAG 2.x section" / "Not Applicable — …").
  - **Right detail card**: criterion id + name, tag row (report, level, WCAG version, automated-check count), AI-confidence bar (with a "Worth a closer look" flag under 72%), a **conformance-level selector** (the 4–5 levels as selectable pills), an **editable Remarks textarea**, a **supporting-evidence list** (pass/issue rows with location), and — for WCAG criteria — the **cross-reference panel** showing the EN 301 549 and Section 508 provisions this one response also documents.
  - "Approve & continue" advances to the next unapproved criterion (across reports). "Approve all remaining" bulk-approves.
- Footer "Assemble report" is disabled until every criterion is approved.

### Step 6 — Report (`DownloadScreen`)
- Success eyebrow + H1 "Accessibility Conformance Report assembled".
- **Conformance summary card**: animated donut (the % = (Supports + 0.5·Partial) / applicable) beside a per-level breakdown with mini bars.
- **Per-report breakdown**: three cards (WCAG / 508 / EN), each a stacked segment bar + legend.
- **ACR header card**: the official report header fields (Product/Version, Report Date, Product Description, Contact Information, Evaluation Methods Used, Notes) + the **Applicable Standards/Guidelines** table (WCAG 2.0/2.1/2.2 with A/AA/AAA Yes-No, Section 508, EN 301 549).
- **Download card**: PDF (primary) / Word / .vpat buttons; clicking shows a generated-filename confirmation. In the prototype no file is produced — see BACKEND.md for real export.
- "Start a new report" resets.

---

## Design tokens

Defined as CSS custom properties in `design/VPAT Generator.html`. The prototype ships **three switchable visual directions** (via the Tweaks panel) — pick one for production; **"Airy" (the default) is the recommended baseline.**

### Color — light & airy neutral base
| Token | Value | Use |
|---|---|---|
| `--accent` | `#4f56d3` (indigo) | primary actions, active states |
| `--bg` | `oklch(0.985 0.003 250)` | app background |
| `--surface` | `#ffffff` | cards, panels |
| `--surface-2` | `oklch(0.975 0.004 250)` | insets, log, evidence rows |
| `--text` | `oklch(0.24 0.012 260)` | primary text |
| `--text-muted` | `oklch(0.52 0.012 260)` | secondary text |
| `--text-faint` | `oklch(0.66 0.01 260)` | tertiary / captions |
| `--border` | `oklch(0.91 0.005 260)` | hairlines |
| `--border-strong` | `oklch(0.84 0.006 260)` | input borders |

### Conformance semantics (used everywhere status appears)
| Status | Text | Background |
|---|---|---|
| Supports | `--ok` `#15824b` | `--ok-bg` `#e6f4ec` |
| Partially Supports | `--warn` `#9a6700` | `--warn-bg` `#fbf0d9` |
| Does Not Support | `--bad` `#b3261e` | `--bad-bg` `#fbe7e6` |
| Not Applicable / Not Evaluated | `--na` `#5b6470` | `--na-bg` `#eceef1` |

### Type
- **Sans**: `IBM Plex Sans` (system-ui fallback) — UI and body.
- **Mono**: `IBM Plex Mono` — criterion ids, counters, log, micro-labels, tags.
- Scale: H1 `clamp(26px, 4vw, 34px)`/600; section H2 21px/600; body 15px; lead 16px; labels 13px/600; micro-labels 11.5px (uppercase + letter-spacing in the "Console" direction).

### Shape & rhythm
- Radius: `--radius` 14px (cards), `--radius-sm` 10px (inputs/buttons), `--radius-pill` 999px.
- Shadow: `--shadow` `0 1px 2px rgba(20,24,40,.04), 0 8px 24px -12px rgba(20,24,40,.12)`.
- Spacing scale driven by `--pad` (24px) and `--gap` (16px); a density toggle scales these (compact 16/11 · comfortable 26/18).
- Focus ring (important for an a11y product — practice what you preach): `2px solid var(--accent)`, `outline-offset: 2px` on `:focus-visible`.

### The three directions (Tweaks)
- **Airy** — soft shadows, 14px radius (default, recommended).
- **Console** — utilitarian: 0 radius, no shadow, uppercase mono micro-labels, stronger hairlines.
- **Slate** — middle ground: 8px radius, subtle border + soft shadow.

---

## Files in `design/`
- `VPAT Generator.html` — entry; all design tokens + CSS live in the `<style>` block here.
- `vpat-data.js` — **the domain model** (conformance levels, standards, the full criteria set with cross-references, reports/sections, auto-rows). Best reference for the real schema.
- `vpat-ui.jsx` — icons, status helpers, `wcagAlsoApplies()` cross-reference mapping, donut ring, count-up hook.
- `vpat-screens.jsx` — Steps 1–4 (Domain, Credentials, Examining, Generating).
- `vpat-review.jsx` — Steps 5–6 (Review, Download).
- `vpat-app.jsx` — wizard shell, stepper, state machine, Tweaks wiring.
- `tweaks-panel.jsx` — prototype-only design-switcher; **do not port to production.**

> Want pixel references? Open `VPAT Generator.html` in a browser and click through, or ask for exported screenshots to be added to this bundle.
