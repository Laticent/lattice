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
 *   · A LIST/TABLE chart (progress/gantt/kanban/timeline-list/roadmap) has content-height
 *     rows: too many rows genuinely exceed the stage. That overflow MUST be caught by
 *     probeSectionOverflow via the clip cell, NOT silently clipped. This is the exact
 *     silent-overflow class the QR-card `flex:0 0 auto` pin guards against — so this
 *     gate proves an overstuffed list chart still reports `over: true`.
 *
 *   · state-chart is a SELF-SCALING chart in the pie/SVG class (2026-07-16-state-chart-self-scale.md):
 *     its figure is a flex viewport and an inner `.state-chart-scale` box letterbox-fits the
 *     content — nodes + edges together — so it ALWAYS fits, squeezing down when the machine is
 *     tall and filling up when there's room. It NEVER overflows: an overstuffed machine just gets
 *     cramped (the author's stress test), not flagged. Both a fitting and an overstuffed machine
 *     are gated as `over:false` below.
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
const {
  CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, probeSectionOverflow,
  probeFigureLegibility, FIGURE_TEXT_FLOOR_RATIO,
} = require('../../../lib/core/overflow-probe');

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

// state-chart is a SELF-SCALING chart (pie/SVG class): its inner `.state-chart-scale`
// box letterbox-fits into the flex-viewport figure, so it ALWAYS fits and never overflows
// (2026-07-16-state-chart-self-scale.md).
// A fitting state-chart: four states WITH a caption — the exact shape that regressed after
// .viz-frame (the then-pinned node column couldn't shrink into the caption-compressed stage
// and clipped the caption). It must self-scale to fit and NOT report overflow.
const FITTING_STATE = `<!-- _class: state-chart -->

\`Lifecycle\`

## How a document moves to archive.

1. Draft
   - \`submit => 2\`
2. Submitted
   - \`review => 3\`
3. Approved
   - \`archive => 4\`
4. Archived

_Source: workflow engine_
`;

// A DENSE machine: 14 ascending-numbered states with long labels + a full-span
// back-edge. This is the "overstuffed author stress test" AND a regression guard
// for the two-digit-marker split: states 10–14 use `10.`–`14.` markers whose
// wider content column ejects the 3-space nested transitions, so markdown-it
// splits the list — extractStateList must reassemble it (all 14 states rendered,
// not lost as siblings) and the self-scale must still fit it without overflow.
// See 2026-07-16-state-chart-self-scale.md §Follow-ups (the "ceiling" is retired).
const OVER_STATES = Array.from(
  { length: 14 },
  (_v, i) => `${i + 1}. State ${i + 1} with a reasonably long descriptive name\n   - \`=> ${i < 13 ? i + 2 : 1}\``,
).join('\n');
const OVER_TALL_STATE = `<!-- _class: state-chart -->

## A dense ten-state machine with long labels.

${OVER_STATES}
`;

// The INLINE variant of the same self-scaling chart. It renders chips instead of an
// SVG overlay, and for the life of the component that meant it carried no
// `data-sc-transitions` — so draw() never visited it and it was the ONE presentation
// with no fit at all. Its rows sat in flow at natural height inside a figure that
// flex-fills a fixed stage, and `.chart-body`'s clip sheared the tail: on
// examples/state-chart.md p6, 434px of rows in a 358px figure lost the sixth state's
// label entirely (#1360). Seven states here, comfortably past what the stage holds.
//
// This case is gated on HIDDEN PIXELS and RENDERED ROWS rather than on `over`,
// because the loss never grew the section: `probeSectionOverflow` reported
// `over: false` throughout and the channel that caught it was CONTENT CLIPPED. An
// `over`-only assertion passes against the broken build.
const OVER_INLINE_STATES = Array.from(
  { length: 7 },
  (_v, i) => `${i + 1}. Inline state ${i + 1} with a reasonably long name\n   - \`advance => ${i < 6 ? i + 2 : 1}\``,
).join('\n');
const OVER_TALL_INLINE = `<!-- _class: state-chart inline -->

## A seven-state inline machine.

${OVER_INLINE_STATES}
`;

// Dense enough that the letterbox has to shrink hard. The point is NOT that it clips —
// after the inline fit it never clips — but that a shrink this deep is REPORTED. Before
// the `data-fit-k` arm existed, `probeFigureLegibility` selected `svg[viewBox]` only, the
// inline variant emits no SVG, and the probe returned null: "nothing to judge", which
// reads downstream as "legible". Measured on this shape: k = 0.23, effective type 1.8px
// against a 7.2px floor, and not one channel said a word.
const DENSE_INLINE_STATES = Array.from(
  { length: 24 },
  (_v, i) => `${i + 1}. State ${i + 1} with a reasonably long descriptive name\n   - \`advance => ${i < 23 ? i + 2 : 1}\``,
).join('\n');
const ILLEGIBLE_INLINE = `<!-- _class: state-chart inline -->

## A 24-state inline machine.

${DENSE_INLINE_STATES}
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
    const v = await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1, IGNORED_CLIP_SELECTOR);
    const hasStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage'));
    const bodyInStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage > .chart-body'));
    const titleHoisted = await page.$eval('section', (s) => !!s.querySelector('.cell-masthead .masthead-lede > h2'));
    const stateNodes = await page.$eval('section', (s) => s.querySelectorAll('.state-node').length);
    const stateRows = await page.$eval('section', (s) => s.querySelectorAll('.state-node-row').length);
    // What `over` structurally cannot answer: does any box CLIP its own content? A
    // sheared inline row grows no section and no cell — it just disappears inside
    // `.chart-body`'s `overflow: hidden` (#1360).
    const bodyHidden = await page.$eval('section', (s) => {
      const b = s.querySelector('.chart-body');
      return b ? b.scrollHeight - b.clientHeight : null;
    });
    await page.close();
    return { over: v.over, hasStage, bodyInStage, titleHoisted, stateNodes, stateRows, bodyHidden };
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

  test('a fitting captioned state-chart does NOT overflow — it self-scales, caption kept', async () => {
    const v = await probeFirstSection(FITTING_STATE, 'chart-overflow-fitting-state');
    assert.equal(v.hasStage, true);
    assert.equal(
      v.over,
      false,
      'REGRESSION: a normal 4-state captioned state-chart reported overflow — the self-scale letterbox ' +
        'is not fitting it into the caption-compressed stage, so the caption is clipped off the slide ' +
        '(2026-07-16-state-chart-self-scale.md).',
    );
  });

  test('an overstuffed state-chart does NOT overflow — it self-scales to fit (cramped, not clipped)', async () => {
    const v = await probeFirstSection(OVER_TALL_STATE, 'chart-overflow-over-states');
    assert.equal(v.hasStage, true);
    // Reassembly guard (real pipeline): the 14-state machine uses two-digit markers
    // that split the markdown list; extractStateList must recover every state, so
    // all 14 nodes render — none lost as leaked siblings.
    assert.equal(
      v.stateNodes,
      14,
      'REGRESSION: states past 9 were lost to the two-digit-marker list split — extractStateList ' +
        'must reassemble the leaked <ol start>/orphan <ul> fragments (state-chart.transform.js §extractStateList).',
    );
    assert.equal(
      v.over,
      false,
      'REGRESSION: an overstuffed state-chart reported overflow — state-chart is a SELF-SCALING chart (pie/SVG ' +
        'class), so it always squeezes to fit, never overflows. Overstuffing just makes it cramped (the author ' +
        "stress test); the engine does not flag it. If this trips, the letterbox scale isn't fitting a dense " +
        'machine (2026-07-16-state-chart-self-scale.md).',
    );
  });

  test('an overstuffed INLINE state-chart loses no rows — the one variant the fit used to skip', async () => {
    const v = await probeFirstSection(OVER_TALL_INLINE, 'chart-overflow-over-inline');
    assert.equal(v.hasStage, true);
    assert.equal(
      v.stateRows,
      7,
      'the fixture must actually render seven inline rows — otherwise the clip assertion below proves nothing',
    );
    assert.equal(
      v.bodyHidden,
      0,
      `REGRESSION: .chart-body is hiding ${v.bodyHidden}px of an inline state-chart. The inline variant renders ` +
        'chips rather than an SVG overlay, so it carries no `data-sc-transitions` and draw() does not visit it — ' +
        'it is fitted by the separate fitOnly() pass, which keys on the `.state-chart-scale` box instead. If this ' +
        'trips, either renderInline stopped emitting that box or drawAll() stopped running the fit-only pass, and ' +
        'the rows are being sheared away inside a box that clips (#1360).',
    );
    assert.equal(
      v.over,
      false,
      'an inline state-chart must not report frame overflow either — it is the same self-scaling chart',
    );
  });

  test('a letterboxed inline chart that shrinks past the type floor IS reported', async () => {
    // The other half of the inline fit, and the more important one. Making the variant
    // fit removed a loud failure (a sheared row, reported on CONTENT CLIPPED and counted
    // by the ratchet); if nothing watched the shrink, that would be a trade DOWN — an
    // unreported illegible slide for a reported broken one. This asserts the channel.
    const html = renderHtml(formDeck(ILLEGIBLE_INLINE), { key: 'chart-legibility-inline', timeout: 240000 });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 1200));
    const v = await page.$eval('section', probeFigureLegibility, FIGURE_TEXT_FLOOR_RATIO);
    const stamped = await page.$eval('section', (s) => {
      const box = s.querySelector('[data-fit-k]');
      return { k: box ? Number(box.getAttribute('data-fit-k')) : null, svgViewBoxes: s.querySelectorAll('svg[viewBox]').length };
    });
    await page.close();

    assert.equal(stamped.svgViewBoxes, 0, 'the fixture must be the SVG-less variant, or this proves nothing');
    assert.ok(stamped.k > 0 && stamped.k < 0.5, `the fit must actually shrink hard here — got k=${stamped.k}`);
    assert.ok(
      v && v.under === true,
      `REGRESSION: a letterboxed inline chart at k=${stamped.k} rendered below the legibility floor and the `
      + `probe did not report it (got ${JSON.stringify(v)}). probeFigureLegibility selects svg[viewBox]; this `
      + 'variant has none, so it is judged through the `data-fit-k` arm — which needs applyFit() to keep '
      + 'stamping the attribute. Without it the probe returns null, which reads downstream as "legible".',
    );
    assert.ok(v.minPx < v.floorPx, `reported minPx ${v.minPx} must be under the floor ${v.floorPx}`);
  });
});
