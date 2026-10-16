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
 *   5. A slow defer/async tag, and a folder named "mermaid", do NOT trip the fast arm.
 *   6. The release is FAST — under two seconds, not the ten-second deadline. That is not a
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
async function readFence({ mermaid, payload = '404', laterDeck = null, laterMs = 0, stampDiagrams = false, deck = DECK, scriptAttrs = '', mermaidDelayMs = 0, basePath = '/', extraScript = '', dynamicInsert = null, waitFor = null, settleMs = 8000, runtimeFirst = false }) {
  const puppeteer = require('puppeteer');
  const engine = require('../../../lib/engine');
  const { composeCss } = require('../../../lib/engine/css.js');
  const { fontFaceCss } = require('../../../lib/fonts/face-css.js');

  const out = engine.render(deck, 'indaco', { preview: true });
  // A deck whose slides arrive LATER, appended by a script after `laterMs` — the shape of a host
  // that patches a first diagram into a live document.
  const later = laterDeck ? engine.render(laterDeck, 'indaco', { preview: true }).html : '';
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco', 'indaco.css'), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  // The tag ORDER mirrors `buildSrcdoc` (docs/src/playground/deck-preview.js): mermaid
  // first, then the runtime, both plain. Reversing it would silently retire cell 4.
  const doc = '<!doctype html><html' + (stampDiagrams ? ' data-lattice-diagrams' : '') + '><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style>'
    // What the fence's state was AT `load` — the moment the Studio's desktop print starts its
    // 450ms beat toward `print()`, with no diagram wait of its own.
    + '<scr' + 'ipt>addEventListener("load",function(){var p=document.querySelector("pre[data-lattice-settle]");window.__stateAtLoad=p?p.getAttribute("data-lattice-settle"):null;});</scr' + 'ipt>'
    // Did Mermaid's OWN startOnLoad pass ever paint its error graphic into one of our (empty)
    // render targets? Watched from the first byte of <body>, for the life of the page.
    + '<scr' + 'ipt>window.__bomb=0;new MutationObserver(function(){if(document.querySelector(".mermaid [aria-roledescription=\\"error\\"], .mermaid .error-icon"))window.__bomb++;}).observe(document.documentElement,{subtree:true,childList:true});</scr' + 'ipt>'
    + (dynamicInsert
      // Inserted by script, `async = false`, into <head> — so it precedes the runtime tag
      // at the end of <body> in document order while not having run. No platform signal
      // separates this from a parser-inserted tag; the `load` handler is the bound.
      ? '<scr' + 'ipt>(function(){var s=document.createElement("script");s.async=false;'
        + 's.src="mermaid.js";document.head.appendChild(s);})();</scr' + 'ipt>'
      : '')
    + '</head><body>'
    + `<article class="lattice">${out.html}</article>`
    + (later
      ? `<template id="later">${later}</template><scr` + `ipt>setTimeout(function(){var a=document.querySelector('.lattice');`
        + `a.appendChild(document.getElementById('later').content.cloneNode(true));}, ${laterMs});</scr` + `ipt>`
      : '')
    // `scriptAttrs` goes on the MERMAID tag only. Putting it on both made the defer cell
    // vacuous — two `defer` scripts execute in order, so Mermaid was already real when the
    // runtime booted and `mermaidPromiseBroken()` was never consulted at all.
    + (runtimeFirst ? '<scr' + 'ipt ' + scriptAttrs + ' src="lattice-runtime.js"></scr' + 'ipt>' : '')
    + (mermaid === 'no-tag' || dynamicInsert ? '' : '<scr' + 'ipt ' + scriptAttrs + ' src="mermaid.js"></scr' + 'ipt>')
    + (extraScript || '')
    + (runtimeFirst ? '' : '<scr' + 'ipt src="lattice-runtime.js"></scr' + 'ipt>')
    + '</body></html>';

  const runtimeJs = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'));
  const mermaidJs = mermaid && mermaid !== 'no-tag' ? fs.readFileSync(path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.js')) : null;
  const payloadRequests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith('/lattice-runtime.js')) {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(runtimeJs);
      return;
    }
    // The Mermaid plugin's PAYLOAD, which the runtime's plugin host asks for beside itself when no
    // host wrote a Mermaid tag (lib/plugins/host-browser.mjs `ensureLibrary`). A 404 by default, so
    // a cell that means to exercise a host tag is not rescued by it.
    if (req.url.endsWith('/mermaid.min.js')) {
      payloadRequests.push(req.url);
      if (payload !== 'serve') { res.writeHead(404); res.end('no payload here'); return; }
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(fs.readFileSync(path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')));
      return;
    }
    if (req.url.endsWith('/mermaid.js')) {
      if (!mermaidJs) { res.writeHead(404); res.end('no mermaid here'); return; }
      // A SLOW but successful load — the case the fast arm must not mistake for a failure.
      if (mermaidDelayMs) await new Promise((r) => { setTimeout(r, mermaidDelayMs); });
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(mermaidJs);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(doc);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}${basePath}`;

  const browser = await puppeteer.launch({
    executablePath: CHROME || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    // THE GIVE-UP ITSELF, not just its outcome. A misfire on a document whose Mermaid was
    // still coming is recovered — by the `load` handler, or by an edit — so asserting only
    // the final state cannot tell a correct wait from a wrong release that got rescued.
    // The runtime says when it gives up; that line is the discriminator.
    const gaveUpLines = [];
    page.on('console', (m) => {
      const t = m.text();
      if (t.includes('real mermaid never loaded; giving up')) gaveUpLines.push(t);
    });
    const startedAt = Date.now();
    await page.goto(base, { waitUntil: 'load' });
    // Wait for the fence to SETTLE either way — rendered, or handed back. Bounded well
    // under the runtime's own 10s deadline so cell 4 can distinguish the two arms; a
    // release that only happened on the deadline times out here rather than passing late.
    const settleStates = waitFor ? [waitFor] : ['rendered', 'unavailable', 'error'];
    const settleSelector = settleStates
      .flatMap((st) => [`pre[data-lattice-settle="${st}"]`, `marp-pre[data-lattice-settle="${st}"]`])
      .join(',');
    const settled = await page.waitForFunction(
      (sel) => !!document.querySelector(sel),
      { timeout: settleMs }, settleSelector,
    ).then(() => true).catch(() => false);
    const settledMs = Date.now() - startedAt;
    await page.evaluate(() => document.fonts.ready);
    const read = await page.evaluate(() => {
      const pre = document.querySelector('pre[data-lattice-settle],marp-pre[data-lattice-settle]');
      const sibling = pre?.nextElementSibling?.classList.contains('mermaid') ? pre.nextElementSibling : null;
      const box = pre?.getBoundingClientRect();
      return {
        state: pre?.getAttribute('data-lattice-settle') ?? null,
        plugin: pre?.getAttribute('data-lattice-hydrate') ?? null,
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
        stateAtLoad: window.__stateAtLoad ?? null,
        bomb: window.__bomb || 0,
      };
    });
    return { ...read, settled, settledMs, gaveUp: gaveUpLines.length > 0, gaveUpLines, payloadRequests };
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
    // The watched-preview shape, and the cell that says why the give-up writes a STATE
    // rather than removing the attribute: under `[data-lattice-diagrams]` the anti-flash
    // rule withholds an UNTAGGED fence's ink, so an un-tagging give-up would hand the
    // author a fence that is present, correctly sized, and invisible — which no box
    // measurement catches. Hence `codeVisibility`.
    //
    // AND BE HONEST ABOUT WHAT THIS CELL CANNOT FAIL ON, because the first version of this
    // paragraph got it backwards and overstated the coverage. It claimed the document
    // carries the UNSCOPED rule and that `codeVisibility` is therefore a live
    // discriminator here. It is not: this cell builds its sheet with `composeCss`, the
    // same function the preview uses, and that PREFIXES every rule with
    // `article.lattice > section` — so the shipped rule wants a `[data-lattice-diagrams]`
    // element INSIDE a slide while the attribute is on `<html>`, and cannot match in any
    // arm. A checker proved it by rebuilding the runtime to un-tag and watching
    // `codeVisibility` stay `visible` through the very failure the assertion was written
    // for. So the ink assertion is gone rather than left to look like coverage, and
    // NOTHING here exercises rule A live — that scoping is a separate, pre-existing defect
    // (engineering/decisions/2026-09-05-diagram-fence-flash.md).
    //
    // What this cell still proves, and it is the part that matters: the give-up runs in a
    // stamping document, hands the fence back, and does not touch the document's markup.
    const r = await readFence({ mermaid: false, stampDiagrams: true });
    assert.equal(r.state, 'unavailable', 'the give-up runs in a stamping document too');
    assert.equal(r.stamped, true, 'the give-up leaves the document\'s own markup alone');
    assert.notEqual(r.display, 'none', 'the source <pre> is shown');
    assert.match(r.text, new RegExp(SENTINEL));
  });

  test('collapses the empty slot for a diagram Mermaid REJECTS, too', async () => {
    // The `error` state's sibling collapse is the rule `unavailable` is modelled on, and
    // measuring it is how this change found that it had not worked on a Form-wrapped
    // diagram slide since the masthead kernel started wrapping the body in `.cell-stage`:
    // `section.diagram > .cell-stage > .mermaid { display:flex; flex:1 }` out-specifies
    // `[data-lattice-settle="error"] + .mermaid { display:none }` (0,3,1 against 0,2,1), so
    // an EMPTY box claimed half the stage and the source the author needs to read got the
    // other half. Both states carry the wrapped arm now. Driven, not derived from that
    // arithmetic — the arithmetic is what a reviewer would have got wrong.
    const r = await readFence({ mermaid: true, deck: BROKEN_DECK });
    assert.equal(r.state, 'error', 'Mermaid rejected the diagram, so this is the error state');
    assert.notEqual(r.display, 'none', 'the error state shows the source — that is its whole point');
    assert.equal(r.siblingDisplay, 'none', 'the empty .mermaid box must collapse so the source has the full slot');
  });

  /**
   * THE THREE WAYS THE FAST ARM CAN BE WRONG, each driven by an independent checker against
   * the FIRST version of it and each now a cell.
   *
   * Being wrong here is expensive in one specific direction: a false "the promise is broken"
   * releases a fence whose Mermaid was still coming, so the slide shows raw source — the
   * §4A flash this whole swimlane exists to remove — and an export bakes that source into
   * the artifact, because `waitForDiagrams` treats the released state as settled.
   */
  test('waits for a DEFER tag that has not run yet', async () => {
    // `readyState` flips to `interactive` BEFORE deferred scripts execute, so the first
    // version of the predicate reported a defer tag as settled and gave up while Mermaid
    // was still on its way. Position against our own script is the exact question instead.
    const r = await readFence({ mermaid: true, scriptAttrs: 'defer', mermaidDelayMs: 1200 });
    assert.equal(r.gaveUp, false,
      `the runtime must not GIVE UP on a defer tag that has not run: ${r.gaveUpLines.join(' | ')}`);
    assert.equal(r.state, 'rendered', 'a slow DEFER mermaid still draws');
    assert.ok(r.svgs > 0, 'the diagram is on the slide');
  });

  test('waits for a DEFER tag that comes AFTER our own script', async () => {
    // THE CELL THAT ISOLATES THE PREDICATE, and it took a second checker plus a corrected
    // mutation run to find the shape. With Mermaid's tag first — which is what every
    // builder writes — the old `readyState` predicate and the new position one agree, so
    // the cell above cannot tell them apart: reverting the fix leaves it green.
    //
    // The disagreement needs OUR tag first. Both deferred, the runtime runs before the
    // Mermaid tag has executed, and `readyState` is already `interactive` — so the old
    // form called it settled and gave up on a Mermaid that was one script away. Position
    // gets it right: our script does not FOLLOW that element, so the arm stays silent.
    // No builder writes this order; the predicate should not depend on that.
    const r = await readFence({
      mermaid: true, scriptAttrs: 'defer', runtimeFirst: true,
      mermaidDelayMs: 600, waitFor: 'rendered', settleMs: 25000,
    });
    assert.equal(r.gaveUp, false,
      `our tag coming first must not turn a pending Mermaid into a broken promise: ${r.gaveUpLines.join(' | ')}`);
    assert.equal(r.state, 'rendered', 'and the diagram draws');
  });

  test('waits for an ASYNC tag that has not run yet', async () => {
    const r = await readFence({ mermaid: true, scriptAttrs: 'async', mermaidDelayMs: 1200 });
    assert.equal(r.gaveUp, false,
      `the runtime must not GIVE UP on an async tag that has not run: ${r.gaveUpLines.join(' | ')}`);
    assert.equal(r.state, 'rendered', 'a slow ASYNC mermaid still draws');
  });

  test('does not read a FOLDER NAME as a promise of Mermaid', async () => {
    // `el.src` is the RESOLVED url, so matching /mermaid/i against the whole of it made
    // every script in a document served from a path containing "mermaid" count as a
    // mermaid script. A document with no mermaid tag at all then gave up on the first tick.
    //
    // THE THIRD-PARTY SCRIPT IS WHAT MAKES THIS CELL ABLE TO FAIL, and a checker is why it
    // is here: with only the runtime's own tag in the document, the `el !== OWN_SCRIPT`
    // exclusion rescues the cell on its own, so reverting the FILE-NAME fix left it green
    // and the fix it names had no isolating coverage. An unrelated third-party script in
    // the same mermaid-named folder is excluded by neither guard, so it isolates the one
    // under test.
    //
    // With no Mermaid tag, the runtime now asks the plugin host for the library instead (the
    // plugin's payload, 404 here), and THAT failure gives up too — so the discriminator is WHICH
    // arm gave up: the fast arm's line names a `<script src>` that had its turn, and must not
    // appear. Revert the file-name fix and `analytics.js` becomes that script: the fast arm fires
    // on the first tick, before the payload is ever requested.
    const r = await readFence({
      mermaid: 'no-tag',
      basePath: '/mermaid-demo/',
      extraScript: '<scr' + 'ipt src="analytics.js"></scr' + 'ipt>',
    });
    assert.ok(!r.gaveUpLines.some((l) => /naming mermaid has had its turn/.test(l)),
      `a folder name is not a promise of Mermaid: ${r.gaveUpLines.join(' | ')}`);
    assert.equal(r.payloadRequests.length, 1, 'with no Mermaid tag, the plugin host asked for the payload');
  });

  test('draws through the plugin host when no host wrote a Mermaid tag — the payload beside the runtime', async () => {
    // Phase D's browser half: the library is the Mermaid plugin's declared payload
    // (lib/plugins/mermaid/mermaid.manifest.json), staged beside `lattice-runtime.js` by its file
    // name, and loaded by the plugin host's one loader. No page threads a URL.
    const r = await readFence({ mermaid: 'no-tag', payload: 'serve', waitFor: 'rendered', settleMs: 20000 });
    assert.equal(r.state, 'rendered', 'the diagram draws with no host tag at all');
    assert.equal(r.plugin, 'mermaid', 'the fence carries the plugin host\'s markup');
    assert.ok(r.svgs > 0, 'and the SVG is on the slide');
    assert.deepEqual(r.payloadRequests, ['/mermaid.min.js'], 'fetched once, from beside the runtime, by the payload\'s file name');
  });

  test('Mermaid\'s own startOnLoad pass never paints its error graphic into our empty targets', async () => {
    // The payload lands just before the window's `load`, and Mermaid's evaluation registers a
    // `load` listener that runs over every `.mermaid` element — our empty targets — unless
    // `startOnLoad` is off by then. The runtime switches it off in the script's own onload
    // (HARD RULE #25 red team: the error graphic showed for ~130ms in up to 4 of 4 runs). Four
    // diagrams and five documents, because the race is a race.
    const four = deckWith(['flowchart LR', `  A["${SENTINEL}"] --> B`, '```', '', '---', '', '<!-- _class: diagram -->', '', '## Two', '', '```mermaid', 'flowchart LR', '  C --> D', '```', '', '---', '', '<!-- _class: diagram -->', '', '## Three', '', '```mermaid', 'sequenceDiagram', '  A->>B: hi', '```', '', '---', '', '<!-- _class: diagram -->', '', '## Four', '', '```mermaid', 'flowchart TB', '  E --> F']);
    for (let i = 0; i < 5; i++) {
      const r = await readFence({ mermaid: 'no-tag', payload: 'serve', deck: four, waitFor: 'rendered', settleMs: 20000 });
      assert.equal(r.bomb, 0, `run ${i}: Mermaid drew its own error graphic into a render target`);
      assert.equal(r.state, 'rendered');
    }
  });

  test('a payload that 404s hands the fence back fast, not on the deadline', async () => {
    // The plugin host reports the failed load and the runtime gives up at once — the same
    // release the fast arm makes for a host tag, and for the same reason (the Studio's desktop
    // print waits `load` + 450ms and never waits on diagrams).
    const r = await readFence({ mermaid: 'no-tag', payload: '404' });
    assert.equal(r.settled, true);
    assert.equal(r.state, 'unavailable');
    assert.notEqual(r.display, 'none', 'the source is shown');
    assert.match(r.text, new RegExp(SENTINEL));
    assert.ok(r.gaveUpLines.some((l) => /plugin host could not load its library/.test(l)), r.gaveUpLines.join(' | '));
    assert.ok(r.settledMs < 2000, `settled in ${r.settledMs}ms, want < 2000ms`);
    // …and BEFORE `load`: the runtime inserts the payload's script while the document is still
    // loading, so its failure lands before `load` fires — as the old parser-inserted tag's did.
    // This is what the print path (PrintOptionsPanel.tsx) relies on.
    assert.equal(r.stateAtLoad, 'unavailable', 'the fence was already handed back when `load` fired');
  });

  test('a fence that arrives AFTER the deadline, whose payload then 404s, is handed back — not left hidden', async () => {
    // The bootstrap give-up is one-shot, and in a document that booted with no fence it has
    // already fired (releasing nothing) by the time a fence is patched in. The payload request
    // tags that fence `pending` — hidden — so its failure has to release it itself (HARD RULE
    // #25 checker: before the fix it stayed `pending` and invisible for good).
    const r = await readFence({
      mermaid: 'no-tag', payload: '404',
      deck: ['---', 'theme: indaco', '---', '', '## No diagram yet'].join('\n'),
      laterDeck: DECK, laterMs: 11000, waitFor: 'unavailable', settleMs: 25000,
    });
    assert.equal(r.state, 'unavailable', 'the late fence was handed back to its source');
    assert.notEqual(r.display, 'none', 'and it is visible');
    assert.match(r.text, new RegExp(SENTINEL));
  });

  test('never asks for the payload when the host wrote its own Mermaid tag — even on a later pass', async () => {
    // An async host tag still loading, and a DOM mutation meanwhile: the debounced pass must not
    // ask the plugin host for a second copy. Before the fix it did, the payload 404ed, and the
    // fence flashed its source until the host's script landed (HARD RULE #25 checker).
    const r = await readFence({
      mermaid: true, scriptAttrs: 'async', mermaidDelayMs: 2500,
      extraScript: '<scr' + 'ipt>setTimeout(function(){document.body.appendChild(document.createElement("div"));}, 300);</scr' + 'ipt>',
      waitFor: 'rendered', settleMs: 20000,
    });
    assert.deepEqual(r.payloadRequests, [], 'the host tag is the library; the payload is never fetched');
    assert.equal(r.gaveUp, false, `nothing gave up: ${r.gaveUpLines.join(' | ')}`);
    assert.equal(r.state, 'rendered');
  });

  test('a document with no fence never asks for the payload', async () => {
    const r = await readFence({ mermaid: 'no-tag', payload: 'serve', deck: ['---', 'theme: indaco', '---', '', '## No diagram here'].join('\n'), settleMs: 1500 });
    assert.deepEqual(r.payloadRequests, [], 'a deck without a diagram never fetches the library');
  });

  test('takes the fence back when a slow Mermaid finally loads, with no edit to trigger it', async () => {
    // The bound on the fast arm's residual, and on any late arrival. A document nobody is
    // editing produces no mutations, so before the `load` handler nothing re-ran and the
    // author kept looking at source — which in an offscreen export capture means the
    // artifact is written that way and frozen. The tag is dynamically inserted into
    // `<head>`, which is the exact shape a checker drove: it sits BEFORE our own script,
    // carries neither `async` nor `defer`, and has not run, so the fast arm misfires on it.
    // The point of this cell is that the misfire is recovered rather than permanent.
    const r = await readFence({
      mermaid: true,
      mermaidDelayMs: 900,
      dynamicInsert: 'head',
      // Wait for the DIAGRAM, not for the first settled state — the first settled state
      // here is the misfire this cell exists to watch recover from.
      waitFor: 'rendered',
      settleMs: 20000,
    });
    assert.equal(r.state, 'rendered', 'the diagram draws in the end, with no edit to prompt it');
    assert.ok(r.svgs > 0, 'and the SVG is on the slide');
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
