/**
 * lib/integrations/mermaid/render-worker.js
 *
 * THE export path's Mermaid renderer — a page the engine owns, instead of a shell-out
 * to the `mmdc` binary.
 *
 * ── WHY (#1674) ──────────────────────────────────────────────────────────────
 * Mermaid MEASURES a label in the browser that renders it, then bakes the measured
 * box into the SVG. `mmdc` renders in ITS OWN page — `@mermaid-js/mermaid-cli`'s
 * `dist/index.html` — which carries no Lattice `@font-face`, so every label was
 * measured in a fallback face and then painted, in the host deck, in the real one.
 * Mono survived that only because its stack ends in the `monospace` generic, whose
 * fallback metrics nearly match; no hand face has that property, which is why
 * `mode: sketch` could never reach diagram type (measured: label boxes 20% narrow,
 * "Raw Signals" clipped to "Raw Signa").
 *
 * `mmdc --cssFile` is NOT the lever, by construction rather than by timing: the CLI
 * appends that CSS as a `<style>` INSIDE the SVG *after* `mermaid.render()` has
 * already returned (`src/index.js`), and it preloads `document.fonts` before that.
 * Feeding it the `@font-face` block moves the PAINT to the hand face and leaves the
 * MEASUREMENT in the fallback — strictly worse than doing nothing. Measured:
 * byte-identical geometry with and without `-C`.
 *
 * So the fix is to own the page. Here we load THE SAME page and THE SAME bundles the
 * CLI does — its `dist/index.html` plus the `mermaid` and `mermaid-zenuml` IIFEs — and
 * add exactly two things before rendering: Lattice's `@font-face` rules, and an
 * `await` on the faces actually loading. Everything else is the CLI's own sequence,
 * kept deliberately identical so this is a change of FONTS and CONFIG DELIVERY, not a
 * change of renderer.
 *
 * ── WHY A CHILD PROCESS ──────────────────────────────────────────────────────
 * `preprocessMermaid` runs at module-evaluation time in `lattice-emulator.js` and
 * cannot `await`. Puppeteer is async. Running the page in a child process keeps the
 * caller's `execFileSync` shape exactly as the `mmdc` shell-out had it, so nothing
 * upstream has to become async. It is also FASTER than what it replaces: one browser
 * and one page for the whole deck, versus a fresh Chromium per `mmdc` invocation.
 *
 * ── CONFIG ARRIVES THROUGH `mermaid.initialize`, NOT A DIRECTIVE ─────────────
 * Because we own the page, the engine's config is passed the same way the live
 * preview passes it (`lib/runtime/index.js`) instead of being serialized into a
 * `%%{init}%%` directive prepended to the source. That retires the whole class of
 * bug the directive route carried: `sanitizeDirective`'s allow-list bars the hyphen
 * (so `system-ui`/`sans-serif` was blanked) and, worse, an APOSTROPHE in any value
 * discards the entire directive — measured, the palette silently falls all the way
 * back to stock `#ECECFF`/`#333333`. An author's own `%%{init}%%` still merges OVER
 * ours, exactly as it does in the preview, because that is Mermaid's own behavior for
 * a directive layered on the site config.
 *
 * PROTOCOL. `node render-worker.js <job.json>`; the job names an output file and the
 * worker writes a result JSON there. Nothing is parsed from stdout — Mermaid logs
 * warnings to the console and a mixed stream would be a parsing hazard.
 *
 *   job    { pkgRoot, chromePath, backgroundColor, svgId, outFile,
 *            diagrams: [ { definition, config } ] }
 *   result { ok, error?, fontsLoaded: [family], results: [ { ok, svg?, error? } ] }
 *
 * `fontsLoaded` is the families the page really loaded, not the ones it declared — see
 * the note at the load site. `results` is index-aligned with `job.diagrams`.
 *
 * A diagram that fails is isolated: its entry reports the error and the rest of the
 * batch still renders. That is what preserves the caller's per-diagram `<pre>`
 * degradation without making one bad fence cost the whole deck its diagrams.
 */

const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { fontFaceCss } = require('../../fonts/face-css.js');
const { TEXT_FACES } = require('../../fonts/text-faces.js');

/**
 * Per-CDP-call budget. Generous enough that a genuinely large diagram is never cut off
 * (the whole 14-fence gallery renders in ~3.5s), tight enough that a wedged page fails in
 * seconds rather than the 180s Puppeteer would otherwise wait — times every remaining
 * diagram in the deck.
 */
const PROTOCOL_TIMEOUT_MS = 60_000;

/**
 * Errors that mean THE PAGE IS GONE, not "this diagram is malformed". Mermaid reports a
 * bad fence as a parse error; a dead renderer reports through Puppeteer's transport, and
 * those messages are the tell. Retrying a parse error costs three Chromium boots to reach
 * the same verdict; NOT retrying a dead page silently drops the rest of the deck.
 */
const FATAL_PAGE_ERROR = /detached Frame|Target closed|Session closed|Execution context was destroyed|Protocol error|timed out|Navigating frame was detached|Connection closed/i;
function isFatalPageError(message) {
  return FATAL_PAGE_ERROR.test(String(message || ''));
}

/**
 * Resolve the three assets the CLI's own render path uses, from wherever npm put
 * them. `mermaid-cli`'s `exports` map publishes only its ESM entry, so its
 * `dist/index.html` cannot be `require.resolve`d directly — locate it relative to a
 * sibling package that IS resolvable, which is correct under both a hoisted and a
 * nested `node_modules`.
 */
function resolveBundles(pkgRoot) {
  const mermaidIife = require.resolve('mermaid/dist/mermaid.js');
  const zenumlIife = require.resolve('@mermaid-js/mermaid-zenuml/dist/mermaid-zenuml.js');
  // ASK NODE WHERE IT WOULD LOOK, rather than deriving one directory from where `mermaid`
  // happened to land. The first cut did the latter — `dirname(resolve('mermaid/…'))/../..`
  // — and it collapses: when a consumer app pins a different `mermaid` at its root, npm
  // nests OURS under `node_modules/lattice/node_modules/mermaid` while `mermaid-cli` stays
  // hoisted, so both candidates resolved to the same nested path and the hoisted CLI was
  // never probed. `resolveBundles` then threw, the batch returned null, and EVERY diagram
  // in every deck degraded to a `<pre>`. `mmdc` had no such exposure — a bin-link works
  // under any layout. Found by the adversarial trio's red team on a real nested tree.
  const roots = [
    ...(require.resolve.paths('@mermaid-js/mermaid-cli') || []),
    path.join(pkgRoot, 'node_modules'),
    path.resolve(path.dirname(mermaidIife), '..', '..'),
  ];
  const candidates = roots.map((r) => path.join(r, '@mermaid-js', 'mermaid-cli', 'dist', 'index.html'));
  const indexHtml = candidates.find((p) => fs.existsSync(p));
  if (!indexHtml) {
    throw new Error(`mermaid-cli render page not found (looked in: ${candidates.join(', ')})`);
  }
  return { mermaidIife, zenumlIife, indexHtml };
}

/**
 * Render every diagram in the job. ONE browser, ONE page, reused across the batch —
 * the 1.6 MB Mermaid bundle is parsed once instead of once per diagram, which is
 * where the old batching's `1.09s × N` went.
 */
async function renderAll(job) {
  const puppeteer = require('puppeteer');
  const { mermaidIife, zenumlIife, indexHtml } = resolveBundles(job.pkgRoot);
  const launchOpts = {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // BOUND THE PROTOCOL. Puppeteer's default `protocolTimeout` is 180s PER CALL, and one
    // page serves the whole deck — so a wedged renderer used to stall every remaining
    // diagram behind it. Measured on a killed renderer: three diagrams burned 540s of dead
    // wall clock inside one batch, and a re-run was still hung at 11 minutes. `mmdc` booted
    // a browser per diagram, so the same wedge cost one diagram; sharing the page turned
    // that into the whole deck, which is a blast-radius regression this pays back.
    protocolTimeout: PROTOCOL_TIMEOUT_MS,
  };
  if (job.chromePath) launchOpts.executablePath = job.chromePath;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    // Mermaid is chatty on stdout via console.warn; swallow it so the caller's
    // progress line stays readable. Real failures come back in the result JSON.
    page.on('console', () => {});
    await page.goto(url.pathToFileURL(indexHtml).href);
    await Promise.all([
      page.addScriptTag({ path: mermaidIife }),
      page.addScriptTag({ path: zenumlIife }),
    ]);
    // THE CLI'S PROLOGUE, NOT JUST ITS PAGE. Loading `dist/index.html` gets the vite
    // bundle (KaTeX + FontAwesome faces, and `globalThis.elkLayouts`), but the two
    // REGISTRATIONS live in mermaid-cli's own JavaScript — `src/index.js`, inside the
    // `$eval` — and a page that only loads the bundle has neither.
    //
    // Dropping them cost the export two whole capabilities, silently, and an earlier
    // draft of this file shipped that way. Measured against `mmdc` on the same input:
    // a `zenuml` diagram failed outright ("No diagram type detected"), and
    // `%%{init: {"layout":"elk"}}%%` came back as dagre — `viewBox="0 0 320.69 67"`
    // where mmdc gives elk's `viewBox="4 4 324.92 70"`. Neither failure is loud: the
    // first degrades to a `<pre>` and the second just looks like a diagram.
    //
    // `test/unit/mermaid/render-worker.test.js` pins this against the CLI's source, so
    // a prologue step added upstream fails a test instead of quietly removing a feature.
    await page.evaluate(async () => {
      const { mermaid, elkLayouts } = globalThis;
      const zenuml = globalThis['mermaid-zenuml'];
      // THROW rather than skip. `if (zenuml)` was the first spelling, and it re-armed the
      // exact silent failure this block was added to fix: these are mermaid-cli's PRIVATE
      // bundle globals, so an upstream rename is precisely what would make them undefined
      // — and a skipped registration is invisible (zenuml degrades to a `<pre>`, elk
      // renders as dagre and looks fine). A loud failure here degrades one render and says
      // why; a quiet one removes a capability for a release. Red team, S6.
      const missing = [!zenuml && 'mermaid-zenuml', !elkLayouts && 'elkLayouts'].filter(Boolean);
      if (missing.length) {
        throw new Error(`mermaid-cli page is missing the globals its own prologue registers: ${missing.join(', ')}`
          + ' — the bundle changed; see lib/integrations/mermaid/render-worker.js');
      }
      await mermaid.registerExternalDiagrams([zenuml]);
      mermaid.registerLayoutLoaders(elkLayouts);
    });
    // THE POINT OF THIS FILE. Declare Lattice's faces, then WAIT for them: a declared
    // face is not a loaded one, and Mermaid measures against whatever is loaded at
    // render time.
    const faceCss = fontFaceCss(job.pkgRoot, { display: 'block' });
    if (faceCss) await page.addStyleTag({ content: faceCss });
    const fontsLoaded = await page.evaluate(async (families) => {
      // Per FAMILY and per WEIGHT: `document.fonts.load()` resolves a shorthand
      // against the declared faces, and a weight nobody asked for stays unloaded.
      const wanted = [];
      for (const family of families) {
        for (const weight of [300, 400, 500, 600, 700]) {
          wanted.push(document.fonts.load(`${weight} 16px "${family}"`));
        }
      }
      await Promise.all(wanted);
      await Promise.all(Array.from(document.fonts, (f) => f.load()));
      await document.fonts.ready;
      // REPORT WHAT ACTUALLY LOADED, PER FACE. A face that is declared but not loaded
      // measures as its fallback, which is precisely the bug this file exists to fix — and
      // it fails silently, because the diagram still renders. Handing the list back makes
      // the property observable: the caller warns, and a test can assert it without
      // inferring fonts from geometry (an earlier one tried, and a threshold calibrated
      // from the wrong probe let a broken render pass).
      //
      // `family|weight|style`, NOT family. The first cut deduped by family and so could
      // not see a missing WEIGHT — and a missing weight is the likely failure, because
      // mermaid sets cluster titles and `**bold**` runs at 700. The page would measure
      // synthetic-bold-from-400 and the deck would paint the real 700: the same
      // measure/paint split, one weight down, with the guard silent. Red team, S5.
      return [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => `${f.family}|${f.weight}|${f.style}`);
    }, [...new Set(TEXT_FACES.map((f) => f.family))]);

    await page.$eval('body', (body, bg) => { body.style.background = bg; },
      job.backgroundColor || 'transparent');

    const results = [];
    let fatal = null;
    for (let i = 0; i < job.diagrams.length; i++) {
      const { definition, config } = job.diagrams[i];
      // eslint-disable-next-line no-await-in-loop -- Mermaid's config is GLOBAL to the
      // page, so the renders of one page are necessarily serial. Same constraint the
      // live preview works under (lib/runtime/index.js `configureForScope`).
      const result = await renderOne(page, definition, config, `${job.svgId || 'my-svg'}`,
        job.backgroundColor || 'transparent');
      results.push(result);
      // A DEAD PAGE IS NOT A DIAGRAM ERROR, and conflating the two was the worst bug in
      // the first cut of this file. `renderOne` catches everything, so a browser that died
      // mid-batch reported N per-diagram failures inside an `ok: true` payload — the caller
      // saw a successful batch, skipped the retrying fallback, and shipped a PDF with a
      // hole in it. Measured: a renderer killed 4s into an 80-diagram batch lost 70 of 80
      // diagrams and exited 0. Every one of those errors was frame/target/protocol level,
      // i.e. exactly the class the retry exists for.
      if (!result.ok && (isFatalPageError(result.error) || page.isClosed() || browser.connected === false)) {
        fatal = result.error;
        break;
      }
    }
    // `ok: false` sends the caller to its per-diagram path, which retries. The partial
    // results ride along so a caller that prefers them to nothing still has them.
    if (fatal) return { ok: false, error: `render page died mid-batch: ${fatal}`, fontsLoaded, results };
    return { ok: true, fontsLoaded, results };
  } finally {
    await browser.close();
  }
}

async function renderOne(page, definition, config, svgId, backgroundColor) {
  try {
    const svg = await page.$eval('#container', async (container, definition, config, svgId, backgroundColor) => {
      const { mermaid } = globalThis;
      container.innerHTML = '';
      // `initialize` REPLACES the site config rather than accumulating onto it, so a
      // key one diagram sets and the next omits (`look`, on a sketch deck carrying one
      // `_class: boardroom` slide) does not leak forward. Asserted by
      // test/unit/mermaid/render-worker.test.js rather than assumed — a leak here would
      // be invisible except as one slide silently wearing the previous slide's finish.
      mermaid.initialize(config);
      const { svg: svgText } = await mermaid.render(svgId, definition, container);
      container.innerHTML = svgText;
      // mmdc set this on the SVG ELEMENT, not just the body, and the attribute rides into
      // the emitted markup (`style="max-width:…; background-color: transparent;"`). No
      // stylesheet in the tree reads it, so dropping it looked inert — but the image-set
      // export lifts these SVGs out of the deck as standalone files, where the element's
      // own style is all there is. Kept for parity rather than argued about.
      const el = container.querySelector('svg');
      if (el?.style) el.style.backgroundColor = backgroundColor;
      // Serialize from the DOM, not from `svgText`: a `<foreignObject>` label carries
      // HTML that is not well-formed XML (`<br>`), and XMLSerializer is what the CLI
      // uses to make it so.
      return el ? new XMLSerializer().serializeToString(el) : '';
    }, definition, config, svgId, backgroundColor);
    // A RENDER THAT PRODUCED NOTHING IS A FAILURE, however calmly it returned. Mermaid can
    // resolve without inserting an `<svg>` — a `pie` definition containing a full-width
    // digit does exactly that on 11.14, resolving cleanly with an empty container — and
    // reporting `ok: true` with no markup let the diagram vanish: the caller either threw
    // on `undefined.replace` or, worse, would have shipped a slide with a hole in it.
    // Report it like any other diagram-level failure so the `<pre>` degradation catches it.
    if (!svg) return { ok: false, error: 'mermaid resolved without producing an SVG' };
    return { ok: true, svg };
  } catch (e) {
    return { ok: false, error: String(e?.message ? e.message : e).split('\n')[0] };
  }
}

async function main() {
  const jobFile = process.argv[2];
  if (!jobFile) {
    process.stderr.write('render-worker: usage: node render-worker.js <job.json>\n');
    process.exit(2);
  }
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  let payload;
  try {
    payload = await renderAll(job);
  } catch (e) {
    payload = { ok: false, error: String(e?.message ? e.message : e).split('\n')[0], results: [] };
  }
  fs.writeFileSync(job.outFile, JSON.stringify(payload));
  // A worker that reached its output file has done its job; a diagram-level failure
  // is DATA in that file, not a process failure. Exiting non-zero for it would make
  // the caller discard the diagrams that did render.
  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { renderAll, resolveBundles, isFatalPageError };
