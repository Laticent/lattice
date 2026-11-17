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
 *   CHART    a line chart over the same insight, its labels still legible (15.7pt) but the chart at 322px of the 737px it
 *            fills alone: the same two pages
 *   SHORT    a diagram over a one-line insight that leaves its labels legible stays one slide
 *
 * FALSIFIABLE: without the `insight` fact the export prints TYPE FLOOR for DIAGRAM and neither slide splits; without
 * the stage rule CHART stays one slide. Needs Chromium (CHROME_PATH).
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
`;

let dir;
let log;
let pages;
before(() => {
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
      text: removeTags(p.inner).replace(/\s+/g, ' '),
    }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const runOf = (n) => pages.filter((p) => p.slide === n);

test('nothing clips, and no figure renders below the type floor', () => {
  assert.doesNotMatch(log, /OVERFLOW|CONTENT CLIPPED|TYPE FLOOR —/, log);
});

for (const [name, n] of [['DIAGRAM', '1'], ['CHART', '2']]) {
  test(`${name}: the figure takes its page, then the insight closes the run`, () => {
    const run = runOf(n);
    assert.deepEqual(run.map((p) => p.role), [undefined, 'closing']);
    assert.match(run[0].text, n === '1' ? /never voiced/ : /Churn fell/, 'the figure page keeps the slide\'s title');
    assert.ok(run[0].svg, 'the figure is on the first page');
    assert.doesNotMatch(run[0].text, /retention lever/, 'the insight is not under the figure');
    assert.ok(!run[1].svg, 'the closing page holds no figure');
    assert.equal(run.map((p) => p.text).join(' ').split('retention lever').length - 1, 1, 'the insight appears once');
  });
}

test('SHORT: a figure whose labels stay legible keeps its insight on the slide', () => {
  const run = runOf('3');
  assert.equal(run.length, 1);
  assert.match(run[0].text, /Only the label carries the meaning/);
});
