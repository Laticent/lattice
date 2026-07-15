/**
 * PROTECTED-machinery regression — the `diagram` conformance:strict migration MUST
 * NOT change the overflow-probe verdict
 * (engineering/decisions/2026-07-15-model-driven-frame-render.md §5/§6).
 *
 * `diagram` is the third (and first VIZ) canvas migration (after contact + wifi).
 * Its body — the pre-rendered Mermaid SVG (`.mermaid-svg`), plus an optional
 * leading dek and a trailing Key Insight `<blockquote>` — now hoists into the
 * frame's `.cell-stage` (a bounded flex column: flex:1; min-height:0;
 * overflow:clip). The slide title is UNTOUCHED — diagram emits a section-level
 * `<h2>` that keeps lifting into `masthead-lede` as before.
 *
 * Unlike the fixed-height QR cards (contact/wifi), diagram needs NO `flex:0 0 auto`
 * self-size pin: the Mermaid SVG SELF-SCALES — `mermaid.css` forces
 * `.mermaid-svg svg { height:100% !important }` and the SVG's `preserveAspectRatio`
 * letterboxes it — so it always fits its flex box at any size. A shrinkable diagram
 * box does not LOSE content when the stage squeezes it, it SCALES it, so the stage
 * clip can never silently swallow a diagram (the silent-overflow class the pin
 * guards against for the QR cards simply does not arise here — task hazard #1,
 * "risk is LOW").
 *
 * Overflow on a diagram slide therefore comes from the NON-self-scaling body: a
 * genuinely over-tall Key Insight blockquote that, together with the diagram,
 * exceeds the stage. This gate renders a FITTING diagram (the sample) and an
 * OVER-TALL one (a very long Key Insight) under Form-ON and asserts the REAL
 * probeSectionOverflow verdict: fitting → not over (and wrapped in a stage cell),
 * over-tall → over (the wrap must NOT swallow it). Proven identical to the pre-wrap
 * direct-child render.
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

// A fitting diagram: a small flowchart + a one-line Key Insight (the sample shape).
const FITTING = `<!-- _class: diagram -->

## How a signal moves from input to decision.

\`\`\`mermaid
flowchart LR
  A["Raw signals"] --> B["Classify"]
  B --> C["Score & weight"]
  C --> D["Decision log"]
\`\`\`

> The calibration loop keeps the weights honest.
`;

// An over-tall one: the SAME small (self-scaling) diagram, but a Key Insight that
// runs to many wrapped lines, pushing the stage content well past its bottom edge.
const KEY_INSIGHT = Array.from(
  { length: 40 },
  (_v, i) =>
    `Sentence ${i + 1} of a very long key insight that runs on across many wrapped lines and pushes the stage content well past its bottom edge.`,
).join(' ');

const OVER_TALL = `<!-- _class: diagram -->

## A fitting diagram with an over-tall Key Insight.

\`\`\`mermaid
flowchart LR
  A["Input"] --> B["Process"] --> C["Output"]
\`\`\`

> ${KEY_INSIGHT}
`;

describe('diagram overflow detection is preserved after the conformance:strict wrap', () => {
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
    // Puppeteer serializes probeSectionOverflow (self-contained per overflow-probe.js's
    // injection contract) and runs it in-page against the first <section>. No eval.
    const v = await page.$eval('section', probeSectionOverflow, CLIP_CELL_SELECTOR, 1);
    const hasStage = await page.$eval('section', (s) => !!s.querySelector('.cell-stage'));
    const mermaidInStage = await page.$eval(
      'section',
      (s) => !!s.querySelector('.cell-stage > .mermaid-svg'),
    );
    await page.close();
    return { over: v.over, hasStage, mermaidInStage };
  }

  test('a fitting diagram does NOT overflow (and its body is wrapped in a stage cell)', async () => {
    const v = await probeFirstSection(FITTING, 'diagram-overflow-fitting');
    assert.equal(v.hasStage, true, 'diagram should hoist its body into a .cell-stage under Form (conformance:strict)');
    assert.equal(v.mermaidInStage, true, 'the Mermaid SVG must sit INSIDE the stage cell');
    assert.equal(v.over, false, 'a fitting diagram must not report overflow');
  });

  test('an over-tall Key Insight DOES overflow — the wrap must not swallow it', async () => {
    const v = await probeFirstSection(OVER_TALL, 'diagram-overflow-over-tall');
    assert.equal(v.hasStage, true);
    assert.equal(
      v.over,
      true,
      'REGRESSION: an over-tall diagram body was silently clipped by the stage wrap instead of ' +
        'reporting overflow — the .cell-stage clip is swallowing content the overflow probe should ' +
        'catch (see diagram.styles.css / model-driven frame render §5).',
    );
  });
});
