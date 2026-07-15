/**
 * PROTECTED-machinery regression — the `.viz-frame` merge (charts adopt the
 * cell-masthead/cell-stage/cell-footer structure) MUST NOT let the `.cell-stage`
 * clip silently swallow chart overflow
 * (engineering/decisions/2026-07-15-viz-frame-merge.md §5;
 * 2026-07-15-model-driven-frame-render.md §5).
 *
 * Charts now wrap their figure + caption into the frame's `.cell-stage` (a bounded
 * flex column: flex:1; min-height:0; overflow:clip) and hoist eyebrow + h2 +
 * subtitle into the masthead band. Two overflow classes matter, split by the §6
 * self-scaling test:
 *
 *   · An SVG chart (piechart/radar/map/quadrant/funnel/word-cloud) self-scales —
 *     its `<svg>` is sized to its box and letterboxes via preserveAspectRatio — so
 *     the stage clip SCALES it, never loses content. A fitting SVG chart → not over.
 *
 *   · A LIST/TABLE chart (progress/gantt/kanban/timeline-list/…) has content-height
 *     rows: too many rows genuinely exceed the stage. That overflow MUST be caught by
 *     probeSectionOverflow via the clip cell, NOT silently clipped. This is the exact
 *     silent-overflow class the QR-card `flex:0 0 auto` pin guards against — so this
 *     gate proves an overstuffed list chart still reports `over: true`.
 *
 * Needs Chromium + the emulator (renders the deck, probes the laid-out DOM).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');
const { CLIP_CELL_SELECTOR, probeSectionOverflow } = require('../../../lib/core/overflow-probe');

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

function formDeck(sample) {
  return `---\nmarp: true\ntheme: indaco\n---\n\n${sample.trim()}\n`;
}

// A fitting SVG chart (self-scaling): a small pie with four slices.
const FITTING_SVG = `<!-- _class: piechart donut -->

\`Revenue\`

## Revenue mix by segment.

- Enterprise \`52\`
- Mid-market \`31\`
- SMB \`17\`
`;

// A fitting list chart: three progress bars.
const FITTING_LIST = `<!-- _class: progress -->

## Delivery progress by workstream.

- Platform migration \`82%\` \`on-track\`
- Data pipeline \`64%\` \`at-risk\`
- Mobile app \`45%\` \`blocked\`
`;

// An overstuffed list chart: far too many progress rows to fit the stage — the
// content-height rows must spill the stage clip and be CAUGHT, not swallowed.
const OVER_ROWS = Array.from(
  { length: 40 },
  (_v, i) => `- Workstream ${i + 1} with a fairly long descriptive label \`${(i * 7) % 100}%\` \`on-track\``,
).join('\n');
const OVER_TALL_LIST = `<!-- _class: progress -->

## An overstuffed progress chart with far too many rows.

${OVER_ROWS}
`;

describe('chart overflow detection is preserved after the .viz-frame stage wrap', () => {
  const chrome = resolveChrome();
  let browser;

  if (!chrome) {
    test('SKIPPED — no Chromium available', { skip: true }, () => {});
    return;
  }
  process.env.CHROME_PATH = chrome;

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function probeFirstSection(sample, key) {
    const html = renderHtml(formDeck(sample), { key, timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const v = await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1);
    const hasStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage'));
    const bodyInStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage > .chart-body'));
    const titleHoisted = await page.$eval('section', (s) => !!s.querySelector('.cell-masthead .masthead-lede > h2'));
    await page.close();
    return { over: v.over, hasStage, bodyInStage, titleHoisted };
  }

  test('a fitting SVG chart does NOT overflow (body in stage, title hoisted)', async () => {
    const v = await probeFirstSection(FITTING_SVG, 'chart-overflow-fitting-svg');
    assert.equal(v.hasStage, true, 'a chart hoists its figure into a .cell-stage (.viz-frame)');
    assert.equal(v.bodyInStage, true, 'the chart-body must sit INSIDE the stage cell');
    assert.equal(v.titleHoisted, true, 'the chart title hoists into the masthead band');
    assert.equal(v.over, false, 'a fitting SVG chart must not report overflow');
  });

  test('a fitting list chart does NOT overflow', async () => {
    const v = await probeFirstSection(FITTING_LIST, 'chart-overflow-fitting-list');
    assert.equal(v.hasStage, true);
    assert.equal(v.over, false, 'a fitting progress chart must not report overflow');
  });

  test('an overstuffed list chart DOES overflow — the stage wrap must not swallow it', async () => {
    const v = await probeFirstSection(OVER_TALL_LIST, 'chart-overflow-over-rows');
    assert.equal(v.hasStage, true);
    assert.equal(
      v.over,
      true,
      'REGRESSION: an overstuffed list chart was silently clipped by the stage wrap instead of ' +
        'reporting overflow — the .cell-stage clip is swallowing rows the overflow probe should catch ' +
        '(the list chart may need a flex:0 0 auto self-size pin like the QR cards; see viz-frame §5).',
    );
  });
});
