/** Crawl + automated analysis. Attempts a real Playwright + axe-core scan; on any
 *  failure (e.g. the unreachable *.example demo domains) it falls back to the baked
 *  mock dataset so the end-to-end flow always completes (BACKEND.md §1). */
import type { Page } from 'playwright';
import { PAGES, SCAN_PHASES, criteriaForEdition, type Evidence } from '@vpat/shared';
import type { ScanJobMessage } from '@vpat/shared';
import { readSecret } from '@vpat/backend';
import type { Emitter } from './events.js';
import { deepAudit } from './checks.js';

export interface CriterionData {
  auto: number;
  evidence: Evidence[];
}
export interface AnalysisResult {
  pages: { url: string; title: string; auth: boolean }[];
  perCriterion: Map<string, CriterionData>;
  mock: boolean;
  issues: number;
  evidence: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ScanCredentials {
  user: string;
  pass: string;
  loginUrl?: string;
}

/** axe wcag tag (e.g. "wcag1411") → success-criterion id ("1.4.11"). */
function tagToCriterion(tag: string): string | null {
  const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** Walk the 8 pipeline phases, emitting phase + per-page log lines and live counters. */
async function runPipeline(
  emit: Emitter,
  pages: AnalysisResult['pages'],
  pageIssues: (url: string) => number,
): Promise<{ issues: number; evidence: number }> {
  let issues = 0;
  let evidence = 0;
  for (let i = 0; i < SCAN_PHASES.length; i++) {
    const ph = SCAN_PHASES[i];
    await emit.emit({ kind: 'phase', phase: i, label: ph.label });
    await emit.emit({ kind: 'log', level: 'phase', text: ph.label });
    if (ph.key === 'render' || ph.key === 'axe') {
      for (const pg of pages) {
        const found = pageIssues(pg.url);
        issues += found;
        evidence += 1 + (found > 0 ? 1 : 0);
        await emit.emit({
          kind: 'log',
          level: found > 4 ? 'warn' : 'ok',
          text: `GET ${pg.url}`,
          meta: found ? `${found} issues · ${pg.title}` : `clean · ${pg.title}`,
        });
        await emit.counter(pages.length, issues, evidence);
        await sleep(120);
      }
    }
    await sleep(220);
  }
  return { issues, evidence };
}

async function clickFirstVisible(
  page: Page,
  selectors: Array<{ kind: 'role'; role: Parameters<Page['getByRole']>[0]; name: string } | { kind: 'css'; selector: string }>,
): Promise<boolean> {
  for (const item of selectors) {
    const locator =
      item.kind === 'role'
        ? page.getByRole(item.role, { name: item.name })
        : page.locator(item.selector);
    if ((await locator.count()) < 1) continue;
    try {
      await locator.first().click({ timeout: 5000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function fillFirstVisible(page: Page, selectors: string[], value: string): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) < 1) continue;
    try {
      await locator.first().fill(value, { timeout: 5000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function waitForCredentialFields(page: Page): Promise<boolean> {
  const selectors = ['input[type="email"]', 'input[name="username"]', '#username', 'input[type="password"]', '#password'];
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const selector of selectors) {
      if ((await page.locator(selector).count()) > 0) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function authenticate(page: Page, base: string, creds: ScanCredentials, emit: Emitter): Promise<void> {
  const loginTarget = new URL(creds.loginUrl || '/login', base).toString();
  await emit.emit({ kind: 'log', level: 'phase', text: `Opening login page`, meta: creds.loginUrl || '/login' });
  await page.goto(loginTarget, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Some apps show a bridge button before handing off to Auth0 / SSO.
  if (!(await waitForCredentialFields(page))) {
    await clickFirstVisible(page, [
      { kind: 'role', role: 'button', name: 'Sign in with Auth0' },
      { kind: 'role', role: 'button', name: 'Continue with Auth0' },
      { kind: 'role', role: 'button', name: 'Log in with Auth0' },
      { kind: 'role', role: 'button', name: 'Sign in' },
      { kind: 'role', role: 'button', name: 'Log in' },
      { kind: 'css', selector: 'a[href*="auth0.com"]' },
      { kind: 'css', selector: 'button[data-auth-provider]' },
    ]);
    await waitForCredentialFields(page);
  }

  const userFilled = await fillFirstVisible(page, ['#username', 'input[name="username"]', 'input[type="email"]'], creds.user);
  const passFilled = await fillFirstVisible(page, ['#password', 'input[name="password"]', 'input[type="password"]'], creds.pass);
  if (!userFilled || !passFilled) {
    throw new Error(`authenticated login failed: could not find credential fields after opening ${loginTarget}`);
  }

  await emit.emit({ kind: 'log', level: 'phase', text: `Submitting login form`, meta: new URL(await page.url()).origin });
  const clicked = await clickFirstVisible(page, [
    { kind: 'role', role: 'button', name: 'Continue' },
    { kind: 'role', role: 'button', name: 'Log in' },
    { kind: 'role', role: 'button', name: 'Sign in' },
    { kind: 'role', role: 'button', name: 'Submit' },
    { kind: 'css', selector: 'button[type="submit"]' },
    { kind: 'css', selector: 'input[type="submit"]' },
  ]);
  if (!clicked) {
    await page.keyboard.press('Enter');
  }

  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  for (let attempt = 0; attempt < 60; attempt++) {
    const currentUrl = page.url();
    if (new URL(currentUrl).origin === new URL(base).origin && !/\/login\b/.test(new URL(currentUrl).pathname)) {
      if (currentUrl !== base) {
        await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
      await emit.emit({ kind: 'log', level: 'ok', text: `Authenticated session ready`, meta: new URL(currentUrl).pathname || '/' });
      return;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error(`authenticated login failed: did not return to ${new URL(base).origin} after submitting credentials`);
}

/** Best-effort real scan: root + a few same-origin pages, axe per page. */
async function realScan(job: ScanJobMessage, emit: Emitter): Promise<AnalysisResult> {
  const { chromium } = await import('playwright');
  const AxeBuilder = (await import('@axe-core/playwright')).default;

  const base = `https://${job.domain}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (job.authMode === 'auth' && job.authSecretId) {
      const creds = await readSecret<ScanCredentials>(job.authSecretId);
      if (!creds?.user || !creds?.pass) throw new Error('authenticated scan failed: credentials secret missing or unreadable');
      await authenticate(page, base, creds, emit);
    }

    // Discover pages.
    const limit = job.scope === 'single' ? 1 : 8;
    const urls = new Set<string>([base]);
    if (job.scope !== 'single') {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const links: string[] = await page.$$eval('a[href]', (as) =>
        (as as HTMLAnchorElement[]).map((a) => a.href),
      );
      for (const href of links) {
        try {
          if (new URL(href).origin === new URL(base).origin) urls.add(href.split('#')[0]);
        } catch {
          /* ignore malformed */
        }
        if (urls.size >= limit) break;
      }
    }

    const pages: AnalysisResult['pages'] = [];
    const issuesByUrl = new Map<string, number>();
    const perCriterion = new Map<string, CriterionData>();

    for (const url of [...urls].slice(0, limit)) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      const path = new URL(url).pathname || '/';
      pages.push({ url: path, title: title || path, auth: false });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      let pageIssueCount = 0;
      for (const v of results.violations) {
        const nodes = v.nodes.length;
        pageIssueCount += nodes;
        for (const tag of v.tags) {
          const cid = tagToCriterion(tag);
          if (!cid) continue;
          const data = perCriterion.get(cid) ?? { auto: 0, evidence: [] };
          data.auto += nodes;
          if (data.evidence.length < 6) {
            data.evidence.push({ type: 'issue', text: v.help, where: path });
          }
          perCriterion.set(cid, data);
        }
      }

      // AT-oriented checks beyond axe (accessibility tree, keyboard, reflow, …).
      const deep = await deepAudit(page, path);
      for (const [cid, d] of deep) {
        const data = perCriterion.get(cid) ?? { auto: 0, evidence: [] };
        data.auto += d.auto;
        for (const ev of d.evidence) {
          if (data.evidence.length < 8) data.evidence.push(ev);
        }
        perCriterion.set(cid, data);
        pageIssueCount += d.auto;
      }

      issuesByUrl.set(path, pageIssueCount);
    }
    await context.close();

    const totals = await runPipeline(emit, pages, (u) => issuesByUrl.get(u) ?? 0);
    return { pages, perCriterion, mock: false, issues: totals.issues, evidence: totals.evidence };
  } finally {
    await browser.close();
  }
}

/** Deterministic mock scan over the baked dataset. */
async function mockScan(job: ScanJobMessage, emit: Emitter): Promise<AnalysisResult> {
  const pages = PAGES.filter((p) => job.authMode === 'auth' || !p.auth);
  const perCriterion = new Map<string, CriterionData>();
  for (const c of criteriaForEdition(job.edition)) {
    perCriterion.set(c.id, { auto: c.auto, evidence: c.evidence });
  }
  // Pseudo-random but stable issue count per page url.
  const pageIssues = (url: string) => {
    let h = 0;
    for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 9;
  };
  const totals = await runPipeline(emit, pages, pageIssues);
  return { pages, perCriterion, mock: true, issues: totals.issues, evidence: totals.evidence };
}

/** Quick reachability probe so demo domains fall straight through to the mock path. */
async function reachable(domain: string): Promise<boolean> {
  try {
    await fetch(`https://${domain}`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}

export async function analyze(job: ScanJobMessage, emit: Emitter): Promise<AnalysisResult> {
  if (await reachable(job.domain)) {
    try {
      return await realScan(job, emit);
    } catch (err) {
      await emit.emit({ kind: 'log', level: 'warn', text: `real scan failed, using mock — ${String(err)}` });
    }
  }
  return mockScan(job, emit);
}
