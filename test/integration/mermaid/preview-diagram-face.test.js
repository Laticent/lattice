/**
 * Integration: the LIVE PREVIEW renders diagram labels in the deck's face too.
 *
 * The export has `tools/check-diagram-labels.js`. The preview had nothing, and that gap
 * hid a regression through an entire adversarial review: this branch deleted the
 * runtime's `finishTheme` port, which fetched `--font-body` with the reader's `raw()`,
 * and routed the token through `MERMAID_VAR_MAP` instead — where the preview's port used
 * `read()`.
 *
 * `read()` is a COLOR resolver. It probes by assigning `color: var(--token)` and reading
 * the computed value back, which is how `light-dark(...)` reaches Mermaid as a flat rgb.
 * Handed a font stack that assignment is invalid, so the probe keeps its INHERITED COLOR
 * and the reader returns `rgb(31, 74, 110)` — measured. Mermaid then had a color as its
 * font family on every preview render.
 *
 * It was invisible because `mermaid.css` sets `font-family` on most label elements
 * regardless. Exactly five labels in a ten-slide deck exposed it: the gantt axis ticks,
 * the one text our CSS does not cover. No unit test could see it either — the palette
 * parity test drives both paths with a FAKE reader, which returns the same string for
 * `read` and `raw` by construction.
 *
 * So this drives the real thing: `engine.render(preview)` + the shipped
 * `dist/lattice-runtime.js` + mermaid, assembled the way
 * `docs/src/playground/deck-preview.js` assembles the preview frame, in a real Chromium.
 * Anything rendering in a face the deck did not ask for fails.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null;
const TIMEOUT = 120000;

/** Mermaid's own defaults, plus the generic families a dropped stack falls back to. */
const NOT_A_DECK_FACE = /^(?:Open Sans|trebuchet ms|verdana|arial|Times New Roman|sans-serif|serif|monospace)$/i;

async function previewFaces(deckFile, theme) {
  const puppeteer = require('puppeteer');
  const engine = require('../../../lib/engine');
  const { composeCss } = require('../../../lib/engine/css.js');
  const { fontFaceCss } = require('../../../lib/fonts/face-css.js');

  const out = engine.render(fs.readFileSync(deckFile, 'utf8'), theme, { preview: true });
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  const doc = '<!doctype html><html><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style></head><body>'
    + `<article class="lattice">${out.html}</article>`
    + '</body></html>';

  const browser = await puppeteer.launch({
    executablePath: CHROME || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: 'networkidle0' });
    // The bundles go in as SCRIPT TAGS, the way the real preview frame loads them —
    // inlining mermaid's ~3 MB IIFE into `setContent` made a document large enough to
    // kill the tab ("Target closed") before the first evaluate.
    await page.addScriptTag({ path: path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'dist', 'lattice-runtime.js') });
    await page.evaluate(() => document.fonts.ready);
    // The runtime renders diagrams asynchronously, off its own queue.
    await page.waitForFunction(
      () => [...document.querySelectorAll('section svg')].some((s) => s.querySelector('text, foreignObject')),
      { timeout: 30000 },
    ).catch(() => {});
    await new Promise((r) => { setTimeout(r, 2500); });
    // `return await`, not `return` — the `finally` below closes the browser, and an
    // un-awaited promise settles after it ("Target closed").
    return await page.evaluate(() => {
      const faces = {};
      let diagrams = 0;
      document.querySelectorAll('section svg').forEach((svg) => {
        if (!svg.querySelector('text, foreignObject')) return;
        diagrams++;
        svg.querySelectorAll('text, tspan, .nodeLabel, .edgeLabel, foreignObject span, foreignObject p')
          .forEach((el) => {
            if (!(el.textContent || '').trim()) return;
            const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
            faces[f] = (faces[f] || 0) + 1;
          });
      });
      return { diagrams, faces };
    });
  } finally {
    await browser.close();
  }
}

describe('preview diagram face', { skip: CHROME ? false : 'no CHROME_PATH' }, () => {
  test('a sketch deck previews every diagram label in the hand face', { timeout: TIMEOUT }, async () => {
    const { diagrams, faces } = await previewFaces(
      path.join(ROOT, 'examples', 'mermaid-sketch-labels.md'), 'indaco');
    assert.ok(diagrams >= 6, `expected the deck's diagrams to render; got ${diagrams}`);

    const foreign = Object.entries(faces).filter(([f]) => NOT_A_DECK_FACE.test(f));
    assert.deepEqual(foreign, [],
      'the live preview rendered diagram text in a face the deck never asked for. The likely '
      + 'cause is a non-color token fetched through the reader\'s color-resolving `read()` — '
      + 'see TEXT_VALUE_TOKENS in lib/runtime/index.js. Faces seen: '
      + JSON.stringify(faces));

    assert.ok(faces['Shantell Sans'] > 0, 'the sketch deck must preview in the hand face');
  });

  test('the check is not vacuous — it can see a foreign face', () => {
    // The pattern is the whole test; assert it matches what it is meant to catch, so a
    // regex edit that quietly stops matching cannot make this suite green by accident.
    for (const face of ['Open Sans', 'trebuchet ms', 'sans-serif', 'Times New Roman']) {
      assert.ok(NOT_A_DECK_FACE.test(face), `${face} must count as a foreign face`);
    }
    for (const face of ['Shantell Sans', 'Outfit', 'JetBrains Mono', 'Caveat']) {
      assert.equal(NOT_A_DECK_FACE.test(face), false, `${face} is a deck face`);
    }
  });
});
