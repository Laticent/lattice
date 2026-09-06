/**
 * Integration: WHEN MERMAID NEVER ARRIVES, THE AUTHOR GETS THEIR SOURCE BACK (#2092).
 *
 * `wrapFences` tags every ```mermaid fence `pending` at boot, before it can know whether
 * Mermaid will ever load — deliberately, because that tag is what `mermaid.css` hides on
 * and hiding it is the only way to cover the load window that made the source flash
 * (engineering/decisions/2026-09-05-diagram-fence-flash.md §4A). Nothing un-tagged it when
 * the answer turned out to be "never". So on a 404, a CSP block, or a host that installs
 * a stub, the fence stayed hidden forever and the author's only signal that their diagram
 * did not draw was an EMPTY SLOT — permanently, in a file they had downloaded.
 *
 * WHY THIS TIER. The mechanism is three things agreeing, and no cheaper tier holds all
 * three: the shipped runtime's give-up (`lib/runtime/index.js`), the shipped stylesheet's
 * visibility rules (`dist/lattice.css`), and a real browser's script loading — because the
 * fast arm's whole argument is that a PLAIN `<script src>` placed before ours has already
 * had its turn by the time we run. A jsdom stand-in has no script loading to be wrong
 * about, so it could only assert the code I wrote against a copy of my own reasoning.
 *
 * WHAT IT IS AND IS NOT. The document is assembled the way `buildSrcdoc` assembles one —
 * the Mermaid tag first, plain, then the runtime — and served over a real HTTP origin so
 * a 404 is a real 404. It is NOT the Studio: no `srcdoc` frame, no sanitizers, no fit
 * agent. The Studio's own two artifacts are driven in `docs/e2e/webpage-export.spec.ts`.
 *
 * FOUR CELLS, and the pairing is the point — cells 1 and 2 are the same deck and the same
 * document with ONE variable, whether the Mermaid URL resolves:
 *   1. Mermaid 404s      → the fence is visible, has a real box, and holds the source.
 *   2. Mermaid loads     → unchanged: the diagram draws and the <pre> stays hidden.
 *   3. Mermaid 404s in a document that STAMPS `data-lattice-diagrams` (the watched preview
 *      shape) → still visible, because the give-up drops the falsified promise.
 *   4. A diagram Mermaid REJECTS (the `error` state) collapses its empty slot too.
 *   5. The release is FAST — under two seconds, not the ten-second deadline. That is not a
 *      nicety: the Studio's desktop print document waits `load` + 450ms and nothing else,
 *      so a release on the deadline would print the empty slot anyway.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = resolveChrome();
const TIMEOUT = 180000;

/** A sentinel only the author's own fence text can carry onto the page. */
const SENTINEL = 'UNRENDERABLE_FENCE_SENTINEL';

const deckWith = (body) => [
  '---', 'theme: indaco', '---', '',
  '<!-- _class: diagram -->', '',
  '## A diagram that will not draw', '',
  '```mermaid', ...body, '```', '',
].join('\n');

/** A diagram that renders. */
const DECK = deckWith(['flowchart LR', `  A["${SENTINEL}"] --> B["Second"]`]);
/** A diagram Mermaid PARSES AND REJECTS — the `error` state, not the `unavailable` one. */
const BROKEN_DECK = deckWith([`flowchart LR ${SENTINEL}`, '  A -->']);

/**
 * Serve one document, the shipped runtime, and either a real Mermaid or a 404, then read
 * the fence's state back out of the live page.
 *
 * The tags go in as REAL `<script src>` elements over a REAL origin rather than through
 * `page.addScriptTag`, and that is the whole fidelity argument of this file: the runtime's
 * fast arm reasons about a script that has already had its turn, and `addScriptTag`
 * appends after load, which is the one shape the arm deliberately does not claim.
 */
async function readFence({ mermaid, stampDiagrams = false, deck = DECK }) {
  const puppeteer = require('puppeteer');
  const engine = require('../../../lib/engine');
  const { composeCss } = require('../../../lib/engine/css.js');
  const { fontFaceCss } = require('../../../lib/fonts/face-css.js');

  const out = engine.render(deck, 'indaco', { preview: true });
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  // The tag ORDER mirrors `buildSrcdoc` (docs/src/playground/deck-preview.js): mermaid
  // first, then the runtime, both plain. Reversing it would silently retire cell 4.
  const doc = '<!doctype html><html' + (stampDiagrams ? ' data-lattice-diagrams' : '') + '><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style></head><body>'
    + `<article class="lattice">${out.html}</article>`
    + '<scr' + 'ipt src="/mermaid.js"></scr' + 'ipt>'
    + '<scr' + 'ipt src="/lattice-runtime.js"></scr' + 'ipt>'
    + '</body></html>';

  const runtimeJs = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'));
  const mermaidJs = mermaid ? fs.readFileSync(path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.js')) : null;
  const server = http.createServer((req, res) => {
    if (req.url === '/lattice-runtime.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(runtimeJs);
      return;
    }
    if (req.url === '/mermaid.js') {
      if (!mermaidJs) { res.writeHead(404); res.end('no mermaid here'); return; }
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(mermaidJs);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(doc);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const browser = await puppeteer.launch({
    executablePath: CHROME || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const startedAt = Date.now();
    await page.goto(base, { waitUntil: 'load' });
    // Wait for the fence to SETTLE either way — rendered, or handed back. Bounded well
    // under the runtime's own 10s deadline so cell 4 can distinguish the two arms; a
    // release that only happened on the deadline times out here rather than passing late.
    const settled = await page.waitForFunction(
      () => !!document.querySelector('pre[data-mermaid-state="rendered"],pre[data-mermaid-state="unavailable"],pre[data-mermaid-state="error"],marp-pre[data-mermaid-state="rendered"],marp-pre[data-mermaid-state="unavailable"],marp-pre[data-mermaid-state="error"]'),
      { timeout: 8000 },
    ).then(() => true).catch(() => false);
    const settledMs = Date.now() - startedAt;
    await page.evaluate(() => document.fonts.ready);
    const read = await page.evaluate(() => {
      const pre = document.querySelector('pre[data-mermaid-state],marp-pre[data-mermaid-state]');
      const sibling = pre?.nextElementSibling?.classList.contains('mermaid') ? pre.nextElementSibling : null;
      const box = pre?.getBoundingClientRect();
      return {
        state: pre?.getAttribute('data-mermaid-state') ?? null,
        display: pre ? getComputedStyle(pre).display : null,
        visibility: pre ? getComputedStyle(pre).visibility : null,
        // The CODE's visibility, not the <pre>'s: the anti-flash rule withholds ink on
        // the `<code>`, so reading only the box would miss a fence that is present,
        // sized, and painting nothing.
        codeVisibility: pre?.querySelector('code') ? getComputedStyle(pre.querySelector('code')).visibility : null,
        width: box ? Math.round(box.width) : 0,
        height: box ? Math.round(box.height) : 0,
        text: (pre?.textContent || '').trim(),
        siblingDisplay: sibling ? getComputedStyle(sibling).display : null,
        svgs: document.querySelectorAll('section svg').length,
        stamped: document.documentElement.hasAttribute('data-lattice-diagrams'),
      };
    });
    return { ...read, settled, settledMs };
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}

describe('a fence Mermaid never draws', { skip: skipWithoutChrome(CHROME), timeout: TIMEOUT }, () => {
  test('shows the author its source when the Mermaid script 404s', async () => {
    const r = await readFence({ mermaid: false });
    assert.equal(r.settled, true, 'the runtime never settled the fence — it is still pending and hidden');
    assert.equal(r.state, 'unavailable', 'the give-up must hand the fence back, not leave it pending');
    assert.notEqual(r.display, 'none', 'the source <pre> must be shown once Mermaid is known not to be coming');
    assert.equal(r.codeVisibility, 'visible', 'the fence must PAINT, not merely occupy a box');
    assert.ok(r.width > 0 && r.height > 0, `the source <pre> must have a real box (got ${r.width}x${r.height})`);
    assert.match(r.text, new RegExp(SENTINEL), 'the author\'s own fence text must be on the page');
    assert.equal(r.siblingDisplay, 'none', 'the empty .mermaid slot must collapse so the source has full room');
    assert.equal(r.svgs, 0, 'no diagram was drawn — that is the premise of this cell');
  });

  test('is unchanged when the Mermaid script loads', async () => {
    const r = await readFence({ mermaid: true });
    assert.equal(r.state, 'rendered', 'a healthy deck still renders its diagram');
    assert.equal(r.display, 'none', 'the spent source <pre> stays hidden on a healthy render');
    assert.equal(r.siblingDisplay, 'flex', 'the SVG box takes the slot');
    assert.ok(r.svgs > 0, 'the diagram is on the slide');
  });

  test('shows the source in a document that stamped data-lattice-diagrams', async () => {
    // The watched-preview shape. Rule A withholds an UNTAGGED fence's ink under this
    // attribute, so a give-up that merely removed `data-mermaid-state` would hand the
    // author a fence that is present, sized, and invisible — a worse bug than the one it
    // fixed, and one no box measurement would catch. Hence `codeVisibility` below.
    const r = await readFence({ mermaid: false, stampDiagrams: true });
    assert.equal(r.state, 'unavailable', 'the give-up runs in a stamping document too');
    assert.equal(r.stamped, false, 'the give-up drops the promise the document could not keep');
    assert.notEqual(r.display, 'none', 'the source <pre> is shown');
    assert.equal(r.codeVisibility, 'visible', 'and it paints — rule A must not still be withholding its ink');
    assert.match(r.text, new RegExp(SENTINEL));
  });

  test('collapses the empty slot for a diagram Mermaid REJECTS, too', async () => {
    // The `error` state's sibling collapse is the rule `unavailable` is modelled on, and
    // measuring it is how this change found that it had not worked on a Form-wrapped
    // diagram slide since the masthead kernel started wrapping the body in `.cell-stage`:
    // `section.diagram > .cell-stage > .mermaid { display:flex; flex:1 }` out-specifies
    // `[data-mermaid-state="error"] + .mermaid { display:none }` (0,3,1 against 0,2,1), so
    // an EMPTY box claimed half the stage and the source the author needs to read got the
    // other half. Both states carry the wrapped arm now. Driven, not derived from that
    // arithmetic — the arithmetic is what a reviewer would have got wrong.
    const r = await readFence({ mermaid: true, deck: BROKEN_DECK });
    assert.equal(r.state, 'error', 'Mermaid rejected the diagram, so this is the error state');
    assert.notEqual(r.display, 'none', 'the error state shows the source — that is its whole point');
    assert.equal(r.siblingDisplay, 'none', 'the empty .mermaid box must collapse so the source has the full slot');
  });

  test('gives up fast, not on the ten-second deadline', async () => {
    // The Studio's desktop print document waits `load` + 450ms and never waits on
    // diagrams, so a release that only fired on `MERMAID_WAIT_CAP` / `MERMAID_WAIT_MS`
    // would print the empty slot regardless of everything above. This is the cell that
    // pins the synchronous arm: a plain `<script src>` naming mermaid, sitting before
    // ours, has already had its turn. Delete that arm and this fails at 8s while the
    // three cells above stay green.
    const r = await readFence({ mermaid: false });
    assert.equal(r.settled, true);
    assert.ok(r.settledMs < 2000,
      `the give-up must not wait out the deadline — settled in ${r.settledMs}ms, want < 2000ms`);
  });
});
