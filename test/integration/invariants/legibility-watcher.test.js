/**
 * THE TYPE-FLOOR WATCHER on the real live surface (§8 rule 8), in real Chromium against the
 * SHIPPED `dist/lattice-runtime.js` — the same bundle the VS Code preview and the docs Playground
 * load, not a stand-in (HARD RULE #23).
 *
 * Two things need pinning here and neither is reachable from a unit test, because the watcher is
 * a browser IIFE over live layout:
 *
 *   1. that it runs AT ALL. Rule 8 shipped in the export watcher only; `lib/runtime/index.js`
 *      never called the probe, so `dist/lattice.css` carried a ring and a tab that no live surface
 *      could trigger while the decision doc claimed the preview had one. Deleting the call today
 *      is invisible to every unit test — the pure helpers in fluid-view-policy.test.js pin the
 *      LABEL and the add/update/remove decision, not the wiring.
 *
 *   2. that it stays OFF for a READER. The floor is a fraction of the slide box, and in the fluid
 *      viewer that box is the reader's phone — so ungated it fired on 7 of 11 slides of a shipped
 *      gallery at 390×844, printing an amber "Type 3px · floor 8.4px" over the deck header. All
 *      three lenses of the HARD RULE #25 trio caught it independently. A reader cannot resize a
 *      figure; the signal has no reader action, so unlike the overflow tab (which becomes a calm
 *      "More below") it simply must not appear.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer');
const { spawnSync } = require('child_process');
const { ROOT } = require('../../helpers/render');

/** Best-effort Chromium path — mirrors split-envelope-css.test.js. */
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

// A minimal page carrying the real bundles: one slide whose figure renders text far below the
// floor, and one comfortably above it. Loading the runtime on a plain page IS the author-preview
// path (the watcher defaults to `authorTags: true`); the reader path is exercised below by a real
// `--fluid` export, which is the only honest way to reach it.
function harness() {
  const css = path.join(ROOT, 'dist', 'lattice.css');
  const js = path.join(ROOT, 'dist', 'lattice-runtime.js');
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${css}">
<style>section{width:960px;height:540px;position:relative;display:block}</style>
</head><body>
<section data-lattice-slide="1" class="chart form" data-theme="indaco">
  <h2>A dense figure</h2>
  <svg viewBox="0 0 900 60" width="900" height="60"><text x="0" y="40" font-size="4">tiny label</text></svg>
</section>
<section data-lattice-slide="2" class="chart form" data-theme="indaco">
  <h2>A legible figure</h2>
  <svg viewBox="0 0 900 60" width="900" height="60"><text x="0" y="40" font-size="40">big label</text></svg>
</section>
<script src="file://${js}"></script>
</body></html>`;
}

describe('type-floor watcher — the live runtime, on the real bundle', () => {
  let browser;
  let dir;

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      args: ['--no-sandbox', '--allow-file-access-from-files'],
    });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-legwatch-'));
  });
  after(async () => { if (browser) await browser.close(); });

  const read = async (file) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto('file://' + file, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 2500));
    const out = await page.evaluate(() => [...document.querySelectorAll('section')].map((s) => ({
      illegible: s.classList.contains('illegible'),
      tab: s.querySelector(':scope > .illegible-tab')?.textContent || null,
    })));
    await page.close();
    return out;
  };

  test('an author preview RINGS the figure below the floor, and only that one', { timeout: 120000 }, async () => {
    const file = path.join(dir, 'author.html');
    fs.writeFileSync(file, harness());
    const [dense, legible] = await read(file);
    assert.equal(dense.illegible, true, 'the 4px figure must ring — this is the whole rule');
    assert.match(dense.tab || '', /^Type [\d.]+px · floor [\d.]+px$/, 'and name the numbers, not just colour');
    assert.equal(legible.illegible, false, 'a legible figure must stay clean (no blanket ring)');
    assert.equal(legible.tab, null);
  });

  test('a READER of a --fluid export never sees it, at any viewport', { timeout: 300000 }, async () => {
    // The real reader surface: `--fluid` runs the watcher with `authorTags: false`. Ungated, this
    // deck rang on 7 of 11 slides at phone size, because the floor is 1% of the SLIDE box and in
    // the fluid viewer that box is the reader's screen. Driven at three widths, since the whole
    // failure was viewport-dependent and a desktop-only check missed it entirely.
    const deck = path.join(ROOT, 'lib', 'components', 'chart', 'state-chart', 'state-chart.gallery.md');
    const out = path.join(dir, 'fluid.pdf');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), deck, out, '--fluid'], {
      cwd: ROOT, encoding: 'utf8', timeout: 240000,
    });
    assert.equal(res.status, 0, `--fluid export failed:\n${res.stderr}`);
    const html = out.replace(/\.pdf$/, '.html');
    // The export itself must still REPORT the floor on stderr — the author channel is untouched;
    // only the reader's ring is gated. Otherwise this test would pass by breaking the rule.
    assert.match(res.stderr, /TYPE FLOOR/, 'the author still gets the stderr report');

    for (const [w, h] of [[390, 844], [820, 1180], [1440, 900]]) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      await page.goto('file://' + html, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 2500));
      const n = await page.evaluate(() => ({
        rings: document.querySelectorAll('section.illegible').length,
        tabs: document.querySelectorAll('.illegible-tab').length,
        // The fluid viewer's LOAD-BEARING geometry: each slide sizes itself
        // `width: min(100%, 100dvh * --fill-max-aspect)`, and that percentage resolves
        // against the slide's PARENT. Anything interposed between <body> and the
        // sections changes the containing block and collapses every slide to ZERO
        // width — a blank page for the recipient.
        slideW: [...document.querySelectorAll('section[data-lattice-slide]')]
          .slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().width)),
      }));
      await page.close();
      assert.equal(n.rings, 0, `a reader at ${w}x${h} must see no type-floor ring (saw ${n.rings})`);
      assert.equal(n.tabs, 0, `…and no type-floor tab at ${w}x${h} (saw ${n.tabs})`);
      // Regression guard: the export shell's <main id="deck"> landmark shipped and made
      // every fluid slide 0px wide — a 100%-broken shipped feature that `npm test`, the
      // integration tier and CI were all green through, because nothing measured the
      // fluid viewer's geometry. It does now.
      assert.ok(
        n.slideW.length > 0 && n.slideW.every((x) => x > 0),
        `fluid slides must have non-zero width at ${w}x${h} — got [${n.slideW}]. ` +
        'Something between <body> and the slides changed their containing block.',
      );
    }
  });
});
