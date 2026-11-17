/**
 * Integration: a figure keeps the stage (owner, 2026-11-17: "we always split chart and key insight so the chart has the
 * stage"; fit-everywhere-model.md §25). A chart or diagram scales to its box rather than overflow, so a long key insight
 * under it never clips: it shrinks the figure until the figure's labels fall below the legibility floor, and the export
 * could only warn (TYPE FLOOR). The measured split now reads two things (lib/core/fit-measure.js `measureFit`): the
 * floor, by the export's own `probeFigureLegibility`, and the stage, where beats taller than half the figure's cell have
 * taken the slide even with legible labels; and only when the figure would draw at least a fifth larger without them. Either gives the insight a page of its own (lib/core/carousel.js `insightOwnPage`,
 * lib/core/auto-split.js `{ insightOwn }`): the figure whole on its page, the beats on the run's closing page. The figure
 * is never cut. Cases, on the real CLI export at square:
 *   DIAGRAM  a sequence diagram over a 76-word key insight: the diagram's page and then the insight's, no TYPE FLOOR
 *   CHART    a line chart over the same insight keeps it, for now: its phone drawing is laid out at markdown time for
 *            the box under the insight, and no split redraws it, so a page of its own would hold the same-size chart
 *            (final checker, 2026-11-17). It moves once a split can redraw a chart (decision card)
 *   SHORT    a diagram over a one-line insight that leaves its labels legible stays one slide
 *   OVER     a diagram under a 90-word insight, which squeezed the diagram to 0px and still read as fitting: the insight moves
 *
 * Every split also checks the figure GREW on its own page: a split that leaves the drawing its crowded size is two
 * thinner pages, not a remedy.
 *
 * FALSIFIABLE: without the `insight` fact the export prints TYPE FLOOR for DIAGRAM and nothing splits; measuring a chart
 * by its box splits CHART at its crowded size; requiring a visible figure leaves OVER whole, its diagram gone. Needs
 * Chromium (CHROME_PATH).
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
// The sequence diagram's drawn scale, split (its own page) and whole (the same slide under its insight, `fit-report`
// opting it out of the split), read in a browser from each export's HTML.
const scale = {};

// The diagram's drawn scale on slide 1 of an exported HTML: the SVG letterboxes inside its box, so the scale is the
// smaller of its two ratios.
async function drawnScale(file) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    return await page.evaluate(() => {
      const svg = document.querySelector('section[data-lattice-slide="1"] .cell-stage svg[viewBox]');
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return Math.min(r.width / vb.width, r.height / vb.height);
    });
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
  // The first slide alone, kept whole.
  const whole = path.join(dir, 'whole.md');
  fs.writeFileSync(whole, DECK.split('\n---\n').slice(0, 2).join('\n---\n').replace('<!-- _class: diagram -->', '<!-- _class: diagram fit-report -->'));
  const w = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), whole, path.join(dir, 'whole.pdf'), '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (w.status !== 0) throw new Error(`export failed: ${w.stderr}`);
  scale.split = await drawnScale(pdf.replace(/\.pdf$/, '.html'));
  scale.whole = await drawnScale(path.join(dir, 'whole.html'));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const runOf = (n) => pages.filter((p) => p.slide === n);

test('nothing clips, and no figure renders below the type floor', () => {
  assert.doesNotMatch(log, /OVERFLOW|CONTENT CLIPPED|TYPE FLOOR —/, log);
});

for (const [name, n] of [['DIAGRAM', '1'], ['OVER', '4']]) {
  test(`${name}: the figure takes its page, then the insight closes the run`, () => {
    const run = runOf(n);
    assert.deepEqual(run.map((p) => p.role), [undefined, 'closing']);
    assert.match(run[0].text, /never voiced/, 'the figure page keeps the slide\'s title');
    assert.ok(run[0].svg, 'the figure is on the first page');
    assert.doesNotMatch(run[0].text, /retention lever/, 'the insight is not under the figure');
    assert.ok(!run[1].svg, 'the closing page holds no figure');
    assert.ok(run.map((p) => p.text).join(' ').includes('retention lever'), 'the insight is kept');
  });
}

test('DIAGRAM: the diagram draws larger on its own page than under its insight', () => {
  assert.ok(scale.split > scale.whole * 1.2, `split ${scale.split}, whole ${scale.whole}`);
});

test('CHART: a chart keeps its insight until a split can redraw it', () => {
  const run = runOf('2');
  assert.equal(run.length, 1);
  assert.match(run[0].text, /retention lever/);
});

test('SHORT: a figure whose labels stay legible keeps its insight on the slide', () => {
  const run = runOf('3');
  assert.equal(run.length, 1);
  assert.match(run[0].text, /Only the label carries the meaning/);
});
