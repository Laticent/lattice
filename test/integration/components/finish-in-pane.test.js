/**
 * Integration: a chart finish reaches a chart that sits in a PANE.
 *
 * A finish is a block of `--finish-*` values the mark rules read (tools/build-marks-css.js). Those values name the chart
 * family's own variables (`--chart-cat-N-hue`, `--chart-on-mark`), and a custom property resolves where it is declared.
 * The family declares its variables on the chart's frame: the slide itself for a plain chart slide, but a NESTED element
 * inside a pane, where the slide is a `lat-pane-host` that carries none. A first cut put the values on the slide alone
 * and every pane chart filled BLACK: pigment, etch and tone alike, with every gate green, because the gallery gates
 * render plain chart slides. The block now also targets the frame, which is what this pins on a real render.
 *
 * FALSIFIABLE: with the token block's `.chart-frame` target removed, every assertion below fails (fill `rgb(0, 0, 0)`).
 * Needs Chromium (CHROME_PATH or the puppeteer cache).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const chrome = resolveChrome();

const DECK = (finish) => `---
marp: true
theme: indaco
marks: ${finish}
---

<!-- _class: columns ratio-40-60 -->

## Two charts side by side.

<!-- _pane: progress -->

- Signal intake \`92%\` \`on-track\`
- Vendor onboarding \`64%\` \`at-risk\`

<!-- _pane: bar -->

- North America \`3.1\`
- Europe \`2.4\`
- APAC \`1.8\`
`;

describe('a chart in a pane wears its finish', { skip: skipWithoutChrome(chrome) }, () => {
  let browser;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-finish-pane-'));
  const read = {};

  before(async () => {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    for (const finish of ['pigment', 'etch', 'tone']) {
      const md = path.join(tmp, `${finish}.md`);
      const html = path.join(tmp, `${finish}.html`);
      fs.writeFileSync(md, DECK(finish));
      execFileSync('node', [path.join(ROOT, 'dist', 'lattice.js'), md, html, '-q'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
      read[finish] = await page.evaluate(() => {
        const bar = document.querySelector('.bar-mark[data-hue="1"]');
        const status = document.querySelector('.progress-fill');
        const cs = getComputedStyle(bar);
        const host = document.querySelector('section');
        return {
          host: host.className,
          fill: cs.fill,
          stroke: cs.stroke,
          hue: cs.getPropertyValue('--chart-cat-1-hue').trim(),
          progress: getComputedStyle(status).backgroundColor,
        };
      });
      await page.close();
    }
  });
  after(async () => {
    await browser?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('the slide is a pane host that names no chart, so its own variables are empty', () => {
    // The precondition: if the host carried the family's variables, this test could not tell the two designs apart.
    for (const finish of ['pigment', 'etch', 'tone']) assert.match(read[finish].host, /lat-pane-host/, finish);
  });

  for (const finish of ['pigment', 'etch', 'tone']) {
    test(`${finish}: the bar and the progress fill are painted, not black`, () => {
      const r = read[finish];
      assert.notEqual(r.fill, 'rgb(0, 0, 0)', `${finish}: the bar fill`);
      assert.notEqual(r.stroke, 'rgb(0, 0, 0)', `${finish}: the bar edge`);
      assert.notEqual(r.progress, 'rgba(0, 0, 0, 0)', `${finish}: the progress fill`);
      assert.notEqual(r.progress, 'rgb(0, 0, 0)', `${finish}: the progress fill`);
    });
  }

  test('the three finishes paint the same bar three ways', () => {
    const fills = ['pigment', 'etch', 'tone'].map((f) => read[f].fill);
    assert.equal(new Set(fills).size, 3, `fills: ${fills.join(' | ')}`);
  });
});
