/**
 * Integration: a figure's coda takes its own page (owner, 2026-11-17: "we always split chart and key insight so the
 * chart has the stage"; 2026-11-22: "we automatically move coda to their own split page"; fit-everywhere-model.md
 * §25). On a page that splits (square, tall, strip), a chart or diagram slide with trailing beats gives them the run's
 * closing page (lib/core/fit-measure.js `measureFit`, lib/core/carousel.js `insightOwnPage`), and a chart is drawn
 * for the whole page from the start (lib/plugins/chart-family/shared/chart-phone.js `formBoxPx` `codaMoves`). The
 * figure is never cut. Cases, on the real CLI export at square:
 *   DIAGRAM  a sequence diagram over a 76-word key insight: the diagram's page, then the insight's, no TYPE FLOOR
 *   CHART    a line chart over the same insight: the same two pages
 *   SHORT    a diagram over a one-line insight: the same two pages too, since the move needs no threshold
 *   OVER     a diagram under a 90-word insight, which squeezed the diagram to 0px and still read as fitting
 *   GROW     each figure draws larger on its own page than the same slide kept whole (`fit-report`)
 *   WIDE     at 16:9, which never splits, the same chart slide stays one slide
 *
 * FALSIFIABLE: without the `insight` fact nothing splits and DIAGRAM prints TYPE FLOOR; drawing the chart for the box
 * under its insight (no `codaMoves`) fails GROW for the chart; any threshold leaves SHORT whole. Needs Chromium
 * (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const LONG = 'The drop starts the month the onboarding call moved from week three to week one, and it holds across every cohort we tracked since, including the enterprise accounts that historically churned at twice the base rate; the pattern survives controlling for seat count, contract length and region, which is why we now treat the first-week call as a retention lever rather than a courtesy, and staff it accordingly every quarter.';
const DECK = `---
marp: true
theme: indaco
paginate: true
size: square
---

<!-- _class: diagram -->

## The glyph's meaning is never voiced.

\`\`\`mermaid
sequenceDiagram
  Client-)Server: fire and forget
  Server--xClient: dropped
  Worker-->>Queue: acknowledgment
\`\`\`

> ${LONG}

---

<!-- _class: line -->

## Churn fell once onboarding moved to week one.

- Jan
  - Churn \`4.1\`
- Feb
  - Churn \`3.9\`
- Mar
  - Churn \`2.6\`
- Apr
  - Churn \`2.2\`

> ${LONG}

---

<!-- _class: diagram -->

## A short note leaves the diagram its room.

\`\`\`mermaid
sequenceDiagram
  Client-)Server: fire and forget
  Server--xClient: dropped
\`\`\`

> Only the label carries the meaning.

---

<!-- _class: diagram -->

## The glyph's meaning is never voiced, at length.

\`\`\`mermaid
sequenceDiagram
  Client-)Server: fire and forget
  Server--xClient: dropped
  Worker-->>Queue: acknowledgment
\`\`\`

> ${LONG} Every quarter since, the call has paid for itself twice over in renewals alone.
`;

let dir;
let log;
let pages;
// Each figure's drawn height, split (its own page) and whole (the same slide under its insight, `fit-report` opting it
// out of the split), read in a browser from each export's HTML.
const scale = { split: {}, whole: {} };
let wideLog;
let widePages;

// A figure's drawn size on slide `n` of an exported HTML: the SVG letterboxes inside its box, so its scale is the
// smaller of its two ratios, times the viewBox height (the drawn height in px).
async function drawnScale(file, n = '1') {
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    return await page.evaluate((slide) => {
      const svg = document.querySelector(`section[data-lattice-slide="${slide}"] .cell-stage svg[viewBox]`);
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return Math.min(r.width / vb.width, r.height / vb.height) * vb.height;
    }, n);
  } finally {
    await browser.close();
  }
}
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-own-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => ({
      slide: (p.openTag.match(/data-lattice-slide="(\d+)/) || [])[1],
      role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1],
      svg: /<svg\b/.test(p.inner),
      html: p.inner,
      text: removeTags(p.inner).replace(/\s+/g, ' '),
    }));
  // The deck again with every slide kept whole.
  const whole = path.join(dir, 'whole.md');
  fs.writeFileSync(whole, DECK.replaceAll('<!-- _class: diagram -->', '<!-- _class: diagram fit-report -->').replaceAll('<!-- _class: line -->', '<!-- _class: line fit-report -->'));
  const w = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), whole, path.join(dir, 'whole.pdf'), '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (w.status !== 0) throw new Error(`export failed: ${w.stderr}`);
  for (const n of ['1', '2']) {
    scale.split[n] = await drawnScale(pdf.replace(/\.pdf$/, '.html'), n);
    scale.whole[n] = await drawnScale(path.join(dir, 'whole.html'), n);
  }
  // At 16:9.
  const wide = path.join(dir, 'wide.md');
  fs.writeFileSync(wide, DECK.replace('size: square', 'size: 16:9'));
  const x = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), wide, path.join(dir, 'wide.pdf'), '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (x.status !== 0) throw new Error(`export failed: ${x.stderr}`);
  wideLog = `${x.stdout}${x.stderr}`;
  const wh = fs.readFileSync(path.join(dir, 'wide.html'), 'utf8');
  widePages = splitSections(wh.slice(wh.indexOf('<section'))).filter((p) => p.type === 'section');
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const runOf = (n) => pages.filter((p) => p.slide === n);

test('nothing clips, and no figure renders below the type floor', () => {
  assert.doesNotMatch(log, /OVERFLOW|CONTENT CLIPPED|TYPE FLOOR —/, log);
});

for (const [name, n, title] of [['DIAGRAM', '1', /never voiced/], ['CHART', '2', /Churn fell/], ['SHORT', '3', /room/], ['OVER', '4', /at length/]]) {
  test(`${name}: the figure takes its page, then the coda closes the run`, () => {
    const run = runOf(n);
    assert.deepEqual(run.map((p) => p.role), [undefined, 'closing']);
    assert.match(run[0].text, title, 'the figure page keeps the slide\'s title');
    assert.ok(run[0].svg, 'the figure is on the first page');
    assert.doesNotMatch(run[0].text, /retention lever|Only the label carries/, 'the coda is not under the figure');
    assert.ok(!run[1].svg, 'the closing page holds no figure');
  });
}

test('the coda appears once, on its closing page', () => {
  const all = pages.map((p) => p.text).join(' ');
  assert.equal(all.split('Only the label carries the meaning').length - 1, 1);
});

for (const [name, n] of [['diagram', '1'], ['chart', '2']]) {
  test(`GROW: the ${name} draws larger on its own page than kept whole under its insight`, () => {
    assert.ok(scale.split[n] > scale.whole[n] * 1.2, `split ${scale.split[n]}, whole ${scale.whole[n]}`);
  });
}

test('WIDE: at 16:9 nothing splits', () => {
  assert.doesNotMatch(wideLog, /OVERFLOW/, wideLog);
  assert.ok(!widePages.some((p) => /data-split-role=/.test(p.openTag)), 'no split page at 16:9');
});
