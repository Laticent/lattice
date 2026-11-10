/**
 * Integration: the VS Code-shaped stylesheet (dist/lattice-vscode-min.css, tools/build-marp-vscode-css.js) styles a Marp for VS
 * Code preview EXACTLY as registering the full theme did, slide for slide, pixel for pixel.
 *
 * WHY IT EXISTS. The kit stopped registering the 1.1 MB theme with Marp for VS Code, which re-processed it on every keystroke
 * (typing went from ~1.1 s to ~0.3 s per keystroke, measured in a real VS Code: engineering/gotchas/vscode.md). The preview now
 * registers directive-only stubs and the deck links the pre-shaped file. That is only safe if nothing a reader sees changes, and
 * nothing else would notice if it did: this is the gate.
 *
 * HOW. Each deck is rendered twice by marp-core with the options Marp for VS Code renders its preview with (`VSCODE_OPTIONS`),
 * the way the preview assembles its page (Marp's style, then the slides):
 *   · BEFORE: the full engine and every palette registered, no link;
 *   · AFTER: the stubs registered (`stubOf`, the same cut the kit ships), and the linked stylesheet.
 * Both pages run the real runtime in Chromium and settle (the runtime loaded, fonts ready, no figure pending), then every slide is
 * screenshotted and the two PNGs must be identical bytes. A difference names the slide and keeps both images.
 *
 * Both hand-offs are covered: the copy-and-go kit (dist/lattice-vscode-min.css) and an Export-to-Marp bundle, whose themes pass
 * through `marpScopableCss` first (dist/lattice-vscode-bundle-min.css, shipped as `lattice-vscode.css`). The decks: the kit's
 * Sample-Deck (cuoio, and cuoio-dark, a palette that `@import`s another), and the layout gallery (every component, mustard, 4K:
 * also proves the stubs keep a deck's own `size:`).
 *
 * EVERY BUNDLED MARP. A user's preview runs the marp-core (and marpit) THEIR Marp for VS Code bundles, and Marp's own rules differ
 * between them: marpit before 3.2.2 writes its `h1` reset one type selector stronger, which beat a lowered engine rule and moved
 * a title slide's paragraphs 43 px in Marp for VS Code 3.0.0-3.5.1 (found by driving all ten 3.x releases, 2026-11-10; this test
 * then ran 4.4.0 only and passed). So every Sample-Deck case runs under each pair the build models (`VSCODE_CORES`); the 120-slide
 * gallery runs under the newest, since the theme's own rules pack the same under all of them.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const KIT = path.join(ROOT, 'dist', 'marp-kit');
// Its own folder per run (HARD RULE #32): two runs at once must not delete each other's pages. Kept afterwards, for the images.
const OUT = path.join(ROOT, '.scratch', `marp-vscode-css-parity-${process.pid}`);
const link = (href) => `<link rel="stylesheet" href="${href}">`;
const VIEW = 5400;
const TAGS = '<script src="mermaid-v11-min.js"></script>\n<script src="lattice-dagre-min.js"></script>\n<script src="lattice-runtime-min.js"></script>\n';

let Marp;
try { ({ Marp } = require('@marp-team/marp-core')); } catch { Marp = null; }
const { VSCODE_OPTIONS, VSCODE_CORES, stubOf } = require('../../../tools/build-marp-vscode-css.js');
const { marpScopableCss, withoutEmojiFont, VSCODE_STYLESHEET } = require('../../../lib/export/marp-bundle.js');

// The two hand-offs, each with the theme text it registers and the stylesheet its deck links. The kit registers the dist files
// as they are; an Export-to-Marp bundle registers them through the same `prepare` its producers use (tools/export-marp.js
// `copyCssInto`), and links a stylesheet the build cut from those prepared themes.
const HANDOFFS = {
  kit: { prepare: (css) => css, href: 'lattice-vscode-min.css', from: null, engineStub: 'dist/lattice-vscode-stub.css' },
  bundle: { prepare: (css) => marpScopableCss(withoutEmojiFont(css)), href: VSCODE_STYLESHEET, from: 'dist/lattice-vscode-bundle-min.css', engineStub: 'dist/lattice-vscode-bundle-stub.css' },
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ENGINE = () => read('dist/lattice-min.css');
// Every palette is registered, as a hand-off registers every theme it ships: a palette `@import`s the one it extends
// (cuoio-dark → cuoio), and Marp resolves that by name among the registered themes.
const PALETTES = () => fs.readdirSync(path.join(ROOT, 'dist', 'themes')).filter((f) => f.endsWith('-min.css')).map((f) => read(`dist/themes/${f}`));

/** One preview page as Marp for VS Code assembles it: its style, then the slides; the harness only sizes each slide. */
function previewPage(deck, themes, href, MarpClass = Marp) {
  const marp = new MarpClass(VSCODE_OPTIONS);
  for (const css of themes) marp.themeSet.add(css);
  const body = deck.replace(/^<link rel="stylesheet" href="[^"]+">$/m, '') + (href ? `\n${link(href)}\n` : '\n');
  const { html, css } = marp.render(body);
  return `<!doctype html><html><head><meta charset="utf-8"><style>svg[data-marpit-svg]{display:block;width:960px;height:auto}</style>`
    + `<style id="__marp-vscode-style">${css}</style></head><body class="marp-vscode">${html}</body></html>`;
}

/** The kit's Sample-Deck in another palette. */
const inPalette = (deck, palette) => deck.replace(/^theme: \S+$/m, `theme: ${palette}`);

const SAMPLE = () => read('kit/Sample-Deck.md');
const GALLERY = () => `${read('test/integration/baseline-decks/gallery.md')}\n\n<!-- markdownlint-disable MD033 -->\n${TAGS}`;
// A deck that overrides the engine from its own CSS, both ways Marp takes it: a global `<style>` and the `style:` directive. Marp
// puts those after the theme, so at equal specificity the author wins; the linked stylesheet must leave it that way.
const AUTHORED = () => SAMPLE()
  .replace(/^theme: (\S+)$/m, 'theme: $1\nstyle: |\n  section p { letter-spacing: 0.08em; }\n  section { background: rgb(236, 230, 210); }')
  + '\n<style>\nsection h1, section h2 { color: rgb(170, 20, 40); }\nsection li { font-style: italic; }\n'
  // Order-settled, not selector-settled: which layer wins is fixed by the FIRST statement naming the order, and the engine's came
  // before the author's when the theme was registered (`components` after `base`, so red). Linked after, blue would win.
  + '@layer components { section p { outline: 2px solid rgb(200, 0, 0); } }\n@layer base { section p { outline: 2px solid rgb(0, 0, 200); } }\n'
  + '</style>\n';
const DECKS = [
  { name: 'kit-authored-css', handoff: 'kit', deck: AUTHORED },
  { name: 'bundle-authored-css', handoff: 'bundle', deck: AUTHORED },
  { name: 'kit-sample-cuoio', handoff: 'kit', deck: SAMPLE },
  { name: 'kit-sample-cuoio-dark', handoff: 'kit', deck: () => inPalette(SAMPLE(), 'cuoio-dark') },
  { name: 'kit-gallery-mustard', handoff: 'kit', deck: GALLERY },
  { name: 'bundle-sample-cuoio', handoff: 'bundle', deck: SAMPLE },
  { name: 'bundle-sample-cuoio-dark', handoff: 'bundle', deck: () => inPalette(SAMPLE(), 'cuoio-dark') },
  { name: 'bundle-gallery-mustard', handoff: 'bundle', deck: GALLERY },
];

describe('the VS Code-shaped stylesheet styles the preview exactly as the registered theme did', () => {
  let skip = null;
  let browser;

  before(async () => {
    if (!Marp) { skip = '@marp-team/marp-core is not installed (npm ci)'; return; }
    if (!fs.existsSync(path.join(KIT, 'lattice-vscode-min.css'))) { skip = 'dist/marp-kit is not built (npm run build)'; return; }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.cpSync(KIT, OUT, { recursive: true });
    for (const h of Object.values(HANDOFFS)) if (h.from) fs.copyFileSync(path.join(ROOT, h.from), path.join(OUT, h.href));
    // Full-resolution raster only (HARD RULE #32: the same pixels on every run). Chromium first paints a scrolled or cold region
    // with low-resolution tiles and fills it in partially; a capture can catch either, and a curve at a fractional offset then
    // differs by a few anti-aliased pixels. Measured on the authored deck's diagram slide: 2 runs in 5 differed by 95 pixels with
    // the defaults, 0 in 8 with these two flags.
    browser = await require('puppeteer').launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-low-res-tiling', '--disable-partial-raster'],
    });
  });
  after(async () => { if (browser) await browser.close(); });

  async function shots(file) {
    const page = await browser.newPage();
    // A tall viewport, set before the page loads (a resize later would re-run the runtime's fit): ten slides at a time are
    // captured straight from the viewport. An element screenshot re-lays out the whole page per capture, which on the 120-slide
    // gallery costs ~4 s a slide; a viewport clip costs ~60 ms.
    await page.setViewport({ width: 1000, height: VIEW, deviceScaleFactor: 1 });
    page.setDefaultTimeout(90000);
    await page.goto(`file://${path.join(OUT, file)}`, { waitUntil: 'networkidle0', timeout: 90000 });
    // Signals, not durations (HARD RULE #32): the runtime ran, every font arrived, no figure is still being drawn.
    await page.waitForFunction(() => document.documentElement.dataset.latticeRuntime === 'loaded', { timeout: 60000 });
    await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[data-lattice-settle="pending"], [data-lattice-settle="hydrating"]'), { timeout: 60000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const boxes = await page.$$eval('svg[data-marpit-svg]', (all) => all.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
    }));
    const out = [];
    for (const box of boxes) {
      const top = Math.floor(box.y / (VIEW - 600)) * (VIEW - 600);
      await page.evaluate((y) => window.scrollTo(0, y), top);
      out.push(await page.screenshot({ clip: box, captureBeyondViewport: false }));
    }
    await page.close();
    return out;
  }

  const NEWEST = VSCODE_CORES[VSCODE_CORES.length - 1];
  const RUNS = DECKS.flatMap((d) => (d.name.includes('gallery') ? [NEWEST] : VSCODE_CORES).map((c) => ({ ...d, core: c })));
  for (const d of RUNS) {
    const tag = `${d.name}-core${d.core.core}`;
    test(`${d.name} under marp-core ${d.core.core} (Marp for VS Code ${d.core.vscode}): every slide identical`, async (t) => {
      if (skip) return t.skip(skip);
      const h = HANDOFFS[d.handoff];
      const palettes = PALETTES().map(h.prepare);
      const deck = d.deck();
      // Before: the full themes. After: the engine's built stub (its directives and pinned declarations), each palette's stub.
      fs.writeFileSync(path.join(OUT, `${tag}-before.html`), previewPage(deck, [h.prepare(ENGINE()), ...palettes], null, d.core.Marp));
      fs.writeFileSync(path.join(OUT, `${tag}-after.html`), previewPage(deck, [read(h.engineStub), ...palettes.map(stubOf)], h.href, d.core.Marp));
      const before = await shots(`${tag}-before.html`);
      const after = await shots(`${tag}-after.html`);
      assert.equal(after.length, before.length, 'the same slides');
      assert.ok(before.length > 0, 'a deck with slides (guard against a vacuous pass)');
      // ...and slides that were really drawn: a blank or unstyled capture would match its twin just as well.
      assert.ok(new Set(before.map((png) => png.toString('base64'))).size > 1, 'the captures differ from one another');
      const differ = [];
      before.forEach((png, i) => {
        if (Buffer.compare(png, after[i]) !== 0) {
          differ.push(i + 1);
          fs.writeFileSync(path.join(OUT, `${tag}-slide${i + 1}-before.png`), png);
          fs.writeFileSync(path.join(OUT, `${tag}-slide${i + 1}-after.png`), after[i]);
        }
      });
      assert.deepEqual(differ, [], `slides that differ (both images kept in ${path.relative(ROOT, OUT)})`);
    });
  }
});
