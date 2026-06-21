/** Crawl + automated analysis. Attempts a real Playwright + axe-core scan; on any
 *  failure (e.g. the unreachable *.example demo domains) it falls back to the baked
 *  mock dataset so the end-to-end flow always completes (BACKEND.md §1). */
import { CRITERIA, PAGES, SCAN_PHASES, type Evidence } from '@vpat/shared';
import type { ScanJobMessage } from '@vpat/shared';
import type { Emitter } from './events.js';

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

/** Best-effort real scan: root + a few same-origin pages, axe per page. */
async function realScan(job: ScanJobMessage, emit: Emitter): Promise<AnalysisResult> {
  const { chromium } = await import('playwright');
  const AxeBuilder = (await import('@axe-core/playwright')).default;

  const base = `https://${job.domain}`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

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
  for (const c of CRITERIA) {
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
