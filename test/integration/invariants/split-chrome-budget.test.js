/**
 * SPLIT CHROME BUDGET — the running header and footer of `split-panel` / `split-compare` stay
 * on the field they start on, and never land on text.
 *
 * The budget is CSS arithmetic: `right: calc(100% - var(--_panel-outer) + var(--frame-inset-x))`,
 * where `--_panel-outer` restates the panel's rendered width (`--_panel-w` plus its content-box
 * padding). Nothing but a browser can check that the restatement still matches the box — a
 * variant that changes the panel's side padding moves the seam and silently re-opens the
 * defect: a header crossing the seam in the panel's ink, where it vanishes, or printing over
 * split-compare's option cards (split-panel.styles.css, "THE RUNNING CHROME HAS A BUDGET").
 * So this renders every variant width through the real emulator and measures.
 *
 * It also pins the two DOM facts the budget stands on: the running footer is a DIRECT section
 * child (so `no-footer` / `silent` reach it — they did not when split-panel nested it in
 * `.panel-right`), and split-compare keeps its footer at all (its string transform dropped it).
 *
 * FALSIFIABLE: on the commit before the budget, every seam assertion below fails (the header's
 * box spanned the slide), split-compare has no footer, and `no-footer` leaves split-panel's
 * footer visible. Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

const PANEL_BODY = '`Eyebrow`\n\n## A heading that fills the panel with a real line.\n\nA lede long enough to wrap onto a second line of the panel.\n\n- First point\n  - Supporting detail for the first point.\n- Second point\n  - Supporting detail for the second point.';
const COMPARE_BODY = '`Decision`\n\n## Two options, one verdict.\n\nOne sentence of context.\n\n- Option A\n  - A fact\n  - Another fact\n- Option B\n  - A fact\n  - Another fact\n\n> Pick option B.';

// [class, body, which side the chrome starts on]. The side is where the header/footer are
// anchored (left inset), so it is `.panel-left` except under `mirror`, whose row-reverse puts
// the supporting zone on the left.
const SLIDES = [
  ['split-panel', PANEL_BODY, '.panel-left'],
  ['split-panel mirror', PANEL_BODY, '.panel-right'],
  ['split-panel metric', PANEL_BODY.replace('## A heading that fills the panel with a real line.', '## 42'), '.panel-left'],
  ['split-panel metric mirror', PANEL_BODY.replace('## A heading that fills the panel with a real line.', '## 42'), '.panel-right'],
  ['split-panel steps', PANEL_BODY, '.panel-left'],
  ['split-panel pullquote', '> A quotation long enough to take the panel.\n\n`Someone, somewhere`\n\n- First point\n  - Detail.', '.panel-left'],
  ['split-panel watermark', PANEL_BODY, '.panel-left'],
  ['split-panel watermark mirror', PANEL_BODY, '.panel-right'],
  ['split-panel cat-3', PANEL_BODY, '.panel-left'],
  ['split-panel finish finish-strata', PANEL_BODY, '.panel-left'],
  ['split-compare', COMPARE_BODY, '.compare-left'],
  ['split-compare finish finish-strata', COMPARE_BODY, '.compare-left'],
];
const NO_FOOTER = SLIDES.length + 1;
const SILENT = SLIDES.length + 2;

const DECK = `---
marp: true
theme: indaco
header: "Lattice · a running header long enough to reach well past any panel seam"
footer: "Confidential · Laticent · a running footer long enough to run past any panel seam on any variant"
paginate: true
---

${[...SLIDES.map(([cls, body]) => `<!-- _class: ${cls} -->\n\n${body}`),
  `<!-- _class: split-panel no-footer -->\n\n${PANEL_BODY}`,
  `<!-- _class: split-panel silent -->\n\n${PANEL_BODY}`].join('\n\n---\n\n')}
`;

describe('split chrome budget (real render)', () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(DECK, { key: 'split-chrome-budget' });
    browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      try { await document.fonts.ready; } catch { /* Font Loading API absent — proceed */ }
    });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  // Geometry of one slide: the field the chrome starts on, the chrome boxes, and every
  // text-bearing box in either panel. Relative to the section; 0.5px tolerance for AA.
  const measure = (n, fieldSel) => page.evaluate(({ n, fieldSel }) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`);
    if (!sec) return null;
    const S = sec.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - S.left, r: r.right - S.left, t: r.top - S.top, b: r.bottom - S.top }; };
    const field = sec.querySelector(`:scope > ${fieldSel}`);
    const chrome = {};
    for (const tag of ['header', 'footer']) {
      const el = sec.querySelector(`:scope > ${tag}`);
      chrome[tag] = el && getComputedStyle(el).display !== 'none' && el.getClientRects().length ? box(el) : null;
    }
    const text = [...sec.querySelectorAll(':scope > div :is(h2, h3, p, li, blockquote, .panel-eyebrow, .frame-label, cite)')]
      .filter((el) => el.getClientRects().length && el.textContent.trim())
      .map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent.trim().slice(0, 30), ...box(el) }));
    // Every <footer> in the slide, wherever it nests — the suppression tests must not pass
    // vacuously because the footer moved somewhere a direct-child selector cannot see.
    const anyFooterShown = [...sec.querySelectorAll('footer')].some((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0);
    return { cls: sec.className, field: field ? box(field) : null, chrome, text, anyFooterShown };
  }, { n, fieldSel });

  const overlaps = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

  SLIDES.forEach(([cls, , fieldSel], i) => {
    test(`${cls}: header and footer stay inside ${fieldSel} and clear every text box`, async () => {
      const m = await measure(i + 1, fieldSel);
      assert.ok(m?.field, `slide ${i + 1} has no ${fieldSel}`);
      for (const tag of ['header', 'footer']) {
        const c = m.chrome[tag];
        assert.ok(c, `${cls}: the running ${tag} is missing or hidden`);
        assert.ok(c.l >= m.field.l - 0.5 && c.r <= m.field.r + 0.5,
          `${cls}: ${tag} spans x ${c.l.toFixed(1)}–${c.r.toFixed(1)}, outside its field ${m.field.l.toFixed(1)}–${m.field.r.toFixed(1)}`);
        const hit = m.text.find((t) => overlaps(c, t));
        assert.equal(hit, undefined, `${cls}: ${tag} overlaps <${hit?.tag}> "${hit?.text}"`);
      }
    });
  });

  test('no-footer hides a split-panel footer (it is a direct section child)', async () => {
    const m = await measure(NO_FOOTER, '.panel-left');
    assert.equal(m.anyFooterShown, false, 'no footer anywhere in the slide should be visible');
    assert.ok(m.chrome.header, 'the header should stay');
  });

  test('silent hides both', async () => {
    const m = await measure(SILENT, '.panel-left');
    assert.equal(m.chrome.header, null);
    assert.equal(m.anyFooterShown, false);
  });
});

// PORTRAIT. The panels stack, so the footer spans the frame, but it still holds ONE line, and on a
// split page it stops before the k-of-N rail. The rail fills its pills through the current page, so
// it is widest on the run's LAST page; the footer's reserve is that width (`--split-rail-reserve`,
// base.modifiers.css), which the arm reads off the last page's rail. FALSIFIABLE: before the
// reserve, a 60-character footer wrapped to two lines on every page here and, on the run's cover,
// ran on under the rail's lane.
const LONG_FOOTER = 'Confidential · board pre-read · do not forward outside the org';
const points = (n) => Array.from({ length: n }, (_, i) => `- Point ${i + 1}\n  - Detail ${i + 1}.`).join('\n');
const PORTRAIT_DECK = `---
marp: true
size: portrait
theme: indaco
paginate: true
---

${[1, 3, 14].map((n) => `<!-- _class: split-panel pullquote -->\n<!-- _footer: "${LONG_FOOTER}" -->\n\n> A quotation.\n\n\`Someone\`\n\n${points(n)}`).join('\n\n---\n\n')}
`;

describe('portrait split-panel footer budget (real render)', () => {
  let browser;
  let page;
  before(async () => {
    const html = renderHtml(PORTRAIT_DECK, { key: 'split-chrome-budget-portrait' });
    browser = await puppeteer.launch({ executablePath: resolveChrome(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      try { await document.fonts.ready; } catch { /* Font Loading API absent — proceed */ }
    });
  }, { timeout: 630000 });
  after(async () => { if (browser) await browser.close(); });

  const facts = () => page.evaluate(() => [...document.querySelectorAll('section.split-panel')].map((sec) => {
    const S = sec.getBoundingClientRect();
    const box = (el) => {
      if (!el?.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - S.left, r: r.right - S.left, h: r.height };
    };
    const footer = sec.querySelector(':scope > footer');
    return {
      run: sec.getAttribute('data-split-run'),
      footer: box(footer),
      lineHeight: footer ? parseFloat(getComputedStyle(footer).lineHeight) : 0,
      rail: box(sec.querySelector(':scope > .lat-split-rail')),
      counted: !!sec.querySelector(':scope > .lat-split-rail > .seg-count'),
      pagination: box(sec.querySelector(':scope > .lat-pagination')),
    };
  }));

  test('the footer holds one line and clears the page number and the rail at its widest', async () => {
    const pages = await facts();
    const withFooter = pages.filter((p) => p.footer);
    assert.equal(withFooter.length, 3, 'one footer per authored slide (the unsplit slide and each run cover)');
    for (const p of withFooter) {
      assert.ok(p.footer.h < 1.5 * p.lineHeight, `footer wraps: ${p.footer.h.toFixed(1)}px tall at line-height ${p.lineHeight}px`);
      if (p.pagination) assert.ok(p.footer.r <= p.pagination.l + 0.5, `footer ends at ${p.footer.r.toFixed(1)}, past the page number at ${p.pagination.l.toFixed(1)}`);
    }
    const runs = [...new Set(pages.map((p) => p.run).filter(Boolean))];
    assert.equal(runs.length, 2, 'the 3-point and 14-point slides split');
    const forms = new Set();
    for (const run of runs) {
      const members = pages.filter((p) => p.run === run);
      const cover = members.find((p) => p.footer);
      assert.ok(cover, `run ${run} carries its footer on one page`);
      const widest = Math.min(...members.filter((p) => p.rail).map((p) => p.rail.l));
      assert.ok(cover.footer.r <= widest - 0.5, `run ${run}: footer ends at ${cover.footer.r.toFixed(1)}, into the rail's lane from ${widest.toFixed(1)}`);
      forms.add(members.some((p) => p.counted) ? 'count' : 'pills');
    }
    assert.deepEqual([...forms].sort(), ['count', 'pills'], 'both rail forms are exercised');
  });
});
