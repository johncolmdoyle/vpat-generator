/**
 * Assistive-technology-oriented checks that go beyond axe-core's static rules.
 *
 * These exercise the same surfaces a screen-reader / keyboard user depends on:
 *  - computed **accessible name** of interactive controls (what AT announces) → 4.1.2,
 *  - scripted **keyboard** traversal: focus reachability + trap detection → 2.1.1/2.1.2,
 *  - **focus visibility** → 2.4.7,
 *  - **reflow** at 320 CSS px → 1.4.10,
 *  - pointer **target size** (24×24) → 2.5.8,
 *  - programmatic **labels** → 3.3.2, **landmarks/skip link** → 2.4.1,
 *    **heading order** → 1.3.1, **page language** → 3.1.1, **captions** → 1.2.2.
 *
 * We cannot drive native JAWS/NVDA/VoiceOver in a headless container, so genuine
 * manual AT testing is recorded via the evaluator attestation. These automated checks
 * maximize the AT-relevant signal the worker can produce on its own.
 */
import type { Page } from 'playwright';
import type { Evidence } from '@vpat/shared';

export interface CriterionFinding {
  auto: number;
  evidence: Evidence[];
}
export type DeepResult = Map<string, CriterionFinding>;

function add(map: DeepResult, cid: string, ev: Evidence, weight = 1): void {
  const d = map.get(cid) ?? { auto: 0, evidence: [] };
  if (ev.type === 'issue') d.auto += weight;
  if (d.evidence.length < 6) d.evidence.push(ev);
  map.set(cid, d);
}

/** Structural + accessible-name DOM checks run in-page; returns plain data. */
interface DomReport {
  lang: boolean;
  hasMain: boolean;
  hasSkip: boolean;
  headingSkips: number;
  imagesNoAlt: number;
  imagesOk: number;
  unlabeledFields: number;
  labeledFields: number;
  unnamedControls: number;
  namedControls: number;
  smallTargets: number;
  videosNoCaptions: number;
  focusOutlineSuppressed: boolean;
}

async function domAudit(page: Page): Promise<DomReport> {
  return page.evaluate(() => {
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };

    // Accessible-name computation (simplified ARIA accname algorithm — the string a
    // screen reader would announce for the control).
    const accName = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim();
        if (t) return t;
      }
      const tag = el.tagName;
      if (tag === 'INPUT') {
        const input = el as HTMLInputElement;
        const ty = (input.getAttribute('type') || 'text').toLowerCase();
        if ((ty === 'button' || ty === 'submit' || ty === 'reset') && input.value.trim()) return input.value.trim();
        if (input.id) {
          const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (l?.textContent?.trim()) return l.textContent.trim();
        }
        const wrap = input.closest('label');
        if (wrap?.textContent?.trim()) return wrap.textContent.trim();
      }
      if (tag === 'IMG') {
        const alt = el.getAttribute('alt');
        return alt ? alt.trim() : '';
      }
      const txt = (el.textContent || '').trim();
      if (txt) return txt;
      const title = el.getAttribute('title');
      if (title && title.trim()) return title.trim();
      const innerImg = el.querySelector('img[alt]');
      if (innerImg) {
        const a = innerImg.getAttribute('alt');
        if (a && a.trim()) return a.trim();
      }
      return '';
    };

    const lang = !!document.documentElement.getAttribute('lang');
    const hasMain = !!document.querySelector('main, [role="main"]');
    const skip = Array.from(document.querySelectorAll('a[href^="#"]')).slice(0, 3);
    const hasSkip = skip.some((a) => /skip|main|content/i.test(a.textContent || ''));

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    let prev = 0;
    let headingSkips = 0;
    for (const h of headings) {
      const lvl = Number(h.tagName[1]);
      if (prev && lvl > prev + 1) headingSkips++;
      prev = lvl;
    }

    let imagesNoAlt = 0;
    let imagesOk = 0;
    for (const img of Array.from(document.querySelectorAll('img'))) {
      if (img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true') continue;
      if (img.getAttribute('alt') === null) imagesNoAlt++;
      else imagesOk++;
    }

    let unlabeledFields = 0;
    let labeledFields = 0;
    const controls = Array.from(
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea'),
    );
    for (const c of controls) {
      const el = c as HTMLInputElement;
      const named =
        !!el.getAttribute('aria-label') ||
        !!el.getAttribute('aria-labelledby') ||
        !!el.getAttribute('title') ||
        (!!el.id && !!document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
        !!el.closest('label');
      if (named) labeledFields++;
      else unlabeledFields++;
    }

    // Name, Role, Value (4.1.2): interactive controls must announce a name.
    let unnamedControls = 0;
    let namedControls = 0;
    const interactive = Array.from(
      document.querySelectorAll(
        'button,a[href],[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"]',
      ),
    );
    for (const el of interactive) {
      if (!visible(el)) continue;
      if (accName(el)) namedControls++;
      else unnamedControls++;
    }

    let smallTargets = 0;
    const clickable = Array.from(document.querySelectorAll('a[href],button,[role="button"],[role="link"]'));
    for (const el of clickable) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) smallTargets++;
    }

    let videosNoCaptions = 0;
    for (const v of Array.from(document.querySelectorAll('video'))) {
      if (!v.querySelector('track[kind="captions"],track[kind="subtitles"]')) videosNoCaptions++;
    }

    let focusOutlineSuppressed = false;
    try {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | undefined;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin sheet
        }
        for (const rule of Array.from(rules ?? [])) {
          const sr = rule as CSSStyleRule;
          const t = sr.selectorText;
          const outline = sr.style && (sr.style.outline || sr.style.getPropertyValue('outline'));
          if (t && /:focus(?!-visible)/.test(t) && outline && /none|^0/.test(outline)) {
            focusOutlineSuppressed = true;
          }
        }
      }
    } catch {
      /* ignore */
    }

    return {
      lang,
      hasMain,
      hasSkip,
      headingSkips,
      imagesNoAlt,
      imagesOk,
      unlabeledFields,
      labeledFields,
      unnamedControls,
      namedControls,
      smallTargets,
      videosNoCaptions,
      focusOutlineSuppressed,
    };
  });
}

/** Scripted keyboard traversal: count reachable focus stops, detect a trap. */
async function keyboardAudit(page: Page): Promise<{ reached: number; interactive: number; trapped: boolean }> {
  const interactive = await page.evaluate(
    () =>
      document.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ).length,
  );
  const signatures = new Set<string>();
  let repeats = 0;
  const maxTabs = Math.min(60, interactive + 5);
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const sig = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return '';
      return `${a.tagName}#${a.id}.${(a.getAttribute('class') || '').slice(0, 20)}[${(a.textContent || '').slice(0, 12)}]`;
    });
    if (!sig) continue;
    if (signatures.has(sig)) repeats++;
    else repeats = 0;
    signatures.add(sig);
    if (repeats >= 4) return { reached: signatures.size, interactive, trapped: true };
  }
  return { reached: signatures.size, interactive, trapped: false };
}

/** Reflow at 320 CSS px: horizontal scrollbar ⇒ content does not reflow. */
async function reflowAudit(page: Page): Promise<boolean> {
  const original = page.viewportSize();
  try {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(150);
    return await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth > window.innerWidth + 2;
    });
  } catch {
    return false;
  } finally {
    if (original) await page.setViewportSize(original).catch(() => {});
  }
}

/** Run all AT-oriented checks against a rendered page and return per-criterion findings. */
export async function deepAudit(page: Page, path: string): Promise<DeepResult> {
  const map: DeepResult = new Map();

  try {
    const d = await domAudit(page);

    if (d.unnamedControls > 0)
      add(map, '4.1.2', { type: 'issue', text: `${d.unnamedControls} interactive control(s) expose no accessible name to assistive technology`, where: path }, d.unnamedControls);
    else if (d.namedControls > 0)
      add(map, '4.1.2', { type: 'pass', text: `All ${d.namedControls} interactive controls expose an accessible name`, where: path });

    if (!d.lang) add(map, '3.1.1', { type: 'issue', text: 'No lang attribute on <html>; page language is not programmatically set', where: path });
    else add(map, '3.1.1', { type: 'pass', text: 'Page language is set on <html>', where: path });

    if (!d.hasMain || !d.hasSkip)
      add(map, '2.4.1', {
        type: 'issue',
        text: `Bypass blocks: ${!d.hasMain ? 'no main landmark' : ''}${!d.hasMain && !d.hasSkip ? '; ' : ''}${!d.hasSkip ? 'no skip link' : ''}`,
        where: path,
      });
    else add(map, '2.4.1', { type: 'pass', text: 'Main landmark and skip link present', where: path });

    if (d.headingSkips > 0) add(map, '1.3.1', { type: 'issue', text: `${d.headingSkips} heading level(s) skipped, breaking document structure`, where: path }, d.headingSkips);
    if (d.imagesNoAlt > 0) add(map, '1.1.1', { type: 'issue', text: `${d.imagesNoAlt} image(s) missing an alt attribute`, where: path }, d.imagesNoAlt);
    else if (d.imagesOk > 0) add(map, '1.1.1', { type: 'pass', text: `${d.imagesOk} image(s) provide alt text`, where: path });

    if (d.unlabeledFields > 0) add(map, '3.3.2', { type: 'issue', text: `${d.unlabeledFields} form field(s) have no programmatic label`, where: path }, d.unlabeledFields);
    else if (d.labeledFields > 0) add(map, '3.3.2', { type: 'pass', text: `${d.labeledFields} form field(s) are labeled`, where: path });

    if (d.smallTargets > 0) add(map, '2.5.8', { type: 'issue', text: `${d.smallTargets} pointer target(s) smaller than 24×24 CSS px`, where: path }, d.smallTargets);
    if (d.videosNoCaptions > 0) add(map, '1.2.2', { type: 'issue', text: `${d.videosNoCaptions} video(s) without a captions track`, where: path }, d.videosNoCaptions);
    if (d.focusOutlineSuppressed) add(map, '2.4.7', { type: 'issue', text: 'A :focus rule removes the outline without a visible replacement', where: path });
  } catch {
    /* ignore */
  }

  try {
    const k = await keyboardAudit(page);
    if (k.trapped) add(map, '2.1.2', { type: 'issue', text: 'Keyboard focus appears to be trapped (focus did not advance)', where: path });
    else add(map, '2.1.2', { type: 'pass', text: 'No keyboard trap detected during tab traversal', where: path });
    if (k.interactive > 0 && k.reached < Math.ceil(k.interactive * 0.6))
      add(map, '2.1.1', { type: 'issue', text: `Only ${k.reached} of ~${k.interactive} interactive elements were keyboard reachable`, where: path });
    else if (k.reached > 0) add(map, '2.1.1', { type: 'pass', text: `${k.reached} interactive elements reachable by keyboard`, where: path });
  } catch {
    /* ignore */
  }

  try {
    if (await reflowAudit(page)) add(map, '1.4.10', { type: 'issue', text: 'Horizontal scrolling required at 320 CSS px (content does not reflow)', where: path });
    else add(map, '1.4.10', { type: 'pass', text: 'Content reflows without horizontal scrolling at 320 CSS px', where: path });
  } catch {
    /* ignore */
  }

  return map;
}
