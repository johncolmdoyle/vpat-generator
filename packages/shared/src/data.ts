/**
 * VPAT prototype data — modeled on VPAT 2.5Rev International Edition (Feb 2025).
 * Ported verbatim from the prototype's `vpat-data.js`; this is the mock domain the
 * web app runs on until the real scan/LLM pipeline (BACKEND.md) replaces it.
 */
import type {
  AutoRow,
  ConformanceLevel,
  Criterion,
  Page,
  ReportDef,
  ScanPhase,
  Standard,
  Term,
} from './types.js';

export const VERSION = 'VPAT® 2.5Rev';
export const EDITION = 'International Edition';

/**
 * Default "Evaluation Methods Used" text describing the tooling this product runs.
 * Prefilled into the Details form and used as the export fallback. The human evaluator
 * appends the assistive technologies + environments they tested with.
 */
export const DEFAULT_EVALUATION_METHODS = [
  'Automated testing with axe-core against the WCAG 2.2 ruleset (tags wcag2a, wcag2aa, wcag21aa, wcag22aa).',
  'Accessibility-tree inspection of accessible name, role and state for interactive controls (the API assistive technologies consume).',
  'Scripted keyboard-only operation: tab traversal, focus-order and focus-trap detection.',
  'Focus-visibility, reflow at 320 CSS pixels, and pointer target-size (24×24) measurement.',
  'AI-assisted drafting of conformance levels and remarks from the collected evidence.',
  'Manual review and approval of every criterion by the named evaluator (see attestation).',
].join(' ');

/** Standing disclaimer printed on every exported report. */
export const DRAFT_DISCLAIMER =
  'DRAFT — This Accessibility Conformance Report is a draft pending review and approval by the responsible party. ' +
  'Automated tooling reliably detects only a portion of WCAG issues; conformance claims must be verified by the named ' +
  'evaluator through manual and assistive-technology testing before this report is published or relied upon.';

/** Conformance level constants. */
export const CONF = {
  SUPPORTS: 'Supports',
  PARTIAL: 'Partially Supports',
  NOT: 'Does Not Support',
  NA: 'Not Applicable',
  NE: 'Not Evaluated',
} as const satisfies Record<string, ConformanceLevel>;

/** Conformance term definitions (verbatim intent from the VPAT 2.5Rev template). */
export const TERMS: Term[] = [
  { term: 'Supports', def: 'The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation.' },
  { term: 'Partially Supports', def: 'Some functionality of the product does not meet the criterion.' },
  { term: 'Does Not Support', def: 'The majority of product functionality does not meet the criterion.' },
  { term: 'Not Applicable', def: 'The criterion is not relevant to the product.' },
  { term: 'Not Evaluated', def: 'The product has not been evaluated against the criterion. Used only for WCAG Level AAA.' },
];

/** Applicable Standards / Guidelines covered by the International edition. */
export const STANDARDS: Standard[] = [
  { id: 'wcag20', group: 'Web Content Accessibility Guidelines 2.0', levels: ['A', 'AA', 'AAA'] },
  { id: 'wcag21', group: 'Web Content Accessibility Guidelines 2.1', levels: ['A', 'AA', 'AAA'] },
  { id: 'wcag22', group: 'Web Content Accessibility Guidelines 2.2', levels: ['A', 'AA', 'AAA'] },
  { id: '508', group: 'Revised Section 508 (Jan 18, 2017, corrected Jan 22, 2018)', levels: null },
  { id: 'en', group: 'EN 301 549 V3.1.1 (2019-11) and V3.2.1 (2021-03)', levels: null },
];

export const PAGES: Page[] = [
  { url: '/', title: 'Home', auth: false },
  { url: '/products', title: 'Products', auth: false },
  { url: '/products/checkout', title: 'Checkout', auth: true },
  { url: '/account/dashboard', title: 'Account Dashboard', auth: true },
  { url: '/account/settings', title: 'Settings', auth: true },
  { url: '/support', title: 'Support Center', auth: false },
  { url: '/support/contact', title: 'Contact Form', auth: false },
  { url: '/blog', title: 'Blog Index', auth: false },
  { url: '/blog/accessibility-matters', title: 'Article', auth: false },
  { url: '/login', title: 'Sign In', auth: false },
];

export const SCAN_PHASES: ScanPhase[] = [
  { key: 'crawl', label: 'Crawling site map', detail: 'Discovering reachable pages' },
  { key: 'auth', label: 'Authenticating', detail: 'Entering protected areas' },
  { key: 'render', label: 'Rendering pages', detail: 'Headless browser + DOM snapshots' },
  { key: 'axe', label: 'Running automated checks', detail: 'axe-core · WCAG 2.2 ruleset' },
  { key: 'contrast', label: 'Sampling color contrast', detail: 'Computed-style ratios' },
  { key: 'keyboard', label: 'Simulating keyboard nav', detail: 'Tab order + focus traps' },
  { key: 'media', label: 'Inspecting media', detail: 'Captions, alt text, transcripts' },
  { key: 'evidence', label: 'Capturing evidence', detail: 'Screenshots + code excerpts' },
];

export const GEN_PHASES: string[] = [
  'Indexing captured evidence',
  'Mapping issues to WCAG 2.2 success criteria',
  'Cross-referencing EN 301 549 & Section 508',
  'Drafting conformance levels & remarks',
  'Scoring confidence',
];

/** Report structure (tabs + sections) for the INT edition ACR. */
export const REPORTS: ReportDef[] = [
  {
    id: 'wcag', name: 'WCAG 2.2 Report', tag: 'Tables 1–2',
    note: 'Tables 1 & 2 also document EN 301 549 (Clauses 9, 10.1–10.4, 11.1–11.4, 11.8.2, 12.1.2, 12.2.4) and Revised Section 508 (501.1, 504.2, 602.3).',
    sections: [
      { id: 'A', name: 'Table 1 — Success Criteria, Level A' },
      { id: 'AA', name: 'Table 2 — Success Criteria, Level AA' },
    ],
  },
  {
    id: '508', name: 'Revised Section 508 Report', tag: 'Ch. 3–6',
    note: 'Software (Ch. 5) and Support Documentation (602.3) conformance is recorded once in the WCAG 2.x section and cross-referenced here.',
    sections: [
      { id: 'fpc', name: 'Chapter 3 — Functional Performance Criteria' },
      { id: 'ref508', name: 'Chapters 4–6 — Hardware, Software & Docs' },
    ],
  },
  {
    id: 'en', name: 'EN 301 549 Report', tag: 'Clauses 4–13',
    note: 'Web (Clause 9), Non-Web Documents (10.1–10.4), Software (11.1–11.4) and parts of Documentation (12) are recorded in the WCAG 2.x section and cross-referenced here.',
    sections: [
      { id: 'fps', name: 'Clause 4 — Functional Performance Statements' },
      { id: 'refen', name: 'Clauses 5–13 — Generic, Hardware, Web & Docs' },
    ],
  },
];

// ---- WCAG 2.x success criteria (Level A + AA), with AI-drafted findings ----
// `ver` is the WCAG version that introduced the criterion; `section` mirrors `level`.
const WCAG_RAW: Omit<Criterion, 'report' | 'section'>[] = [
  { id: '1.1.1', name: 'Non-text Content', level: 'A', ver: '2.0', principle: 'Perceivable',
    status: CONF.PARTIAL, confidence: 0.86, auto: 14,
    remarks: 'Most images include descriptive alt text. 14 decorative icons on Products and Checkout lack alt attributes and are announced as filenames. Product gallery thumbnails use empty alt where descriptive text is needed.',
    evidence: [{ type: 'issue', text: '14 images missing alt attribute', where: '/products, /products/checkout' }, { type: 'pass', text: 'Hero & article images have meaningful alt', where: '/, /blog/accessibility-matters' }] },
  { id: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', ver: '2.0', principle: 'Perceivable',
    status: CONF.NOT, confidence: 0.78, auto: 2,
    remarks: 'The product demo video on Home and the onboarding video in Account Dashboard play without synchronized captions. No WebVTT caption track detected on either <video> element.',
    evidence: [{ type: 'issue', text: '2 videos without caption tracks', where: '/, /account/dashboard' }] },
  { id: '1.3.1', name: 'Info and Relationships', level: 'A', ver: '2.0', principle: 'Perceivable',
    status: CONF.PARTIAL, confidence: 0.81, auto: 9,
    remarks: 'Headings are mostly well-structured. Settings skips from h1 to h3, and the pricing comparison uses a <div> grid instead of a <table>, so row/column relationships are not programmatically conveyed.',
    evidence: [{ type: 'issue', text: 'Heading level skipped (h1 → h3)', where: '/account/settings' }, { type: 'issue', text: 'Data presented as styled divs, not table', where: '/products' }] },
  { id: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', ver: '2.0', principle: 'Perceivable',
    status: CONF.PARTIAL, confidence: 0.92, auto: 23,
    remarks: 'Body copy meets 4.5:1. Placeholder text (#9aa0a6 on #ffffff = 2.8:1) and secondary button labels fall below the 4.5:1 threshold on 23 sampled instances.',
    evidence: [{ type: 'issue', text: 'Placeholder text 2.8:1 (needs 4.5:1)', where: '/support/contact, /login' }, { type: 'issue', text: 'Ghost-button label 3.1:1', where: 'global' }] },
  { id: '1.4.4', name: 'Resize Text', level: 'AA', ver: '2.0', principle: 'Perceivable',
    status: CONF.SUPPORTS, confidence: 0.74, auto: 0,
    remarks: 'Text scales to 200% without loss of content or function. Layout uses relative units (rem) and reflows cleanly at increased zoom.',
    evidence: [{ type: 'pass', text: 'No clipping at 200% zoom across sampled pages', where: 'all pages' }] },
  { id: '1.4.10', name: 'Reflow', level: 'AA', ver: '2.1', principle: 'Perceivable',
    status: CONF.PARTIAL, confidence: 0.69, auto: 4,
    remarks: 'Most views reflow to a 320px viewport without horizontal scrolling. The Checkout summary table and blog code samples introduce horizontal scroll at 320px width.',
    evidence: [{ type: 'issue', text: 'Horizontal scroll at 320px CSS width', where: '/products/checkout' }] },
  { id: '1.4.11', name: 'Non-text Contrast', level: 'AA', ver: '2.1', principle: 'Perceivable',
    status: CONF.PARTIAL, confidence: 0.7, auto: 6,
    remarks: 'Most interactive boundaries meet 3:1. Input field borders (#e0e0e0) and the toggle-switch off state fall below 3:1 against their background.',
    evidence: [{ type: 'issue', text: 'Input border 1.3:1 against page', where: 'global forms' }] },
  { id: '2.1.1', name: 'Keyboard', level: 'A', ver: '2.0', principle: 'Operable',
    status: CONF.PARTIAL, confidence: 0.83, auto: 5,
    remarks: 'Primary navigation and forms are keyboard operable. The custom date picker on Checkout and the image carousel on Home cannot be operated without a pointing device.',
    evidence: [{ type: 'issue', text: 'Date picker not keyboard-operable', where: '/products/checkout' }, { type: 'issue', text: 'Carousel controls unreachable via Tab', where: '/' }] },
  { id: '2.1.2', name: 'No Keyboard Trap', level: 'A', ver: '2.0', principle: 'Operable',
    status: CONF.SUPPORTS, confidence: 0.88, auto: 0,
    remarks: 'Focus can be moved away from all components using standard keyboard commands. No traps detected in modal dialogs or embedded widgets.',
    evidence: [{ type: 'pass', text: 'Modals release focus on Esc / Tab', where: '/support, /account/settings' }] },
  { id: '2.4.1', name: 'Bypass Blocks', level: 'A', ver: '2.0', principle: 'Operable',
    status: CONF.NOT, confidence: 0.9, auto: 10,
    remarks: "No 'skip to main content' link is present, and pages lack landmark regions (no <main>, no nav role). Keyboard users must tab through the full header on every page.",
    evidence: [{ type: 'issue', text: 'No skip link detected', where: 'all pages' }, { type: 'issue', text: 'Missing landmark regions', where: 'all pages' }] },
  { id: '2.4.3', name: 'Focus Order', level: 'A', ver: '2.0', principle: 'Operable',
    status: CONF.SUPPORTS, confidence: 0.72, auto: 1,
    remarks: 'Focus order follows a logical, meaningful sequence on sampled pages. One mega-menu reorders DOM on open but restores order on close.',
    evidence: [{ type: 'pass', text: 'Tab sequence matches visual order', where: 'sampled pages' }] },
  { id: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', ver: '2.0', principle: 'Operable',
    status: CONF.PARTIAL, confidence: 0.79, auto: 18,
    remarks: "Most links are descriptive. 18 'Read more' and 'Click here' links on Blog and Support do not convey purpose from link text or context.",
    evidence: [{ type: 'issue', text: '18 ambiguous link labels', where: '/blog, /support' }] },
  { id: '2.4.7', name: 'Focus Visible', level: 'AA', ver: '2.0', principle: 'Operable',
    status: CONF.NOT, confidence: 0.85, auto: 12,
    remarks: 'A global `outline: none` rule removes the default focus indicator on links and custom buttons without a visible replacement, making keyboard focus position unclear.',
    evidence: [{ type: 'issue', text: 'outline:none with no replacement', where: 'global stylesheet' }] },
  { id: '2.4.11', name: 'Focus Not Obscured (Minimum)', level: 'AA', ver: '2.2', principle: 'Operable',
    status: CONF.PARTIAL, confidence: 0.64, auto: 3,
    remarks: 'On most pages the focused element is not hidden. The sticky header overlaps focused fields near the top of the Checkout and Contact forms when tabbing upward.',
    evidence: [{ type: 'issue', text: 'Sticky header obscures focused field', where: '/products/checkout, /support/contact' }] },
  { id: '2.5.3', name: 'Label in Name', level: 'A', ver: '2.1', principle: 'Operable',
    status: CONF.SUPPORTS, confidence: 0.68, auto: 2,
    remarks: 'Visible labels are contained within the accessible name for sampled controls. Two icon buttons rely on aria-label matching the visible tooltip text.',
    evidence: [{ type: 'pass', text: 'Accessible name contains visible label', where: 'sampled controls' }] },
  { id: '2.5.7', name: 'Dragging Movements', level: 'AA', ver: '2.2', principle: 'Operable',
    status: CONF.PARTIAL, confidence: 0.61, auto: 1,
    remarks: 'The image-comparison slider on Products and the reorder list in Settings require dragging with no single-pointer alternative (e.g. tap/click targets).',
    evidence: [{ type: 'issue', text: 'Drag-only slider, no click alternative', where: '/products' }] },
  { id: '2.5.8', name: 'Target Size (Minimum)', level: 'AA', ver: '2.2', principle: 'Operable',
    status: CONF.PARTIAL, confidence: 0.73, auto: 8,
    remarks: 'Most targets meet 24×24 CSS px. Pagination controls on Blog and the footer social icons are 18×18px with insufficient spacing.',
    evidence: [{ type: 'issue', text: 'Targets below 24×24px', where: '/blog footer, global footer' }] },
  { id: '3.1.1', name: 'Language of Page', level: 'A', ver: '2.0', principle: 'Understandable',
    status: CONF.SUPPORTS, confidence: 0.95, auto: 0,
    remarks: 'All sampled pages declare lang="en" on the <html> element. The default human language is programmatically determined.',
    evidence: [{ type: 'pass', text: 'lang attribute present on all pages', where: 'all pages' }] },
  { id: '3.2.1', name: 'On Focus', level: 'A', ver: '2.0', principle: 'Understandable',
    status: CONF.SUPPORTS, confidence: 0.71, auto: 0,
    remarks: 'Receiving focus does not initiate a change of context on sampled components. No automatic form submission or navigation on focus detected.',
    evidence: [{ type: 'pass', text: 'No context change on focus', where: 'sampled forms' }] },
  { id: '3.2.6', name: 'Consistent Help', level: 'A', ver: '2.2', principle: 'Understandable',
    status: CONF.PARTIAL, confidence: 0.6, auto: 0,
    remarks: 'Help links appear in the header on most pages but are placed in the footer on Checkout and omitted from the Sign In page, so help is not in a consistent relative order.',
    evidence: [{ type: 'issue', text: 'Help link order inconsistent across pages', where: '/products/checkout, /login' }] },
  { id: '3.3.1', name: 'Error Identification', level: 'A', ver: '2.0', principle: 'Understandable',
    status: CONF.PARTIAL, confidence: 0.8, auto: 7,
    remarks: 'The Contact form identifies errors in text. Sign In indicates errors with a red border only, without text, and does not associate messages via aria-describedby.',
    evidence: [{ type: 'issue', text: 'Errors conveyed by color only', where: '/login' }, { type: 'pass', text: 'Text error messages present', where: '/support/contact' }] },
  { id: '3.3.2', name: 'Labels or Instructions', level: 'A', ver: '2.0', principle: 'Understandable',
    status: CONF.PARTIAL, confidence: 0.77, auto: 11,
    remarks: 'Most inputs have associated <label> elements. The search field and newsletter signup use placeholder text as the only label, which disappears on input.',
    evidence: [{ type: 'issue', text: 'Placeholder used as sole label', where: 'global header, footer' }] },
  { id: '3.3.7', name: 'Redundant Entry', level: 'A', ver: '2.2', principle: 'Understandable',
    status: CONF.SUPPORTS, confidence: 0.66, auto: 0,
    remarks: 'Checkout auto-populates the billing address from the shipping address and offers it for reuse, so previously entered information is not unnecessarily re-requested.',
    evidence: [{ type: 'pass', text: 'Billing address offered for reuse', where: '/products/checkout' }] },
  { id: '3.3.8', name: 'Accessible Authentication (Minimum)', level: 'AA', ver: '2.2', principle: 'Understandable',
    status: CONF.NOT, confidence: 0.69, auto: 1,
    remarks: 'Sign In requires solving an image-based CAPTCHA (a cognitive function test) with no alternative that does not rely on recognizing objects, and copy-paste is blocked on the password field.',
    evidence: [{ type: 'issue', text: 'Image CAPTCHA with no accessible alternative', where: '/login' }, { type: 'issue', text: 'Paste blocked on password field', where: '/login' }] },
  { id: '4.1.2', name: 'Name, Role, Value', level: 'A', ver: '2.0', principle: 'Robust',
    status: CONF.NOT, confidence: 0.87, auto: 16,
    remarks: 'Several custom controls (rating widget, custom dropdowns, toggle switches) are built from <div>/<span> without ARIA roles or states, so their name, role and value are not exposed to assistive technology.',
    evidence: [{ type: 'issue', text: 'Custom widgets missing ARIA role/state', where: '/products, /account/settings' }] },
  { id: '4.1.3', name: 'Status Messages', level: 'AA', ver: '2.1', principle: 'Robust',
    status: CONF.PARTIAL, confidence: 0.66, auto: 3,
    remarks: "The cart 'item added' confirmation uses a live region. Form-submission success and async filter results update silently without an aria-live announcement.",
    evidence: [{ type: 'issue', text: 'Filter results not announced', where: '/products' }, { type: 'pass', text: 'Cart updates use aria-live', where: '/products/checkout' }] },
];

const WCAG: Criterion[] = WCAG_RAW.map((c) => ({
  ...c,
  report: 'wcag',
  section: c.level === 'AA' ? 'AA' : 'A',
}));

/** Note row for the obsolete 4.1.1 Parsing criterion (removed in WCAG 2.2). */
export const PARSING_NOTE: Criterion = {
  id: '4.1.1', name: 'Parsing (obsolete)', level: 'A', ver: '2.0/2.1', principle: 'Robust',
  report: 'wcag', section: 'A', status: CONF.SUPPORTS, confidence: 1, auto: 0, obsolete: true,
  remarks: 'Per the W3C, 4.1.1 Parsing is obsolete and removed: it does not apply to WCAG 2.2 and resolves automatically to “Supports” for WCAG 2.0 and 2.1.',
  evidence: [],
};

// ---- Revised Section 508 — Chapter 3: Functional Performance Criteria ----
type FpRaw = Pick<Criterion, 'id' | 'name' | 'status' | 'confidence' | 'remarks' | 'evidence'>;

const FPC_RAW: FpRaw[] = [
  { id: '302.1', name: 'Without Vision', status: CONF.PARTIAL, confidence: 0.8, remarks: 'A non-visual mode of operation is available via screen reader, but unnamed custom widgets (4.1.2) and missing image text (1.1.1) leave parts of Products and Settings inoperable without vision.', evidence: [{ type: 'issue', text: 'Custom widgets unnamed to AT', where: '/products, /account/settings' }] },
  { id: '302.2', name: 'With Limited Vision', status: CONF.PARTIAL, confidence: 0.78, remarks: 'Content scales to 200% and reflows, but low-contrast placeholder and control text (1.4.3, 1.4.11) reduce usability with limited vision.', evidence: [{ type: 'issue', text: 'Sub-threshold contrast on form text', where: 'global forms' }] },
  { id: '302.3', name: 'Without Perception of Color', status: CONF.PARTIAL, confidence: 0.82, remarks: 'Most information is conveyed beyond color, but Sign In conveys validation errors by color alone (3.3.1).', evidence: [{ type: 'issue', text: 'Error state by color only', where: '/login' }] },
  { id: '302.4', name: 'Without Hearing', status: CONF.NOT, confidence: 0.84, remarks: 'Prerecorded videos lack synchronized captions (1.2.2), so audio content is not available to users without hearing.', evidence: [{ type: 'issue', text: 'Uncaptioned video', where: '/, /account/dashboard' }] },
  { id: '302.5', name: 'With Limited Hearing', status: CONF.PARTIAL, confidence: 0.7, remarks: 'No captions are provided; volume is system-controlled. Users with limited hearing cannot rely on captions for the demo and onboarding media.', evidence: [{ type: 'issue', text: 'No captions for media', where: '/, /account/dashboard' }] },
  { id: '302.6', name: 'Without Speech', status: CONF.NA, confidence: 0.9, remarks: 'The product does not require speech input for any operation; all functions are operable by keyboard and pointer.', evidence: [{ type: 'pass', text: 'No speech-dependent operation', where: 'all pages' }] },
  { id: '302.7', name: 'With Limited Manipulation', status: CONF.PARTIAL, confidence: 0.74, remarks: 'Keyboard operation covers most flows, but the date picker and carousel (2.1.1) and drag-only slider (2.5.7) require fine manipulation with no alternative.', evidence: [{ type: 'issue', text: 'Keyboard & drag alternatives missing', where: '/products/checkout, /products' }] },
  { id: '302.8', name: 'With Limited Reach and Strength', status: CONF.SUPPORTS, confidence: 0.83, remarks: 'As a web product with no hardware, operation does not require physical reach or strength; all functions are software-operable.', evidence: [{ type: 'pass', text: 'No physical reach/strength required', where: 'all pages' }] },
  { id: '302.9', name: 'With Limited Language, Cognitive, and Learning Abilities', status: CONF.PARTIAL, confidence: 0.62, remarks: 'Plain-language labels are mostly used, but inconsistent help placement (3.2.6) and a cognitive-function CAPTCHA at sign in (3.3.8) raise barriers.', evidence: [{ type: 'issue', text: 'Inconsistent help & CAPTCHA', where: '/login, /products/checkout' }] },
];

const FPC_508: Criterion[] = FPC_RAW.map((c) => ({
  ...c,
  report: '508',
  section: 'fpc',
  auto: 0,
  principle: 'Functional Performance',
}));

// ---- EN 301 549 — Clause 4: Functional Performance Statements ----
type FpsRaw = Pick<Criterion, 'id' | 'name' | 'status' | 'confidence' | 'remarks'>;

const FPS_RAW: FpsRaw[] = [
  { id: '4.2.1', name: 'Usage without vision', status: CONF.PARTIAL, confidence: 0.8, remarks: 'Screen-reader operation is possible, but unnamed widgets (11.x / WCAG 4.1.2) and missing non-text alternatives block some tasks.' },
  { id: '4.2.2', name: 'Usage with limited vision', status: CONF.PARTIAL, confidence: 0.77, remarks: 'Reflow and resize succeed; low text and non-text contrast reduce usability with limited vision.' },
  { id: '4.2.3', name: 'Usage without perception of colour', status: CONF.PARTIAL, confidence: 0.82, remarks: 'Generally colour-independent, except colour-only error indication on Sign In.' },
  { id: '4.2.4', name: 'Usage without hearing', status: CONF.NOT, confidence: 0.84, remarks: 'Prerecorded media lacks captions, so audio information is unavailable without hearing.' },
  { id: '4.2.5', name: 'Usage with limited hearing', status: CONF.PARTIAL, confidence: 0.7, remarks: 'No captions provided; system volume control only.' },
  { id: '4.2.6', name: 'Usage with no or limited vocal capability', status: CONF.NA, confidence: 0.9, remarks: 'No function requires vocal input.' },
  { id: '4.2.7', name: 'Usage with limited manipulation or strength', status: CONF.PARTIAL, confidence: 0.74, remarks: 'Keyboard alternatives missing for date picker, carousel and drag-only slider.' },
  { id: '4.2.8', name: 'Usage with limited reach', status: CONF.SUPPORTS, confidence: 0.83, remarks: 'Web product with no hardware; reach is not a factor.' },
  { id: '4.2.9', name: 'Minimize photosensitive seizure triggers', status: CONF.SUPPORTS, confidence: 0.78, remarks: 'No content flashes more than three times per second; animations respect prefers-reduced-motion.' },
  { id: '4.2.10', name: 'Usage with limited cognition, language or learning', status: CONF.PARTIAL, confidence: 0.62, remarks: 'Inconsistent help placement and a cognitive-test CAPTCHA at sign in raise barriers.' },
  { id: '4.2.11', name: 'Privacy', status: CONF.PARTIAL, confidence: 0.66, remarks: 'Password entry can be masked, but the only authentication method depends on a cognitive function test, limiting private independent use.' },
];

const FPS_EN: Criterion[] = FPS_RAW.map((c) => ({
  ...c,
  report: 'en',
  section: 'fps',
  auto: 0,
  evidence: [],
  principle: 'Functional Performance',
}));

/** Auto-referenced / not-applicable rows (resolved automatically, shown for completeness). */
export const AUTO: AutoRow[] = [
  // Section 508
  { report: '508', section: 'ref508', id: '501.1', name: 'Scope — Incorporation of WCAG 2.0 AA', status: CONF.SUPPORTS, ref: 'See WCAG 2.x section' },
  { report: '508', section: 'ref508', id: 'Ch. 4', name: 'Hardware (402–415)', status: CONF.NA, ref: 'Not Applicable — web-based product with no hardware component' },
  { report: '508', section: 'ref508', id: '502 / 503', name: 'Software — Interoperability & Applications', status: CONF.PARTIAL, ref: 'Conformance recorded in WCAG 2.x section (Name, Role, Value)' },
  { report: '508', section: 'ref508', id: '504.2', name: 'Authoring Tools — Content Creation', status: CONF.NA, ref: 'Not Applicable — product is not an authoring tool' },
  { report: '508', section: 'ref508', id: '602.3', name: 'Electronic Support Documentation', status: CONF.SUPPORTS, ref: 'See WCAG 2.x section' },
  // EN 301 549
  { report: 'en', section: 'refen', id: 'Clause 5', name: 'Generic Requirements (closed functionality)', status: CONF.NA, ref: 'Not Applicable — product is not closed functionality' },
  { report: 'en', section: 'refen', id: 'Clauses 6–7', name: 'Two-Way Voice & Video Capabilities', status: CONF.NA, ref: 'Not Applicable — no voice/video communication features' },
  { report: 'en', section: 'refen', id: 'Clause 8', name: 'Hardware', status: CONF.NA, ref: 'Not Applicable — no hardware component' },
  { report: 'en', section: 'refen', id: 'Clause 9', name: 'Web', status: CONF.PARTIAL, ref: 'See WCAG 2.x section (Tables 1 & 2)' },
  { report: 'en', section: 'refen', id: '11.1–11.4', name: 'Software', status: CONF.PARTIAL, ref: 'See WCAG 2.x section' },
  { report: 'en', section: 'refen', id: '12.1.2 / 12.2.4', name: 'Documentation & Support', status: CONF.SUPPORTS, ref: 'See WCAG 2.x section' },
  { report: 'en', section: 'refen', id: 'Clause 13', name: 'Relay & Emergency Service Access', status: CONF.NA, ref: 'Not Applicable — not a relay or emergency service' },
];

/** Approvable findings: WCAG (A+AA) + parsing note + 508 FPC + EN FPS. */
export const CRITERIA: Criterion[] = [...WCAG, PARSING_NOTE, ...FPC_508, ...FPS_EN];
