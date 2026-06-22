/**
 * Manual assistive-technology test plan shown to the evaluator on the Details step and
 * recorded as an appendix in the exported report. Automated checks (axe + the worker's
 * AT-oriented checks) cover only part of WCAG; this is the exact procedure a human must
 * follow on real assistive technology to back the attestation.
 */

export interface SrCommand {
  action: string;
  keys: string;
}

export interface PlatformGuide {
  id: 'windows' | 'mac';
  label: string;
  screenReader: string;
  browser: string;
  /** One-time setup steps before testing. */
  setup: string[];
  /** The key commands the evaluator needs while testing. */
  commands: SrCommand[];
}

export interface TestArea {
  title: string;
  /** What to do, step by step. */
  steps: string[];
  /** WCAG success criteria this area exercises. */
  criteria: string[];
}

export interface PagePriority {
  type: string;
  why: string;
}

export const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    id: 'windows',
    label: 'Windows',
    screenReader: 'NVDA (free) or JAWS',
    browser: 'Chrome or Firefox',
    setup: [
      'Install NVDA from nvaccess.org (free) — or use JAWS. Use the latest version and restart the browser after installing.',
      'Use Chrome or Firefox; they are the most-tested pairing with NVDA. Plug in headphones so you hear announcements clearly.',
      'Start NVDA with Ctrl+Alt+N. The "NVDA key" is Insert (or CapsLock on laptops). Press Insert+N for the menu.',
      'Turn on Speech Viewer (NVDA menu → Tools → Speech Viewer) so you can also read what is announced.',
    ],
    commands: [
      { action: 'Stop / silence speech', keys: 'Control' },
      { action: 'Read everything from here', keys: 'Insert + ↓' },
      { action: 'Next / previous line', keys: '↓ / ↑' },
      { action: 'List all links, headings, landmarks', keys: 'Insert + F7' },
      { action: 'Next heading (or by level)', keys: 'H  (1–6 for level)' },
      { action: 'Next landmark / region', keys: 'D' },
      { action: 'Next form field / button / table', keys: 'F / B / T' },
      { action: 'Next graphic (image)', keys: 'G' },
      { action: 'Toggle browse / focus (forms) mode', keys: 'Insert + Space' },
      { action: 'Announce window title', keys: 'Insert + T' },
    ],
  },
  {
    id: 'mac',
    label: 'macOS',
    screenReader: 'VoiceOver (built in)',
    browser: 'Safari',
    setup: [
      'Turn VoiceOver on/off with Cmd+F5. Use Safari for the best VoiceOver support.',
      'Enable keyboard reachability of links: Safari → Settings → Advanced → check "Press Tab to highlight each item on a webpage".',
      'Turn on Full Keyboard Access: System Settings → Keyboard → Keyboard navigation (so Tab reaches all controls system-wide).',
      'Learn the "VO" modifier: Control+Option. Press it with other keys for VoiceOver commands. Open VoiceOver Utility for the verbosity settings.',
    ],
    commands: [
      { action: 'Stop / silence speech', keys: 'Control' },
      { action: 'Read everything from here', keys: 'VO + A' },
      { action: 'Next / previous item', keys: 'VO + → / VO + ←' },
      { action: 'Open the Rotor (headings, links, form controls, landmarks)', keys: 'VO + U' },
      { action: 'Next heading', keys: 'VO + Cmd + H' },
      { action: 'Next link', keys: 'VO + Cmd + L' },
      { action: 'Next form control', keys: 'VO + Cmd + J' },
      { action: 'Interact with / stop interacting (groups, tables)', keys: 'VO + Shift + ↓ / ↑' },
      { action: 'Activate (click) the item', keys: 'VO + Space' },
      { action: 'Announce window title', keys: 'VO + F2' },
    ],
  },
];

export const TEST_PROCEDURE: TestArea[] = [
  {
    title: '1. Keyboard-only pass (no mouse)',
    steps: [
      'Put the mouse aside. From the very top of the page, press Tab repeatedly to the end.',
      'A "Skip to main content" link should be the first thing you reach, and it must work.',
      'Confirm the focus indicator is always clearly visible and never disappears.',
      'Confirm focus order is logical and matches the visual reading order (no jumping around).',
      'Confirm you can reach AND operate every control: links/buttons (Enter/Space), menus, tabs, sliders, date pickers, carousels (arrow keys), and any custom widget.',
      'Open every menu, modal, and dropdown with the keyboard; press Esc to close and confirm focus returns to where it was. You must never get trapped — Tab/Shift+Tab always moves on.',
    ],
    criteria: ['2.1.1', '2.1.2', '2.4.1', '2.4.3', '2.4.7', '2.4.11', '2.5.7'],
  },
  {
    title: '2. Screen-reader reading & structure',
    steps: [
      'Turn the screen reader on and read the page top to bottom (Insert+↓ / VO+A). Everything should be announced in a sensible order.',
      'Open the headings list (Insert+F7 / VO+U → Headings): exactly one H1, logical nesting, headings that describe each section.',
      'Navigate landmarks (D / Rotor): confirm banner, navigation, main and contentinfo regions exist.',
      'Navigate images (G): every meaningful image announces useful alt text; purely decorative images stay silent.',
      'Navigate links (Insert+F7 / VO+Cmd+L): each link makes sense out of context — no bare "click here" or "read more".',
    ],
    criteria: ['1.1.1', '1.3.1', '1.3.2', '2.4.1', '2.4.4', '2.4.6'],
  },
  {
    title: '3. Forms, errors & custom widgets (screen reader)',
    steps: [
      'Navigate each form field (F / VO+Cmd+J). Every field must announce a label, its type, and required state.',
      'Submit the form with invalid/empty values. Errors must be announced (live region), described in text (not color alone), and tied to the right field.',
      'Operate custom controls (toggles, tabs, comboboxes, sliders): confirm name, role and current value/state are announced, and changes are announced.',
      'On sign-in: confirm any CAPTCHA has an accessible alternative, the password field allows paste, and authentication does not rely on a cognitive-only test.',
    ],
    criteria: ['1.3.1', '3.3.1', '3.3.2', '3.3.3', '3.3.7', '3.3.8', '4.1.2', '4.1.3'],
  },
  {
    title: '4. Zoom, reflow & text spacing',
    steps: [
      'Browser-zoom to 200% (Ctrl/Cmd and + a few times): no loss of content or function.',
      'Reflow: set the window to 320 CSS px wide (or zoom to 400% at 1280px). Content should collapse to a single column with no horizontal scrolling (data tables and maps are exempt).',
      'Increase text spacing (line-height 1.5×, letter/word spacing) via a bookmarklet or extension: no clipped or overlapping text.',
    ],
    criteria: ['1.4.4', '1.4.10', '1.4.12'],
  },
  {
    title: '5. Contrast & use of color',
    steps: [
      'With a contrast tool (browser DevTools or TPGi Colour Contrast Analyser) sample body text, placeholders, button labels, links and the focus indicator: normal text ≥ 4.5:1, large text ≥ 3:1.',
      'Sample UI component boundaries (input borders, toggles, icons) and graphical objects: ≥ 3:1 against their background.',
      'Confirm no information is conveyed by color alone — errors, required fields, links within text, and chart series must have a non-color cue.',
    ],
    criteria: ['1.4.1', '1.4.3', '1.4.11'],
  },
  {
    title: '6. Media, motion & timing',
    steps: [
      'For each video: synchronized captions are present and accurate; provide audio description if there is meaningful visual-only content.',
      'For audio-only content: a transcript is available.',
      'Confirm nothing flashes more than three times per second.',
      'Enable "reduce motion" (OS setting) and confirm non-essential animation stops; confirm no content auto-updates or times out without a way to pause/extend.',
    ],
    criteria: ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '2.2.1', '2.2.2', '2.3.1'],
  },
  {
    title: '7. Predictability & consistency',
    steps: [
      'Tab to fields and controls: nothing should change context (navigate, submit, open a popup) just because it received focus or you typed.',
      'Confirm navigation and the position of repeated controls (search, help) are consistent across pages, and components that do the same thing are labeled the same way.',
    ],
    criteria: ['3.2.1', '3.2.2', '3.2.3', '3.2.4', '3.2.6'],
  },
];

/** Which page types to prioritize when picking pages to test. */
export const PAGE_PRIORITY: PagePriority[] = [
  { type: 'Home / landing', why: 'Global header, nav, footer, hero media and skip link — sets the baseline for every page.' },
  { type: 'A listing / catalog page', why: 'Filters, sorting, cards, pagination and status messages (live regions).' },
  { type: 'A content / article page', why: 'Heading structure, in-text links, images and reading order.' },
  { type: 'A form page (contact / search)', why: 'Labels, required state, inline validation and error messaging.' },
  { type: 'Sign-in / authentication', why: 'CAPTCHA alternative, paste, error handling and accessible authentication.' },
  { type: 'A transactional flow (checkout)', why: 'Multi-step focus management, custom widgets (date pickers), summary tables and reflow.' },
  { type: 'An authenticated page (account / settings)', why: 'Test signed in with the supplied credentials; custom controls and dynamic updates.' },
];

/** How to record results back into the report. */
export const RECORDING_GUIDANCE = [
  'For every criterion, set the conformance level in Step 5 (Review) and write remarks that cite the specific page and what you observed.',
  'Prioritize the criteria the automated scan flagged as "requires manual verification" — those have no automated signal and depend entirely on this manual pass.',
  'List the assistive technologies and environments you actually used in the attestation fields above; they are printed in the report.',
];
